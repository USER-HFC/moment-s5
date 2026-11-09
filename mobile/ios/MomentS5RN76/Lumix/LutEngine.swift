import Compression
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

struct LumixError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

/// A bounded 3D .cube reader and trilinear transform for received JPEGs. Port of LutEngine.java:
/// same limits, same error text, same per-pixel math on display-encoded 8-bit RGB.
final class LutEngine {
  static let maxFile = 16 * 1024 * 1024
  static let maxPixels = 36 * 1024 * 1024

  let title: String
  private let size: Int
  private let values: [Float]
  private let domainMin: [Float]
  private let domainMax: [Float]
  /// Built once in init: engines are shared across the preview, save and album threads.
  private var axes: [Axis] = []

  private init(size: Int, values: [Float], min: [Float], max: [Float], title: String) {
    self.size = size; self.values = values; domainMin = min; domainMax = max; self.title = title
    axes = buildAxes()
  }

  static func load(_ url: URL, fallbackTitle: String? = nil) throws -> LutEngine {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    guard let bytes = attributes?[.size] as? Int, attributes?[.type] as? FileAttributeType == .typeRegular else { throw LumixError("LUT 文件不存在") }
    if bytes > maxFile { throw LumixError("LUT 文件超过 16 MB") }
    guard let text = String(data: try Data(contentsOf: url), encoding: .utf8) else { throw LumixError("LUT 文件不是 UTF-8 文本") }
    return try parse(text, title: fallbackTitle ?? url.lastPathComponent)
  }

  static func parse(_ text: String, title fallback: String) throws -> LutEngine {
    var size = 0, title = fallback
    var min: [Float] = [0, 0, 0], max: [Float] = [1, 1, 1]
    var data: [Float] = []
    var sawSize = false, sawMin = false, sawMax = false
    var lineNo = 0
    for raw in text.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" || $0 == "\r\n" || $0 == "\r" }) {
      lineNo += 1
      var line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
      if lineNo == 1 && line.hasPrefix("\u{FEFF}") { line = String(line.dropFirst()).trimmingCharacters(in: .whitespaces) }
      line = withoutComment(line)
      if line.isEmpty { continue }
      let parts = line.split(whereSeparator: { $0 == " " || $0 == "\t" }).map(String.init)
      let key = parts[0].uppercased()
      func number(_ s: String) throws -> Float {
        guard let value = Float(s) else { throw LumixError("LUT 第 \(lineNo) 行格式错误") }
        return value
      }
      switch key {
      case "TITLE":
        if parts.count < 2 { throw LumixError("TITLE 为空") }
        title = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
          .replacingOccurrences(of: "^[\"']|[\"']$", with: "", options: .regularExpression)
      case "LUT_3D_SIZE":
        if sawSize || parts.count != 2 { throw LumixError("LUT_3D_SIZE 重复或格式错误") }
        guard let n = Int(parts[1]) else { throw LumixError("LUT 第 \(lineNo) 行格式错误") }
        if n < 2 || n > 64 { throw LumixError("LUT_3D_SIZE 必须在 2–64 之间") }
        size = n; sawSize = true; data.reserveCapacity(n * n * n * 3)
      case "LUT_1D_SIZE":
        throw LumixError("仅支持 3D .cube LUT，不支持 1D LUT")
      case "LUT_3D_INPUT_RANGE":
        if parts.count != 3 || sawMin || sawMax { throw LumixError("LUT_3D_INPUT_RANGE 重复或与 DOMAIN 冲突") }
        let lo = try number(parts[1]), hi = try number(parts[2])
        if !lo.isFinite || !hi.isFinite { throw LumixError("LUT_3D_INPUT_RANGE 不是有限数") }
        min = [lo, lo, lo]; max = [hi, hi, hi]; sawMin = true; sawMax = true
      case "DOMAIN_MIN", "DOMAIN_MAX":
        if parts.count != 4 { throw LumixError("DOMAIN 需要 3 个数") }
        let isMin = key == "DOMAIN_MIN"
        if isMin ? sawMin : sawMax { throw LumixError("DOMAIN 重复") }
        var dest: [Float] = []
        for i in 1...3 { let v = try number(parts[i]); if !v.isFinite { throw LumixError("DOMAIN 不是有限数") }; dest.append(v) }
        if isMin { min = dest; sawMin = true } else { max = dest; sawMax = true }
      default:
        guard parts.count == 3 else { throw LumixError("第 \(lineNo) 行无法识别") }
        if !sawSize { throw LumixError("LUT 数据出现在 LUT_3D_SIZE 之前") }
        for part in parts { let v = try number(part); if !v.isFinite { throw LumixError("LUT 数据不是有限数") }; data.append(v) }
        if data.count > size * size * size * 3 { throw LumixError("LUT 数据行数过多") }
      }
    }
    if !sawSize { throw LumixError("缺少 LUT_3D_SIZE") }
    let rows = data.count / 3, need = size * size * size
    if rows != need { throw LumixError("LUT 数据行数不匹配：需要 \(need)，实际 \(rows)") }
    for i in 0..<3 where !(max[i] > min[i]) { throw LumixError("DOMAIN_MAX 必须大于 DOMAIN_MIN") }
    return LutEngine(size: size, values: data, min: min, max: max, title: title.isEmpty ? fallback : title)
  }

  private static func withoutComment(_ line: String) -> String {
    var quote: Character?
    var previous: Character?
    for (offset, c) in line.enumerated() {
      if (c == "\"" || c == "'") && previous != "\\" {
        if quote == nil { quote = c } else if quote == c { quote = nil }
      } else if c == "#" && quote == nil {
        return String(line.prefix(offset)).trimmingCharacters(in: .whitespaces)
      }
      previous = c
    }
    return line
  }

  // MARK: Pixels

  /// maxEdge above zero downsamples for a preview. Saving a moment passes zero and stays full size.
  /// Unlike Android, the source's EXIF orientation is carried to the output, so a rotated photo stays upright.
  func applyJpeg(_ jpeg: Data, maxEdge: Int = 0) throws -> Data {
    if jpeg.isEmpty { throw LumixError("LUT 输入为空") }
    guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let width = props[kCGImagePropertyPixelWidth] as? Int, let height = props[kCGImagePropertyPixelHeight] as? Int,
          width > 0, height > 0 else { throw LumixError("LUT 输入 JPEG 无法解码") }
    if width * height > LutEngine.maxPixels { throw LumixError("照片分辨率超过 LUT 处理上限") }
    let image: CGImage?
    if maxEdge > 0 && max(width, height) > maxEdge {
      image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceThumbnailMaxPixelSize: maxEdge,
        kCGImageSourceCreateThumbnailWithTransform: false,
      ] as CFDictionary)
    } else {
      image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    }
    guard let image else { throw LumixError("LUT 输入 JPEG 无法解码") }
    let w = image.width, h = image.height
    guard let space = CGColorSpace(name: CGColorSpace.sRGB),
          let context = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: space,
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
    else { throw LumixError("无法建立 LUT 图像缓冲") }
    context.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    guard let pixels = context.data?.assumingMemoryBound(to: UInt8.self) else { throw LumixError("无法建立 LUT 图像缓冲") }
    apply(pixels, width: w, height: h, rowBytes: context.bytesPerRow)
    guard let output = context.makeImage() else { throw LumixError("LUT JPEG 编码失败") }
    var keep: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.95]
    if let orientation = props[kCGImagePropertyOrientation] { keep[kCGImagePropertyOrientation] = orientation }
    if maxEdge == 0 {
      for key in [kCGImagePropertyExifDictionary, kCGImagePropertyTIFFDictionary, kCGImagePropertyGPSDictionary, kCGImagePropertyExifAuxDictionary] {
        if let value = props[key] { keep[key] = value }
      }
    }
    return try LutEngine.encodeJpeg(output, properties: keep)
  }

  static func encodeJpeg(_ image: CGImage, properties: [CFString: Any]) throws -> Data {
    let out = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { throw LumixError("LUT JPEG 编码失败") }
    CGImageDestinationAddImage(dest, image, properties as CFDictionary)
    if !CGImageDestinationFinalize(dest) { throw LumixError("LUT JPEG 编码失败") }
    return out as Data
  }

  /// Grid cell and weight for each 8-bit value on one channel, exactly as Android's axes() derives them.
  private struct Axis { var lo = [Int](repeating: 0, count: 256); var hi = [Int](repeating: 0, count: 256); var t = [Float](repeating: 0, count: 256) }

  private func buildAxes() -> [Axis] {
    (0..<3).map { c in
      var axis = Axis()
      for v in 0..<256 {
        let x = norm(Float(v) / 255, c) * Float(size - 1)
        let x0 = Int(x.rounded(.down))
        axis.lo[v] = x0; axis.hi[v] = Swift.min(x0 + 1, size - 1); axis.t[v] = x - Float(x0)
      }
      return axis
    }
  }

  private func norm(_ value: Float, _ c: Int) -> Float {
    let n = (Double(value) - Double(domainMin[c])) / (Double(domainMax[c]) - Double(domainMin[c]))
    return Float(Swift.max(0, Swift.min(1, n)))
  }

  private static let stripRows = 64

  private func apply(_ pixels: UnsafeMutablePointer<UInt8>, width: Int, height: Int, rowBytes: Int) {
    let axes = self.axes, size = self.size
    let strips = (height + LutEngine.stripRows - 1) / LutEngine.stripRows
    values.withUnsafeBufferPointer { lut in
      let work = { (strip: Int) in
        let y0 = strip * LutEngine.stripRows, y1 = Swift.min(height, y0 + LutEngine.stripRows)
        @inline(__always) func v(_ r: Int, _ g: Int, _ b: Int, _ c: Int) -> Float { lut[((b * size + g) * size + r) * 3 + c] }
        @inline(__always) func lerp(_ a: Float, _ b: Float, _ t: Float) -> Float { Float(Double(a) + (Double(b) - Double(a)) * Double(t)) }
        for y in y0..<y1 {
          var p = pixels + y * rowBytes
          for _ in 0..<width {
            let r = Int(p[0]), g = Int(p[1]), b = Int(p[2])
            let x0 = axes[0].lo[r], x1 = axes[0].hi[r], yy0 = axes[1].lo[g], yy1 = axes[1].hi[g], z0 = axes[2].lo[b], z1 = axes[2].hi[b]
            let tx = axes[0].t[r], ty = axes[1].t[g], tz = axes[2].t[b]
            for c in 0..<3 {
              let a = lerp(v(x0, yy0, z0, c), v(x1, yy0, z0, c), tx), b0 = lerp(v(x0, yy1, z0, c), v(x1, yy1, z0, c), tx)
              let c0 = lerp(v(x0, yy0, z1, c), v(x1, yy0, z1, c), tx), d = lerp(v(x0, yy1, z1, c), v(x1, yy1, z1, c), tx)
              let out = lerp(lerp(a, b0, ty), lerp(c0, d, ty), tz)
              p[c] = UInt8((Swift.max(0, Swift.min(1, out)) * 255).rounded())
            }
            p += 4
          }
        }
      }
      if width * height >= 1_500_000 { DispatchQueue.concurrentPerform(iterations: strips, execute: work) }
      else { for strip in 0..<strips { work(strip) } }
    }
  }
}

/// Bounds both the selected LUT and the ZIP it may come in. Port of LutImport.java.
enum LutImport {
  static func copy(from source: URL, to target: URL) throws {
    let bytes = (try? FileManager.default.attributesOfItem(atPath: source.path)[.size] as? Int) ?? 0
    if bytes > LutEngine.maxFile { throw LumixError("LUT 文件或 ZIP 解压数据超过大小上限") }
    try Data(contentsOf: source).write(to: target)
  }

  /// First .cube entry of a ZIP, read through the central directory. Returns that entry's file name.
  static func extract(from source: URL, to target: URL) throws -> String {
    let attributes = try FileManager.default.attributesOfItem(atPath: source.path)
    if (attributes[.size] as? Int ?? 0) > 2 * LutEngine.maxFile { throw LumixError("LUT 文件或 ZIP 解压数据超过大小上限") }
    let zip = try Data(contentsOf: source)
    func u16(_ at: Int) throws -> Int { guard at + 2 <= zip.count else { throw LumixError("ZIP 文件已损坏") }; return Int(zip[at]) | Int(zip[at + 1]) << 8 }
    func u32(_ at: Int) throws -> Int { return try u16(at) | (try u16(at + 2)) << 16 }
    // End of central directory: the last "PK\5\6" within the trailing comment window.
    var end = -1
    var at = zip.count - 22
    while at >= Swift.max(0, zip.count - 22 - 65_535) {
      if zip[at] == 0x50, zip[at + 1] == 0x4B, zip[at + 2] == 5, zip[at + 3] == 6 { end = at; break }
      at -= 1
    }
    if end < 0 { throw LumixError("不是有效的 ZIP 文件") }
    let count = try u16(end + 10)
    if count > 512 { throw LumixError("ZIP 文件条目过多") }
    if count == 0xFFFF { throw LumixError("不支持 ZIP64 文件") }
    var entry = try u32(end + 16)
    for _ in 0..<count {
      guard try u32(entry) == 0x0201_4B50 else { throw LumixError("ZIP 文件已损坏") }
      let method = try u16(entry + 10), compressed = try u32(entry + 20), plain = try u32(entry + 24)
      let nameLength = try u16(entry + 28), extra = try u16(entry + 30), comment = try u16(entry + 32), local = try u32(entry + 42)
      guard entry + 46 + nameLength <= zip.count else { throw LumixError("ZIP 文件已损坏") }
      let name = String(decoding: zip[(entry + 46)..<(entry + 46 + nameLength)], as: UTF8.self)
      entry += 46 + nameLength + extra + comment
      guard !name.hasSuffix("/"), name.lowercased().hasSuffix(".cube") else { continue }
      let path = name.replacingOccurrences(of: "\\", with: "/")
      if path.hasPrefix("/") || path.range(of: "^[A-Za-z]:", options: .regularExpression) != nil || path.split(separator: "/").contains("..") {
        throw LumixError("ZIP 包含非法路径")
      }
      if plain > LutEngine.maxFile { throw LumixError("LUT 文件或 ZIP 解压数据超过大小上限") }
      guard try u32(local) == 0x0403_4B50 else { throw LumixError("ZIP 文件已损坏") }
      let start = local + 30 + (try u16(local + 26)) + (try u16(local + 28))
      guard start + compressed <= zip.count else { throw LumixError("ZIP 文件已损坏") }
      let body = zip.subdata(in: start..<(start + compressed))
      let output: Data
      switch method {
      case 0: output = body
      case 8:
        var buffer = Data(count: plain)
        let written = buffer.withUnsafeMutableBytes { dst in
          body.withUnsafeBytes { src in
            compression_decode_buffer(dst.bindMemory(to: UInt8.self).baseAddress!, plain,
                                      src.bindMemory(to: UInt8.self).baseAddress!, compressed, nil, COMPRESSION_ZLIB)
          }
        }
        if written != plain { throw LumixError("ZIP 中的 LUT 无法解压") }
        output = buffer
      default: throw LumixError("ZIP 压缩方式不受支持")
      }
      try output.write(to: target)
      return path.split(separator: "/").last.map(String.init) ?? "imported.cube"
    }
    throw LumixError("ZIP 中没有 .cube LUT")
  }
}

/// Immutable bundle LUTs, separate from the imported directory. Mirrors BuiltInLutCatalog.java, which is
/// generated by tools/generate_fuji_style_luts.py; keep both lists in step when that generator changes.
enum BuiltInLuts {
  struct Entry { let id: String; let name: String; let asset: String; let bytes: Int }
  static let prefix = "builtin:"
  static let entries: [Entry] = [
    Entry(id: "builtin:provia-standard", name: "Fuji 风格 · Provia / Standard", asset: "fuji-style-provia-standard.cube", bytes: 970_733),
    Entry(id: "builtin:velvia", name: "Fuji 风格 · Velvia", asset: "fuji-style-velvia.cube", bytes: 970_722),
    Entry(id: "builtin:astia", name: "Fuji 风格 · Astia", asset: "fuji-style-astia.cube", bytes: 970_721),
    Entry(id: "builtin:classic-chrome", name: "Fuji 风格 · Classic Chrome", asset: "fuji-style-classic-chrome.cube", bytes: 970_730),
    Entry(id: "builtin:classic-negative", name: "Fuji 风格 · Classic Negative", asset: "fuji-style-classic-negative.cube", bytes: 970_732),
    Entry(id: "builtin:eterna", name: "Fuji 风格 · Eterna", asset: "fuji-style-eterna.cube", bytes: 970_722),
    Entry(id: "builtin:acros", name: "Fuji 风格 · Acros", asset: "fuji-style-acros.cube", bytes: 970_721),
    Entry(id: "builtin:pro-neg-standard", name: "Fuji 风格 · Pro Neg.Std", asset: "fuji-style-pro-neg-standard.cube", bytes: 970_727),
  ]
  private static var parsed: [String: LutEngine] = [:]
  private static let lock = NSLock()

  static func isBuiltIn(_ id: String) -> Bool { id.hasPrefix(prefix) }

  /// Parsed engines are immutable, so keep them for this process; switching in the flyout then skips the parse.
  static func load(_ id: String) throws -> LutEngine {
    lock.lock(); if let hit = parsed[id] { lock.unlock(); return hit }; lock.unlock()
    guard let entry = entries.first(where: { $0.id == id }) else { throw LumixError("内置 LUT 不存在") }
    guard let url = Bundle.main.url(forResource: entry.asset, withExtension: nil, subdirectory: "luts") else { throw LumixError("内置 LUT 不存在") }
    let bytes = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? -1
    if bytes != entry.bytes { throw LumixError("内置 LUT 大小不匹配") }
    let engine = try LutEngine.load(url, fallbackTitle: entry.name)
    lock.lock(); parsed[id] = engine; lock.unlock()
    return engine
  }
}
