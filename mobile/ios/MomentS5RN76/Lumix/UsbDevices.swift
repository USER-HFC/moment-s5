import Foundation
import ImageCaptureCore

/// Finds the Panasonic body on the iPhone's USB-C port through ImageCaptureCore. The system owns the USB
/// interface and the PTP session; the app only asks for control and passes vendor operations through.
/// Everything here runs on the main thread, which is where ImageCaptureCore delivers its callbacks.
final class UsbCameraBrowser: NSObject, ICDeviceBrowserDelegate {
  static let shared = UsbCameraBrowser()

  /// A Panasonic camera appeared while the browser was running.
  var onAttach: (() -> Void)?
  /// A camera the app may be holding went away.
  var onDetach: ((ICCameraDevice) -> Void)?

  private let browser = ICDeviceBrowser()
  private var started = false
  /// Devices already plugged in are reported right after start(); those are not a new attach.
  private var startedAt = Date.distantPast

  private override init() {
    super.init()
    browser.delegate = self
    if #available(iOS 15.2, *) {
      browser.browsedDeviceTypeMask = ICDeviceTypeMask(rawValue: ICDeviceTypeMask.camera.rawValue | ICDeviceLocationTypeMask.local.rawValue)!
    }
  }

  static func candidate(_ device: ICDevice) -> Bool { device is ICCameraDevice && Int(device.usbVendorID) == UsbPtp.panasonicVendor }

  /// The simulator's ImageCaptureCore has the class but not the authorization calls, and would crash on them.
  private var supported: Bool {
    browser.responds(to: #selector(ICDeviceBrowser.requestControlAuthorization(completion:)))
      && browser.responds(to: #selector(getter: ICDeviceBrowser.controlAuthorizationStatus))
  }

  /// Only once the user has already allowed control, so launching the app never shows a prompt.
  func startIfAllowed() {
    dispatchPrecondition(condition: .onQueue(.main))
    if supported && browser.controlAuthorizationStatus == .authorized { start() }
  }

  private func start() {
    if started { return }
    started = true; startedAt = Date()
    browser.start()
  }

  /// Called from the capture worker. Asks for control the first time, then waits for the local scan.
  func findCamera(log: @escaping (String) -> Void) throws -> ICCameraDevice {
    dispatchPrecondition(condition: .notOnQueue(.main))
    if !DispatchQueue.main.sync(execute: { supported }) { throw UsbPtp.Failure("当前设备不支持 USB 主机连接（模拟器没有 USB）") }
    let asked = DispatchSemaphore(value: 0)
    var status = ICAuthorizationStatus.notDetermined
    DispatchQueue.main.async { [self] in
      let current = browser.controlAuthorizationStatus
      if current == .authorized || current == .denied || current == .restricted { status = current; asked.signal(); return }
      browser.requestControlAuthorization { result in DispatchQueue.main.async { status = result; asked.signal() } }
    }
    // The system prompt waits for the user; give them time to read it.
    if asked.wait(timeout: .now() + 120) == .timedOut { throw UsbPtp.Failure("USB 访问未授权：等待授权超时") }
    log("USB 相机控制授权：\(status.rawValue)")
    if status == .denied || status == .restricted { throw UsbPtp.Failure("未获准控制 USB 相机") }

    // iOS has no "local scan finished" callback. Wait up to three seconds for a body, then a moment longer
    // in case a second one is still being reported.
    DispatchQueue.main.sync { start() }
    var found: [ICCameraDevice] = [], others = 0
    let scanEnd = Date().addingTimeInterval(3)
    var settleEnd: Date?
    while Date() < (settleEnd ?? scanEnd) {
      usleep(100_000)
      (found, others) = DispatchQueue.main.sync {
        let all = browser.devices ?? []
        let cameras = all.compactMap { UsbCameraBrowser.candidate($0) ? $0 as? ICCameraDevice : nil }
        return (cameras, all.count - cameras.count)
      }
      if !found.isEmpty && settleEnd == nil { settleEnd = min(scanEnd, Date().addingTimeInterval(0.4)) }
    }
    log("USB 设备：Panasonic \(found.count) 台，其他 \(others) 台")
    if found.isEmpty {
      if status != .authorized { throw UsbPtp.Failure("未找到 USB 相机（系统未返回控制授权：\(status.rawValue)）") }
      throw UsbPtp.Failure("未找到 USB 相机")
    }
    if found.count > 1 { throw UsbPtp.Failure("检测到多台 Panasonic 相机") }
    return found[0]
  }

  // MARK: ICDeviceBrowserDelegate

  func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
    if UsbCameraBrowser.candidate(device) && Date().timeIntervalSince(startedAt) > 2 { onAttach?() }
  }

  func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) {
    if let camera = device as? ICCameraDevice, UsbCameraBrowser.candidate(camera) { onDetach?(camera) }
  }
}

/// PTP pass-through on one ImageCaptureCore camera. send() blocks the capture worker, never the main thread.
final class IccLink: NSObject, PtpLink, ICCameraDeviceDelegate {
  let device: ICCameraDevice
  var onEvent: ((Data) -> Void)?
  private let log: (String) -> Void
  private let lock = NSLock()
  private var aborted = false
  private var pending: Pending?

  private final class Pending {
    let done = DispatchSemaphore(value: 0)
    var result: Result<(Data, Data), Error>?
  }

  init(device: ICCameraDevice, log: @escaping (String) -> Void) { self.device = device; self.log = log; super.init() }

  /// Opens the system's session and checks that the body really talks PTP (PC(Tether), not storage mode).
  func open() throws {
    dispatchPrecondition(condition: .notOnQueue(.main))
    let opened = DispatchSemaphore(value: 0)
    var failure: Error?
    DispatchQueue.main.async { [self] in
      device.delegate = self
      device.ptpEventHandler = { [weak self] data in self?.event(data) }
      device.requestOpenSession(options: [:]) { error in failure = error; opened.signal() }
    }
    if opened.wait(timeout: .now() + 20) == .timedOut { abort(); throw UsbPtp.Failure("USB 会话打开超时；请重新插拔数据线") }
    if let failure { abort(); throw IccLink.describe(failure, operation: nil) }
    let ptp = DispatchQueue.main.sync { device.capabilities.contains(ICDeviceCapability.cameraDeviceCanAcceptPTPCommands.rawValue) }
    log("USB 会话已打开：\(DispatchQueue.main.sync { device.name ?? "相机" }) · PTP \(ptp ? "可用" : "不可用")")
    if !ptp { close(); throw UsbPtp.Failure("没有 PTP 双向端点；仅支持 Panasonic PTP，请在相机里选择 PC(Tether)") }
  }

  func send(_ command: Data, data: Data?, timeout: TimeInterval) throws -> (response: Data, data: Data) {
    let request = Pending()
    try lock.guarded {
      if aborted { throw UsbPtp.Failure("USB 已断开") }
      pending = request
    }
    defer { lock.guarded { if pending === request { pending = nil } } }
    let operation = UsbPtp.u16(command, 6)
    DispatchQueue.main.async { [self] in
      device.requestSendPTPCommand(command, outData: data) { [weak self] inData, response, error in
        let outcome: Result<(Data, Data), Error> = error.map { .failure(IccLink.describe($0, operation: operation)) } ?? .success((response, inData))
        self?.lock.guarded { if request.result == nil { request.result = outcome } }
        request.done.signal()
      }
    }
    if request.done.wait(timeout: .now() + timeout) == .timedOut {
      throw UsbPtp.Failure(String(format: "USB 超时或已断开（指令 0x%04X 在 %.0f 秒内没有响应）", operation, timeout))
    }
    switch lock.guarded({ request.result }) {
    case .success(let (response, payload)): return (response, payload)
    case .failure(let error): throw error
    case nil: throw UsbPtp.Failure("USB 已断开")
    }
  }

  func abort() {
    let waiting = lock.guarded { () -> Pending? in
      aborted = true
      let p = pending
      if let p, p.result == nil { p.result = .failure(UsbPtp.Failure("USB 已断开")) }
      return p
    }
    waiting?.done.signal()
    endSession()
  }

  func close() { lock.guarded { aborted = true }; endSession() }

  private var ended = false
  private func endSession() {
    DispatchQueue.main.async { [self] in
      if ended { return }
      ended = true
      device.ptpEventHandler = { _ in }
      if device.hasOpenSession { device.requestCloseSession(options: [:]) { _ in } }
    }
  }

  private func event(_ data: Data) { onEvent?(data) }

  static func describe(_ error: Error, operation: Int?) -> Error {
    let ns = error as NSError
    let what = operation.map { String(format: "指令 0x%04X", $0) } ?? "打开会话"
    switch ns.code {
    case -21249, -21343: return UsbPtp.Failure("USB 访问未授权（\(what)）")
    case -9958, -9902: return UsbPtp.Failure("相机会话已失效（\(what)）")
    default: return UsbPtp.Failure("USB \(what) 失败：\(ns.localizedDescription)（\(ns.code)）")
    }
  }

  // MARK: ICCameraDeviceDelegate. Content callbacks are ignored: photos are found by PTP handle.

  func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) { event(eventData) }
  func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {}
  func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {}
  func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: Error?) {}
  func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: Error?) {}
  func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {}
  func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {}
  func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {}
  func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {}
  func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {}
  func device(_ device: ICDevice, didOpenSessionWithError error: Error?) {}
  func device(_ device: ICDevice, didCloseSessionWithError error: Error?) {}
  func didRemove(_ device: ICDevice) { abort() }
}

private extension NSLock {
  /// NSLocking.guarded needs iOS 16; this build still installs on 15.1.
  func guarded<T>(_ body: () throws -> T) rethrows -> T { lock(); defer { unlock() }; return try body() }
}
