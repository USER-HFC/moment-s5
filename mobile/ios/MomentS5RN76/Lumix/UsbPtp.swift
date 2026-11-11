import Foundation

/// Bounded PTP dataset parsing, ported from Ptp.java (vendor constants follow MIT-licensed tethr). Pure Foundation,
/// so ios/checks can run it on the Mac. ImageCaptureCore owns the USB framing and the session; Apple does not
/// document whether its data phase keeps the 12-byte container header, so both shapes are accepted.
enum UsbPtp {
  struct Failure: LocalizedError { let message: String; init(_ m: String) { message = m }; var errorDescription: String? { message } }

  static let panasonicVendor = 0x04da
  static let ok = 0x2001, sessionAlreadyOpen = 0x201e, busy = 0x2019

  static func requireSuccess(_ operation: Int, _ response: Int) throws {
    // Match tethr: an existing standard PTP session is usable after USB reconnect. Never for any other operation.
    if response == ok || (operation == 0x1002 && response == sessionAlreadyOpen) { return }
    let detail = response == sessionAlreadyOpen ? "（会话已打开）" : response == busy ? "（机身忙）" : ""
    throw Failure(String(format: "PTP 指令 0x%04X，响应 0x%04X%@", operation, response, detail))
  }

  static func u16(_ d: Data, _ at: Int) -> Int { let b = [UInt8](d[d.startIndex + at ..< d.startIndex + at + 2]); return Int(b[0]) | Int(b[1]) << 8 }
  static func u32(_ d: Data, _ at: Int) -> UInt32 {
    let b = [UInt8](d[d.startIndex + at ..< d.startIndex + at + 4])
    return UInt32(b[0]) | UInt32(b[1]) << 8 | UInt32(b[2]) << 16 | UInt32(b[3]) << 24
  }
  static func i32(_ d: Data, _ at: Int) -> Int32 { Int32(bitPattern: u32(d, at)) }
  static func le16(_ v: Int) -> [UInt8] { [UInt8(v & 255), UInt8(v >> 8 & 255)] }
  static func le32(_ v: UInt32) -> [UInt8] { [UInt8(v & 255), UInt8(v >> 8 & 255), UInt8(v >> 16 & 255), UInt8(v >> 24 & 255)] }

  /// Operation request container. ImageCaptureCore assigns the transaction ID of its own session.
  static func command(_ op: Int, _ params: [UInt32], transaction: UInt32 = 0) -> Data {
    precondition(params.count <= 5, "PTP parameter count")
    var b = le32(UInt32(12 + params.count * 4)) + le16(1) + le16(op) + le32(transaction)
    for p in params { b += le32(p) }
    return Data(b)
  }

  /// The response code from ImageCaptureCore's response block: a full response container (type 3).
  static func responseCode(_ response: Data, operation: Int) throws -> Int {
    guard response.count >= 8 else { throw Failure("相机没有返回 PTP 响应（指令 0x\(String(format: "%04X", operation))）") }
    let type = u16(response, 4)
    guard type == 3 else { throw Failure("PTP 响应容器异常（类型 \(type)）") }
    return u16(response, 6)
  }

  /// The data phase without a container header, whichever shape ImageCaptureCore handed over.
  static func payload(_ data: Data, operation: Int, limit: Int) throws -> Data {
    var body = data
    if data.count >= 12, Int(u32(data, 0)) == data.count, u16(data, 4) == 2, u16(data, 6) == operation { body = data.subdata(in: data.startIndex + 12 ..< data.endIndex) }
    if body.count > limit { throw Failure(limit >= 64 << 20 ? "照片超过当前 64 MB 接收上限" : "PTP 长度越界 \(body.count)") }
    return Data(body)
  }

  /// A PTP event container from the interrupt endpoint: (code, first parameter).
  static func event(_ data: Data) -> (code: Int, parameter: UInt32?)? {
    guard data.count >= 8, u16(data, 4) == 4 else { return nil }
    let length = min(Int(u32(data, 0)), data.count)
    return (u16(data, 6), length >= 16 ? u32(data, 12) : nil)
  }

  struct Reader {
    private let d: Data
    private(set) var at = 0
    init(_ data: Data) { d = Data(data) }
    private func need(_ n: Int) throws { if n < 0 || d.count - at < n { throw Failure("PTP 数据截断") } }
    mutating func u16() throws -> Int { try need(2); defer { at += 2 }; return UsbPtp.u16(d, at) }
    mutating func u32() throws -> UInt32 { try need(4); defer { at += 4 }; return UsbPtp.u32(d, at) }
    mutating func i32() throws -> Int32 { Int32(bitPattern: try u32()) }
    mutating func skip(_ n: Int) throws { try need(n); at += n }
    mutating func position(_ n: Int) throws { if n < 0 || n > d.count { throw Failure("PTP 偏移越界") }; at = n }
    mutating func array(_ size: Int) throws -> [UInt32] {
      let n = Int(try i32())
      if n < 0 || n > 100_000 || n > (d.count - at) / size { throw Failure("PTP 数组长度异常") }
      return try (0..<n).map { _ in size == 2 ? UInt32(try u16()) : try u32() }
    }
    mutating func string() throws -> String {
      try need(1); let count = Int(d[at]); at += 1
      if count == 0 { return "" }
      try need(count * 2)
      let text = d.subdata(in: at ..< at + (count - 1) * 2); at += count * 2
      return String(data: text, encoding: .utf16LittleEndian) ?? ""
    }
  }

  struct DeviceInfo {
    let manufacturer: String, model: String, version: String
    let operations: [UInt32]
    init(_ data: Data) throws {
      var r = Reader(data); try r.skip(8); _ = try r.string(); try r.skip(2)
      operations = try r.array(2); _ = try r.array(2); _ = try r.array(2); _ = try r.array(2); _ = try r.array(2)
      manufacturer = try r.string(); model = try r.string(); version = try r.string()
      // Deliberately never read or keep a camera serial number in diagnostics.
    }
  }

  struct ObjectInfo {
    let storageId: UInt32, format: Int, width: Int32, height: Int32
    let size: Int64
    let filename: String
    init(_ data: Data) throws {
      var r = Reader(data); storageId = try r.u32(); format = try r.u16(); try r.skip(2); size = Int64(try r.u32())
      try r.skip(14); width = try r.i32(); height = try r.i32(); try r.position(52); filename = try r.string()
    }
    var jpeg: Bool { format == 0x3801 || filename.lowercased().hasSuffix(".jpg") }
  }

  /// Panasonic GetProperty (0x9402): [code][value size][value], as in libgphoto2.
  static func propertyValue(_ data: Data) throws -> UInt32 {
    var r = Reader(data); try r.skip(4); let size = try r.i32()
    if size == 4 { return try r.u32() }
    if size == 2 { return UInt32(try r.u16()) }
    throw Failure("属性值长度异常 \(size)")
  }

  /// Panasonic list descriptor (0x9108): the current value sits after the header's table of codes.
  static func listedValue(_ data: Data, size: Int) throws -> UInt32 {
    var r = Reader(data); try r.skip(4); let length = try r.i32()
    if length < 0 || length > 1024 { throw Failure("属性头长度异常") }
    try r.position(Int(length) * 4 + 8)
    return size == 2 ? UInt32(try r.u16()) : try r.u32()
  }

  static func isoLabel(_ iso: Int32) -> String { "ISO " + (iso < 0 ? "AUTO" : String(iso)) }
  static func apertureLabel(_ tenths: Int32) -> String {
    tenths <= 0 ? "f/--" : "f/" + (tenths % 10 == 0 ? String(tenths / 10) : String(format: "%.1f", Double(tenths) / 10))
  }
  /// 0xFFFFFFFF is bulb; the high bit marks whole/tenth seconds, otherwise 1/(value/1000).
  static func shutterLabel(_ value: UInt32) -> String {
    if value == 0xffff_ffff { return "B" }
    if value == 0 { return "快门 --" }
    let v = value & 0x7fff_ffff
    let amount = v % 1000 == 0 ? String(v / 1000) : String(format: "%.1f", Double(v) / 1000)
    return value & 0x8000_0000 != 0 ? amount + "s" : "1/" + amount
  }

  static func liveJpeg(_ raw: Data) throws -> Data? {
    let data = Data(raw)
    if data.count < 4 { return nil }
    var jpegOffset = 180
    var pos = 0
    while pos + 8 <= min(180, data.count) {
      let id = u32(data, pos), size = Int(i32(data, pos + 4))
      if size < 0 || size > data.count - pos - 8 { break }
      if id == 0x1700_0001 && size >= 8 { jpegOffset = Int(i32(data, pos + 12)) }
      pos += 8 + size
    }
    if jpegOffset > 0 && jpegOffset < data.count - 3 && data[jpegOffset] == 0xff && data[jpegOffset + 1] == 0xd8 {
      return data.subdata(in: jpegOffset ..< data.count)
    }
    // Header layouts differ by firmware. Only accept an actual SOI marker.
    if data.count > 3 {
      for i in 0..<min(4096, data.count - 3) where data[i] == 0xff && data[i + 1] == 0xd8 && data[i + 2] == 0xff {
        return data.subdata(in: i ..< data.count)
      }
    }
    throw Failure("取景数据中没有 JPEG；需要适配此固件的帧结构")
  }

  /// `P`, or `_` in AdobeRGB, + folder + file, e.g. P1010001.JPG / _1010001.JPG. -1 when it does not match.
  static func lumixSequence(_ filename: String?) -> Int {
    guard let name = filename?.trimmingCharacters(in: .whitespaces).uppercased(), name.count >= 12,
          name.hasPrefix("P") || name.hasPrefix("_") else { return -1 }
    let stem = name.dropFirst().prefix(7), rest = String(name.dropFirst(8))
    guard stem.count == 7, stem.allSatisfy({ $0.isASCII && $0.isNumber }), rest == ".JPG" || rest == ".JPEG" else { return -1 }
    let digits = Array(stem)
    return Int(String(digits[0..<3]))! * 10_000 + Int(String(digits[3..<7]))!
  }
}
