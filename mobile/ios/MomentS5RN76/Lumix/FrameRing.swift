import Foundation

/// Monotonic microseconds, the one clock for preview frames, audio and the shutter boundary.
/// Same role as CaptureEngine.now() on Android.
func monotonicMicros() -> Int64 { Int64(DispatchTime.now().uptimeNanoseconds / 1000) }

/// JPEG ring bounded by both time and bytes. Port of FrameRing.java; the readiness rules match.
final class FrameRing {
  static let preCaptureUs: Int64 = 3_000_000
  static let maxFrameAgeUs: Int64 = 500_000

  struct Frame { let us: Int64; let jpeg: Data }

  private var frames: [Frame] = []
  private let windowUs: Int64
  private let maxBytes: Int
  private var bytes = 0
  private let lock = NSLock()

  init(windowUs: Int64, maxBytes: Int) { self.windowUs = windowUs; self.maxBytes = maxBytes }

  func add(_ us: Int64, _ jpeg: Data) {
    lock.lock(); defer { lock.unlock() }
    if jpeg.count > maxBytes { return }
    if let last = frames.last, us <= last.us { return }
    frames.append(Frame(us: us, jpeg: jpeg)); bytes += jpeg.count
    var drop = 0
    while drop < frames.count && (bytes > maxBytes || us - frames[drop].us > windowUs) { bytes -= frames[drop].jpeg.count; drop += 1 }
    if drop > 0 { frames.removeFirst(drop) }
  }

  /// The exact window used by both the shutter button and the capture worker.
  func preCaptureWindow(_ nowUs: Int64) -> [Frame] {
    lock.lock(); defer { lock.unlock() }
    let from = nowUs - FrameRing.preCaptureUs
    var out: [Frame] = []; var anchor: Frame?; var recent = 0
    for frame in frames {
      if frame.us < from { anchor = frame; continue }
      if frame.us > nowUs { break }
      out.append(frame); recent += 1
    }
    // An optional boundary frame avoids readiness flicker between preview samples.
    if let anchor, from - anchor.us <= FrameRing.maxFrameAgeUs { out.insert(anchor, at: 0) }
    guard recent >= 2, let first = out.first, let last = out.last,
          first.us <= from + 50_000, nowUs - last.us < FrameRing.maxFrameAgeUs,
          FrameRing.maxGap(out) <= FrameRing.maxFrameAgeUs else { return [] }
    return out
  }

  var durationUs: Int64 {
    lock.lock(); defer { lock.unlock() }
    guard frames.count >= 2, let first = frames.first, let last = frames.last else { return 0 }
    return last.us - first.us
  }

  func clear() { lock.lock(); frames.removeAll(); bytes = 0; lock.unlock() }

  static func maxGap(_ frames: [Frame]) -> Int64 {
    var gap: Int64 = 0
    for i in frames.indices.dropFirst() { gap = max(gap, frames[i].us - frames[i - 1].us) }
    return gap
  }
}
