import Foundation

protocol CaptureBaseline: AnyObject {}

struct CameraPreview { let jpeg: Data; let receivedUs: Int64 }
struct CameraOriginal { let key: String; let filename: String; let size: Int64 }
struct CameraCapabilities { let autofocus: Bool; let manualFocus: Bool; let exposure: Bool }

/// Camera I/O only. Capture timing, LUTs, encoding and storage stay in CaptureEngine. Port of CameraTransport.java.
protocol CameraTransport: AnyObject {
  var kind: String { get }
  /// Body name from the description. Nil until that read succeeds.
  var cameraModel: String? { get }
  func open() throws
  func preview() throws -> CameraPreview?
  var capabilities: CameraCapabilities { get }
  func autofocus() throws
  func focus(far: Bool) throws
  var exposure: String { get }
  var exposureUpdatedAtUs: Int64 { get }
  func prepareCaptureBaseline() throws -> CaptureBaseline
  var freshBaselineRequired: Bool { get }
  /// One invocation, no automatic retry, including a lost response.
  func shutter() throws
  func awaitNewJpeg(_ baseline: CaptureBaseline?, valid: () -> Bool) throws -> CameraOriginal
  func downloadOriginal(_ original: CameraOriginal, to destination: URL) throws
  func completeWithoutDownload()
  var closed: Bool { get }
  func abort()
  func close()

  /// Body-shutter photos announced by ObjectAdded events. USB only; Wi-Fi keeps the defaults below.
  var reportsNewPhotos: Bool { get }
  func clearCaptureEvents()
  func nextCameraPhoto(_ baseline: CaptureBaseline?, saved: Set<String>) throws -> CameraOriginal?
  /// Keeps a saved photo out of every later pairing.
  func noteSaved(_ photo: CameraOriginal)
  func withPhoto(_ baseline: CaptureBaseline?, _ photo: CameraOriginal) -> CaptureBaseline?
}

extension CameraTransport {
  var reportsNewPhotos: Bool { false }
  func clearCaptureEvents() {}
  func nextCameraPhoto(_ baseline: CaptureBaseline?, saved: Set<String>) throws -> CameraOriginal? { nil }
  func noteSaved(_ photo: CameraOriginal) {}
  func withPhoto(_ baseline: CaptureBaseline?, _ photo: CameraOriginal) -> CaptureBaseline? { baseline }
}
