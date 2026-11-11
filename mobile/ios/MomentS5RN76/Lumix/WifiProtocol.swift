import Foundation

/// Port of WifiS5Protocol.java: cam.cgi replies, the DLNA description and catalog, the LUMIX Sync
/// access transform and the live-view datagram. Independently authored; NOT S5 hardware verification.
enum WifiProtocol {
  static let cds = "urn:schemas-upnp-org:service:ContentDirectory:1"
  static let maxXml = 2 * 1024 * 1024, maxJpeg = 64 * 1024 * 1024

  // MARK: XML

  /// A minimal DOM: local names, attributes by local name, and every text run kept in order.
  class Node {
    let name: String
    var attributes: [String: String]
    var children: [Node] = []
    var ownText = ""
    init(_ name: String, _ attributes: [String: String]) { self.name = name; self.attributes = attributes }
    var textContent: String { children.isEmpty ? ownText : ownText + children.map(\.textContent).joined() }
    func elements(_ local: String) -> [Node] {
      var out: [Node] = []
      func walk(_ node: Node) { if node.name == local { out.append(node) }; node.children.forEach(walk) }
      walk(self); return out
    }
    func text(_ local: String) -> String? { elements(local).first?.textContent.trimmingCharacters(in: .whitespacesAndNewlines) }
    func attribute(_ name: String) -> String { attributes[name] ?? "" }
  }

  private final class Builder: NSObject, XMLParserDelegate {
    let root = Node("#document", [:])
    var stack: [Node] = []
    var failure: Error?
    override init() { super.init(); stack = [root] }
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
      var local: [String: String] = [:]
      for (key, value) in attributes where !key.hasPrefix("xmlns") { local[key.split(separator: ":").last.map(String.init) ?? key] = value }
      let node = Node(name.split(separator: ":").last.map(String.init) ?? name, local)
      stack.last?.children.append(node); stack.append(node)
    }
    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) { stack.removeLast() }
    func parser(_ parser: XMLParser, foundCharacters string: String) { append(string) }
    func parser(_ parser: XMLParser, foundCDATA data: Data) { append(String(decoding: data, as: UTF8.self)) }
    func parser(_ parser: XMLParser, parseErrorOccurred error: Error) { failure = error }
    func parser(_ parser: XMLParser, resolveExternalEntityName name: String, systemID: String?) -> Data? { parser.abortParsing(); return nil }
    private func append(_ text: String) {
      guard let node = stack.last else { return }
      // Mixed content is rare in camera XML; text after a child still belongs to the parent's text content.
      if node.children.isEmpty { node.ownText += text } else { node.children.append(TextRun(text)) }
    }
  }

  private final class TextRun: Node {
    init(_ text: String) { super.init("#text", [:]); ownText = text }
  }

  static func xml(_ data: Data) throws -> Node {
    if data.count > maxXml { throw LumixError("相机 XML 超过上限") }
    let text = String(decoding: data, as: UTF8.self)
    let upper = text.uppercased()
    if text.contains("\0") || upper.contains("<!DOCTYPE") || upper.contains("<!ENTITY") { throw LumixError("拒绝相机 XML 外部实体或 DTD") }
    let parser = XMLParser(data: data)
    parser.shouldProcessNamespaces = true
    parser.shouldResolveExternalEntities = false
    let builder = Builder()
    parser.delegate = builder
    if !parser.parse() || builder.failure != nil { throw LumixError("相机 XML 无法解析") }
    guard builder.root.children.contains(where: { !($0 is TextRun) }) else { throw LumixError("相机 XML 无法解析") }
    return builder.root
  }

  static func documentElement(_ root: Node) -> Node? { root.children.first { !($0 is TextRun) } }

  private static func leafValues(_ root: Node, _ values: inout [String: [String]]) {
    if !(root is TextRun) && root.name != "#document" {
      let hasElements = root.children.contains { !($0 is TextRun) }
      if !hasElements {
        values[root.name, default: []].append(root.textContent.trimmingCharacters(in: .whitespacesAndNewlines))
        for (key, value) in root.attributes.sorted(by: { $0.key < $1.key }) { values[key, default: []].append(value) }
      }
    }
    for child in root.children where !(child is TextRun) { leafValues(child, &values) }
  }

  // MARK: cam.cgi replies

  struct Reply {
    let result: String
    let values: [String: [String]]
    let fields: [String]
    var ok: Bool { result.caseInsensitiveCompare("ok") == .orderedSame }
    func requireOk() throws { if !ok { throw LumixError("相机拒绝 Wi-Fi 指令：\(WifiProtocol.safe(result))") } }
    func first(_ key: String) -> String? { values[key]?.first }
    var gen2: Bool { values["challenge"] != nil || fields.contains { $0.contains("req_acc_g") || $0.contains("req_acc_e") } || result.contains("gen2") }
  }

  /// Only letters, digits, space, underscore and dash, at most 80 characters, for log lines.
  static func safe(_ value: String?) -> String {
    guard let value else { return "无应答" }
    let kept = value.unicodeScalars.filter { $0.isASCII && (CharacterSet.alphanumerics.contains($0) || " _-".unicodeScalars.contains($0)) }
    return String(String.UnicodeScalarView(kept.prefix(80)))
  }

  static func reply(_ data: Data) throws -> Reply {
    var raw = String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    if raw.hasPrefix("\u{feff}") { raw = String(raw.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines) }
    if raw.hasPrefix("<") {
      let doc = try xml(data)
      guard let result = doc.text("result") else { throw LumixError("相机应答缺少 result") }
      var values: [String: [String]] = [:]
      leafValues(doc, &values)
      return Reply(result: result, values: values, fields: [])
    }
    let fields = try csv(raw)
    guard let head = fields.first, !head.isEmpty else { throw LumixError("相机 CSV 应答为空") }
    return Reply(result: head, values: [:], fields: Array(fields.dropFirst()))
  }

  static func csv(_ raw: String) throws -> [String] {
    var fields: [String] = [], current = ""
    var quoted = false, ended = false
    let chars = Array(raw)
    var i = 0
    while i < chars.count {
      let c = chars[i]
      if quoted {
        if c == "\"" {
          if i + 1 < chars.count && chars[i + 1] == "\"" { current.append("\""); i += 1 } else { quoted = false; ended = true }
        } else { current.append(c) }
      } else if c == "," { fields.append(current.trimmingCharacters(in: .whitespaces)); current = ""; ended = false }
      else if c == "\"" && current.isEmpty && !ended { quoted = true }
      else if ended && !c.isWhitespace { throw LumixError("相机 CSV 引号无效") }
      else { current.append(c) }
      i += 1
    }
    if quoted { throw LumixError("相机 CSV 被截断") }
    fields.append(current.trimmingCharacters(in: .whitespaces))
    return fields
  }

  /// req_acc_g answers `ok,<8 hex>`; returns that 32-bit nonce, or nil for any other reply.
  static func nonce(_ reply: Reply) -> UInt32? {
    guard reply.ok, let value = reply.fields.first, value.count == 8, value.allSatisfy(\.isHexDigit) else { return nil }
    return UInt32(value, radix: 16)
  }

  /// LUMIX Sync's stand-in when the body returns a zero nonce.
  static let zeroNonce: UInt32 = UInt32(bitPattern: -1_875_740_628)

  /// LUMIX Sync's req_acc_e field transform: pad the UTF-8 bytes with 0xFF to a multiple of four, XOR each
  /// big-endian 32-bit block with the nonce, then print it byte-swapped as %08x. Unverified on an encrypted body.
  static func encryptAccess(_ text: String, nonce: UInt32) -> String {
    let key = nonce == 0 ? zeroNonce : nonce
    var bytes = Array(text.utf8)
    while bytes.count % 4 != 0 { bytes.append(0xFF) }
    var out = ""
    for i in stride(from: 0, to: bytes.count, by: 4) {
      let block = (UInt32(bytes[i]) << 24 | UInt32(bytes[i + 1]) << 16 | UInt32(bytes[i + 2]) << 8 | UInt32(bytes[i + 3])) ^ key
      out += String(format: "%08x", block.byteSwapped)
    }
    return out
  }

  // MARK: Addresses

  /// The camera base URL. Outside debug: a private-LAN IPv4 literal with no port.
  static func cameraUrl(_ endpoint: String, debug: Bool) throws -> URL {
    guard let url = URL(string: "http://" + endpoint), url.scheme == "http", let host = url.host, !host.isEmpty,
          url.user == nil, url.password == nil, url.path.isEmpty, url.query == nil, url.fragment == nil else { throw LumixError("请输入相机 IPv4 地址") }
    if let port = url.port, port < 1 || port > 65535 { throw LumixError("相机端口无效") }
    if !debug {
      let parts = host.split(separator: ".", omittingEmptySubsequences: false)
      if parts.count != 4 || url.port != nil { throw LumixError("请输入相机 IPv4 地址（不含端口）") }
      var ip: [Int] = []
      for part in parts {
        guard (1...3).contains(part.count), part.allSatisfy(\.isASCII), part.allSatisfy(\.isNumber), let n = Int(part), n <= 255 else { throw LumixError("相机 IPv4 地址无效") }
        ip.append(n)
      }
      if !(ip[0] == 10 || ip[0] == 172 && (16...31).contains(ip[1]) || ip[0] == 192 && ip[1] == 168) { throw LumixError("Wi-Fi 实验仅接受相机私有局域网 IPv4 地址") }
    }
    return url
  }

  static func port(_ url: URL) -> Int { url.port ?? 80 }

  /// A camera-served resource: same host, plain http, never cam.cgi, no control characters.
  static func resource(_ base: URL, _ value: String) throws -> URL {
    guard let url = URL(string: value, relativeTo: base)?.absoluteURL else { throw LumixError("拒绝非相机或控制指令资源 URL") }
    var path = url.path
    for _ in 0..<3 { guard let decoded = path.removingPercentEncoding else { throw LumixError("无效资源 URL") }; path = decoded }
    let full = url.absoluteString
    if url.scheme != "http" || url.host?.lowercased() != base.host?.lowercased() || url.user != nil || url.fragment != nil
        || url.port == 0 || (url.port ?? 0) > 65535 || path.lowercased().contains("cam.cgi")
        || path.contains("\r") || path.contains("\n") || path.contains("\\") || full.contains("\r") || full.contains("\n") || full.contains(" ") {
      throw LumixError("拒绝非相机或控制指令资源 URL")
    }
    return url
  }

  /// Path plus query, as written on the request line.
  static func requestTarget(_ url: URL) -> String {
    let path = url.path.isEmpty ? "/" : (URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath ?? url.path)
    if let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery { return path + "?" + query }
    return path
  }

  // MARK: Description

  /// A Lumix announces modelName "LUMIX" and the body in modelNumber (real DC-S5: "DC-S5").
  struct Description {
    let manufacturer: String?, modelName: String?, modelNumber: String?, firmware: String?, capability: String?
    let control: URL
    let events: URL?
    var model: String? { (modelNumber?.isEmpty == false) ? modelNumber : modelName }
    var panasonic: Bool { manufacturer?.trimmingCharacters(in: .whitespaces).caseInsensitiveCompare("Panasonic") == .orderedSame }
    /// LUMIX Sync uses the encrypted req_acc_g / req_acc_e handshake only when X_CamCapability ends in 1.
    var encryptedHandshake: Bool { capability?.trimmingCharacters(in: .whitespaces).hasSuffix("1") ?? false }
  }

  static func description(_ data: Data, location: URL) throws -> Description {
    let doc = try xml(data)
    var control: URL?, events: URL?
    for service in doc.elements("service") {
      guard let type = service.text("serviceType") else { continue }
      if control == nil && type == cds, let value = service.text("controlURL"), !value.isEmpty { control = try resource(location, value) }
      if events == nil && type.contains("ConnectionManager"), let value = service.text("eventSubURL"), !value.isEmpty { events = try resource(location, value) }
    }
    guard let control else { throw LumixError("相机未公布 DLNA ContentDirectory 控制地址") }
    return Description(manufacturer: doc.text("manufacturer"), modelName: doc.text("modelName"), modelNumber: doc.text("modelNumber"),
                       firmware: doc.text("X_FirmVersion"), capability: doc.text("X_CamCapability"), control: control, events: events)
  }

  /// Leaf values of a GENA NOTIFY propertyset, e.g. X_Panasonic_Cam_Sync.
  static func events(_ data: Data) throws -> [String: [String]] {
    var values: [String: [String]] = [:]
    leafValues(try xml(data), &values)
    return values
  }

  /// LUMIX Sync's accctrl identity: fixed prefix plus a per-install seed of 12 hex digits.
  static let clientPrefix = "4D454930-0100-1000-8001-"
  static func clientId(_ file: URL) throws -> String {
    if let saved = try? String(contentsOf: file, encoding: .ascii).trimmingCharacters(in: .whitespacesAndNewlines),
       saved.count == 12, saved.allSatisfy({ $0.isHexDigit && !$0.isLowercase }) { return clientPrefix + saved }
    var seed = [UInt8](repeating: 0, count: 6)
    guard SecRandomCopyBytes(kSecRandomDefault, seed.count, &seed) == errSecSuccess else { throw LumixError("无法保存 Wi-Fi 设备标识") }
    let hex = seed.map { String(format: "%02X", $0) }.joined()
    do {
      try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try Data(hex.utf8).write(to: file, options: .atomic)
    } catch { throw LumixError("无法保存 Wi-Fi 设备标识") }
    return clientPrefix + hex
  }

  // MARK: Catalog

  struct Media: Equatable {
    let itemKey: String, url: URL, filename: String, size: Int64
    var key: String { "\(itemKey)\u{1f}\(url.absoluteString)\u{1f}\(filename)\u{1f}\(size)" }
  }

  /// `childCount` is -1 when the camera omits it.
  struct Item {
    let id: String, parent: String, title: String?, originals: [Media], container: Bool, childCount: Int
    var identity: String { "\(parent)\u{1f}\(id)" }
  }

  struct Page { let items: [Item], returned: Int, total: Int, update: String? }

  private static func integer(_ root: Node, _ key: String) throws -> Int {
    guard let text = root.text(key), let n = Int(text), (0...10000).contains(n) else { throw LumixError("相机目录 \(key) 无效") }
    return n
  }

  private static let originalKind = try! NSRegularExpression(pattern: "PANASONIC\\.COM_PN=(CAM_ORG|CAM_RAW_JPG)(?:[;: ]|$)", options: [.caseInsensitive, .dotMatchesLineSeparators])
  private static let originalName = try! NSRegularExpression(pattern: "OriginalFileName=['\"]?([^;'\"]+)", options: .caseInsensitive)
  private static func isJpegName(_ name: String) -> Bool { name.range(of: "\\.jpe?g$", options: [.regularExpression, .caseInsensitive]) != nil }

  static func browse(_ data: Data, control: URL) throws -> Page {
    let soap = try xml(data)
    if !soap.elements("Fault").isEmpty { throw LumixError("相机 DLNA 目录请求失败") }
    guard let inner = soap.text("Result") else { throw LumixError("相机目录缺少 DIDL Result") }
    let didlDoc = try xml(Data(inner.utf8))
    guard let didl = documentElement(didlDoc), didl.name == "DIDL-Lite" else { throw LumixError("相机目录不是 DIDL-Lite") }
    var items: [Item] = []
    for node in didl.children where !(node is TextRun) {
      let container = node.name == "container"
      if !container && node.name != "item" { continue }
      let id = node.attribute("id"), parent = node.attribute("parentID"), title = node.text("title")
      if id.isEmpty { throw LumixError("相机目录对象没有 ID") }
      let key = "\(parent)\u{1f}\(id)"
      var originals: [Media] = []
      if !container {
        for res in node.elements("res") {
          let info = res.attribute("protocolInfo")
          let range = NSRange(info.startIndex..., in: info)
          if originalKind.firstMatch(in: info, range: range) == nil { continue }
          let url = try resource(control, res.textContent.trimmingCharacters(in: .whitespacesAndNewlines))
          var filename = title
          if let match = originalName.firstMatch(in: info, range: range), let r = Range(match.range(at: 1), in: info) { filename = String(info[r]) }
          guard let name = filename, isJpegName(name), isJpegName(url.path) else { continue }
          var size: Int64 = 0
          let declared = res.attribute("size")
          if !declared.isEmpty {
            guard let n = Int64(declared), n >= 0, n <= Int64(maxJpeg) else { throw LumixError("原 JPEG 大小无效或超过 64 MB") }
            size = n
          }
          originals.append(Media(itemKey: key, url: url, filename: (name as NSString).lastPathComponent, size: size))
        }
      }
      var children = -1
      if container, let n = Int(node.attribute("childCount")), n >= 0 { children = n }
      items.append(Item(id: id, parent: parent, title: title, originals: originals, container: container, childCount: children))
    }
    let returned = try integer(soap, "NumberReturned"), total = try integer(soap, "TotalMatches")
    if returned != items.count || returned > total { throw LumixError("相机目录分页数量不一致") }
    return Page(items: items, returned: returned, total: total, update: soap.text("UpdateID"))
  }

  /// The one original that is in `current` but not in `baseline`; more than one is refused.
  static func uniqueNew(_ baseline: [String: Item], _ current: [(String, Item)]) throws -> Media? {
    var seen = Set<String>(), choices: [Media] = []
    for (identity, item) in current where baseline[identity] == nil {
      for media in item.originals where seen.insert("\(media.itemKey)\u{1f}\(media.url.absoluteString)").inserted { choices.append(media) }
    }
    if choices.count > 1 { throw LumixError("出现多个新原 JPEG，无法确认本次照片；未使用旧图，请检查机身 SD 卡") }
    return choices.first
  }

  static func soap(_ object: String, start: Int) -> Data {
    let safeObject = object.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;").replacingOccurrences(of: "'", with: "&apos;")
    let body = "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\"><s:Body><u:Browse xmlns:u=\"\(cds)\" xmlns:pana=\"urn:schemas-panasonic-com:pana\"><ObjectID>\(safeObject)</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>\(start)</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria/><pana:X_FromCP>LumixLink2.0</pana:X_FromCP></u:Browse></s:Body></s:Envelope>"
    return Data(body.utf8)
  }

  // MARK: JPEG

  /// Strict marker/segment/scan envelope check up to EOI, including SOF and SOS. Returns (width, height,
  /// bytes through EOI). Bytes after EOI are allowed: S5 originals are padded, and MPF images follow EOI.
  static func jpeg(_ next: () throws -> Int, limit: Int) throws -> (width: Int, height: Int, length: Int) {
    var count = 0
    func read() throws -> Int { let b = try next(); if b >= 0 { count += 1; if count > limit { throw LumixError("JPEG 超过接收上限") } }; return b }
    if try read() != 255 || read() != 216 { throw LumixError("JPEG 缺少 SOI") }
    var scan = false, sawScan = false, width = 0, height = 0
    let sofMarkers: Set<Int> = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
    while true {
      var marker: Int
      if scan {
        var b: Int
        repeat { b = try read(); if b < 0 { throw LumixError("JPEG 扫描被截断") } } while b != 255
        repeat { marker = try read() } while marker == 255
        if marker == 0 || (0xd0...0xd7).contains(marker) { continue }
        scan = false
      } else {
        if try read() != 255 { throw LumixError("JPEG 标记边界无效") }
        repeat { marker = try read() } while marker == 255
      }
      if marker == 0xd9 {
        if !sawScan || width == 0 || height == 0 { throw LumixError("JPEG 缺少 SOF/SOS") }
        return (width, height, count)
      }
      if marker < 0 || marker == 0 || marker == 0xd8 || (0xd0...0xd7).contains(marker) { throw LumixError("JPEG 标记无效") }
      if marker == 1 { continue }
      let a = try read(), b = try read()
      if a < 0 || b < 0 { throw LumixError("JPEG 段被截断") }
      var length = (a << 8 | b) - 2
      if length < 0 { throw LumixError("JPEG 段长度无效") }
      if sofMarkers.contains(marker) {
        if length < 6 { throw LumixError("JPEG SOF 无效") }
        let depth = try read()
        height = try read() << 8 | read(); width = try read() << 8 | read()
        let components = try read(); length -= 6
        if depth <= 0 || width <= 0 || height <= 0 || width > 20000 || height > 20000 || width * height > 48_000_000 || components < 1 || length != 3 * components {
          throw LumixError("JPEG 尺寸或 SOF 无效")
        }
      }
      if marker == 0xda && length < 4 { throw LumixError("JPEG SOS 无效") }
      while length > 0 { if try read() < 0 { throw LumixError("JPEG 段不完整") }; length -= 1 }
      if marker == 0xda { scan = true; sawScan = true }
    }
  }

  static func jpeg(_ data: Data, limit: Int) throws -> (width: Int, height: Int, length: Int) {
    try data.withUnsafeBytes { raw -> (Int, Int, Int) in
      let bytes = raw.bindMemory(to: UInt8.self)
      var at = 0
      return try jpeg({ () -> Int in if at >= bytes.count { return -1 }; defer { at += 1 }; return Int(bytes[at]) }, limit: limit)
    }
  }

  static func jpeg(file: URL, limit: Int) throws {
    guard let stream = InputStream(url: file) else { throw LumixError("无法读取 Wi-Fi 原片") }
    stream.open(); defer { stream.close() }
    var buffer = [UInt8](repeating: 0, count: 65536)
    var filled = 0, at = 0
    _ = try jpeg({ () -> Int in
      if at >= filled {
        filled = stream.read(&buffer, maxLength: buffer.count); at = 0
        if filled < 0 { throw LumixError("无法读取 Wi-Fi 原片") }
        if filled == 0 { return -1 }
      }
      defer { at += 1 }
      return Int(buffer[at])
    }, limit: limit)
  }

  /// One live-view frame per datagram. The S5 header stores the JPEG offset as be16(bytes 30..31) + 32;
  /// the header also carries the camera MAC, which can contain FF D8, so a marker search is the fallback.
  static func datagram(_ packet: Data) -> Data? {
    let bytes = [UInt8](packet), length = bytes.count
    var start = -1
    if length > 34 {
      let offset = (Int(bytes[30]) << 8 | Int(bytes[31])) + 32
      if offset + 2 < length && bytes[offset] == 255 && bytes[offset + 1] == 216 && bytes[offset + 2] == 255 { start = offset }
    }
    if start < 0 {
      var i = 0
      while i < min(length - 2, 1024) { if bytes[i] == 255 && bytes[i + 1] == 216 && bytes[i + 2] == 255 { start = i; break }; i += 1 }
    }
    if start < 0 { return nil }
    let jpegBytes = Data(bytes[start...])
    guard let size = try? jpeg(jpegBytes, limit: 2 * 1024 * 1024), size.width * size.height <= 3_000_000 else { return nil }
    return size.length == jpegBytes.count ? jpegBytes : Data(jpegBytes.prefix(size.length))
  }
}
