import Foundation
import ImageIO
import Photos

typealias Meta = [String: Any]

/// App-private album: Application Support/moments/<id>/{moment.json, original.jpg, rendered.jpg, motion.mp4, MOMENT_MP.jpg}.
/// Same layout and moment.json fields as MomentStore.java, so the JS album reads both platforms alike.
final class MomentStore {
  let root: URL
  private let files = FileManager.default

  init() throws {
    let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    root = support.appendingPathComponent("moments", isDirectory: true)
    // Until exported, an app capture may be the only copy, so it stays in the device backup like any document.
    try files.createDirectory(at: root, withIntermediateDirectories: true)
  }

  func create() throws -> URL {
    let id = "M\(Int64(Date().timeIntervalSince1970 * 1000))_\(UUID().uuidString.lowercased().prefix(8))"
    let dir = root.appendingPathComponent(id, isDirectory: true)
    try files.createDirectory(at: dir, withIntermediateDirectories: false)
    return dir
  }

  /// Newest first; only directories that already carry a moment.json.
  func list() -> [URL] {
    let names = (try? files.contentsOfDirectory(atPath: root.path)) ?? []
    return names.sorted(by: >).compactMap { name in
      let dir = root.appendingPathComponent(name, isDirectory: true)
      var isDir: ObjCBool = false
      guard files.fileExists(atPath: dir.path, isDirectory: &isDir), isDir.boolValue,
            files.fileExists(atPath: dir.appendingPathComponent("moment.json").path) else { return nil }
      return dir
    }
  }

  func directory(_ id: String) throws -> URL {
    guard MomentStore.isSimpleId(id) else { throw LumixError("非法动态照片路径") }
    guard let dir = list().first(where: { $0.lastPathComponent == id }) else { throw LumixError("动态照片不存在") }
    return dir
  }

  static func isSimpleId(_ id: String) -> Bool {
    !id.isEmpty && id != "." && id != ".." && !id.contains("/") && !id.contains("\\") && !id.contains("\0")
  }

  // MARK: Metadata

  static func metadata(_ dir: URL) throws -> Meta {
    let data = try Data(contentsOf: dir.appendingPathComponent("moment.json"))
    guard let meta = try JSONSerialization.jsonObject(with: data) as? Meta else { throw LumixError("照片记录无法读取") }
    return meta
  }

  static func write(_ meta: Meta, to dir: URL) throws {
    let data = try JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted, .sortedKeys])
    try data.write(to: dir.appendingPathComponent("moment.json"), options: .atomic)
  }

  // MARK: Deletion (port of MomentDeletion.java)

  /// Bounded deletion of one moment directory. Any symlink in the tree is refused before anything is removed.
  func delete(_ id: String) throws {
    guard MomentStore.isSimpleId(id) else { throw LumixError("非法动态照片路径") }
    let rootPath = root.resolvingSymlinksInPath().standardizedFileURL
    let candidate = rootPath.appendingPathComponent(id, isDirectory: true)
    let attributes = try? files.attributesOfItem(atPath: candidate.path)
    guard attributes?[.type] as? FileAttributeType == .typeDirectory else { throw LumixError("动态照片不存在") }
    guard files.fileExists(atPath: candidate.appendingPathComponent("moment.json").path) else { throw LumixError("动态照片不存在") }
    guard let walker = files.enumerator(at: candidate, includingPropertiesForKeys: [.isSymbolicLinkKey], options: []) else { throw LumixError("动态照片不存在") }
    for case let item as URL in walker {
      if (try? item.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink) == true { throw LumixError("动态照片目录包含符号链接") }
      if !item.standardizedFileURL.path.hasPrefix(candidate.path + "/") { throw LumixError("非法动态照片路径") }
    }
    try files.removeItem(at: candidate)
  }

  // MARK: Usage

  struct Usage { var count = 0; var bytes: Int64 = 0; var exportedCount = 0; var exportedBytes: Int64 = 0 }

  func usage() -> Usage {
    var usage = Usage()
    for dir in list() {
      usage.count += 1
      let size = bytesUnder(dir)
      usage.bytes += size
      if MomentExport.state(dir).confirmed { usage.exportedCount += 1; usage.exportedBytes += size }
    }
    return usage
  }

  /// Removes app copies the Photos library still holds. An unverifiable export is kept: uncertainty is not permission to delete.
  func deleteExported() throws -> Int {
    var removed = 0
    for dir in list() where MomentExport.state(dir).confirmed { try delete(dir.lastPathComponent); removed += 1 }
    return removed
  }

  private func bytesUnder(_ dir: URL) -> Int64 {
    var total: Int64 = 0
    let keys: [URLResourceKey] = [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey]
    guard let walker = files.enumerator(at: dir, includingPropertiesForKeys: keys, options: []) else { return 0 }
    for case let item as URL in walker {
      guard let values = try? item.resourceValues(forKeys: Set(keys)), values.isSymbolicLink != true, values.isRegularFile == true else { continue }
      total += Int64(values.fileSize ?? 0)
    }
    return total
  }

  static func usableBytes() -> Int64 {
    if let forced = usableOverride { return forced }
    let home = URL(fileURLWithPath: NSHomeDirectory())
    guard let values = try? home.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
          let bytes = values.volumeAvailableCapacityForImportantUsage else { return -1 }
    return bytes
  }
  static var usableOverride: Int64?
  /// A still plus a short motion clip can fail to save below this. Same 300 MiB as DeviceStorage.java.
  static let lowBytes: Int64 = 300 * 1024 * 1024
  static func low(_ bytes: Int64) -> Bool { bytes >= 0 && bytes < lowBytes }
}

// MARK: - Export state

/// What the Photos library says about a moment we exported. Recorded at export as exportAssetId.
enum MomentExport {
  struct State { let known: Bool; let exported: Bool; let path: String? ; var confirmed: Bool { known && exported } }

  /// Full or limited library access can confirm the asset still exists (assets this app created are always visible
  /// under limited access). Add-only access cannot look, so a recorded export reads as "无法确认", never as deleted.
  static func state(_ dir: URL) -> State {
    guard let meta = try? MomentStore.metadata(dir), let asset = meta["exportAssetId"] as? String, !asset.isEmpty else {
      return State(known: true, exported: false, path: nil)
    }
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    guard status == .authorized || status == .limited else { return State(known: false, exported: true, path: "照片 App") }
    let found = PHAsset.fetchAssets(withLocalIdentifiers: [asset], options: nil).firstObject != nil
    return State(known: true, exported: found, path: found ? "照片 App · \(dir.lastPathComponent)" : nil)
  }

  /// Album badge: recorded exports count, so the badge does not vanish just because the library cannot be read.
  static func badge(_ dir: URL) -> Bool { let s = state(dir); return s.exported }
}

// MARK: - Details (port of MomentDetails / MomentExif / MomentFacts)

enum MomentFacts {
  static func origin(demo: Bool, cameraTriggered: Bool) -> String { demo ? "演示" : cameraTriggered ? "机身快门同步" : "App 快门" }
  static func transport(_ kind: String) -> String {
    switch kind { case "": return "未知"; case "usb": return "USB"; case "wifi": return "Wi-Fi（实验）"; case "demo": return "演示"; default: return kind }
  }
  static func cameraName(make: String?, model: String?) -> String? {
    let made = make?.trimmingCharacters(in: .whitespaces).nilIfEmpty, named = model?.trimmingCharacters(in: .whitespaces).nilIfEmpty
    guard let named else { return made }
    if let made, !named.lowercased().contains(made.lowercased()) { return "\(made) \(named)" }
    return named
  }
  static func iso(_ value: Int) -> String? { value > 0 ? "ISO \(value)" : nil }
  static func shutter(_ seconds: Double) -> String? {
    guard seconds > 0, seconds.isFinite else { return nil }
    if seconds >= 1 { return trim(seconds) + "s" }
    return "1/\(max(1, Int((1 / seconds).rounded())))"
  }
  static func aperture(_ value: Double) -> String? { value > 0 && value.isFinite ? "f/" + trim(value) : nil }
  static func focal(_ mm: Double) -> String? { mm > 0 && mm.isFinite ? trim(mm) + " mm" : nil }
  private static func trim(_ value: Double) -> String {
    let rounded = (value * 10).rounded() / 10
    return abs(rounded - rounded.rounded()) < 0.05 ? String(Int(rounded.rounded())) : String(rounded)
  }
}

extension String { var nilIfEmpty: String? { isEmpty ? nil : self } }

enum MomentDetails {
  static func read(_ dir: URL) throws -> Meta {
    let meta = try MomentStore.metadata(dir)
    let demo = meta["demo"] as? Bool ?? false
    let source = meta["source"] as? String ?? ""
    let cameraFile: Any = demo || source.isEmpty || source == "DEMO.jpg" ? NSNull() : source
    var out: Meta = [
      "origin": MomentFacts.origin(demo: demo, cameraTriggered: meta["cameraTriggered"] as? Bool ?? false),
      "transport": MomentFacts.transport(meta["transport"] as? String ?? (demo ? "demo" : "")),
      "cameraFile": cameraFile,
      "capturedAt": meta["createdAt"] as? Double ?? 0,
      "lutApplied": meta["lutApplied"] as? Bool ?? false,
      "directory": dir.path,
    ]
    let lut = meta["lut"] as? String
    out["lut"] = lut?.nilIfEmpty ?? NSNull()
    for (key, value) in exif(dir.appendingPathComponent("original.jpg")) { out[key] = value }
    out["files"] = ["original.jpg", "rendered.jpg", "motion.mp4", "MOMENT_MP.jpg"].compactMap { name -> Meta? in
      let file = dir.appendingPathComponent(name)
      guard let size = (try? FileManager.default.attributesOfItem(atPath: file.path))?[.size] as? Int else { return nil }
      return ["name": name, "bytes": size]
    }
    let export = MomentExport.state(dir)
    out["exportKnown"] = export.known; out["exported"] = export.exported; out["exportPath"] = export.path ?? NSNull()
    return out
  }

  /// EXIF labels for one original.jpg. Missing tags stay null; a bad header does not fail the panel.
  private static func exif(_ file: URL) -> Meta {
    var out: Meta = ["camera": NSNull(), "lens": NSNull(), "iso": NSNull(), "shutter": NSNull(), "aperture": NSNull(), "focalLength": NSNull(), "width": NSNull(), "height": NSNull()]
    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any] else { return out }
    let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
    let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
    out["camera"] = MomentFacts.cameraName(make: tiff[kCGImagePropertyTIFFMake] as? String, model: tiff[kCGImagePropertyTIFFModel] as? String) ?? NSNull()
    out["lens"] = (exif[kCGImagePropertyExifLensModel] as? String)?.trimmingCharacters(in: .whitespaces).nilIfEmpty ?? NSNull()
    out["iso"] = MomentFacts.iso((exif[kCGImagePropertyExifISOSpeedRatings] as? [Int])?.first ?? -1) ?? NSNull()
    out["shutter"] = MomentFacts.shutter(exif[kCGImagePropertyExifExposureTime] as? Double ?? -1) ?? NSNull()
    out["aperture"] = MomentFacts.aperture(exif[kCGImagePropertyExifFNumber] as? Double ?? -1) ?? NSNull()
    out["focalLength"] = MomentFacts.focal(exif[kCGImagePropertyExifFocalLength] as? Double ?? -1) ?? NSNull()
    var width = props[kCGImagePropertyPixelWidth] as? Int ?? 0, height = props[kCGImagePropertyPixelHeight] as? Int ?? 0
    if let orientation = props[kCGImagePropertyOrientation] as? Int, (5...8).contains(orientation) { swap(&width, &height) }
    if width > 0 && height > 0 { out["width"] = width; out["height"] = height }
    return out
  }
}
