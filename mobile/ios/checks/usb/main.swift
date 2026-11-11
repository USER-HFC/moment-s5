import Foundation

// Host checks for the iOS USB transport: PTP parsing plus the pairing rules, driven by a fake Lumix that answers
// the way ImageCaptureCore hands PTP replies over. Real hardware is still unverified.

func monotonicMicros() -> Int64 { Int64(DispatchTime.now().uptimeNanoseconds / 1000) }

var passed = 0, failed = 0
func check(_ name: String, _ condition: @autoclosure () throws -> Bool) {
  do { if try condition() { passed += 1; return } ; print("FAIL \(name)") } catch { print("FAIL \(name): \(error.localizedDescription)") }
  failed += 1
}
func throwsMessage(_ body: () throws -> Void) -> String? { do { try body(); return nil } catch { return error.localizedDescription } }

func le16(_ v: Int) -> [UInt8] { UsbPtp.le16(v) }
func le32(_ v: UInt32) -> [UInt8] { UsbPtp.le32(v) }
func ptpString(_ s: String) -> [UInt8] {
  if s.isEmpty { return [0] }
  let units = Array(s.utf16) + [0]
  return [UInt8(units.count)] + units.flatMap { le16(Int($0)) }
}
func u16array(_ v: [Int]) -> [UInt8] { le32(UInt32(v.count)) + v.flatMap { le16($0) } }

struct FakeObject { var storage: UInt32; var format: Int; var name: String; var bytes: Data }

final class FakeLumix: PtpLink {
  var onEvent: ((Data) -> Void)?
  var objects: [UInt32: FakeObject] = [:]
  var nextHandle: UInt32 = 1
  var headerOnData = false
  var sendEvents = false
  var previewBusy = false
  var failNext: Int?
  var shutterAdds: [(storage: UInt32, format: Int, name: String)] = []
  var focusAnswer = 0x2001
  var vendorAnswer = 0x2001
  var log: [Int] = []
  var aborted = false, closedPolitely = false

  func add(_ storage: UInt32, _ format: Int, _ name: String, _ bytes: Data? = nil) -> UInt32 {
    let h = nextHandle; nextHandle += 1
    objects[h] = FakeObject(storage: storage, format: format, name: name, bytes: bytes ?? FakeLumix.jpeg(name)); return h
  }
  static func jpeg(_ tag: String) -> Data { Data([0xff, 0xd8, 0xff, 0xe0] + Array(tag.utf8) + [0xff, 0xd9]) }

  func event(_ code: Int, _ param: UInt32) { onEvent?(Data(le32(16) + le16(4) + le16(code) + le32(0) + le32(param))) }

  func send(_ command: Data, data: Data?, timeout: TimeInterval) throws -> (response: Data, data: Data) {
    if aborted { throw UsbPtp.Failure("USB 已断开") }
    let op = UsbPtp.u16(command, 6)
    var params: [UInt32] = []
    var at = 12; while at + 4 <= command.count { params.append(UsbPtp.u32(command, at)); at += 4 }
    log.append(op)
    if failNext == op { failNext = nil; throw UsbPtp.Failure("USB 超时或已断开（fake）") }
    var code = 0x2001
    var payload: [UInt8] = []
    switch op {
    case 0x1001:
      payload = le16(100) + le32(6) + le16(100) + ptpString("") + le16(0) + u16array([0x1001, 0x1007, 0x1008, 0x1009])
        + u16array([0x4002]) + u16array([]) + u16array([]) + u16array([0x3801]) + ptpString("Panasonic") + ptpString("DC-S5") + ptpString("2.9") + ptpString("SERIAL")
    case 0x9102, 0x9412, 0x9103: code = op == 0x9102 ? vendorAnswer : 0x2001
    case 0x9706:
      if previewBusy { code = 0x2019 } else {
        // A Panasonic header: block 0x17000001 says where the JPEG starts.
        var header = [UInt8](repeating: 0, count: 180)
        let block = le32(0x1700_0001) + le32(8) + le32(0) + le32(180)
        header.replaceSubrange(0..<block.count, with: block)
        payload = header + Array(FakeLumix.jpeg("live"))
      }
    case 0x9402:
      switch params[0] { case 0x0200_0021: payload = le32(params[0]) + le32(4) + le32(400)
      case 0x0200_0041: payload = le32(params[0]) + le32(2) + le16(28)
      default: code = 0x2005 }
    case 0x9108:
      payload = le32(params[0]) + le32(2) + le32(0) + le32(0) + le32(125_000)   // two codes in the header, then the value
    case 0x9404:
      for shot in shutterAdds {
        let h = add(shot.storage, shot.format, shot.name)
        if sendEvents { event(0xc108, h) }
      }
    case 0x9405: break
    case 0x9416: code = focusAnswer
    case 0x1007:
      let handles = objects.keys.sorted()
      payload = le32(UInt32(handles.count)) + handles.flatMap { le32($0) }
    case 0x1008:
      guard let o = objects[params[0]] else { code = 0x2009; break }
      var info = le32(o.storage) + le16(o.format) + le16(0) + le32(UInt32(o.bytes.count))
      info += [UInt8](repeating: 0, count: 14) + le32(6000) + le32(4000)
      info += [UInt8](repeating: 0, count: 52 - info.count) + ptpString(o.name)
      payload = info
    case 0x1009:
      guard let o = objects[params[0]] else { code = 0x2009; break }
      payload = Array(o.bytes)
    default: code = 0x2005
    }
    var body = Data(payload)
    if headerOnData && !payload.isEmpty { body = Data(le32(UInt32(12 + payload.count)) + le16(2) + le16(op) + le32(7) + payload) }
    return (Data(le32(12) + le16(3) + le16(code) + le32(7)), body)
  }
  func close() { closedPolitely = true }
  func abort() { aborted = true }
}

func transport(_ fake: FakeLumix) -> UsbTransport { let t = UsbTransport(link: fake) { _ in }; t.pollMs = 10; return t }
func download(_ t: UsbTransport, _ o: CameraOriginal) throws -> Data {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent("usb-check-\(UUID().uuidString).jpg")
  defer { try? FileManager.default.removeItem(at: url) }
  try t.downloadOriginal(o, to: url); return try Data(contentsOf: url)
}

// MARK: Parsing

check("sequence P", UsbPtp.lumixSequence("P1010001.JPG") == 1010001)
check("sequence AdobeRGB", UsbPtp.lumixSequence("_1230456.jpg") == 1230456)
check("sequence JPEG", UsbPtp.lumixSequence("P1010001.JPEG") == 1010001)
check("sequence rejects extra", UsbPtp.lumixSequence("P1010001.X.JPG") == -1)
check("sequence rejects RAW", UsbPtp.lumixSequence("P1010001.RW2") == -1)
check("sequence rejects short", UsbPtp.lumixSequence("P101001.JPG") == -1)
check("shutter 1/125", UsbPtp.shutterLabel(125_000) == "1/125")
check("shutter 2.5s", UsbPtp.shutterLabel(0x8000_0000 | 2500) == "2.5s")
check("shutter bulb", UsbPtp.shutterLabel(0xffff_ffff) == "B")
check("aperture 2.8", UsbPtp.apertureLabel(28) == "f/2.8")
check("aperture 4", UsbPtp.apertureLabel(40) == "f/4")
check("iso auto", UsbPtp.isoLabel(-1) == "ISO AUTO")
check("command layout", UsbPtp.command(0x1008, [5]) == Data(le32(16) + le16(1) + le16(0x1008) + le32(0) + le32(5)))
check("response code", try UsbPtp.responseCode(Data(le32(12) + le16(3) + le16(0x2019) + le32(1)), operation: 0x9706) == 0x2019)
check("empty response fails", throwsMessage { _ = try UsbPtp.responseCode(Data(), operation: 0x1001) }?.contains("没有返回") == true)
check("payload keeps bare data", try UsbPtp.payload(Data([1, 2, 3]), operation: 0x1009, limit: 10) == Data([1, 2, 3]))
check("payload strips container", try UsbPtp.payload(Data(le32(15) + le16(2) + le16(0x1009) + le32(1) + [9, 8, 7]), operation: 0x1009, limit: 10) == Data([9, 8, 7]))
check("payload limit", throwsMessage { _ = try UsbPtp.payload(Data(count: 11), operation: 0x1009, limit: 10) } != nil)
check("event parse", UsbPtp.event(Data(le32(16) + le16(4) + le16(0xc108) + le32(0) + le32(42)))! == (0xc108, 42))
check("event rejects response", UsbPtp.event(Data(le32(12) + le16(3) + le16(0x2001) + le32(0))) == nil)
check("live jpeg by scan", try UsbPtp.liveJpeg(Data([1, 2, 3, 4, 0xff, 0xd8, 0xff, 9])) == Data([0xff, 0xd8, 0xff, 9]))
check("live jpeg missing", throwsMessage { _ = try UsbPtp.liveJpeg(Data(repeating: 1, count: 300)) }?.contains("没有 JPEG") == true)
check("vendor session rejected", throwsMessage { try UsbPtp.requireSuccess(0x9102, 0x201e) }?.contains("0x201E") == true)
check("open session reuse", throwsMessage { try UsbPtp.requireSuccess(0x1002, 0x201e) } == nil)

// MARK: Session

for header in [false, true] {
  let tag = header ? "（带容器头）" : "（无容器头）"
  let fake = FakeLumix(); fake.headerOnData = header
  _ = fake.add(0x0001_0001, 0x3801, "P1010001.JPG")
  let t = transport(fake)
  check("open\(tag)", throwsMessage { try t.open() } == nil)
  check("model\(tag)", t.cameraModel == "DC-S5")
  check("never opens its own session\(tag)", !fake.log.contains(0x1002) && !fake.log.contains(0x1003))
  check("exposure\(tag)", t.exposure == "ISO 400     f/2.8     1/125")
  check("preview\(tag)", try t.preview()?.jpeg == FakeLumix.jpeg("live"))
  fake.previewBusy = true
  check("busy preview is skipped\(tag)", try t.preview() == nil && !t.closed)
  fake.previewBusy = false

  // No events: two agreeing listings pair the new JPEG; RAW of the pair is ignored.
  let baseline = try! t.prepareCaptureBaseline()
  fake.shutterAdds = [(0x0001_0001, 0xb103, "P1010002.RW2"), (0x0001_0001, 0x3801, "P1010002.JPG")]
  try! t.shutter()
  let shot = try? t.awaitNewJpeg(baseline) { true }
  check("pairs by listing\(tag)", shot?.filename == "P1010002.JPG")
  if let shot {
    check("download\(tag)", try download(t, shot) == FakeLumix.jpeg("P1010002.JPG"))
    t.noteSaved(shot)
  }
  check("no events yet\(tag)", !t.reportsNewPhotos)
  t.close()
  check("close is polite\(tag)", fake.closedPolitely && fake.log.suffix(2) == [0x9412, 0x9103])
}

do {
  // Backup recording: the same name and size on both cards is one photo, from the smaller StorageID.
  let fake = FakeLumix(); let t = transport(fake)
  try t.open()
  let baseline = try t.prepareCaptureBaseline()
  fake.shutterAdds = [(0x0002_0001, 0x3801, "P1010009.JPG"), (0x0001_0001, 0x3801, "P1010009.JPG")]
  try t.shutter()
  let shot = try t.awaitNewJpeg(baseline) { true }
  check("backup copy picks card 1", shot.key == "2")
} catch { check("backup copy: \(error.localizedDescription)", false) }

do {
  // Two different new JPEGs with the same sequence cannot be told apart.
  let fake = FakeLumix(); let t = transport(fake)
  try t.open()
  let baseline = try t.prepareCaptureBaseline()
  fake.shutterAdds = [(0x0001_0001, 0x3801, "P1010009.JPG"), (0x0001_0001, 0x3801, "_1010009.JPG")]
  try t.shutter()
  var calls = 0
  let message = throwsMessage { _ = try t.awaitNewJpeg(baseline) { calls += 1; return calls < 400 } }
  check("ambiguous listing is never paired", message?.contains("连接中断") == true)
} catch { check("ambiguous: \(error.localizedDescription)", false) }

do {
  // Events: once one has arrived, a newer sequence than the saved photo is accepted at once.
  let fake = FakeLumix(); fake.sendEvents = true; let t = transport(fake)
  try t.open()
  fake.event(0x4006, 0)
  check("events seen", t.reportsNewPhotos)
  var baseline = try t.prepareCaptureBaseline()
  fake.shutterAdds = [(0x0001_0001, 0x3801, "P1010003.JPG")]
  t.clearCaptureEvents(); try t.shutter()
  let first = try t.awaitNewJpeg(baseline) { true }
  t.noteSaved(first)
  baseline = try t.prepareCaptureBaseline()
  fake.shutterAdds = [(0x0001_0001, 0x3801, "P1010004.JPG")]
  t.clearCaptureEvents()
  let started = monotonicMicros()
  try t.shutter()
  let second = try t.awaitNewJpeg(baseline) { true }
  check("event pairs fast", second.filename == "P1010004.JPG" && monotonicMicros() - started < 500_000)

  // A photo released on the body arrives as an event; its backup copy is not imported twice.
  let body = fake.add(0x0001_0001, 0x3801, "P1010005.JPG"), copy = fake.add(0x0002_0001, 0x3801, "P1010005.JPG")
  fake.event(0xc108, body); fake.event(0xc108, copy)
  let synced = try t.nextCameraPhoto(baseline, saved: [])
  check("body photo", synced?.filename == "P1010005.JPG")
  check("body backup copy skipped", try t.nextCameraPhoto(baseline, saved: [synced!.key]) == nil)
  let raw = fake.add(0x0001_0001, 0xb103, "P1010006.RW2"); fake.event(0xc108, raw)
  check("body RAW skipped", try t.nextCameraPhoto(baseline, saved: []) == nil)
  let folded = t.withPhoto(baseline, synced!) as? UsbTransport.Handles
  check("baseline gains body photo", folded?.values.contains(body) == true)
} catch { check("events: \(error.localizedDescription)", false) }

do {
  // An old object named by an event before anything was saved is not trusted; the listing decides.
  let fake = FakeLumix(); fake.sendEvents = true; let t = transport(fake)
  try t.open()
  let baseline = try t.prepareCaptureBaseline()
  // Written after the baseline but before this shutter, e.g. by a late card write.
  let old = fake.add(0x0001_0001, 0x3801, "P1010001.JPG")
  fake.event(0xc108, old)
  fake.shutterAdds = [(0x0001_0001, 0x3801, "P1010002.JPG")]
  try t.shutter()
  check("stale event ignored", try t.awaitNewJpeg(baseline) { true }.filename == "P1010002.JPG")
} catch { check("stale event: \(error.localizedDescription)", false) }

do {
  // A lost exchange ends the session; nothing is retried.
  let fake = FakeLumix(); let t = transport(fake)
  try t.open()
  fake.failNext = 0x9404
  let shutterCount = fake.log.filter { $0 == 0x9404 }.count
  check("shutter failure surfaces", throwsMessage { try t.shutter() }?.contains("USB 超时") == true)
  check("shutter not retried", fake.log.filter { $0 == 0x9404 }.count == shutterCount + 1)
  check("session closed after failure", t.closed && fake.aborted)
  check("later calls refuse", throwsMessage { _ = try t.preview() } == "USB 已断开")
} catch { check("failure: \(error.localizedDescription)", false) }

do {
  let fake = FakeLumix(); fake.focusAnswer = 0x2005; let t = transport(fake)
  try t.open()
  check("focus refusal explained", throwsMessage { try t.focus(far: true) }?.contains("对焦步进") == true)
  check("focus refusal keeps session", !t.closed)
  let size = Int64(FakeLumix.jpeg("P1010001.JPG").count)
  let h = fake.add(0x0001_0001, 0x3801, "P1010001.JPG")
  check("size mismatch refused", throwsMessage { _ = try download(t, CameraOriginal(key: String(h), filename: "P1010001.JPG", size: size + 1)) }?.contains("原片长度不符") == true)
  check("over 64 MB refused", throwsMessage { _ = try download(t, CameraOriginal(key: String(h), filename: "P1010001.JPG", size: 65 << 20)) }?.contains("64 MB") == true)
} catch { check("focus: \(error.localizedDescription)", false) }

do {
  let fake = FakeLumix(); fake.vendorAnswer = 0x2019; let t = transport(fake)
  check("busy vendor session fails open", throwsMessage { try t.open() }?.contains("机身忙") == true)
}

print("USB checks: \(passed) passed, \(failed) failed")
exit(failed == 0 ? 0 : 1)
