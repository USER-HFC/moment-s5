import Foundation

/// Experimental legacy cam.cgi + GENA + UDP + DLNA, ported from WifiS5Transport.java. Original DC-S5
/// firmware 2.9 is unverified. Ordering, retry budgets and S5 quirks follow the protocol notes published by
/// sapoepsilon/lumix-remote (MIT, verified on DC-S5 fw 2.03); no code is copied from it.
final class WifiTransport: CameraTransport {
  enum State { case new, authenticating, ready, baselined, shutterSent, locating, downloading, failed, closed }

  /// Every listed item plus each seen container's childCount; containers not listed are assumed unchanged.
  final class Catalog: CaptureBaseline {
    let items: [String: WifiProtocol.Item]
    let order: [(String, WifiProtocol.Item)]
    let counts: [String: Int]
    let session: ObjectIdentifier
    init(order: [(String, WifiProtocol.Item)], counts: [String: Int], session: ObjectIdentifier) {
      self.order = order; self.counts = counts; self.session = session
      items = Dictionary(order, uniquingKeysWith: { first, _ in first })
    }
  }

  private struct CatalogChanged: LocalizedError { var errorDescription: String? { "相机目录在分页时变化；未建立安全基线，请重试" } }
  private struct HttpFailure: LocalizedError { let status: Int; var errorDescription: String? { "相机 HTTP \(status)" } }
  private struct EncryptionRequired: LocalizedError { var errorDescription: String? { "机身要求加密握手" } }

  static let deviceName = "Moment S5 Wi-Fi beta"
  static let busyAttempts = 5, keepaliveFailuresAllowed = 3
  static let keepaliveSilenceUs: Int64 = 30_000_000
  /// LUMIX Sync timings.
  var pairPollMs = 1000, pairTimeoutMs = 90_000, settleMs = 30_000, busyRetryMs = 1000, keepaliveMs = 1000, exposureEveryMs = 2000

  private final class Token {}
  private let sessionToken = Token()
  private let base: URL
  private let debug: Bool
  private let http: WifiHttp
  private let route: WifiRoute
  private let log: (String) -> Void
  private let clientId: String
  private let requestedPort: Int
  private let control = NSRecursiveLock()
  private let lock = NSLock()
  private let keeper = DispatchQueue(label: "moment.wifi.keepalive")
  private var keepTimer: DispatchSourceTimer?
  private let playbackSettled = DispatchSemaphore(value: 0)
  private let allowed: Set<String>

  // Shared across the transport threads; guarded by `lock`.
  private var _state = State.new
  private var _closed = false, streaming = false, playback = false, cameraBusy = false
  private var terminalError: String?
  private var _exposure = "曝光参数暂不可读 · 可用机身调整"
  private var _capabilities = CameraCapabilities(autofocus: false, manualFocus: false, exposure: false)
  private var streamStarted: Int64 = 0, lastFrame: Int64 = 0, _exposureUpdatedAt: Int64 = 0, lastAlive: Int64 = 0
  private var frames: [CameraPreview] = []
  private var udp: WifiUdp?
  private var eventServer: WifiListener?
  private var sid: String?
  private var receiver: Thread?, eventReceiver: Thread?
  private var _cameraModel: String?

  // Used under `control` only.
  private var cds: URL?, eventUrl: URL?
  private var localAddress: String?
  private var subscriptionSeconds = 300
  private var renewAt: Int64 = 0, lastExposure: Int64 = 0
  private var keepaliveFailures = 0
  private var encryptedHandshake = false
  private var prepared: Catalog?
  private var selected: WifiProtocol.Media?
  private var token: String?
  private var exposureFields: [String] = []

  init(route: WifiRoute, endpoint: String, port: Int, debug: Bool, clientId: String, log: @escaping (String) -> Void) throws {
    base = try WifiProtocol.cameraUrl(endpoint, debug: debug)
    if port < 0 || port > 65535 { throw LumixError("UDP 端口无效") }
    if clientId.isEmpty || clientId.count > 64 || !clientId.allSatisfy({ $0.isHexDigit || $0 == "-" }) { throw LumixError("Wi-Fi 设备标识无效") }
    self.route = route; http = WifiHttp(route: route); requestedPort = port; self.debug = debug; self.clientId = clientId; self.log = log
    allowed = WifiNet.addresses(base.host ?? "")
  }

  private func locked<T>(_ body: () throws -> T) rethrows -> T { lock.lock(); defer { lock.unlock() }; return try body() }

  var kind: String { "wifi" }
  var cameraModel: String? { locked { _cameraModel?.trimmingCharacters(in: .whitespaces) }.flatMap { $0.isEmpty ? nil : $0 } }
  var state: State { locked { _state } }
  var closed: Bool { locked { _closed } }
  var capabilities: CameraCapabilities { locked { _capabilities } }
  var exposure: String { locked { _exposure } }
  var exposureUpdatedAtUs: Int64 { locked { _exposureUpdatedAt } }
  var freshBaselineRequired: Bool { true }
  private func setState(_ value: State) { locked { _state = value } }
  private var closedError: LumixError { LumixError(locked { terminalError } ?? "Wi-Fi 已断开") }

  // MARK: Requests

  private func request(_ url: URL, method: String, body: Data? = nil, headers: [(String, String)] = [], timeoutMs: Int) throws -> WifiHttp.Response {
    if url.host?.lowercased() != base.host?.lowercased() || url.scheme != "http" || url.user != nil { throw LumixError("拒绝非相机地址") }
    var extra = headers
    if let token { extra.append(("X-SESSION_ID", token)) }
    let response = try http.request(url, method: method, payload: body, headers: extra, timeoutMs: timeoutMs)
    if response.status != 200 { response.close(); throw HttpFailure(status: response.status) }
    locked { lastAlive = monotonicMicros() }
    return response
  }

  private func command(_ mode: String, type: String? = nil, value: String? = nil, value2: String? = nil, timeoutMs: Int = 5000) throws -> WifiProtocol.Reply {
    control.lock(); defer { control.unlock() }
    if closed { throw closedError }
    var query = "/cam.cgi?mode=\(encode(mode))"
    if let type { query += "&type=\(encode(type))" }
    if let value { query += "&value=\(encode(value))" }
    if let value2 { query += "&value2=\(encode(value2))" }
    guard let url = URL(string: query, relativeTo: base)?.absoluteURL else { throw LumixError("相机指令无效") }
    let response = try request(url, method: "GET", timeoutMs: timeoutMs)
    defer { response.close() }
    let reply = try WifiProtocol.reply(try response.bytes(WifiProtocol.maxXml))
    if mode == "accctrl" && reply.ok {
      // CSV reply: ok,<name>,<mode>,<enc>[,<session id>]; the S5 sends no session field.
      var supplied = response.headers["x-session_id"] ?? reply.first("session_id")
      if supplied == nil && reply.fields.count >= 4 { supplied = reply.fields[3] }
      if let supplied, !supplied.isEmpty {
        if supplied.count > 512 || supplied.contains("\r") || supplied.contains("\n") { throw LumixError("相机 session header 无效") }
        token = supplied
      }
    }
    return reply
  }

  /// Java's URLEncoder: letters, digits and .-*_ stay; space becomes +.
  private func encode(_ value: String) -> String {
    var allowed = CharacterSet.alphanumerics.intersection(CharacterSet(charactersIn: Unicode.Scalar(0)...Unicode.Scalar(127)))
    allowed.insert(charactersIn: ".-*_ ")
    return (value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "").replacingOccurrences(of: " ", with: "+")
  }

  private func ok(_ mode: String, type: String? = nil, value: String? = nil, value2: String? = nil) throws {
    try command(mode, type: type, value: value, value2: value2).requireOk()
  }

  /// LUMIX Sync retries err_busy 5 x 1 s for mode and stream commands. Never used for the shutter.
  private func busyOk(_ mode: String, value: String) throws {
    var attempt = 1
    while true {
      let reply = try command(mode, value: value)
      if reply.result.caseInsensitiveCompare("err_busy") != .orderedSame || attempt >= WifiTransport.busyAttempts { try reply.requireOk(); return }
      try sleep(ms: busyRetryMs); attempt += 1
    }
  }

  private func sleep(ms: Int) throws {
    let until = monotonicMicros() + Int64(ms) * 1000
    while monotonicMicros() < until {
      if closed { throw closedError }
      Thread.sleep(forTimeInterval: min(0.1, Double(until - monotonicMicros()) / 1_000_000))
    }
  }

  // MARK: Open

  func open() throws {
    control.lock()
    if state != .new { control.unlock(); throw LumixError("Wi-Fi 会话不能重复打开") }
    setState(.authenticating)
    control.unlock()
    do {
      log("Wi-Fi 实验性 · 未经真机验证；请在机身确认连接，推荐使用 USB")
      // LUMIX Sync order: description, access, SUBSCRIBE, read-only info, getstate, device name.
      try discoverDescription(); try authenticate(); try subscribe(); try probe(); try ok("getstate")
      try ok("setsetting", type: "device_name", value: WifiTransport.deviceName)
      try settle()
      let status = try command("getstate"); try status.requireOk()
      if status.first("cammode")?.caseInsensitiveCompare("rec") != .orderedSame { try busyOk("camcmd", value: "recmode") }
      // Pin BOTH the local UDP port and its camera interface before requesting a stream.
      let socket = try WifiUdp()
      locked { udp = socket }
      try route.bind(socket); try socket.bind(port: requestedPort)
      let thread = Thread { [weak self] in self?.receive(socket) }
      thread.name = "s5-wifi-jpeg"; thread.qualityOfService = .userInitiated
      locked { receiver = thread }
      thread.start()
      try startStream()
      setState(.ready)
      let now = monotonicMicros()
      locked { lastAlive = now }; lastExposure = now
      let timer = DispatchSource.makeTimerSource(queue: keeper)
      timer.schedule(deadline: .now() + .milliseconds(keepaliveMs), repeating: .milliseconds(keepaliveMs))
      timer.setEventHandler { [weak self] in self?.keepAlive() }
      locked { keepTimer = timer }
      timer.resume()
    } catch {
      locked { terminalError = error.localizedDescription; _state = .failed }
      abort(); throw error
    }
  }

  /// Plain req_acc unless the description asks for the encrypted handshake (LUMIX Sync's rule). A body that
  /// refuses req_acc_g gets plain req_acc; one that answers plain req_acc with a challenge gets the encrypted one.
  private func authenticate() throws {
    if encryptedHandshake {
      if let nonce = WifiProtocol.nonce(try command("accctrl", type: "req_acc_g")) { try pairEncrypted(nonce); return }
      log("机身未接受加密握手，改用普通握手")
    }
    do { try pair("req_acc", clientId, WifiTransport.deviceName) }
    catch is EncryptionRequired {
      guard let nonce = WifiProtocol.nonce(try command("accctrl", type: "req_acc_g")) else { throw LumixError("机身要求加密握手，但没有返回随机数；请把机身固件更新后重试") }
      try pairEncrypted(nonce)
    }
  }

  private func pairEncrypted(_ nonce: UInt32) throws {
    log("使用 LUMIX Sync 加密握手（未经真机验证）")
    try pair("req_acc_e", WifiProtocol.encryptAccess(clientId, nonce: nonce), WifiProtocol.encryptAccess(WifiTransport.deviceName, nonce: nonce))
  }

  private func pair(_ type: String, _ value: String, _ value2: String) throws {
    let deadline = monotonicMicros() + Int64(pairTimeoutMs) * 1000
    var asked = false
    while true {
      let auth = try command("accctrl", type: type, value: value, value2: value2)
      if type == "req_acc" && auth.gen2 { throw EncryptionRequired() }
      if auth.ok { return }
      // ok_under_research[_no_msg]: the body is asking (or auto-approving) and expects the same request every second.
      if !auth.result.lowercased().hasPrefix("ok_under_research") { throw LumixError("Wi-Fi 认证被拒绝（\(WifiProtocol.safe(auth.result))）；请在机身接受设备登记") }
      if !asked { log("请在机身上确认连接请求"); asked = true }
      if monotonicMicros() >= deadline {
        _ = try? command("accctrl", type: "req_acc_can", value: clientId)
        throw LumixError("机身未在时限内确认 Wi-Fi 连接；已取消请求")
      }
      try sleep(ms: pairPollMs)
    }
  }

  private func discoverDescription() throws {
    let port = debug ? WifiProtocol.port(base) : 60606
    var last: Error?
    for path in ["/Lumix/Server0/ddd", "/Server0/ddd"] {
      guard let host = base.host, let location = URL(string: "http://\(host):\(port)\(path)") else { continue }
      do {
        let response = try request(location, method: "GET", timeoutMs: 5000)
        defer { response.close() }
        let description = try WifiProtocol.description(try response.bytes(WifiProtocol.maxXml), location: location)
        // Any Lumix: the body is in modelNumber, modelName is just "LUMIX".
        if !debug && !description.panasonic { throw LumixError("不是松下 LUMIX 相机（厂商：\(WifiProtocol.safe(description.manufacturer))）") }
        cds = description.control; eventUrl = description.events; localAddress = response.localAddress
        encryptedHandshake = description.encryptedHandshake
        locked { _cameraModel = description.model }
        log("相机 \(WifiProtocol.safe(description.model))\(description.firmware.map { " · 固件 \(WifiProtocol.safe($0))" } ?? "") · \(encryptedHandshake ? "加密握手" : "普通握手") · 协议仍需真机验证")
        return
      } catch let failure as HttpFailure where failure.status == 404 { last = failure }
    }
    throw LumixError("未读取到相机 DLNA description；相机 IP 或实验协议不兼容\(last == nil ? "" : "（\(last!.localizedDescription)）")")
  }

  /// Required on the S5: without the subscription startstream answers ok but no frames arrive.
  private func subscribe() throws {
    guard let eventUrl else { log("相机 description 未公布事件地址，跳过事件订阅"); return }
    guard let localAddress else { throw LumixError("无法确定手机在相机网络中的地址") }
    let server = try WifiListener(address: localAddress)
    locked { eventServer = server }
    let thread = Thread { [weak self] in self?.receiveEvents(server) }
    thread.name = "s5-wifi-events"
    locked { eventReceiver = thread }
    thread.start()
    let callback = "<http://\(localAddress):\(server.port)/Camera/event>"
    let response = try request(eventUrl, method: "SUBSCRIBE", headers: [("CALLBACK", callback), ("NT", "upnp:event"), ("TIMEOUT", "Second-300")], timeoutMs: 5000)
    defer { response.close() }
    guard let value = response.headers["sid"], !value.isEmpty, value.count <= 256, !value.contains("\r"), !value.contains("\n") else { throw LumixError("相机事件订阅没有有效 SID") }
    subscriptionSeconds = WifiTransport.seconds(response.headers["timeout"])
    locked { sid = value }
    renewAt = monotonicMicros() + Int64(subscriptionSeconds) * 500_000
    log("已订阅相机事件 · 有效期 \(subscriptionSeconds) 秒")
    try sleep(ms: 200)
  }

  private static func seconds(_ timeout: String?) -> Int {
    guard let timeout, let range = timeout.range(of: "(?i)Second-(\\d{1,6})", options: .regularExpression) else { return 300 }
    let digits = timeout[range].drop { !$0.isNumber }
    return max(30, min(Int(digits) ?? 300, 3600))
  }

  /// After SUBSCRIBE the S5 drops to playback by itself; camcmd before its mod_Play event can wedge it.
  private func settle() throws {
    if locked({ sid }) == nil { return }
    if playbackSettled.wait(timeout: .now() + .milliseconds(settleMs)) == .timedOut { log("未收到机身 mod_Play 事件，继续连接") }
    if closed { throw closedError }
  }

  private func receiveEvents(_ server: WifiListener) {
    while !closed && !server.closed {
      do {
        guard let socket = try server.accept(timeoutMs: 500) else { continue }
        defer { socket.close() }
        guard let peer = socket.peerAddress, allowed.contains(peer) else { continue }
        socket.setTimeout(ms: 2000)
        let notify = try WifiHttp.incoming(socket, limit: 64 * 1024)
        try socket.write(Data("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".utf8))
        if notify.method == "NOTIFY" && !notify.body.isEmpty { event(try WifiProtocol.events(notify.body)) }
      } catch {
        if !closed && !server.closed { log("相机事件无法解析：\(error.localizedDescription)") }
      }
    }
  }

  private func event(_ values: [String: [String]]) {
    for value in values["X_Panasonic_Cam_Sync"] ?? [] {
      log("相机事件 Cam_Sync=\(WifiProtocol.safe(value))")
      switch value {
      case "busy", "busy_no_msg": locked { cameraBusy = true }
      case "update", "lens_Atta": locked { cameraBusy = false }
      case "mod_Play": playbackSettled.signal()
      default: break
      }
    }
  }

  private func probe() throws {
    var declared = Set<String>()
    for kind in ["capability", "allmenu"] {
      do {
        let reply = try command("getinfo", type: kind)
        if reply.ok {
          for values in reply.values.values { for value in values { declared.formUnion(value.lowercased().split { !($0.isLetter || $0.isNumber || $0 == "_" || $0 == "-") }.map(String.init)) } }
        }
      } catch let failure as HttpFailure where (400..<500).contains(failure.status) {}
    }
    for field in ["iso", "focal", "shtrspeed"] {
      do {
        let reply = try command("getsetting", type: field)
        if reply.ok && WifiTransport.setting(reply, field) != nil { exposureFields.append(field) }
      } catch let failure as HttpFailure where (400..<500).contains(failure.status) {}
    }
    let caps = CameraCapabilities(autofocus: declared.contains("oneshot_af"),
                                  manualFocus: declared.contains("focus") && declared.contains("wide-slow") && declared.contains("tele-slow"),
                                  exposure: !exposureFields.isEmpty)
    locked { _capabilities = caps }
    try readExposure()
    log("Wi-Fi 能力探测：AF=\(caps.autofocus) / MF=\(caps.manualFocus) / 曝光=\(caps.exposure)")
  }

  private static func setting(_ reply: WifiProtocol.Reply, _ field: String) -> String? {
    guard let value = reply.first(field) ?? reply.first("value"), !value.isEmpty else { return nil }
    return String(value.prefix(64))
  }

  private func readExposure() throws {
    var values: [String] = []
    for field in exposureFields {
      let reply = try command("getsetting", type: field)
      if reply.ok, let value = WifiTransport.setting(reply, field) { values.append((field == "iso" ? "ISO " : field == "focal" ? "f/" : "快门 ") + value) }
    }
    if !values.isEmpty {
      let now = monotonicMicros()
      locked { _exposure = values.joined(separator: "     "); _exposureUpdatedAt = now }
      lastExposure = now
    }
  }

  // MARK: Keepalive

  /// 1 Hz getstate like LUMIX Sync. Exposure settings are read about every 2 s, and only while READY or
  /// BASELINED and the body is idle: denser cam.cgi polling can wedge an S5. err_busy is not a failure;
  /// err_reject, three failed polls in a row or 30 s without any successful camera reply end the session.
  private func keepAlive() {
    if closed { return }
    control.lock(); defer { control.unlock() }
    var answered = false
    do {
      let result = try command("getstate", timeoutMs: 2500).result
      if result.caseInsensitiveCompare("err_reject") == .orderedSame { dead("相机已拒绝本次 Wi-Fi 会话 · 请重新连接相机"); return }
      if result.caseInsensitiveCompare("ok") == .orderedSame { keepaliveFailures = 0; answered = true }
      else if result.caseInsensitiveCompare("err_busy") != .orderedSame { keepaliveFailures += 1 }
    } catch { keepaliveFailures += 1 }
    let now = monotonicMicros()
    if keepaliveFailures >= WifiTransport.keepaliveFailuresAllowed || now - locked({ lastAlive }) > WifiTransport.keepaliveSilenceUs { dead("Wi-Fi 保活失败 · 请重新连接相机"); return }
    if locked({ sid }) != nil && now >= renewAt { renew() }
    let (current, busy, playing) = locked { (_state, cameraBusy, playback) }
    if answered && (current == .ready || current == .baselined) && !busy && !playing && now - lastExposure >= Int64(exposureEveryMs) * 1000 {
      lastExposure = now
      do { try readExposure() } catch { log("Wi-Fi 曝光读取失败：\(error.localizedDescription)") }
    }
  }

  private func dead(_ message: String) { locked { terminalError = message }; log(message); abort() }

  /// Renew by SID only: a fresh SUBSCRIBE while the body is in rec mode can wedge the S5.
  private func renew() {
    renewAt = monotonicMicros() + Int64(subscriptionSeconds) * 500_000
    guard let eventUrl, let sid = locked({ sid }) else { return }
    do {
      let response = try request(eventUrl, method: "SUBSCRIBE", headers: [("SID", sid), ("TIMEOUT", "Second-\(subscriptionSeconds)")], timeoutMs: 5000)
      subscriptionSeconds = WifiTransport.seconds(response.headers["timeout"]); response.close()
    } catch { log("相机事件续订失败：\(error.localizedDescription)") }
  }

  // MARK: Live view

  private func startStream() throws {
    guard let port = locked({ udp?.port }) else { throw LumixError("取景接收未就绪") }
    locked { streamStarted = monotonicMicros(); lastFrame = 0; frames.removeAll() }
    try busyOk("startstream", value: String(port))
    locked { streaming = true }
  }

  private func receive(_ socket: WifiUdp) {
    var packet = [UInt8](repeating: 0, count: 65535)
    do {
      while !closed {
        guard let (datagram, source) = try socket.receive(into: &packet) else { continue }
        if !allowed.contains(source) { continue }
        guard let jpeg = WifiProtocol.datagram(datagram) else { continue }
        let received = monotonicMicros()
        locked {
          lastFrame = received
          frames.append(CameraPreview(jpeg: jpeg, receivedUs: received))
          if frames.count > 3 { frames.removeFirst(frames.count - 3) }
        }
      }
    } catch {
      if !closed { locked { terminalError = "Wi-Fi 取景接收中断 · 请重新连接相机" }; abort() }
    }
  }

  func preview() throws -> CameraPreview? {
    if closed { throw closedError }
    return try locked {
      if streaming && monotonicMicros() - (lastFrame == 0 ? streamStarted : lastFrame) > 10_000_000 {
        throw LumixError("Wi-Fi 未收到完整取景帧；请检查相机模式、UDP 端口和手机网络，未知分包格式需要真机抓包确认")
      }
      let newest = frames.last
      frames.removeAll()
      return newest
    }
  }

  func autofocus() throws {
    if !capabilities.autofocus { throw LumixError("相机未声明 Wi-Fi AF 支持") }
    try ok("camcmd", value: "oneshot_af")
  }

  func focus(far: Bool) throws {
    if !capabilities.manualFocus { throw LumixError("相机未声明 Wi-Fi MF 步进支持") }
    try ok("camctrl", type: "focus", value: far ? "tele-slow" : "wide-slow")
  }

  // MARK: Capture

  func prepareCaptureBaseline() throws -> CaptureBaseline {
    control.lock(); defer { control.unlock() }
    if closed || (state != .ready && state != .baselined) { throw LumixError("Wi-Fi 拍摄状态不允许准备新基线") }
    prepared = nil; setState(.ready)
    let catalog: Catalog
    do { catalog = try stableSnapshot() } catch { try? leavePlayback(); throw error }
    try leavePlayback() // the shutter needs rec mode
    prepared = catalog; selected = nil; setState(.baselined)
    return catalog
  }

  private func stableSnapshot() throws -> Catalog {
    var attempt = 1
    while true {
      do { return try snapshot(nil) } catch is CatalogChanged where attempt < 3 { attempt += 1 }
    }
  }

  /// Root plus the newest folder for a baseline; afterwards also every container that is new or whose
  /// childCount changed. A real S5 card holds about a dozen folders of ~960 originals, so a full walk is too slow.
  private func snapshot(_ before: Catalog?) throws -> Catalog {
    var order: [(String, WifiProtocol.Item)] = [], seen = Set<String>(), counts: [String: Int] = [:]
    var queue = ["0"], visited = Set<String>()
    var newest: String?, full = false
    while !queue.isEmpty {
      let object = queue.removeFirst()
      if !visited.insert(object).inserted { continue }
      if visited.count > 128 { throw LumixError("相机目录层级超过安全遍历上限") }
      let children = try list(object)
      if object == "0" {
        var folder: WifiProtocol.Item?
        for item in children where item.container {
          if item.childCount < 0 { full = true } // without counts no change can be detected: list everything
          if folder == nil || WifiTransport.newer(item, folder!) { folder = item }
        }
        newest = folder?.id
      }
      for item in children {
        if !seen.insert(item.identity).inserted { throw LumixError("相机目录对象 ID 重复，无法确认原片") }
        order.append((item.identity, item))
        if order.count > 10000 { throw LumixError("相机目录超过安全遍历上限") }
        if !item.container { continue }
        counts[item.id] = item.childCount
        let old = before?.counts[item.id]
        let changed = before != nil && (old == nil || old! != item.childCount)
        if full || item.id == newest || changed { queue.append(item.id) }
      }
    }
    return Catalog(order: order, counts: counts, session: ObjectIdentifier(sessionToken))
  }

  /// Lumix folders are titled NNN-NNNN; a higher folder number holds the newest files.
  private static func newer(_ a: WifiProtocol.Item, _ b: WifiProtocol.Item) -> Bool {
    let ta = a.title ?? "", tb = b.title ?? ""
    return ta != tb ? ta > tb : a.id > b.id
  }

  private func list(_ object: String) throws -> [WifiProtocol.Item] {
    var items: [WifiProtocol.Item] = [], start = 0, total = -1
    var update: String?
    repeat {
      let page = try page(object, start)
      if total != -1 && (total != page.total || update != page.update) { throw CatalogChanged() }
      total = page.total; update = page.update
      if page.returned == 0 && start < total || start + page.returned > total { throw LumixError("相机目录分页被截断") }
      items += page.items; start += page.returned
    } while start < total
    return items
  }

  private func page(_ object: String, _ start: Int) throws -> WifiProtocol.Page {
    do { return try browse(object, start) }
    catch let failure as HttpFailure where !locked({ playback }) && (failure.status == 500 || failure.status == 503) {}
    // The S5 serves card listings only in playback. Switch once and stay until the original is fetched:
    // every extra recmode/playmode pair risks wedging the body.
    try enterPlayback()
    return try browse(object, start)
  }

  private func browse(_ object: String, _ start: Int) throws -> WifiProtocol.Page {
    control.lock(); defer { control.unlock() }
    guard let cds else { throw LumixError("相机目录地址未知") }
    let response = try request(cds, method: "POST", body: WifiProtocol.soap(object, start: start),
                               headers: [("Content-Type", "text/xml; charset=utf-8"), ("SOAPAction", "\"\(WifiProtocol.cds)#Browse\"")], timeoutMs: 5000)
    defer { response.close() }
    return try WifiProtocol.browse(try response.bytes(WifiProtocol.maxXml), control: cds)
  }

  private func enterPlayback() throws {
    try busyOk("camcmd", value: "playmode")
    locked { playback = true; streaming = false; frames.removeAll() }
  }

  /// recmode, then a new stream: none runs in playback, and stopstream without one upsets the S5.
  private func leavePlayback() throws {
    if !locked({ playback }) { return }
    locked { playback = false }
    try busyOk("camcmd", value: "recmode")
    try startStream()
  }

  /// After the original is safe: a failed return to rec ends the session but never the download.
  private func returnToRec() {
    do { try leavePlayback() } catch {
      let message = "Wi-Fi 无法切回拍摄模式 · 请重新连接相机"
      locked { terminalError = message }
      log("\(message)：\(error.localizedDescription)"); abort()
    }
  }

  func shutter() throws {
    control.lock(); defer { control.unlock() }
    if closed || state != .baselined || prepared == nil { throw LumixError("Wi-Fi 快门未准备或已经派发；不会重复发送") }
    setState(.shutterSent) // Reserve BEFORE writing any bytes, including concurrent calls.
    do { try command("camcmd", value: "capture").requireOk() }
    catch {
      let message = "Wi-Fi 快门结果不确定或被拒绝；未重试，请检查机身 SD 卡后重新连接"
      locked { terminalError = message; _state = .failed }
      abort(); throw LumixError(message)
    }
  }

  func awaitNewJpeg(_ before: CaptureBaseline?, valid: () -> Bool) throws -> CameraOriginal {
    control.lock()
    guard state == .shutterSent, let baseline = before as? Catalog, baseline === prepared, baseline.session == ObjectIdentifier(sessionToken) else {
      control.unlock(); throw LumixError("Wi-Fi 原片基线与本次会话不匹配")
    }
    setState(.locating)
    control.unlock()
    let deadline = monotonicMicros() + 60_000_000
    var prior: WifiProtocol.Media?
    do {
      while monotonicMicros() < deadline && !closed && valid() {
        let candidate: WifiProtocol.Media?
        // The body is still writing: a listing that changed mid-page is retried, not fatal.
        do { candidate = try WifiProtocol.uniqueNew(baseline.items, try snapshot(baseline).order) }
        catch is CatalogChanged { prior = nil; Thread.sleep(forTimeInterval: 0.6); continue }
        // Two complete catalog snapshots must agree; never select an old/highest filename.
        if let candidate, let prior, candidate.key == prior.key {
          control.lock(); selected = candidate; control.unlock()
          return CameraOriginal(key: candidate.key, filename: candidate.filename, size: candidate.size)
        }
        prior = candidate
        Thread.sleep(forTimeInterval: 0.6)
      }
      throw LumixError(!valid() || closed ? "Wi-Fi 拍摄期间连接中断；请检查机身 SD 卡原片" : "未找到本次唯一原 JPEG；请用单张 JPEG/RAW+JPEG，检查 SD 卡；未重发快门")
    } catch {
      locked { _state = .failed; terminalError = error.localizedDescription }
      abort(); throw error
    }
  }

  func downloadOriginal(_ original: CameraOriginal, to destination: URL) throws {
    control.lock()
    guard !closed, state == .locating, let media = selected, original.key == media.key else { control.unlock(); throw LumixError("Wi-Fi 原片与本次拍摄不匹配") }
    setState(.downloading)
    control.unlock()
    let part = destination.deletingLastPathComponent().appendingPathComponent(destination.lastPathComponent + ".wifi.part")
    defer { try? FileManager.default.removeItem(at: part) }
    do {
      var count: Int64 = 0
      let deadline = monotonicMicros() + 60_000_000
      while true {
        do {
          let response = try request(try WifiProtocol.resource(base, media.url.absoluteString), method: "GET", timeoutMs: 60_000)
          defer { response.close() }
          FileManager.default.createFile(atPath: part.path, contents: nil)
          let handle = try FileHandle(forWritingTo: part)
          defer { try? handle.close() }
          count = try response.copy(limit: Int64(WifiProtocol.maxJpeg)) { handle.write($0) }
          try handle.synchronize()
          break
        } catch let failure as HttpFailure where (failure.status == 404 || failure.status == 503) && !closed && monotonicMicros() < deadline {
          Thread.sleep(forTimeInterval: 0.5)
        }
      }
      if media.size != 0 && count != media.size { throw LumixError("Wi-Fi 原片长度与目录不符，未保存这张照片") }
      try WifiProtocol.jpeg(file: part, limit: WifiProtocol.maxJpeg)
      if closed { throw LumixError("Wi-Fi 下载已取消") }
      try? FileManager.default.removeItem(at: destination)
      try FileManager.default.moveItem(at: part, to: destination)
      control.lock(); setState(.ready); prepared = nil; selected = nil; control.unlock()
      log("Wi-Fi 原 JPEG 已流式接收并校验；相机字节一致性仍需 SD 卡实测")
    } catch {
      locked { _state = .failed; terminalError = error.localizedDescription }
      abort(); throw error
    }
    returnToRec()
  }

  func completeWithoutDownload() {
    control.lock(); defer { control.unlock() }
    if state == .locating && selected != nil { setState(.ready); prepared = nil; selected = nil; returnToRec() }
  }

  // MARK: Teardown

  func abort() {
    let (timer, socket, events) = locked { () -> (DispatchSourceTimer?, WifiUdp?, WifiListener?) in
      _closed = true
      let parts = (keepTimer, udp, eventServer)
      keepTimer = nil; frames.removeAll()
      if _state != .failed { _state = .closed }
      return parts
    }
    timer?.cancel(); socket?.close(); events?.close()
    http.close()
  }

  func close() {
    let (open, stream, subscription) = locked { (!_closed, streaming, sid) }
    if open && stream { _ = try? command("stopstream", timeoutMs: 1000) }
    if open, let subscription, let eventUrl {
      if let response = try? request(eventUrl, method: "UNSUBSCRIBE", headers: [("SID", subscription)], timeoutMs: 1000) { response.close() }
    }
    abort()
  }
}
