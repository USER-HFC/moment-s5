import AVFoundation
import Foundation
import UIKit

/// The JS contract in mobile/src/native.ts, implemented for iOS. Same method names, payloads and
/// Chinese messages as MomentS5Module.java. Wi-Fi is the experimental transport ported from Android;
/// USB is not in this build yet, so connect() says so instead of pretending.
@objc(MomentLumix)
final class MomentLumix: RCTEventEmitter, CaptureListener {
  private static let defaultCameraIp = "192.168.54.1"
  private static let events = ["cameraStatus", "cameraFrame", "cameraSaved", "cameraFailed", "cameraLog", "cameraExposure", "phoneBattery", "cameraScopes", "usbCameraAttached", "volumeShutter"]

  private let queue = DispatchQueue(label: "moment.module")
  private let files = DispatchQueue(label: "moment.files")
  private var store: MomentStore!
  private var engine: CaptureEngine!
  private var lutDir: URL!
  private var listening = false
  private var rerendering = false
  private let prefs = UserDefaults(suiteName: "moment.preferences") ?? .standard

  override init() {
    super.init()
    do {
      store = try MomentStore()
      let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
      lutDir = support.appendingPathComponent("luts", isDirectory: true)
      try FileManager.default.createDirectory(at: lutDir, withIntermediateDirectories: true)
    } catch {
      NSLog("MomentLumix storage unavailable: %@", error.localizedDescription)
    }
    engine = CaptureEngine(store: store, listener: self)
    DispatchQueue.main.async { [weak self] in
      self?.watchBattery()
      NotificationCenter.default.addObserver(self as Any, selector: #selector(MomentLumix.enteredBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
    }
  }

  /// iOS suspends the camera sockets in the background, so the session ends cleanly here instead of
  /// timing out later. Android does the same when the app pauses.
  @objc private func enteredBackground() {
    queue.async { [self] in
      guard engine.hasCamera else { return }
      engine.disconnect()
      status("App 切到后台，Wi-Fi 已断开 · 回来后请重新连接", ready: false)
    }
  }

  deinit { NotificationCenter.default.removeObserver(self); engine?.shutdown() }

  override static func requiresMainQueueSetup() -> Bool { false }
  override var methodQueue: DispatchQueue! { queue }
  override func supportedEvents() -> [String]! { MomentLumix.events }
  override func startObserving() { listening = true }
  override func stopObserving() { listening = false }

  static func modelIdentifier() -> String {
    if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"], !simulated.isEmpty { return simulated }
    var info = utsname(); uname(&info)
    return withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
  }

  override func constantsToExport() -> [AnyHashable: Any]! {
    let info = Bundle.main.infoDictionary ?? [:]
    func text(_ key: String) -> String { let v = (info[key] as? String ?? "").trimmingCharacters(in: .whitespaces); return v.isEmpty ? "未知" : v }
    #if DEBUG
    let buildType = "debug"
    #else
    let buildType = "release"
    #endif
    return [
      // The any-host fixture entry (tools/s5-wifi/mock_camera.py) exists only in debug builds.
      "wifiDebugEnabled": buildType == "debug",
      "platform": "ios",
      // RN has no phone model on iOS; the diagnostics header reads this instead (e.g. iPhone17,1).
      "deviceModel": MomentLumix.modelIdentifier(),
      "buildInfo": [
        "versionName": text("MomentVersionName") == "未知" ? text("CFBundleShortVersionString") : text("MomentVersionName"), "versionCode": text("CFBundleVersion"),
        "builtAt": text("MomentBuiltAt"), "git": text("MomentGit"), "buildType": buildType,
        "abi": "arm64", "minSdk": text("MinimumOSVersion"),
      ],
    ]
  }

  private func emit(_ name: String, _ body: [String: Any]) {
    guard listening, bridge != nil else { return }
    sendEvent(withName: name, body: body)
  }

  // MARK: CaptureListener

  func status(_ message: String, ready: Bool) { emit("cameraStatus", ["message": message, "ready": ready]) }
  func frame(_ jpeg: Data, bufferedUs: Int64, demo: Bool) {
    emit("cameraFrame", ["jpegBase64": jpeg.base64EncodedString(), "bufferedUs": Double(bufferedUs), "ready": engine.ready, "demo": demo,
                         "exposure": engine.exposureValue, "exposureAgeMs": exposureAge()])
  }
  private func exposureAge() -> Any { engine.exposureAgeMs.map { Double($0) } ?? NSNull() }
  func saved(_ directory: URL) { emit("cameraSaved", ["directory": directory.path]) }
  func failed(_ directory: URL, _ message: String) { emit("cameraFailed", ["directory": directory.path, "error": message.isEmpty ? "动态照片处理失败" : message]) }
  func log(_ message: String) { emit("cameraLog", ["message": message]) }
  func exposure(_ value: String) { emit("cameraExposure", ["value": value, "exposureAgeMs": exposureAge()]) }

  // MARK: Connection

  @objc func connect(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    reject("USB_CONNECT", "iOS 版的 USB 连接还在开发中，可以先体验演示", nil)
  }
  /// The user joins the camera network in Settings first: joining by SSID needs the Hotspot Configuration
  /// entitlement, which this build does not carry. Camera traffic is pinned to that Wi-Fi interface.
  @objc func connectWifi(_ options: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    if engine.busy { reject("WIFI_BUSY", "正在保存，请稍候", nil); return }
    let debugEndpoint = (options["debugEndpoint"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    let debug = debugEndpoint != nil
    #if !DEBUG
    if debug { reject("WIFI_DEBUG_DISABLED", "模拟相机调试仅限 debug 版本", nil); return }
    #endif
    if !(options["manual"] as? Bool ?? true) && !debug { reject("WIFI_CONNECT", "请先在「设置」→「无线局域网」加入相机网络，再回来连接", nil); return }
    let endpoint = debugEndpoint ?? (options["cameraIp"] as? String ?? MomentLumix.defaultCameraIp)
    let port = debug ? (options["udpPort"] as? NSNumber)?.intValue ?? 49152 : 49152
    engine.disconnect()
    do {
      let target = try WifiProtocol.cameraUrl(endpoint, debug: debug)
      let route = debug ? WifiRoute(interface: nil) : try WifiRoute.camera(target.host ?? "")
      engine.connectWifi(route: route, endpoint: endpoint, port: port, debug: debug)
      status("正在连接 Wi-Fi（实验）· 未经真机验证", ready: false)
      resolve(nil)
    } catch { reject("WIFI_CONNECT", error.localizedDescription, error) }
  }
  @objc func demo() { engine.demo() }
  @objc func disconnect() { engine.disconnect(); status("相机已断开 · 请重新连接", ready: false) }
  @objc func capture() { engine.capture(motion: true) }
  @objc func captureStill() { engine.capture(motion: false) }
  @objc func remoteShutter() { engine.remoteShutter() }
  @objc func focus(_ direction: NSNumber) { engine.focus(direction.intValue) }
  @objc func setCaptureScreen(_ capture: Bool) {}
  @objc func setAudio(_ enabled: Bool) { engine.setAudio(enabled) }

  @objc func getState(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve([
      "active": engine.active, "busy": engine.busy, "ready": engine.ready, "demo": engine.demoMode, "audio": engine.audioEnabled,
      "lut": engine.lutTitle ?? NSNull(), "transport": engine.transportKind, "exposure": engine.exposureValue, "exposureAgeMs": exposureAge(),
      "phoneBattery": batteryMap(), "cameraBattery": NSNull(), "autofocus": engine.supportsAutofocus, "manualFocus": engine.supportsManualFocus,
      "cameraModel": engine.cameraModel ?? NSNull(),
    ])
  }
  @objc func diagnostics(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(engine.diagnostics()) }

  // MARK: LUTs

  @objc func setLut(_ id: String?, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      if engine.busy { throw LumixError("拍摄处理中，请稍后再切换 LUT") }
      try engine.setLut(try loadLut(id))
      resolve(engine.lutTitle ?? NSNull())
    } catch { reject("LUT_INVALID", error.localizedDescription, error) }
  }
  @objc func activeLut(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) { resolve(engine.lutTitle ?? NSNull()) }

  @objc func listLuts(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    var out: [[String: Any]] = BuiltInLuts.entries.map { ["id": $0.id, "name": $0.name, "size": $0.bytes, "builtIn": true, "readOnly": true] }
    let names = ((try? FileManager.default.contentsOfDirectory(atPath: lutDir.path)) ?? [])
      .filter { $0.lowercased().hasSuffix(".cube") }.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    for name in names {
      let file = lutDir.appendingPathComponent(name)
      let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0
      let title = (try? LutEngine.load(file).title) ?? name
      out.append(["id": name, "name": title, "size": size, "builtIn": false, "readOnly": false])
    }
    resolve(out)
  }

  @objc func importLut(_ uri: String, name displayName: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      let temp = lutDir.appendingPathComponent("lut-import-\(UUID().uuidString).part")
      defer { try? FileManager.default.removeItem(at: temp) }
      do {
        guard let source = URL(string: uri), source.isFileURL else { throw LumixError("无法读取 LUT 文件") }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let requested = MomentLumix.cleanName(displayName)
        let zip = requested.lowercased().hasSuffix(".zip")
        var fallback = requested.replacingOccurrences(of: "(?i)\\.zip$", with: ".cube", options: .regularExpression)
        if zip { fallback = try LutImport.extract(from: source, to: temp) } else { try LutImport.copy(from: source, to: temp) }
        let lut = try LutEngine.load(temp, fallbackTitle: fallback)
        var name = MomentLumix.cleanName(lut.title)
        if !name.lowercased().hasSuffix(".cube") { name = requested.replacingOccurrences(of: "(?i)\\.zip$", with: "", options: .regularExpression) }
        if !name.lowercased().hasSuffix(".cube") { name += ".cube" }
        let target = try uniqueLutFile(name)
        try FileManager.default.moveItem(at: temp, to: target)
        resolve(["id": target.lastPathComponent, "name": lut.title])
      } catch { reject("LUT_IMPORT", error.localizedDescription, error) }
    }
  }

  private func loadLut(_ id: String?) throws -> LutEngine? {
    guard let id, !id.isEmpty, id != "off" else { return nil }
    if BuiltInLuts.isBuiltIn(id) { return try BuiltInLuts.load(id) }
    let file = try safeLutFile(id)
    guard FileManager.default.fileExists(atPath: file.path) else { throw LumixError("LUT 不存在") }
    return try LutEngine.load(file)
  }

  private func safeLutFile(_ id: String) throws -> URL {
    let file = lutDir.appendingPathComponent(MomentLumix.cleanName(id))
    guard file.deletingLastPathComponent().standardizedFileURL == lutDir.standardizedFileURL else { throw LumixError("非法 LUT 路径") }
    return file
  }

  private func uniqueLutFile(_ name: String) throws -> URL {
    let first = try safeLutFile(name)
    if !FileManager.default.fileExists(atPath: first.path) { return first }
    let stem = name.replacingOccurrences(of: "(?i)\\.cube$", with: "", options: .regularExpression)
    for i in 2..<10000 { let next = try safeLutFile("\(stem)-\(i).cube"); if !FileManager.default.fileExists(atPath: next.path) { return next } }
    throw LumixError("LUT 仓库已存在太多同名文件")
  }

  private static func cleanName(_ raw: String?) -> String {
    let base = (raw.map { ($0 as NSString).lastPathComponent } ?? "imported.cube").trimmingCharacters(in: .whitespaces)
    let name = base.replacingOccurrences(of: "[^A-Za-z0-9._-]", with: "_", options: .regularExpression)
    return name.isEmpty ? "imported.cube" : name
  }

  // MARK: Album

  @objc func listMoments(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in resolve(store.list().compactMap { try? momentMap($0) }) }
  }

  @objc func describeMoment(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      do { resolve(try MomentDetails.read(try store.directory(id))) } catch { reject("MOMENT_DETAILS", error.localizedDescription, error) }
    }
  }

  @objc func exportMoment(_ id: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      PhotoExport.save(try store.directory(id)) { result in
        switch result {
        case .success(let uri): resolve(uri)
        case .failure(let error): reject("MOMENT_EXPORT", error.localizedDescription, error)
        }
      }
    } catch { reject("MOMENT_EXPORT", error.localizedDescription, error) }
  }

  @objc func deleteMoment(_ id: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      if engine.busy { throw LumixError("拍摄处理中，请稍后再删除") }
      if rerendering { throw LumixError("正在套用 LUT，请稍后再删除") }
      try store.delete(id)
      resolve(nil)
    } catch { reject("MOMENT_DELETE", error.localizedDescription, error) }
  }

  @objc func renderMoment(_ id: String, lutId: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if engine.busy { reject("MOMENT_RENDER", "拍摄处理中，请稍后再套用 LUT", nil); return }
    if rerendering { reject("MOMENT_RENDER", "正在套用 LUT", nil); return }
    rerendering = true
    files.async { [self] in
      defer { queue.async { self.rerendering = false } }
      do {
        let dir = try store.directory(id)
        try MomentRender.apply(dir, filter: try loadLut(lutId), lutId: lutId)
        resolve(try momentMap(dir))
      } catch { reject("MOMENT_RENDER", error.localizedDescription, error) }
    }
  }

  @objc func previewMomentLut(_ id: String, lutId: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      do {
        guard let lut = try loadLut(lutId) else { resolve(nil); return }
        let dir = try store.directory(id)
        let jpeg = try MomentRender.preview(dir.appendingPathComponent("original.jpg"), filter: lut, maxEdge: 1600)
        let out = try cacheFile("moment-preview-\(dir.lastPathComponent).jpg")
        try jpeg.write(to: out, options: .atomic)
        resolve(MomentLumix.uri(out))
      } catch { reject("MOMENT_PREVIEW", error.localizedDescription, error) }
    }
  }

  @objc func previewMomentLutThumbnail(_ id: String, lutId: String?, maxEdge: NSNumber, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      do {
        guard let lutId, !lutId.isEmpty, lutId != "off" else { resolve(nil); return }
        let dir = try store.directory(id)
        let original = dir.appendingPathComponent("original.jpg")
        let edge = max(64, min(320, maxEdge.intValue))
        // The original never changes, so a cached thumbnail stays valid until the cache is cleared.
        let out = try cacheFile("moment-thumb-\(dir.lastPathComponent)-\(MomentLumix.stableHash(lutId))-\(edge).jpg")
        if let cached = MomentLumix.modified(out), let source = MomentLumix.modified(original), cached >= source,
           ((try? FileManager.default.attributesOfItem(atPath: out.path)[.size] as? Int) ?? 0) > 0 {
          resolve(MomentLumix.uri(out)); return
        }
        guard let lut = try loadLut(lutId) else { resolve(nil); return }
        try MomentRender.preview(original, filter: lut, maxEdge: edge).write(to: out, options: .atomic)
        resolve(MomentLumix.uri(out))
      } catch { reject("MOMENT_THUMBNAIL", error.localizedDescription, error) }
    }
  }

  @objc func shareMoment(_ id: String, kind: String?, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let dir = try store.directory(id)
      let items = try MomentRender.shareFiles(dir, meta: try MomentStore.metadata(dir), kind: kind)
      present(items, resolve: resolve, reject: reject)
    } catch { reject("MOMENT_SHARE", error.localizedDescription, error) }
  }

  @objc func shareMoments(_ ids: [String], resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      if ids.isEmpty { throw LumixError("还没有选择照片") }
      let items = try ids.map { id -> URL in
        let dir = try store.directory(id)
        return try MomentRender.shareFiles(dir, meta: try MomentStore.metadata(dir), kind: "display")[0]
      }
      present(items, resolve: resolve, reject: reject)
    } catch { reject("MOMENT_SHARE", error.localizedDescription, error) }
  }

  private func present(_ items: [URL], resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let host = RCTPresentedViewController() else { reject("MOMENT_SHARE", "当前无法打开分享", nil); return }
      let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
      if let popover = sheet.popoverPresentationController {
        popover.sourceView = host.view
        popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.maxY - 80, width: 1, height: 1)
      }
      host.present(sheet, animated: true)
      resolve(nil)
    }
  }

  private func momentMap(_ dir: URL) throws -> [String: Any] {
    let meta = try MomentStore.metadata(dir)
    let demo = meta["demo"] as? Bool ?? false
    var transport = meta["transport"] as? String ?? ""
    if transport.isEmpty && demo { transport = "demo" }
    var map: [String: Any] = [
      "id": dir.lastPathComponent, "captureMode": meta["captureMode"] as? String ?? "pre-only", "demo": demo,
      "cameraTriggered": meta["cameraTriggered"] as? Bool ?? false, "transport": transport,
      "source": meta["source"] as? String ?? "动态照片",
      "createdAt": (meta["createdAt"] as? NSNumber)?.doubleValue ?? (MomentLumix.modified(dir) ?? 0),
      "complete": meta["complete"] as? Bool ?? false, "experimentalWifi": meta["experimentalWifi"] as? Bool ?? false,
      "lut": meta["lut"] as? String ?? NSNull(), "exported": MomentExport.badge(dir),
    ]
    if let error = meta["error"] as? String, !error.isEmpty { map["error"] = error }
    if let lutId = meta["lutId"] as? String { map["lutId"] = lutId }
    let original = dir.appendingPathComponent("original.jpg")
    if FileManager.default.fileExists(atPath: original.path) { map["originalUri"] = MomentLumix.uri(original) }
    var image = dir.appendingPathComponent("rendered.jpg")
    if !(meta["lutApplied"] as? Bool ?? false) || !FileManager.default.fileExists(atPath: image.path) { image = original }
    if FileManager.default.fileExists(atPath: image.path) { map["imageUri"] = MomentLumix.uri(image) }
    let video = dir.appendingPathComponent("motion.mp4")
    if meta["captureMode"] as? String != "photo" && FileManager.default.fileExists(atPath: video.path) { map["videoUri"] = MomentLumix.uri(video) }
    return map
  }

  // MARK: Preferences

  private static let flags = ["autoExport": false, "syncBodyPhotos": true, "rememberCapture": false, "onboardingSeen": false,
                              "volumeShutter": true, "reverseFocus": false, "shutterVibration": true]

  private func flag(_ key: String) -> Bool { prefs.object(forKey: key) as? Bool ?? MomentLumix.flags[key] ?? false }

  @objc func getPreferences(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    var map: [String: Any] = [:]
    for key in MomentLumix.flags.keys { map[key] = flag(key) }
    map["capture"] = [
      "motion": prefs.object(forKey: "captureMotion") as? Bool ?? false,
      "grid": prefs.object(forKey: "captureGrid") as? Bool ?? true,
      "guide": MomentLumix.guide(prefs.string(forKey: "captureGuide")),
      "timerSeconds": MomentLumix.timer(prefs.integer(forKey: "captureTimerSeconds")),
    ]
    map["connection"] = ["method": (prefs.string(forKey: "connectionMethod") as Any?) ?? NSNull(),
                         "cameraIp": prefs.string(forKey: "connectionCameraIp") ?? MomentLumix.defaultCameraIp]
    resolve(map)
  }

  @objc func setPreference(_ key: String, value: Bool, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard MomentLumix.flags[key] != nil else { reject("PREFERENCE", "未知的设置项", nil); return }
    prefs.set(value, forKey: key)
    resolve(nil)
  }

  @objc func setConnectionMemory(_ method: String, cameraIp: String, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    guard ["usb", "wifi", "demo"].contains(method) else { reject("PREFERENCE", "未知的连接方式", nil); return }
    guard cameraIp.range(of: "^\\d{1,3}(\\.\\d{1,3}){3}$", options: .regularExpression) != nil else { reject("PREFERENCE", "相机 IP 无效", nil); return }
    prefs.set(method, forKey: "connectionMethod"); prefs.set(cameraIp, forKey: "connectionCameraIp")
    resolve(nil)
  }

  @objc func setCaptureSettings(_ value: NSDictionary, resolver resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    var writes: [String: Any] = [:]
    if let motion = value["motion"] as? Bool { writes["captureMotion"] = motion }
    if let grid = value["grid"] as? Bool { writes["captureGrid"] = grid }
    if value["guide"] != nil {
      guard let raw = value["guide"] as? String, raw == MomentLumix.guide(raw) else { reject("PREFERENCE", "参考框无效", nil); return }
      writes["captureGuide"] = raw
    }
    if let raw = value["timerSeconds"] as? NSNumber {
      let seconds = raw.intValue
      guard Double(seconds) == raw.doubleValue, MomentLumix.timer(seconds) == seconds else { reject("PREFERENCE", "定时时长无效", nil); return }
      writes["captureTimerSeconds"] = seconds
    }
    for (key, item) in writes { prefs.set(item, forKey: key) }
    resolve(nil)
  }

  private static func guide(_ value: String?) -> String { ["off", "3:2", "16:9", "1:1", "4:5"].contains(value ?? "") ? value! : "off" }
  private static func timer(_ seconds: Int) -> Int { [2, 5, 10, 30].contains(seconds) ? seconds : 0 }

  // MARK: Storage

  @objc func storageUsage(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      let usage = store.usage()
      resolve(["count": usage.count, "bytes": Double(usage.bytes), "exportedCount": usage.exportedCount,
               "exportedBytes": Double(usage.exportedBytes), "usableBytes": Double(MomentStore.usableBytes())])
    }
  }

  @objc func usableSpace(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    let free = MomentStore.usableBytes()
    resolve(["usableBytes": Double(free), "storageLow": MomentStore.low(free)])
  }

  @objc func clearExportedCopies(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    files.async { [self] in
      do {
        if engine.busy { throw LumixError("拍摄处理中，请稍后再清理") }
        if queue.sync(execute: { rerendering }) { throw LumixError("正在套用 LUT，请稍后再清理") }
        resolve(["removed": try store.deleteExported()])
      } catch { reject("MOMENT_STORAGE", error.localizedDescription, error) }
    }
  }

  /// Asks once, like the Android permission check; a denial is then explained by the in-app dialog.
  @objc func requestMicrophone(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted: resolve(true)
      case .denied: resolve(false)
      default: AVAudioApplication.requestRecordPermission { resolve($0) }
      }
    } else {
      let session = AVAudioSession.sharedInstance()
      switch session.recordPermission {
      case .granted: resolve(true)
      case .denied: resolve(false)
      default: session.requestRecordPermission { resolve($0) }
      }
    }
  }

  /// The shutter tick. RN's Vibration on iOS ignores the duration and buzzes for about 400 ms.
  @objc func haptic() {
    DispatchQueue.main.async { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
  }

  @objc func openAppSettings(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.main.async {
      guard let url = URL(string: UIApplication.openSettingsURLString) else { reject("SETTINGS", "无法打开系统设置", nil); return }
      UIApplication.shared.open(url) { ok in ok ? resolve(nil) : reject("SETTINGS", "无法打开系统设置", nil) }
    }
  }

  // MARK: Battery

  private var battery: [String: Any] = ["percent": NSNull(), "charging": false]

  private func watchBattery() {
    UIDevice.current.isBatteryMonitoringEnabled = true
    readBattery()
    for name in [UIDevice.batteryLevelDidChangeNotification, UIDevice.batteryStateDidChangeNotification] {
      NotificationCenter.default.addObserver(self, selector: #selector(batteryChanged), name: name, object: nil)
    }
  }

  @objc private func batteryChanged() { readBattery(); emit("phoneBattery", batteryMap()) }

  private func readBattery() {
    let level = UIDevice.current.batteryLevel, state = UIDevice.current.batteryState
    let reading: [String: Any] = ["percent": level < 0 ? NSNull() : Int((level * 100).rounded()), "charging": state == .charging || state == .full]
    queue.async { self.battery = reading }
  }

  private func batteryMap() -> [String: Any] { battery }

  // MARK: Helpers

  private func cacheFile(_ name: String) throws -> URL {
    try FileManager.default.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent(name)
  }

  private static func modified(_ url: URL) -> Double? {
    ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date).map { $0.timeIntervalSince1970 * 1000 }
  }

  /// file:// plus the modification time, so a re-rendered file at the same path is not served from the image cache.
  private static func uri(_ url: URL) -> String { "\(url.absoluteString)?t=\(Int64(modified(url) ?? 0))" }

  /// A hash that is the same on every launch (Swift's hashValue is seeded per process).
  private static func stableHash(_ text: String) -> String {
    var hash: UInt32 = 2_166_136_261
    for byte in text.utf8 { hash = (hash ^ UInt32(byte)) &* 16_777_619 }
    return String(hash, radix: 16)
  }
}

/// Rebuilds a moment's LUT derivative from the untouched original.jpg. Port of MomentRender.java.
enum MomentRender {
  static func apply(_ dir: URL, filter: LutEngine?, lutId: String?) throws {
    let original = dir.appendingPathComponent("original.jpg")
    guard let originalBytes = try? Data(contentsOf: original), !originalBytes.isEmpty else { throw LumixError("没有原片，无法重新套用 LUT") }
    var meta: Meta
    do { meta = try MomentStore.metadata(dir) } catch { throw LumixError("无法读取照片记录") }
    let motion = meta["captureMode"] as? String != "photo"
    let video = dir.appendingPathComponent("motion.mp4")
    let packMotion = motion && ((try? FileManager.default.attributesOfItem(atPath: video.path)[.size] as? Int) ?? 0) >= 12
    let rendered = dir.appendingPathComponent("rendered.jpg"), renderedPart = dir.appendingPathComponent("rendered.jpg.part")
    let packedNext = dir.appendingPathComponent("MOMENT_MP.next.jpg")
    defer { try? FileManager.default.removeItem(at: renderedPart); try? FileManager.default.removeItem(at: packedNext) }
    var applied = false
    if let filter { try filter.applyJpeg(originalBytes).write(to: renderedPart); applied = true }
    if (try? Data(contentsOf: original)) != originalBytes { throw LumixError("原片被修改") }
    // Sharing reads MOMENT_MP.jpg for a motion photo, so the new still is packed with the same video.
    if packMotion {
      try MotionPhoto.write(jpeg: applied ? renderedPart : original, mp4: video, output: packedNext, stillUs: (meta["stillUs"] as? NSNumber)?.int64Value ?? 0)
    }
    let fm = FileManager.default
    if applied { _ = try fm.replaceItemAt(rendered, withItemAt: renderedPart) } else if fm.fileExists(atPath: rendered.path) { try fm.removeItem(at: rendered) }
    if packMotion { _ = try fm.replaceItemAt(dir.appendingPathComponent("MOMENT_MP.jpg"), withItemAt: packedNext) }
    meta["lut"] = applied ? filter!.title : NSNull()
    meta["lutApplied"] = applied
    meta["lutId"] = applied && !(lutId ?? "").isEmpty ? lutId! : NSNull()
    meta["lutRequested"] = applied ? filter!.title : NSNull()
    if meta["captureMode"] as? String == "photo", (meta["error"] as? String ?? "").contains("LUT") { meta["complete"] = true; meta.removeValue(forKey: "error") }
    try MomentStore.write(meta, to: dir)
  }

  static func preview(_ original: URL, filter: LutEngine, maxEdge: Int) throws -> Data {
    guard let bytes = try? Data(contentsOf: original), !bytes.isEmpty else { throw LumixError("没有原片，无法预览 LUT") }
    return try filter.applyJpeg(bytes, maxEdge: maxEdge)
  }

  /// What the share sheet gets. On iOS "motion" shares a Live Photo pair (same-named JPEG and MOV with one
  /// content identifier); the packed MOMENT_MP.jpg is an Android container that iOS shows as a plain photo.
  static func shareFiles(_ dir: URL, meta: Meta, kind: String?) throws -> [URL] {
    let rendered = dir.appendingPathComponent("rendered.jpg"), original = dir.appendingPathComponent("original.jpg")
    let display = (meta["lutApplied"] as? Bool ?? false) && FileManager.default.fileExists(atPath: rendered.path) ? rendered : original
    let video = dir.appendingPathComponent("motion.mp4")
    let files: [URL]
    switch kind ?? "display" {
    case "", "display": files = [display]
    case "original": files = [original]
    case "video": files = [video]
    case "motion":
      guard meta["complete"] as? Bool ?? false else { throw LumixError("动态照片还在生成，稍后再分享") }
      let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("share-live", isDirectory: true)
      try? FileManager.default.removeItem(at: folder)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      let (jpeg, mov) = try LivePhoto.make(still: display, video: video, stillUs: (meta["stillUs"] as? NSNumber)?.int64Value ?? 0, in: folder, name: dir.lastPathComponent)
      files = [jpeg, mov]
    default: throw LumixError("未知分享类型")
    }
    for file in files where ((try? FileManager.default.attributesOfItem(atPath: file.path)[.size] as? Int) ?? 0) == 0 { throw LumixError("文件尚未生成") }
    return files
  }
}
