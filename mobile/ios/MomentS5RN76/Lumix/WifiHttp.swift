import Darwin
import Foundation

/// Blocking POSIX sockets for the camera link, the iOS side of WifiCameraHttp.java's Route. Every call
/// runs on a transport thread, never on the JS or main queue. A socket closed from another thread is shut
/// down first, which wakes a blocked read; the descriptor itself is released only when the object goes.
final class WifiSocket {
  fileprivate let fd: Int32
  private let lock = NSLock()
  private var shut = false

  fileprivate init(fd: Int32) {
    self.fd = fd
    var on: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size))
  }

  deinit { Darwin.close(fd) }

  static func connect(host: String, port: Int, interface: UInt32?, timeoutMs: Int) throws -> WifiSocket {
    var address = try WifiNet.ipv4(host, port: port)
    let fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
    if fd < 0 { throw WifiNet.error("无法创建相机连接") }
    let sock = WifiSocket(fd: fd)
    if let interface { try WifiNet.bind(fd, interface: interface) }
    let flags = fcntl(fd, F_GETFL, 0)
    _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
    let started = withUnsafePointer(to: &address) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    if started != 0 {
      if errno != EINPROGRESS { throw WifiNet.error("无法连接相机") }
      var poll = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
      let ready = Darwin.poll(&poll, 1, Int32(timeoutMs))
      if ready == 0 { throw LumixError("连接相机超时；请确认手机连着相机 Wi-Fi，并允许本 App 访问本地网络") }
      if ready < 0 { throw WifiNet.error("无法连接相机") }
      var failure: Int32 = 0, length = socklen_t(MemoryLayout<Int32>.size)
      getsockopt(fd, SOL_SOCKET, SO_ERROR, &failure, &length)
      if failure != 0 { errno = failure; throw WifiNet.error("无法连接相机") }
    }
    _ = fcntl(fd, F_SETFL, flags & ~O_NONBLOCK)
    return sock
  }

  func setTimeout(ms: Int) {
    var value = timeval(tv_sec: ms / 1000, tv_usec: Int32(ms % 1000 * 1000))
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &value, socklen_t(MemoryLayout<timeval>.size))
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &value, socklen_t(MemoryLayout<timeval>.size))
  }

  func write(_ data: Data) throws {
    try data.withUnsafeBytes { raw in
      var sent = 0
      while sent < raw.count {
        if isShut { throw LumixError("Wi-Fi 连接已取消") }
        let n = send(fd, raw.baseAddress! + sent, raw.count - sent, 0)
        if n < 0 { if errno == EINTR { continue }; throw WifiNet.error("相机连接写入失败") }
        sent += n
      }
    }
  }

  /// 0 at end of stream. A receive timeout throws.
  func read(_ buffer: UnsafeMutableRawPointer, _ max: Int) throws -> Int {
    while true {
      if isShut { throw LumixError("Wi-Fi 连接已取消") }
      let n = recv(fd, buffer, max, 0)
      if n >= 0 { return n }
      if errno == EINTR { continue }
      if errno == EAGAIN || errno == EWOULDBLOCK { throw LumixError("相机 HTTP 响应超时") }
      throw WifiNet.error("相机连接读取失败")
    }
  }

  var localAddress: String? { WifiNet.name(fd, local: true) }
  var peerAddress: String? { WifiNet.name(fd, local: false) }
  private var isShut: Bool { lock.lock(); defer { lock.unlock() }; return shut }

  func close() {
    lock.lock(); let first = !shut; shut = true; lock.unlock()
    if first { Darwin.shutdown(fd, SHUT_RDWR) }
  }
}

/// The GENA callback listener on the camera interface's own address.
final class WifiListener {
  private let fd: Int32
  private let lock = NSLock()
  private var shut = false
  let port: Int

  init(address: String) throws {
    var local = try WifiNet.ipv4(address, port: 0)
    let fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
    if fd < 0 { throw WifiNet.error("无法监听相机事件") }
    self.fd = fd
    var on: Int32 = 1
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, socklen_t(MemoryLayout<Int32>.size))
    let bound = withUnsafePointer(to: &local) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    if bound != 0 || listen(fd, 4) != 0 { let error = WifiNet.error("无法监听相机事件"); Darwin.close(fd); throw error }
    port = WifiNet.port(fd)
  }

  deinit { Darwin.close(fd) }

  /// nil after `timeoutMs` without a connection, so the caller can notice a close.
  func accept(timeoutMs: Int) throws -> WifiSocket? {
    var poll = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
    let ready = Darwin.poll(&poll, 1, Int32(timeoutMs))
    if closed { throw LumixError("相机事件监听已关闭") }
    if ready <= 0 { return nil }
    let client = Darwin.accept(fd, nil, nil)
    if client < 0 { return nil }
    return WifiSocket(fd: client)
  }

  var closed: Bool { lock.lock(); defer { lock.unlock() }; return shut }
  func close() { lock.lock(); let first = !shut; shut = true; lock.unlock(); if first { Darwin.shutdown(fd, SHUT_RDWR) } }
}

/// The live-view datagram socket.
final class WifiUdp {
  private let fd: Int32
  private let lock = NSLock()
  private var shut = false
  private(set) var port = 0

  init() throws {
    fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    if fd < 0 { throw WifiNet.error("无法创建取景接收") }
    var size: Int32 = 1024 * 1024
    setsockopt(fd, SOL_SOCKET, SO_RCVBUF, &size, socklen_t(MemoryLayout<Int32>.size))
    var wait = timeval(tv_sec: 0, tv_usec: 500_000)
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &wait, socklen_t(MemoryLayout<timeval>.size))
  }

  deinit { Darwin.close(fd) }

  func bind(interface: UInt32) throws { try WifiNet.bind(fd, interface: interface) }

  func bind(port requested: Int) throws {
    var local = sockaddr_in()
    local.sin_len = UInt8(MemoryLayout<sockaddr_in>.size); local.sin_family = sa_family_t(AF_INET)
    local.sin_port = in_port_t(UInt16(requested).bigEndian); local.sin_addr.s_addr = INADDR_ANY
    let bound = withUnsafePointer(to: &local) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
    if bound != 0 { throw WifiNet.error("取景 UDP 端口 \(requested) 无法使用") }
    port = WifiNet.port(fd)
  }

  /// One datagram and its IPv4 source, or nil after the 500 ms receive timeout.
  func receive(into buffer: inout [UInt8]) throws -> (Data, String)? {
    var from = sockaddr_in(), length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let n = buffer.withUnsafeMutableBytes { raw in
      withUnsafeMutablePointer(to: &from) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { recvfrom(fd, raw.baseAddress, raw.count, 0, $0, &length) } }
    }
    if closed { throw LumixError("取景接收已关闭") }
    if n < 0 {
      if errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR { return nil }
      throw WifiNet.error("取景接收失败")
    }
    return (Data(buffer[0..<n]), WifiNet.text(from.sin_addr))
  }

  var closed: Bool { lock.lock(); defer { lock.unlock() }; return shut }
  func close() { lock.lock(); let first = !shut; shut = true; lock.unlock(); if first { Darwin.shutdown(fd, SHUT_RDWR) } }
}

/// Which network the camera traffic uses. iOS has no per-app network handle like Android's Network, so the
/// camera interface is picked by subnet and every socket is pinned to it with IP_BOUND_IF.
final class WifiRoute {
  let interface: UInt32?
  private let lock = NSLock()
  private var stopped = false

  init(interface: UInt32?) { self.interface = interface }

  /// The Wi-Fi interface whose IPv4 subnet holds the camera. The user joins the camera network in Settings.
  static func camera(_ host: String) throws -> WifiRoute {
    let target = try WifiNet.ipv4(host, port: 0).sin_addr.s_addr
    var matches: [(String, UInt32)] = []
    var list: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&list) == 0 else { throw LumixError("无法读取手机网络状态") }
    defer { freeifaddrs(list) }
    var cursor = list
    while let entry = cursor?.pointee {
      defer { cursor = entry.ifa_next }
      let flags = Int32(entry.ifa_flags)
      guard flags & IFF_UP != 0, flags & IFF_RUNNING != 0, flags & IFF_LOOPBACK == 0,
            let addr = entry.ifa_addr, addr.pointee.sa_family == sa_family_t(AF_INET), let mask = entry.ifa_netmask else { continue }
      let own = addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr }
      let bits = mask.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee.sin_addr.s_addr }
      if bits == 0 || own & bits != target & bits { continue }
      let name = String(cString: entry.ifa_name)
      if !matches.contains(where: { $0.0 == name }) { matches.append((name, if_nametoindex(entry.ifa_name))) }
    }
    if matches.isEmpty { throw LumixError("手机还没连上相机 Wi-Fi；请先在「设置」→「无线局域网」加入相机网络，再回来连接") }
    if matches.count > 1 { throw LumixError("有多个网络可到达相机 IP，请断开多余的网络后重试") }
    return WifiRoute(interface: matches[0].1)
  }

  func connect(host: String, port: Int) throws -> WifiSocket {
    if isStopped { throw LumixError("相机网络已取消") }
    let socket = try WifiSocket.connect(host: host, port: port, interface: interface, timeoutMs: 5000)
    if isStopped { socket.close(); throw LumixError("相机网络已取消") }
    return socket
  }

  func bind(_ udp: WifiUdp) throws {
    if isStopped { throw LumixError("相机网络已取消") }
    if let interface { try udp.bind(interface: interface) }
  }

  private var isStopped: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
  func close() { lock.lock(); stopped = true; lock.unlock() }
}

enum WifiNet {
  static func ipv4(_ host: String, port: Int) throws -> sockaddr_in {
    var hints = addrinfo(ai_flags: 0, ai_family: AF_INET, ai_socktype: SOCK_STREAM, ai_protocol: 0, ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
    var result: UnsafeMutablePointer<addrinfo>?
    guard getaddrinfo(host, String(port), &hints, &result) == 0, let first = result, let addr = first.pointee.ai_addr else { throw LumixError("相机地址无效") }
    defer { freeaddrinfo(result) }
    return addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { $0.pointee }
  }

  static func addresses(_ host: String) -> Set<String> {
    (try? ipv4(host, port: 0)).map { [text($0.sin_addr)] } ?? []
  }

  static func bind(_ fd: Int32, interface: UInt32) throws {
    var index = interface
    if setsockopt(fd, IPPROTO_IP, IP_BOUND_IF, &index, socklen_t(MemoryLayout<UInt32>.size)) != 0 { throw error("无法使用相机 Wi-Fi") }
  }

  static func text(_ addr: in_addr) -> String {
    var copy = addr
    var buffer = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
    inet_ntop(AF_INET, &copy, &buffer, socklen_t(INET_ADDRSTRLEN))
    return String(cString: buffer)
  }

  static func name(_ fd: Int32, local: Bool) -> String? {
    var addr = sockaddr_in(), length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let ok = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { local ? getsockname(fd, $0, &length) : getpeername(fd, $0, &length) } }
    return ok == 0 && addr.sin_family == sa_family_t(AF_INET) ? text(addr.sin_addr) : nil
  }

  static func port(_ fd: Int32) -> Int {
    var addr = sockaddr_in(), length = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &length) } }
    return Int(UInt16(bigEndian: addr.sin_port))
  }

  /// errno as a sentence. Local-network denial on iOS surfaces as an unreachable host.
  static func error(_ prefix: String) -> LumixError {
    let code = errno
    if code == EHOSTUNREACH || code == ENETUNREACH || code == ENETDOWN {
      return LumixError("\(prefix)：网络不可达；请确认连着相机 Wi-Fi，并在「设置」里允许本 App 访问本地网络")
    }
    if code == ECONNREFUSED { return LumixError("\(prefix)：相机拒绝连接；请确认机身在遥控拍摄等待连接") }
    return LumixError("\(prefix)：\(String(cString: strerror(code)))")
  }
}

/// Small camera-only HTTP/1.1 client: fresh sockets, no redirect and no request retry. Port of WifiCameraHttp.java.
final class WifiHttp {
  private let route: WifiRoute
  private let lock = NSLock()
  private var sockets: [ObjectIdentifier: WifiSocket] = [:]
  private var closed = false

  init(route: WifiRoute) { self.route = route }

  /// Buffered reads with one deadline for the whole response, like the Java Deadline stream.
  final class Reader {
    private let socket: WifiSocket
    private let deadline: UInt64
    private var buffer = [UInt8](repeating: 0, count: 16384)
    private var at = 0, filled = 0

    init(_ socket: WifiSocket, timeoutMs: Int) { self.socket = socket; deadline = DispatchTime.now().uptimeNanoseconds + UInt64(timeoutMs) * 1_000_000 }

    private func check() throws { if DispatchTime.now().uptimeNanoseconds > deadline { throw LumixError("相机 HTTP 响应总时限已到") } }

    private func fill() throws -> Bool {
      try check()
      filled = try buffer.withUnsafeMutableBytes { try socket.read($0.baseAddress!, $0.count) }
      try check()
      at = 0
      return filled > 0
    }

    func byte() throws -> Int {
      if at >= filled, !(try fill()) { return -1 }
      defer { at += 1 }
      return Int(buffer[at])
    }

    /// Up to `max` bytes, 0 at end of stream.
    func read(_ max: Int) throws -> Data {
      if at >= filled, !(try fill()) { return Data() }
      let n = min(max, filled - at)
      defer { at += n }
      return Data(buffer[at..<(at + n)])
    }

    func line() throws -> String {
      var out: [UInt8] = []
      while true {
        let b = try byte()
        if b < 0 { throw LumixError("相机 HTTP 应答被截断") }
        if b == 10 {
          guard out.last == 13 else { throw LumixError("相机 HTTP 换行无效") }
          return String(decoding: out.dropLast(), as: UTF8.self)
        }
        out.append(UInt8(b))
        if out.count > 8192 { throw LumixError("相机 HTTP 行过长") }
      }
    }
  }

  /// Content-Length, chunked or read-to-close.
  final class Body {
    enum Kind { case sized(Int64), chunked, close }
    private let reader: Reader
    private var kind: Kind
    private var remaining: Int64 = 0
    private var first = true, done = false
    private var trailers = 0

    init(_ reader: Reader, _ kind: Kind) {
      self.reader = reader; self.kind = kind
      if case .sized(let n) = kind { remaining = n; done = n == 0 }
    }

    /// The next piece, or nil at the end of the body.
    func next(_ max: Int = 16384) throws -> Data? {
      if done { return nil }
      switch kind {
      case .close:
        let data = try reader.read(max)
        if data.isEmpty { done = true; return nil }
        return data
      case .sized:
        let data = try reader.read(Int(min(Int64(max), remaining)))
        if data.isEmpty { throw LumixError("相机 HTTP 内容不完整") }
        remaining -= Int64(data.count); if remaining == 0 { done = true }
        return data
      case .chunked:
        if remaining == 0 {
          if !first, !(try reader.line()).isEmpty { throw LumixError("无效 HTTP chunk 尾") }
          first = false
          let size = try reader.line().split(separator: ";", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
          guard let n = Int64(size.trimmingCharacters(in: .whitespaces), radix: 16), n >= 0, n <= 64 * 1024 * 1024 else { throw LumixError("无效 HTTP chunk 长度") }
          remaining = n
          if n == 0 {
            while !(try reader.line()).isEmpty { trailers += 1; if trailers > 32 { throw LumixError("HTTP trailer 过多") } }
            done = true; return nil
          }
        }
        let data = try reader.read(Int(min(Int64(max), remaining)))
        if data.isEmpty { throw LumixError("HTTP chunk 不完整") }
        remaining -= Int64(data.count)
        return data
      }
    }
  }

  final class Response {
    let status: Int
    let length: Int64
    let headers: [String: String]
    let localAddress: String?
    private let socket: WifiSocket
    private let body: Body
    private let release: (WifiSocket) -> Void

    fileprivate init(socket: WifiSocket, status: Int, length: Int64, headers: [String: String], body: Body, release: @escaping (WifiSocket) -> Void) {
      self.socket = socket; self.status = status; self.length = length; self.headers = headers; self.body = body; self.release = release
      localAddress = socket.localAddress
    }

    deinit { close() }

    func bytes(_ limit: Int) throws -> Data {
      var out = Data()
      _ = try copy(limit: Int64(limit)) { out.append($0) }
      return out
    }

    func copy(limit: Int64, to sink: (Data) throws -> Void) throws -> Int64 {
      if length > limit { throw LumixError("Wi-Fi 响应超过接收上限") }
      var total: Int64 = 0
      while let piece = try body.next() {
        total += Int64(piece.count)
        if total > limit { throw LumixError("Wi-Fi 响应超过接收上限") }
        try sink(piece)
      }
      if length >= 0 && total != length { throw LumixError("Wi-Fi 原片长度不符或响应被截断") }
      return total
    }

    func close() { socket.close(); release(socket) }
  }

  func request(_ url: URL, method: String, payload: Data?, headers extra: [(String, String)], timeoutMs: Int) throws -> Response {
    if isClosed { throw LumixError("Wi-Fi 已断开") }
    guard let host = url.host else { throw LumixError("相机地址无效") }
    let socket = try route.connect(host: host, port: WifiProtocol.port(url))
    track(socket)
    do {
      if isClosed { throw LumixError("Wi-Fi 连接已取消") }
      socket.setTimeout(ms: min(timeoutMs, 15000))
      let authority = url.port.map { "\(host):\($0)" } ?? host
      var head = "\(method) \(WifiProtocol.requestTarget(url)) HTTP/1.1\r\nHost: \(authority)\r\nConnection: close\r\nAccept: */*\r\n"
      for (key, value) in extra {
        if key.contains("\r") || key.contains("\n") || value.contains("\r") || value.contains("\n") { throw LumixError("无效 HTTP 请求头") }
        head += "\(key): \(value)\r\n"
      }
      if let payload { head += "Content-Length: \(payload.count)\r\n" }
      head += "\r\n"
      // This is the sole dispatch. Nothing in this client retries a write or a response read.
      var wire = Data(head.utf8)
      if let payload { wire.append(payload) }
      try socket.write(wire)
      let reader = Reader(socket, timeoutMs: timeoutMs)
      let statusLine = try reader.line()
      let parts = statusLine.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: false)
      guard parts.count >= 2, parts[0].hasPrefix("HTTP/1.") else { throw LumixError("相机 HTTP 应答无效") }
      guard let status = Int(parts[1]) else { throw LumixError("相机 HTTP 状态无效") }
      var headers: [String: String] = [:]
      var headerBytes = statusLine.utf8.count, count = 0
      while true {
        let value = try reader.line()
        headerBytes += value.utf8.count
        if count > 100 || headerBytes > 32768 { throw LumixError("相机 HTTP 响应头过大") }
        count += 1
        if value.isEmpty { break }
        guard let colon = value.firstIndex(of: ":"), colon != value.startIndex else { throw LumixError("相机 HTTP 响应头无效") }
        let key = value[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
        if headers.updateValue(value[value.index(after: colon)...].trimmingCharacters(in: .whitespaces), forKey: key) != nil { throw LumixError("相机 HTTP 重复响应头") }
      }
      if (300..<400).contains(status) { throw LumixError("拒绝相机 HTTP 重定向；未发送额外指令") }
      var length: Int64 = -1
      if let raw = headers["content-length"] {
        guard let n = Int64(raw), n >= 0 else { throw LumixError("相机 HTTP 长度无效") }
        length = n
      }
      let transfer = headers["transfer-encoding"]
      if let transfer, transfer.caseInsensitiveCompare("chunked") != .orderedSame { throw LumixError("不支持相机 HTTP 传输编码") }
      if transfer != nil && length >= 0 { throw LumixError("相机 HTTP 长度冲突") }
      let body = Body(reader, transfer != nil ? .chunked : length >= 0 ? .sized(length) : .close)
      return Response(socket: socket, status: status, length: length, headers: headers, body: body) { [weak self] in self?.untrack($0) }
    } catch {
      socket.close(); untrack(socket)
      throw error
    }
  }

  struct Incoming { let method: String; let headers: [String: String]; let body: Data }

  /// One inbound request from the camera (GENA NOTIFY), with a bounded body.
  static func incoming(_ socket: WifiSocket, limit: Int) throws -> Incoming {
    let reader = Reader(socket, timeoutMs: 2000)
    let start = try reader.line()
    let parts = start.split(separator: " ", maxSplits: 2, omittingEmptySubsequences: false)
    guard parts.count >= 3, parts[2].hasPrefix("HTTP/1.") else { throw LumixError("相机事件请求无效") }
    var headers: [String: String] = [:]
    var count = 0
    while true {
      let value = try reader.line()
      if count > 100 { throw LumixError("相机事件请求头过多") }
      count += 1
      if value.isEmpty { break }
      guard let colon = value.firstIndex(of: ":"), colon != value.startIndex else { throw LumixError("相机事件请求头无效") }
      headers[value[..<colon].trimmingCharacters(in: .whitespaces).lowercased()] = value[value.index(after: colon)...].trimmingCharacters(in: .whitespaces)
    }
    let body: Body
    if let transfer = headers["transfer-encoding"], transfer.caseInsensitiveCompare("chunked") == .orderedSame { body = Body(reader, .chunked) }
    else {
      guard let length = Int64(headers["content-length"] ?? "0"), length >= 0, length <= Int64(limit) else { throw LumixError("相机事件超过上限") }
      body = Body(reader, .sized(length))
    }
    var out = Data()
    while let piece = try body.next(4096) { out.append(piece); if out.count > limit { throw LumixError("相机事件超过上限") } }
    return Incoming(method: String(parts[0]), headers: headers, body: out)
  }

  private var isClosed: Bool { lock.lock(); defer { lock.unlock() }; return closed }
  private func track(_ socket: WifiSocket) { lock.lock(); sockets[ObjectIdentifier(socket)] = socket; lock.unlock() }
  private func untrack(_ socket: WifiSocket) { lock.lock(); sockets.removeValue(forKey: ObjectIdentifier(socket)); lock.unlock() }

  func close() {
    lock.lock(); closed = true; let open = Array(sockets.values); sockets.removeAll(); lock.unlock()
    for socket in open { socket.close() }
    route.close()
  }
}
