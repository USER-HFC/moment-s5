import Foundation
import UIKit

protocol CaptureListener: AnyObject {
  func status(_ message: String, ready: Bool)
  func frame(_ jpeg: Data, bufferedUs: Int64, demo: Bool)
  func saved(_ directory: URL)
  func failed(_ directory: URL, _ message: String)
  func log(_ message: String)
  func exposure(_ value: String)
}

/// The capture session behind the shutter. Port of CaptureEngine.java: the synthetic demo and the
/// experimental Wi-Fi transport share the pre-shutter ring, the save layout and the status lines, so USB
/// can slot in later without changing what JS sees.
final class CaptureEngine {
  private weak var listener: CaptureListener?
  private let store: MomentStore
  private let worker = DispatchQueue(label: "moment.capture")
  private let exporter = DispatchQueue(label: "moment.export")
  private let ring = FrameRing(windowUs: 4_500_000, maxBytes: 32 * 1024 * 1024)
  private let lock = NSLock()
  private var polling: DispatchSourceTimer?
  private var microphone: AudioRing?
  private var logs: [String] = []
  /// Stable accctrl identity, so the body recognises this install after it was approved once.
  private let wifiClientId: URL

  // Guarded by lock. Read from the JS method queue, written from the worker.
  private var _active = false, _demo = false, _busy = false, _shuttingDown = false, _audio = false
  private var _lut: LutEngine?
  private var _camera: CameraTransport?
  private var _transport = "usb"
  /// The catalog read while preparing the session, before any shutter tap.
  private var preparedHandles: CaptureBaseline?
  private var epoch = 0

  init(store: MomentStore, listener: CaptureListener) {
    self.store = store; self.listener = listener
    let support = (try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)) ?? FileManager.default.temporaryDirectory
    wifiClientId = support.appendingPathComponent("wifi-client-id")
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try body() }
  var active: Bool { locked { _active } }
  var demoMode: Bool { locked { _demo } }
  var busy: Bool { locked { _busy } }
  var audioEnabled: Bool { locked { _audio } }
  var lutTitle: String? { locked { _lut?.title } }
  var transportKind: String { locked { _demo ? "demo" : _transport } }
  private var camera: CameraTransport? { locked { _camera } }
  /// A camera session exists, connected or still opening.
  var hasCamera: Bool { locked { _camera != nil } }
  var cameraModel: String? { locked { _active && !_demo ? _camera?.cameraModel : nil } }
  var supportsAutofocus: Bool { camera?.capabilities.autofocus ?? false }
  var supportsManualFocus: Bool { camera?.capabilities.manualFocus ?? false }
  var exposureValue: String {
    let (active, demo, camera) = locked { (_active, _demo, _camera) }
    return !active ? "" : demo ? "演示素材 · 无相机连接" : camera?.exposure ?? ""
  }
  /// Cached reads only: neither a JS state request nor a preview event issues camera I/O.
  var exposureAgeMs: Int64? {
    let (active, demo, camera) = locked { (_active, _demo, _camera) }
    guard active, !demo, let sampled = camera?.exposureUpdatedAtUs, sampled > 0 else { return nil }
    return max(0, monotonicMicros() - sampled) / 1000
  }
  var ready: Bool { locked { _active && !_busy } && !ring.preCaptureWindow(monotonicMicros()).isEmpty }

  func diagnostics() -> String { locked { logs.joined(separator: "\n") } }

  private func log(_ message: String) {
    // Elapsed ms keeps order across sleeps; the second number is wall-clock ms so the page can show HH:mm:ss.
    let line = "\(monotonicMicros() / 1000) \(Int64(Date().timeIntervalSince1970 * 1000)) \(message)"
    locked { logs.append(line); if logs.count > 250 { logs.removeFirst() } }
    listener?.log(message)
  }

  // MARK: Session

  func setLut(_ value: LutEngine?) throws {
    try locked {
      if _busy { throw LumixError("拍摄处理中，请稍后再切换 LUT") }
      _lut = value
    }
    ring.clear()
    log(value == nil ? "LUT 已关闭，正在重建预缓存" : "LUT 已启用：\(value!.title)，正在重建预缓存")
  }

  func demo() {
    if locked({ _busy || _shuttingDown }) { listener?.status("正在保存，请稍候", ready: false); return }
    let requested = locked { epoch }
    worker.async { [self] in
      if locked({ _busy || _shuttingDown || requested != epoch }) { return }
      disconnectNow(invalidate: true)
      locked { _demo = true; _active = true; preparedHandles = nil }
      log("进入演示：全部图像由 App 生成，不代表真实相机画面")
      listener?.exposure("演示素材 · 无相机连接")
      startPolling()
    }
  }

  func connectWifi(route: WifiRoute, endpoint: String, port: Int, debug: Bool) {
    connectTransport(kind: "wifi", message: "正在连接 Wi-Fi（实验）· 请在机身确认…") { [self] in
      try WifiTransport(route: route, endpoint: endpoint, port: port, debug: debug, clientId: try WifiProtocol.clientId(wifiClientId)) { [weak self] in self?.log($0) }
    }
  }

  private func connectTransport(kind: String, message: String, create: @escaping () throws -> CameraTransport) {
    if locked({ _busy || _shuttingDown }) { listener?.status("正在保存，请稍候", ready: false); return }
    let requested = locked { epoch }
    worker.async { [self] in
      if locked({ _busy || _shuttingDown || requested != epoch }) { return }
      disconnectNow(invalidate: true)
      let connecting = locked { () -> Int in _transport = kind; return epoch }
      listener?.status(message, ready: false)
      var session: CameraTransport?
      do {
        let created = try create(); session = created
        try locked { if connecting != epoch { throw LumixError("相机连接已取消") }; _camera = created }
        try created.open()
        // Read the catalog while still preparing the session. A slow list must never sit between the
        // user's tap and the shutter.
        do { let handles = try created.prepareCaptureBaseline(); locked { preparedHandles = handles }; log("已准备快门前照片索引") }
        catch {
          if created.freshBaselineRequired { throw LumixError("Wi-Fi 未能建立完整快门前目录基线；未发送快门：\(error.localizedDescription)") }
          locked { preparedHandles = nil }
          log("快门前照片索引暂不可用，将仅接受快门后的照片事件：\(error.localizedDescription)")
        }
        try locked {
          if created.closed || connecting != epoch { throw LumixError("相机会话已失效或连接已取消，请重新连接相机") }
          _active = true; _demo = false
        }
        listener?.exposure(created.exposure)
        startPolling()
      } catch {
        session?.close()
        locked { if _camera === session { _camera = nil }; _active = false }
        fail(error)
      }
    }
  }

  func disconnect() {
    // Invalidate queued shutters and unblock camera reads before waiting for the worker.
    let current = locked { () -> CameraTransport? in epoch += 1; _active = false; _demo = false; preparedHandles = nil; return _camera }
    current?.abort()
    stopAudio()
    worker.async { [self] in disconnectNow(invalidate: false) }
  }

  func shutdown() {
    if locked({ let was = _shuttingDown; _shuttingDown = true; return was }) { return }
    disconnect()
  }

  private func disconnectNow(invalidate: Bool) {
    stopAudio()
    let current = locked { () -> CameraTransport? in
      if invalidate { epoch += 1 }
      _active = false; _demo = false; preparedHandles = nil
      let c = _camera; _camera = nil; return c
    }
    polling?.cancel(); polling = nil
    current?.close()
    ring.clear()
  }

  private func sameSession(_ expectedEpoch: Int, _ expected: CameraTransport?, demo expectedDemo: Bool) -> Bool {
    locked { _active && epoch == expectedEpoch && (expectedDemo ? _demo : expected != nil && _camera === expected && !expected!.closed) }
  }

  private func startPolling() {
    startAudio()
    ring.clear()
    listener?.status(demoMode ? "演示 · 正在预缓存" : "已连接 · 正在预缓存", ready: false)
    let timer = DispatchSource.makeTimerSource(queue: worker)
    timer.schedule(deadline: .now(), repeating: .milliseconds(75))
    timer.setEventHandler { [weak self] in
      guard let self else { return }
      do { try self.grab() } catch { self.disconnectNow(invalidate: true); self.fail(error) }
    }
    polling = timer
    timer.resume()
  }

  private func grab() throws {
    guard let (filter, demo, session) = locked({ _active && !_busy ? (_lut, _demo, _camera) : nil }) else { return }
    let frame: CameraPreview?
    if demo { let us = monotonicMicros(); frame = CameraPreview(jpeg: DemoFrame.jpeg(us: us, width: 960, height: 640), receivedUs: us) }
    else { frame = try session?.preview() }
    guard let frame else { return }
    var bytes = frame.jpeg
    if let filter {
      do { bytes = try filter.applyJpeg(bytes) } catch { log("LUT 取景套用失败：\(error.localizedDescription)") }
    }
    let still = locked { _active && !_busy && _lut === filter }
    if !still { return }
    ring.add(frame.receivedUs, bytes)
    listener?.frame(bytes, bufferedUs: ring.durationUs, demo: demo)
  }

  func focus(_ direction: Int) {
    guard let session = locked({ _active && !_busy && !_demo ? _camera : nil }) else { return }
    worker.async { [self] in
      do { if direction == 0 { try session.autofocus() } else { try session.focus(far: direction > 0) } } catch { fail(error) }
    }
  }

  // MARK: Audio

  func setAudio(_ enabled: Bool) {
    locked { _audio = enabled }
    if !enabled { stopAudio() }
    worker.async { [self] in stopAudio(); if active { startAudio() } }
  }

  private func startAudio() {
    guard locked({ _audio && _active && !_shuttingDown }) else { return }
    let ring = AudioRing()
    do { try ring.start(); locked { microphone = ring }; log("环境声录制已开启") }
    catch { ring.close(); log("收音不可用，本次为无声：\(error.localizedDescription)") }
  }

  private func stopAudio() {
    let current = locked { () -> AudioRing? in let m = microphone; microphone = nil; return m }
    current?.close()
  }

  // MARK: Shutter

  /// Single shot saved by the camera; no download and never an automatic retry.
  func remoteShutter() {
    let snapshot: (Int, CameraTransport?, Bool)? = locked {
      if !_active || _busy || _shuttingDown { return nil }
      _busy = true; preparedHandles = nil
      return (epoch, _camera, _demo)
    }
    guard let (captureEpoch, session, synthetic) = snapshot else { listener?.status("相机未连接或正在处理拍摄", ready: false); return }
    worker.async { [self] in
      var result: String?, failure: Error?
      do {
        if !sameSession(captureEpoch, session, demo: synthetic) { throw LumixError("相机已断开，未触发快门") }
        if !synthetic, let session {
          let before = session.freshBaselineRequired ? try session.prepareCaptureBaseline() : nil
          if !sameSession(captureEpoch, session, demo: false) { throw LumixError("相机已断开，未触发快门") }
          try session.shutter()
          if session.freshBaselineRequired {
            _ = try session.awaitNewJpeg(before) { sameSession(captureEpoch, session, demo: false) }
            session.completeWithoutDownload()
          }
        }
        result = synthetic ? "演示：遥控快门已触发（未连接机身）" : "遥控指令已完成 · 请在机身确认照片"
        log(result!)
      } catch { failure = error }
      ring.clear(); locked { _busy = false }
      if let failure { fail(failure) } else { listener?.status(result!, ready: false) }
    }
  }

  func capture(motion: Bool) {
    // Freeze the button boundary before queueing any work: the clip must stay pre-tap.
    let shutterUs = monotonicMicros()
    let pre = motion ? ring.preCaptureWindow(shutterUs) : []
    let snapshot: (LutEngine?, Int, AudioRing?, Bool, CameraTransport?, CaptureBaseline?)? = locked {
      if !_active || _busy || _shuttingDown || (!_demo && _camera == nil) || (motion && pre.isEmpty) { return nil }
      _busy = true
      return (_lut, epoch, motion ? microphone : nil, _demo, _camera, preparedHandles)
    }
    guard let (filter, captureEpoch, recording, demo, session, prepared) = snapshot else {
      listener?.status(motion ? "请等待预缓存填满，并确认取景持续更新" : "相机未连接或正在处理拍摄", ready: false); return
    }
    let kind = demo ? "demo" : session?.kind ?? "usb"
    worker.async { [self] in
      var dir: URL?
      var meta: Meta = [:]
      do {
        if !sameSession(captureEpoch, session, demo: demo) { throw LumixError("相机已断开，尚未触发快门") }
        let from = shutterUs - FrameRing.preCaptureUs, to = shutterUs
        var audio: [Int16]?
        // Snapshot audio before the shutter command can block or age the ring out.
        if let recording { do { audio = try recording.slice(from: from, to: to) } catch { log(error.localizedDescription) } }
        var baseline = prepared
        if !demo, let session, session.freshBaselineRequired { baseline = try session.prepareCaptureBaseline() }
        if !sameSession(captureEpoch, session, demo: demo) { throw LumixError("相机已断开，尚未触发快门") }
        listener?.status(motion ? "正在拍摄 · 已保留快门前 3 秒" : "正在拍摄照片", ready: false)
        let shutterSentUs = monotonicMicros()
        if !demo { try session!.shutter() }
        let shutterDoneUs = monotonicMicros()
        if !sameSession(captureEpoch, session, demo: demo) { throw LumixError("拍摄期间连接中断；请检查机身 SD 卡中的原片") }
        let folder = try store.create(); dir = folder
        meta = ["schema": 1, "demo": demo, "createdAt": Int64(Date().timeIntervalSince1970 * 1000),
                "captureMode": motion ? "pre-only" : "photo", "mediaType": motion ? "motion" : "photo",
                "lutRequested": filter?.title ?? NSNull(), "lut": NSNull(), "lutApplied": false, "complete": false,
                "frames": pre.count, "durationUs": motion ? FrameRing.preCaptureUs : 0, "audio": false, "hasPostFrames": false,
                "transport": kind, "experimentalWifi": kind == "wifi"]
        let original = folder.appendingPathComponent("original.jpg")
        var timing = SyncTiming(tapUs: shutterUs, shutterSentUs: shutterSentUs, shutterDoneUs: shutterDoneUs)
        if demo {
          try DemoFrame.jpeg(us: shutterUs, width: 2400, height: 1600).write(to: original)
          meta["source"] = "DEMO.jpg"
        } else if let session {
          listener?.status(motion ? "动态已缓存 · 正在接收原尺寸照片" : "正在接收原尺寸照片", ready: false)
          let source = try session.awaitNewJpeg(baseline) { sameSession(captureEpoch, session, demo: false) }
          timing.found = monotonicMicros()
          meta["source"] = source.filename
          try MomentStore.write(meta, to: folder)
          let part = folder.appendingPathComponent("original.jpg.part")
          defer { try? FileManager.default.removeItem(at: part) }
          try session.downloadOriginal(source, to: part)
          timing.bytes = Int64((try? FileManager.default.attributesOfItem(atPath: part.path)[.size] as? Int) ?? 0)
          timing.downloaded = monotonicMicros()
          try FileManager.default.moveItem(at: part, to: original)
          // Refresh the next button boundary after this transfer; it can never delay the current capture.
          do { let next = try session.prepareCaptureBaseline(); locked { preparedHandles = next } }
          catch { locked { preparedHandles = nil }; log("下一次拍摄的照片索引暂不可用：\(error.localizedDescription)") }
        }
        try MomentStore.write(meta, to: folder)
        let lutStartUs = monotonicMicros()
        let applied = try renderLut(folder, original: original, filter: filter, motion: motion)
        timing.lut = applied ? monotonicMicros() - lutStartUs : -1
        meta["lut"] = applied ? filter!.title : NSNull(); meta["lutApplied"] = applied; meta["audio"] = audio != nil
        meta["shutterTimeBasis"] = motion ? "button-tap pre-shutter buffer snapshot; exposure time is approximate" : "button-tap request; camera exposure time is approximate"
        if !demo { log(timing.line(motion ? "动态照片原片" : "拍照", endUs: monotonicMicros())) }
        if !motion {
          meta["complete"] = true; meta.removeValue(forKey: "error")
          try MomentStore.write(meta, to: folder)
          ring.clear(); locked { _busy = false }
          listener?.saved(folder); listener?.status(CaptureEngine.savedStatus(motion: false, lutApplied: applied, lutTitle: filter?.title), ready: false)
          return
        }
        let fps = VideoEncoder.fps
        // The still marker uses the last encoded sample, never an out-of-range end timestamp.
        let stillUs = (Int64((Double(to - from) * Double(fps) / 1_000_000).rounded(.up)) - 1) * 1_000_000 / fps
        meta["stillUs"] = stillUs; meta["shutterOffsetUs"] = shutterUs - from; meta["durationUs"] = to - from
        meta["maxGapMs"] = max(FrameRing.maxGap(pre), to - (pre.last?.us ?? to)) / 1000
        meta["motionQuality"] = demo ? "synthetic demo" : kind == "wifi" ? "experimental unverified Wi-Fi preview, not camera-recorded video" : "USB preview, not camera-recorded video"
        meta["error"] = "动态照片还在生成，已接收的原片可以分享"
        try MomentStore.write(meta, to: folder)
        listener?.status("原片已接收 · 正在生成动态照片", ready: false)
        exporter.async { [self] in
          var failure: Error?
          do {
            let video = folder.appendingPathComponent("motion.mp4")
            try VideoEncoder.encode(pre, from: from, to: to, audio: audio, output: video)
            try MotionPhoto.write(jpeg: folder.appendingPathComponent(applied ? "rendered.jpg" : "original.jpg"), mp4: video,
                                  output: folder.appendingPathComponent("MOMENT_MP.jpg"), stillUs: stillUs)
            meta["complete"] = true; meta.removeValue(forKey: "error")
            try MomentStore.write(meta, to: folder)
          } catch { saveFailure(folder, &meta, error); failure = error }
          ring.clear(); locked { _busy = false }
          // Observers must see the completed state when the result event arrives.
          if let failure { listener?.failed(folder, failure.localizedDescription); fail(failure) }
          else {
            listener?.saved(folder)
            log("已合成 \(pre.count) 帧，最长取景间隔 \(FrameRing.maxGap(pre) / 1000) ms")
            listener?.status(CaptureEngine.savedStatus(motion: true, lutApplied: applied, lutTitle: filter?.title), ready: false)
          }
        }
      } catch {
        if let dir { saveFailure(dir, &meta, error) }
        ring.clear(); locked { _busy = false }
        if let dir { listener?.failed(dir, error.localizedDescription) }
        fail(error)
      }
    }
  }

  /// rendered.jpg from the camera bytes; original.jpg is never changed. A photo reports a LUT failure;
  /// a motion photo keeps original-camera.jpg and continues without the look.
  private func renderLut(_ dir: URL, original: URL, filter: LutEngine?, motion: Bool) throws -> Bool {
    guard let filter else { return false }
    let still = try Data(contentsOf: original)
    if motion { try still.write(to: dir.appendingPathComponent("original-camera.jpg")) }
    do { try filter.applyJpeg(still).write(to: dir.appendingPathComponent("rendered.jpg"), options: .atomic); return true }
    catch {
      if !motion { throw LumixError("LUT 处理失败，原片已保留：\(error.localizedDescription)") }
      log("LUT 原片套用失败，保留相机原片：\(error.localizedDescription)"); return false
    }
  }

  private func saveFailure(_ dir: URL, _ meta: inout Meta, _ error: Error) {
    meta["complete"] = false; meta["error"] = error.localizedDescription
    do { try MomentStore.write(meta, to: dir) } catch { log("失败记录写入失败：\(error.localizedDescription)") }
  }

  private func fail(_ error: Error) {
    log("\(type(of: error)): \(error.localizedDescription)")
    listener?.status(error.localizedDescription, ready: false)
  }

  /// The save notice is this status line, so the type and LUT name match the shot that was stored.
  static func savedStatus(motion: Bool, lutApplied: Bool, lutTitle: String?) -> String {
    let base = motion ? "动态照片已保存" : "照片已保存"
    guard lutApplied else { return base }
    var name = (lutTitle ?? "").trimmingCharacters(in: .whitespaces)
    for prefix in ["内置 · ", "Fuji 风格 · "] where name.hasPrefix(prefix) { name = String(name.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces) }
    return name.isEmpty ? base : "\(base) · \(name)"
  }
}

/// Where one photo's sync time went, for the diagnostics log. Port of SyncTiming.java; -1 means the
/// stage did not run.
struct SyncTiming {
  let tapUs: Int64, shutterSentUs: Int64, shutterDoneUs: Int64
  var found: Int64 = -1, downloaded: Int64 = -1, bytes: Int64 = -1, lut: Int64 = -1

  /// e.g.「同步耗时 · 拍照 · 快门 420 ms · 等新照片 310 ms · 传输 1830 ms（12.4 MB，6.8 MB/s） · LUT 640 ms · 合计 3.4 s」
  func line(_ kind: String, endUs: Int64) -> String {
    var out = "同步耗时 · \(kind)"
    if shutterDoneUs > shutterSentUs { out += " · 快门 \(SyncTiming.ms(shutterDoneUs - shutterSentUs))" }
    if found >= 0 && found > shutterDoneUs { out += " · 等新照片 \(SyncTiming.ms(found - shutterDoneUs))" }
    if downloaded >= 0 && found >= 0 {
      let us = max(1, downloaded - found)
      out += " · 传输 \(SyncTiming.ms(us))"
      if bytes > 0 {
        let mb = Double(bytes) / 1_048_576
        out += String(format: "（%.1f MB，%.1f MB/s）", mb, mb / (Double(us) / 1_000_000))
      }
    }
    if lut >= 0 { out += " · LUT \(SyncTiming.ms(lut))" }
    out += " · 合计 \(SyncTiming.seconds(endUs - tapUs))"
    return out
  }

  private static func ms(_ us: Int64) -> String { "\(us / 1000) ms" }
  private static func seconds(_ us: Int64) -> String { us < 10_000_000 ? String(format: "%.1f s", Double(us) / 1_000_000) : "\(us / 1_000_000) s" }
}

/// The synthetic scene, drawn like CaptureEngine.demoFrame on Android: a dusk landscape with a moving light.
enum DemoFrame {
  static func jpeg(us: Int64, width: Int, height: Int) -> Data {
    let w = CGFloat(width), h = CGFloat(height)
    let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
    let image = UIGraphicsImageRenderer(size: CGSize(width: w, height: h), format: format).image { ctx in
      let c = ctx.cgContext
      let space = CGColorSpaceCreateDeviceRGB()
      if let gradient = CGGradient(colorsSpace: space, colors: [rgb(0x779482), rgb(0x182c2c)] as CFArray, locations: [0, 1]) {
        c.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: w, y: h), options: [.drawsBeforeStartLocation, .drawsAfterEndLocation])
      }
      let t = CGFloat(us % 8_000_000) / 8_000_000, x = w * (0.18 + 0.64 * t)
      fill(c, 0xe3d9b7, CGRect(x: w * 0.7 - h * 0.11, y: h * 0.25 - h * 0.11, width: h * 0.22, height: h * 0.22))
      fill(c, 0x2b4942, CGRect(x: -w * 0.2, y: h * 0.4, width: w, height: h))
      fill(c, 0x112c29, CGRect(x: w * 0.3, y: h * 0.55, width: w, height: h * 0.85))
      let y = h * 0.55 + sin(t * .pi * 2) * h * 0.08, r = h * 0.026
      fill(c, 0xf2f2f2, CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2))
      let label = NSAttributedString(string: "SYNTHETIC DEMO", attributes: [
        .font: UIFont.systemFont(ofSize: h * 0.022), .foregroundColor: UIColor(red: 0xEF / 255, green: 0xF3 / 255, blue: 0xE9 / 255, alpha: 0x80 / 255),
      ])
      let size = label.size()
      label.draw(at: CGPoint(x: w * 0.5 - size.width / 2, y: h * 0.70 - size.height * 0.8))
    }
    return image.jpegData(compressionQuality: 0.9) ?? Data()
  }

  private static func rgb(_ hex: Int) -> CGColor {
    CGColor(srgbRed: CGFloat(hex >> 16 & 255) / 255, green: CGFloat(hex >> 8 & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
  }
  private static func fill(_ c: CGContext, _ hex: Int, _ oval: CGRect) { c.setFillColor(rgb(hex)); c.fillEllipse(in: oval) }
}
