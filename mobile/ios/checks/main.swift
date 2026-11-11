import Foundation

// Host checks for WifiProtocol.swift (main.swift so the checks can run as top-level code): the same protocol vectors as tests/WifiS5Checks.java, so the iOS
// port parses camera replies exactly like Android. Run with mobile/ios/checks/run-wifi-checks.sh.

struct LumixError: LocalizedError {
  let message: String
  init(_ message: String) { self.message = message }
  var errorDescription: String? { message }
}

var failures = 0
func check(_ ok: Bool, _ name: String) { if ok { print("ok   \(name)") } else { failures += 1; print("FAIL \(name)") } }
func reject(_ name: String, _ body: () throws -> Void) { do { try body(); check(false, name) } catch { check(true, name) } }
func bytes(_ text: String) -> Data { Data(text.utf8) }
func escape(_ t: String) -> String { t.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;") }
func okXml(_ content: String) -> String { "<camrply><result>ok</result>\(content)</camrply>" }
func media(_ id: String, _ parent: String, _ tag: String, _ url: String, _ size: Int) -> String {
  "<item id='\(id)' parentID='\(parent)'><title>\(id).JPG</title><res protocolInfo='http-get:*:image/jpeg:PANASONIC.COM_PN=CAM_LRGTN'>\(url)</res><res protocolInfo='http-get:*:application/octet-stream;PANASONIC.COM_PN=\(tag)' size='\(size)'>\(url)</res></item>"
}
func soap(_ items: String, _ returned: Int, _ total: Int) -> String {
  "<Envelope><Body><BrowseResponse><Result>\(escape("<DIDL-Lite>\(items)</DIDL-Lite>"))</Result><NumberReturned>\(returned)</NumberReturned><TotalMatches>\(total)</TotalMatches><UpdateID>1</UpdateID></BrowseResponse></Body></Envelope>"
}
func order(_ page: WifiProtocol.Page) -> [(String, WifiProtocol.Item)] { page.items.map { ($0.identity, $0) } }
func dict(_ page: WifiProtocol.Page) -> [String: WifiProtocol.Item] { Dictionary(order(page), uniquingKeysWith: { a, _ in a }) }

let fixtures = URL(fileURLWithPath: CommandLine.arguments[1])

do {
  check(try WifiProtocol.reply(bytes(okXml("<setting><iso>400</iso></setting>"))).first("iso") == "400", "XML readout parsed")
  reject("HTTP 200 cannot hide protocol refusal") { try WifiProtocol.reply(bytes("<camrply><result>err-reject</result></camrply>")).requireOk() }
  reject("missing result refused") { _ = try WifiProtocol.reply(bytes("<camrply><state/></camrply>")) }
  reject("external entity refused") { _ = try WifiProtocol.xml(bytes("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///private-fixture'>]><x>&e;</x>")) }
  check(try WifiProtocol.reply(bytes("ok,\"Camera, fixture\",remote,open,private-fixture-token")).fields.count == 4, "quoted CSV fields preserved")
  check(try WifiProtocol.reply(bytes("ok,\"Camera, fixture\",remote,open,private-fixture-token")).fields[0] == "Camera, fixture", "quoted CSV comma kept inside the field")
  reject("truncated CSV refused") { _ = try WifiProtocol.reply(bytes("ok,\"unterminated")) }
  check(WifiProtocol.nonce(try WifiProtocol.reply(bytes("ok,0a0b0c0d"))) == 0x0a0b0c0d, "req_acc_g nonce parsed")
  let errParam = try WifiProtocol.reply(bytes("err_param")), named = try WifiProtocol.reply(bytes("ok,MOCK-DC-S5,remote"))
  check(WifiProtocol.nonce(errParam) == nil && WifiProtocol.nonce(named) == nil, "non-nonce replies rejected")
  check(WifiProtocol.encryptAccess("A", nonce: 0x01020304) == "fbfcfd40", "access transform pads with 0xFF, XORs big-endian, prints byte-swapped")
  check(WifiProtocol.encryptAccess("ABCD", nonce: 0) == "683b70d1", "zero nonce uses LUMIX Sync's stand-in key")

  let ddd = URL(string: "http://192.168.54.1:60606/Lumix/Server0/ddd")!
  let services = "<serviceList><service><serviceType>\(WifiProtocol.cds)</serviceType><controlURL>/Server0/CDS_control</controlURL></service><service><serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType><eventSubURL>/Server0/CMS_event</eventSubURL></service></serviceList>"
  let s5 = try WifiProtocol.description(bytes("<root xmlns='urn:schemas-upnp-org:device-1-0' xmlns:pana='urn:schemas-panasonic-com:pana'><device><manufacturer>Panasonic</manufacturer><modelName>LUMIX</modelName><modelNumber>DC-S5</modelNumber><pana:X_FirmVersion>2.03</pana:X_FirmVersion>\(services)</device></root>"), location: ddd)
  check(s5.panasonic && s5.model == "DC-S5" && s5.firmware == "2.03" && !s5.encryptedHandshake && s5.events != nil, "real S5 description is identified by modelNumber, plain handshake")
  check(s5.control.absoluteString == "http://192.168.54.1:60606/Server0/CDS_control" && s5.events?.absoluteString == "http://192.168.54.1:60606/Server0/CMS_event", "control and event URLs resolve against the description")
  let newer = try WifiProtocol.description(bytes("<root xmlns:pana='urn:schemas-panasonic-com:pana'><device><manufacturer>Panasonic</manufacturer><modelName>LUMIX</modelName><modelNumber>DC-XX9</modelNumber><pana:X_CamCapability>0000000000000001</pana:X_CamCapability>\(services)</device></root>"), location: ddd)
  check(newer.panasonic && newer.model == "DC-XX9" && newer.encryptedHandshake, "any Lumix accepted; X_CamCapability ending in 1 selects the encrypted handshake")
  check(!(try WifiProtocol.description(bytes("<root><device><manufacturer>Other</manufacturer><modelName>LUMIX</modelName>\(services)</device></root>"), location: ddd)).panasonic, "non-Panasonic description is not treated as a Lumix")
  reject("production refuses public IP") { _ = try WifiProtocol.cameraUrl("8.8.8.8", debug: false) }
  reject("custom port debug only") { _ = try WifiProtocol.cameraUrl("10.0.2.2:18080", debug: false) }
  reject("endpoint cannot contain command path") { _ = try WifiProtocol.cameraUrl("192.168.54.1/path", debug: false) }
  check((try? WifiProtocol.cameraUrl("192.168.54.1", debug: false)) != nil, "private camera IPv4 accepted")
  let base = try WifiProtocol.cameraUrl("127.0.0.1:18080", debug: true)
  reject("off-camera media refused") { _ = try WifiProtocol.resource(base, "http://other.example/a.JPG") }
  reject("command as media refused") { _ = try WifiProtocol.resource(base, "/cam.cgi?mode=camcmd&value=capture") }
  reject("encoded command as media refused") { _ = try WifiProtocol.resource(base, "/%63am.cgi?mode=camcmd&value=capture") }
  let item = media("new", "card-a", "CAM_ORG", "\(base.absoluteString)/original.JPG", 512)
  let parsed = try WifiProtocol.browse(bytes(soap(item, 1, 1)), control: base)
  check(parsed.items[0].originals.count == 1, "thumbnail never selected as original")
  let original = try WifiProtocol.uniqueNew([:], order(parsed))
  check(original?.size == 512 && original?.filename == "new.JPG", "original size and filename preserved")
  check(try WifiProtocol.uniqueNew(dict(parsed), order(parsed)) == nil, "old JPEG not substituted")
  var raw = try WifiProtocol.browse(bytes(soap(media("new", "card-a", "CAM_RAW_JPG", "\(base.absoluteString)/raw-pair.JPG", 1), 1, 1)), control: base)
  check(raw.items[0].originals.count == 1, "RAW+JPEG octet-stream original accepted")
  raw = try WifiProtocol.browse(bytes(soap(media("raw", "card-a", "CAM_RAW", "\(base.absoluteString)/raw.JPG", 1), 1, 1)), control: base)
  check(raw.items[0].originals.isEmpty, "RAW resource rejected")
  let duplicate = try WifiProtocol.browse(bytes(soap(item + media("new", "card-b", "CAM_ORG", "\(base.absoluteString)/second.JPG", 512), 2, 2)), control: base)
  reject("two cards with the same filename refuse ambiguity") { _ = try WifiProtocol.uniqueNew([:], order(duplicate)) }
  reject("truncated/miscounted page refused") { _ = try WifiProtocol.browse(bytes(soap(item, 0, 1)), control: base) }
  reject("SOAP fault refused") { _ = try WifiProtocol.browse(bytes("<Envelope><Fault/></Envelope>"), control: base) }

  let jpeg = try Data(contentsOf: fixtures.appendingPathComponent("preview.jpg"))
  let size = try WifiProtocol.jpeg(jpeg, limit: 65535)
  check(size.width == 64 && size.height == 48, "SOF dimensions verified")
  check(WifiProtocol.datagram(Data(count: 8) + jpeg) == jpeg, "bounded datagram header accepted")
  check(WifiProtocol.datagram(jpeg.prefix(jpeg.count - 2)) == nil, "partial JPEG dropped")
  check(WifiProtocol.datagram(jpeg + Data(count: 2)) == jpeg, "datagram trailer trimmed at EOI")
  var header = [UInt8](repeating: 0, count: 254 + jpeg.count + 5)
  header[0] = UInt8((header.count >> 8) & 255); header[1] = UInt8(header.count & 255)
  header[9] = 0xff; header[10] = 0xd8; header[11] = 0xff; header[16] = 0x21; header[31] = 0xde
  header.replaceSubrange(254..<(254 + jpeg.count), with: jpeg)
  check(WifiProtocol.datagram(Data(header)) == jpeg, "S5 header offset wins over FF D8 inside the camera MAC")
  let padded = jpeg + Data(count: (jpeg.count / 512 + 1) * 512 - jpeg.count)
  let paddedSize = try WifiProtocol.jpeg(padded, limit: 65535)
  check(paddedSize.width == 64 && paddedSize.length == jpeg.count, "512-byte padded original validates through EOI")
  let events = try WifiProtocol.events(bytes("<e:propertyset xmlns:e='urn:schemas-upnp-org:event-1-0'><e:property><X_Panasonic_Cam_Sync>mod_Play</X_Panasonic_Cam_Sync></e:property></e:propertyset>"))
  check(events["X_Panasonic_Cam_Sync"] == ["mod_Play"], "GENA propertyset value parsed")
  let folder = FileManager.default.temporaryDirectory.appendingPathComponent("wifi-id-\(UUID().uuidString)")
  let idFile = folder.appendingPathComponent("wifi-client-id")
  let first = try WifiProtocol.clientId(idFile)
  let second = try WifiProtocol.clientId(idFile)
  check(first.range(of: "^4D454930-0100-1000-8001-[0-9A-F]{12}$", options: .regularExpression) != nil && first == second, "accctrl identity uses LUMIX Sync format and persists")
  try? FileManager.default.removeItem(at: folder)
  reject("JPEG size bound enforced") { _ = try WifiProtocol.jpeg(jpeg, limit: 16) }
  var missingSof = [UInt8](jpeg)
  for i in 0..<(missingSof.count - 1) where missingSof[i] == 0xff && missingSof[i + 1] == 0xc0 { missingSof[i + 1] = 0xe2; break }
  reject("missing SOF rejected") { _ = try WifiProtocol.jpeg(Data(missingSof), limit: 65535) }
  check(WifiProtocol.requestTarget(URL(string: "http://127.0.0.1:18080/cam.cgi?mode=accctrl&value=Moment+S5")!) == "/cam.cgi?mode=accctrl&value=Moment+S5", "request line keeps the encoded query")
} catch {
  failures += 1; print("FAIL unexpected error: \(error)")
}

print(failures == 0 ? "All Wi-Fi protocol checks passed" : "\(failures) Wi-Fi protocol checks failed")
exit(failures == 0 ? 0 : 1)
