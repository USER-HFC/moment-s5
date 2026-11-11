import Foundation

/// One PTP operation through whatever owns the USB session (ImageCaptureCore on the phone, a fake in ios/checks).
/// The owner opens the standard session and assigns transaction IDs; this side never sends 0x1002 / 0x1003.
protocol PtpLink: AnyObject {
  /// Blocks until the response container arrives, the timeout passes, or the link is aborted.
  func send(_ command: Data, data: Data?, timeout: TimeInterval) throws -> (response: Data, data: Data)
  /// Raw PTP event containers, from any thread.
  var onEvent: ((Data) -> Void)? { get set }
  /// Ends the session politely. Never blocks on the camera for long.
  func close()
  /// Fails any pending and future send at once.
  func abort()
}

/// The Panasonic PTP conversation from UsbS5.java, over a PtpLink instead of raw bulk endpoints.
final class UsbCamera {
  static let exchangeTimeout: TimeInterval = 15, shutterTimeout: TimeInterval = 60
  private static let allowed: Set<Int> = [0x1001, 0x1007, 0x1008, 0x1009, 0x9102, 0x9103, 0x9108, 0x9402, 0x9404, 0x9405, 0x9412, 0x9416, 0x9706]

  private let link: PtpLink
  private let log: (String) -> Void
  private let control = NSRecursiveLock()
  private let state = NSLock()
  private var added: [UInt32] = []
  private var _exposureChanged = false, _eventsSeen = false, _closed = false
  private var vendorSession = false, live = false
  private(set) var info: UsbPtp.DeviceInfo?

  init(link: PtpLink, log: @escaping (String) -> Void) {
    self.link = link; self.log = log
    link.onEvent = { [weak self] in self?.accept($0) }
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T { state.lock(); defer { state.unlock() }; return try body() }
  var closed: Bool { locked { _closed } }
  /// Android knows up front whether the body has an interrupt endpoint. ImageCaptureCore hides that, so photo
  /// events count only once one has actually arrived in this session; until then capture pairs by listing.
  var hasEvents: Bool { locked { _eventsSeen } }
  var exposureChanged: Bool { locked { _exposureChanged } }
  func clearExposureChanged() { locked { _exposureChanged = false } }
  func clearCaptureEvents() { locked { added.removeAll() } }
  func nextAdded() -> UInt32? { locked { added.isEmpty ? nil : added.removeFirst() } }

  func open() throws {
    let description = try exchange(0x1001, limit: 65536); try description.ok()
    let device = try UsbPtp.DeviceInfo(description.data); info = device
    // Any Lumix with Panasonic PTP tethering; the vendor operations follow tethr / libgphoto2.
    log("\(device.manufacturer) \(device.model) / \(device.version)" + (device.model.caseInsensitiveCompare("DC-S5") == .orderedSame ? "" : " · 非 S5 机型，按通用 LUMIX 协议连接"))
    try exchange(0x9102, params: [0x0001_0001]).ok(); vendorSession = true
    try exchange(0x9412, params: [0x0d00_0010]).ok(); live = true
    log("USB 会话已建立；开始接收取景")
  }

  func preview() throws -> Data? {
    let r = try exchange(0x9706, limit: 8 << 20)
    if r.code == UsbPtp.busy { return nil }
    try r.ok(); return try UsbPtp.liveJpeg(r.data)
  }
  func shutter() throws { try exchange(0x9404, params: [0x0300_0011]).ok() }
  func autofocus() throws { try exchange(0x9405, params: [0x0300_0024]).ok() }
  func focus(far: Bool) throws {
    // Panasonic leaves its vendor operations out of DeviceInfo, so ask the body and report what it answers.
    let step = Data(UsbPtp.le32(0x0301_0011) + UsbPtp.le32(2) + UsbPtp.le16(far ? 2 : 3))
    let r = try exchange(0x9416, send: step, params: [0x0301_0011])
    if r.code != UsbPtp.ok { throw UsbPtp.Failure(String(format: "机身未执行对焦步进（响应 0x%04X）；部分机型需在菜单开启 AF+MF 或切到 MF", r.code)) }
  }
  func handles() throws -> [UInt32] {
    let r = try exchange(0x1007, limit: 4 << 20, params: [0xffff_ffff, 0, 0]); try r.ok()
    var reader = UsbPtp.Reader(r.data); return try reader.array(4)
  }
  func objectInfo(_ handle: UInt32) throws -> UsbPtp.ObjectInfo {
    let r = try exchange(0x1008, limit: 65536, params: [handle]); try r.ok(); return try UsbPtp.ObjectInfo(r.data)
  }
  func object(_ handle: UInt32) throws -> Data {
    let r = try exchange(0x1009, limit: 64 << 20, params: [handle]); try r.ok(); return r.data
  }

  func exposure() -> String {
    control.lock(); defer { control.unlock() }
    do {
      // libgphoto2 reads ISO and aperture from the *_Param codes; the list descriptor is only a fallback.
      let iso = Int32(bitPattern: try current(0x0200_0021, list: 0x0200_0020, size: 4))
      let aperture = Int32(bitPattern: try current(0x0200_0041, list: 0x0200_0040, size: 2))
      var speed = try listed(0x0200_0030, size: 4)
      if speed == 0 { speed = try value(0x0200_0030) }
      return UsbPtp.isoLabel(iso) + "     " + UsbPtp.apertureLabel(aperture) + "     " + UsbPtp.shutterLabel(speed)
    } catch { log("参数读取：\(error.localizedDescription)"); return "曝光参数暂不可读 · 可用机身调整" }
  }
  private func current(_ param: UInt32, list: UInt32, size: Int) throws -> UInt32 {
    do { return try value(param) } catch { if closed { throw error }; return try listed(list, size: size) }
  }
  private func value(_ prop: UInt32) throws -> UInt32 {
    let r = try exchange(0x9402, limit: 65536, params: [prop]); try r.ok(); return try UsbPtp.propertyValue(r.data)
  }
  private func listed(_ prop: UInt32, size: Int) throws -> UInt32 {
    let r = try exchange(0x9108, limit: 65536, params: [prop]); try r.ok(); return try UsbPtp.listedValue(r.data, size: size)
  }

  /// tethr names Panasonic ObjectAdded 0xC108 and DevicePropChanged 0xC102; Lumix bodies also send the standard
  /// 0x4002 / 0x4006. Only recorded here: the reads happen later on the capture worker, never inside the shutter.
  func accept(_ raw: Data) {
    guard let event = UsbPtp.event(raw) else { return }
    locked {
      _eventsSeen = true
      if (event.code == 0xc108 || event.code == 0x4002), let handle = event.parameter { if added.count < 64 { added.append(handle) } }
      else if event.code == 0xc102 || event.code == 0x4006 { _exposureChanged = true }
    }
  }

  struct Result {
    let operation: Int, code: Int, data: Data
    func ok() throws { try UsbPtp.requireSuccess(operation, code) }
  }

  @discardableResult
  private func exchange(_ op: Int, send: Data? = nil, limit: Int = 0, params: [UInt32] = []) throws -> Result {
    control.lock(); defer { control.unlock() }
    if closed { throw UsbPtp.Failure("USB 已断开") }
    if !UsbCamera.allowed.contains(op) { throw UsbPtp.Failure("指令不在白名单") }
    do {
      // The body may answer a release only after metering, AF and the card write.
      let reply = try link.send(UsbPtp.command(op, params), data: send, timeout: op == 0x9404 ? UsbCamera.shutterTimeout : UsbCamera.exchangeTimeout)
      let code = try UsbPtp.responseCode(reply.response, operation: op)
      let data = limit == 0 ? Data() : try UsbPtp.payload(reply.data, operation: op, limit: limit)
      return Result(operation: op, code: code, data: data)
    } catch {
      // A lost exchange leaves the session in an unknown state. Never retry, least of all a shutter.
      log(String(format: "USB 0x%04X：", op) + error.localizedDescription)
      abort(); throw error
    }
  }

  func abort() { locked { _closed = true }; link.abort() }

  func close() {
    control.lock(); defer { control.unlock() }
    if closed { return }
    if live { do { try exchange(0x9412, params: [0x0d00_0011]).ok() } catch { log("取景停止未确认") } }
    if vendorSession && !closed { do { try exchange(0x9103, params: [0x0001_0001]).ok() } catch { log("厂商会话关闭未确认") } }
    locked { _closed = true }
    link.close()
  }
}

/// UsbS5Transport.java behind the shared CameraTransport: the same pairing rules for the shot just released.
final class UsbTransport: CameraTransport {
  final class Handles: CaptureBaseline { let values: Set<UInt32>; init(_ v: Set<UInt32>) { values = v } }
  private struct Shot { let handle: UInt32; let filename: String; let size: Int64; let sequence: Int; let storageId: UInt32 }

  static let exposureRefreshUs: Int64 = 2_000_000
  private let usb: UsbCamera
  /// The session owner, so the engine can match an unplugged device to this transport.
  let link: PtpLink
  private let log: (String) -> Void
  private let state = NSLock()
  /// Handles and name+size of every photo saved this session; a backup-recording copy carries the same pair.
  private var savedHandles = Set<UInt32>(), savedCopies = Set<String>()
  private var newestSavedSequence = -1, newestSavedName = ""
  private var _exposure = "", _exposureAt: Int64 = 0
  var pollMs: UInt32 = 80

  init(link: PtpLink, log: @escaping (String) -> Void) { self.link = link; usb = UsbCamera(link: link, log: log); self.log = log }

  private func locked<T>(_ body: () throws -> T) rethrows -> T { state.lock(); defer { state.unlock() }; return try body() }
  private static func copyKey(_ name: String, _ size: Int64) -> String { "\(name)\n\(size)" }
  private static func handle(_ photo: CameraOriginal) -> UInt32? { UInt32(photo.key) }

  var kind: String { "usb" }
  var cameraModel: String? { usb.info.map { $0.model.trimmingCharacters(in: .whitespaces) }.flatMap { $0.isEmpty ? nil : $0 } }
  var capabilities: CameraCapabilities { CameraCapabilities(autofocus: true, manualFocus: true, exposure: true) }
  var exposure: String { locked { _exposure } }
  var exposureUpdatedAtUs: Int64 { locked { _exposureAt } }
  var freshBaselineRequired: Bool { false }
  var closed: Bool { usb.closed }
  var reportsNewPhotos: Bool { usb.hasEvents }

  func open() throws { try usb.open(); refreshExposure() }

  /// The idle poll also refreshes the exposure line: on a change event, or every two seconds.
  func preview() throws -> CameraPreview? {
    guard let jpeg = try usb.preview() else { return nil }
    let frame = CameraPreview(jpeg: jpeg, receivedUs: monotonicMicros())
    if usb.exposureChanged || monotonicMicros() - exposureUpdatedAtUs >= UsbTransport.exposureRefreshUs { refreshExposure() }
    return frame
  }
  private func refreshExposure() {
    usb.clearExposureChanged()
    let value = usb.exposure()
    if !usb.closed { locked { _exposure = value; _exposureAt = monotonicMicros() } }
  }

  func autofocus() throws { try usb.autofocus() }
  func focus(far: Bool) throws { try usb.focus(far: far) }
  func prepareCaptureBaseline() throws -> CaptureBaseline { Handles(Set(try usb.handles())) }
  func shutter() throws { try usb.shutter() }
  func clearCaptureEvents() { usb.clearCaptureEvents() }
  func completeWithoutDownload() {}

  func noteSaved(_ photo: CameraOriginal) {
    locked {
      if let handle = UsbTransport.handle(photo) { savedHandles.insert(handle) }
      savedCopies.insert(UsbTransport.copyKey(photo.filename, photo.size))
      let sequence = UsbPtp.lumixSequence(photo.filename)
      if sequence > newestSavedSequence { newestSavedSequence = sequence; newestSavedName = photo.filename }
    }
  }
  private var savedLabel: String { locked { newestSavedName.isEmpty ? String(newestSavedSequence) : newestSavedName } }
  private func alreadySaved(_ handle: UInt32, _ info: UsbPtp.ObjectInfo) -> Bool {
    locked { savedHandles.contains(handle) || savedCopies.contains(UsbTransport.copyKey(info.filename, info.size)) }
  }

  func awaitNewJpeg(_ before: CaptureBaseline?, valid: () -> Bool) throws -> CameraOriginal {
    let baseline = (before as? Handles)?.values
    log(baseline == nil ? "快门前照片索引不可用" : "快门前照片索引 \(baseline!.count) 个")
    let deadline = monotonicMicros() + 60_000_000
    var nextList = monotonicMicros()
    // Not-yet-JPEG objects stay pending: a permanent skip used to drop the file still being written.
    var pendingEvents = Set<UInt32>(), holdFormat = Set<UInt32>()
    var eventLogged: [UInt32: String] = [:]
    var previous: Shot?
    func logEvent(_ handle: UInt32, _ message: String) { if eventLogged.updateValue(message, forKey: handle) != message { log(message) } }
    while monotonicMicros() < deadline && valid() {
      if let handle = usb.nextAdded() { pendingEvents.insert(handle); holdFormat.remove(handle) }
      let listDue = baseline != nil && monotonicMicros() >= nextList
      for handle in pendingEvents.sorted() {
        if holdFormat.contains(handle) && baseline != nil && !listDue { continue }
        let info: UsbPtp.ObjectInfo
        do { info = try usb.objectInfo(handle) }
        catch { if usb.closed { throw error }; holdFormat.insert(handle); logEvent(handle, "照片事件 句柄 \(handle) 暂时读不到格式：\(error.localizedDescription)"); continue }
        logEvent(handle, String(format: "照片事件 句柄 %u 格式 0x%04X 文件 %@", handle, info.format, info.filename))
        if !info.jpeg { holdFormat.insert(handle); continue }
        holdFormat.remove(handle)
        if baseline?.contains(handle) == true { pendingEvents.remove(handle); continue }
        if alreadySaved(handle, info) { log("照片事件 句柄 \(handle) 不选：本会话已保存"); pendingEvents.remove(handle); continue }
        let sequence = UsbPtp.lumixSequence(info.filename)
        if sequence < 0 { log("照片事件 句柄 \(handle) 不选：文件名不符合序号规则，等待两次索引一致"); pendingEvents.remove(handle); continue }
        let newest = locked { newestSavedSequence }
        if newest >= 0 && sequence <= newest { log("照片事件 句柄 \(handle) 不选：文件名序号不大于已保存的 \(savedLabel)"); pendingEvents.remove(handle); continue }
        // One event can name an older object. Until this session has saved a photo only two identical listings
        // may accept; a higher Lumix sequence than that saved photo is the shutter just released.
        if baseline == nil || newest >= 0 {
          log("本次照片选中句柄 \(handle) \(info.filename)：照片事件确认的新 JPEG")
          return CameraOriginal(key: String(handle), filename: info.filename, size: info.size)
        }
        pendingEvents.remove(handle)
      }
      if listDue, let baseline {
        let listed: (Shot, String)?
        do { listed = try listedShot(baseline) }
        catch {
          if usb.closed { throw error }
          log("照片索引暂不可用，继续等待：\(error.localizedDescription)"); previous = nil; nextList = monotonicMicros() + 500_000
          usleep(pollMs * 1000); continue
        }
        if let (chosen, rule) = listed, let previous, chosen.handle == previous.handle, chosen.filename == previous.filename, chosen.size == previous.size {
          log("本次照片选中句柄 \(chosen.handle) \(chosen.filename)：\(rule)")
          return CameraOriginal(key: String(chosen.handle), filename: chosen.filename, size: chosen.size)
        }
        previous = listed?.0
        nextList = monotonicMicros() + 1_000_000
      }
      usleep(pollMs * 1000)
    }
    if !valid() { throw UsbPtp.Failure("拍摄期间连接中断；请检查机身 SD 卡中的原片") }
    throw UsbPtp.Failure(baseline == nil
      ? "未找到本次 JPEG。未获得快门前照片索引，且相机未提供可确认的新照片事件；未使用旧文件，请重试"
      : "未找到本次 JPEG。请用单张拍摄和 JPEG/RAW+JPEG，确认 SD 卡可写；相机可能仍在写入，请重试")
  }

  /// Newest new JPEG after merging backup-recording copies, or nil when this listing is not safe to pair.
  private func listedShot(_ baseline: Set<UInt32>) throws -> (Shot, String)? {
    var choices: [Shot] = [], line: [String] = []
    for handle in try usb.handles().sorted() where !baseline.contains(handle) {
      let info: UsbPtp.ObjectInfo
      do { info = try usb.objectInfo(handle) }
      catch { if usb.closed { throw error }; log("照片索引暂不可读 句柄 \(handle)：\(error.localizedDescription)"); continue }
      if !info.jpeg { line.append(String(format: "句柄 %u 格式 0x%04X 文件 %@（还不是 JPEG）", handle, info.format, info.filename)); continue }
      if alreadySaved(handle, info) { line.append("句柄 \(handle) \(info.filename)（本会话已保存，跳过）"); continue }
      line.append("句柄 \(handle) \(info.filename)")
      choices.append(Shot(handle: handle, filename: info.filename, size: info.size, sequence: UsbPtp.lumixSequence(info.filename), storageId: info.storageId))
    }
    log(line.isEmpty ? "照片索引新增候选：（无）" : "照片索引新增候选：" + line.joined(separator: "；"))
    guard let unique = dedupeCopies(choices), !unique.isEmpty else { return nil }
    if unique.count == 1 {
      let only = unique[0]
      if only.sequence < 0 { log("照片索引只有 \(only.filename)，文件名不符合序号规则；连续两次一致则按唯一新 JPEG 接受") }
      return rollbackChecked(only, only.sequence < 0 ? "只有一个新 JPEG（文件名不符合序号规则）" : "文件名序号最新", multiple: false)
    }
    if unique.contains(where: { $0.sequence < 0 }) { log("多个新 JPEG 中有文件名不符合序号规则，无法判断，不配对"); return nil }
    var best = unique[0]
    for shot in unique {
      if shot.sequence > best.sequence { best = shot }
      else if shot.sequence == best.sequence && shot.filename != best.filename { log("多个候选文件名序号相同，不配对"); return nil }
    }
    return rollbackChecked(best, "文件名序号最新", multiple: true)
  }

  /// Same name and size on two cards is one photo; keep the smaller StorageID. A name with different sizes is
  /// not a backup copy, so nothing in this listing is safe to pair.
  private func dedupeCopies(_ choices: [Shot]) -> [Shot]? {
    var order: [String] = [], byName: [String: [Shot]] = [:]
    for shot in choices { if byName[shot.filename] == nil { order.append(shot.filename) }; byName[shot.filename, default: []].append(shot) }
    var unique: [Shot] = []
    for name in order {
      let copies = byName[name]!
      let size = copies[0].size
      let handles = copies.map { String($0.handle) }.joined(separator: "/")
      if let odd = copies.first(where: { $0.size != size }) {
        log("同名 JPEG 大小不同，不配对：\(name) 句柄 \(handles)，大小 \(size)/\(odd.size)"); return nil
      }
      let keep = copies.min { ($0.storageId, $0.handle) < ($1.storageId, $1.handle) }!
      if copies.count > 1 { log("同名同大小的备份副本视为同一张照片：\(name) 句柄 \(handles)，选 StorageID 较小的句柄 \(keep.handle)") }
      unique.append(keep)
    }
    return unique
  }

  /// Two agreeing listings may accept a rollback only when it is the single new JPEG.
  private func rollbackChecked(_ chosen: Shot, _ rule: String, multiple: Bool) -> (Shot, String)? {
    let newest = locked { newestSavedSequence }
    if chosen.sequence < 0 || newest < 0 || chosen.sequence > newest { return (chosen, "连续两次索引一致，" + rule) }
    if multiple { log("候选文件名序号不大于已保存的 \(savedLabel)，跳过"); return nil }
    log("照片索引只有 \(chosen.filename)，序号不大于已保存的 \(savedLabel)；连续两次一致则按换卡/重置编号接受")
    return (chosen, "连续两次索引一致，只有一个新 JPEG；序号回退（可能换卡或重置编号），按唯一新文件接受")
  }

  func downloadOriginal(_ original: CameraOriginal, to destination: URL) throws {
    if original.size > 64 << 20 { throw UsbPtp.Failure("照片超过当前 64 MB 接收上限") }
    guard let handle = UsbTransport.handle(original) else { throw UsbPtp.Failure("照片句柄无效") }
    let bytes = try usb.object(handle)
    if original.size != 0 && Int64(bytes.count) != original.size { throw UsbPtp.Failure("原片长度不符，未保存这张照片") }
    try bytes.write(to: destination)
  }

  /// A photo released on the body: the next ObjectAdded JPEG that is neither in the baseline nor saved.
  func nextCameraPhoto(_ before: CaptureBaseline?, saved: Set<String>) throws -> CameraOriginal? {
    let known = (before as? Handles)?.values ?? []
    while let handle = usb.nextAdded() {
      if known.contains(handle) || saved.contains(String(handle)) { continue }   // e.g. a second event for a saved photo
      let info = try usb.objectInfo(handle)
      if !info.jpeg { continue }                                                  // the RAW of a RAW+JPEG pair
      // Backup recording stores the same name+size on both cards; the second event is the same photo.
      if !locked({ savedCopies.insert(UsbTransport.copyKey(info.filename, info.size)).inserted }) { continue }
      return CameraOriginal(key: String(handle), filename: info.filename, size: info.size)
    }
    return nil
  }

  func withPhoto(_ before: CaptureBaseline?, _ photo: CameraOriginal) -> CaptureBaseline? {
    var values = (before as? Handles)?.values ?? []
    if let handle = UsbTransport.handle(photo) { values.insert(handle) }
    return Handles(values)
  }

  func abort() { usb.abort() }
  func close() { usb.close() }
}
