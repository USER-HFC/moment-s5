import AVFoundation
import Foundation

/// Optional foreground microphone ring on the preview's monotonic clock. Port of AudioRing.java:
/// 48 kHz mono 16-bit, about five seconds kept, and the same coverage rule for a usable slice.
final class AudioRing {
  static let rate = 48_000

  private struct Block { let us: Int64; let samples: [Int16] }
  private var ring: [Block] = []
  private let lock = NSLock()
  private let engine = AVAudioEngine()
  private var converter: AVAudioConverter?
  private var failure: String?
  private let target = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: Double(AudioRing.rate), channels: 1, interleaved: true)!

  func start() throws {
    let session = AVAudioSession.sharedInstance()
    do {
      // Mix with others: a moment's ambient sound must not stop the user's music.
      try session.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
      try session.setActive(true)
    } catch { throw LumixError("麦克风无法初始化：\(error.localizedDescription)") }
    if session.recordPermission == .denied { throw LumixError("没有麦克风权限，请在系统设置里允许") }
    let input = engine.inputNode
    let format = input.outputFormat(forBus: 0)
    if format.sampleRate <= 0 || format.channelCount == 0 { throw LumixError("麦克风采样率不受支持") }
    guard let converter = AVAudioConverter(from: format, to: target) else { throw LumixError("麦克风采样率不受支持") }
    self.converter = converter
    input.installTap(onBus: 0, bufferSize: 2048, format: format) { [weak self] buffer, time in self?.receive(buffer, time) }
    do { try engine.start() } catch { input.removeTap(onBus: 0); throw LumixError("麦克风启动失败：\(error.localizedDescription)") }
  }

  private func receive(_ buffer: AVAudioPCMBuffer, _ time: AVAudioTime) {
    guard let converter else { return }
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * target.sampleRate / buffer.format.sampleRate) + 32
    guard let out = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return }
    var fed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if fed { status.pointee = .noDataNow; return nil }
      fed = true; status.pointee = .haveData; return buffer
    }
    if let error { lock.lock(); failure = "麦克风读取失败：\(error.localizedDescription)"; lock.unlock(); return }
    guard let data = out.int16ChannelData, out.frameLength > 0 else { return }
    let samples = Array(UnsafeBufferPointer(start: data[0], count: Int(out.frameLength)))
    // Host time shares mach_absolute_time with monotonicMicros(), so audio lines up with preview frames.
    let begin = time.isHostTimeValid ? Int64(AVAudioTime.seconds(forHostTime: time.hostTime) * 1_000_000)
                                      : monotonicMicros() - Int64(samples.count) * 1_000_000 / Int64(AudioRing.rate)
    lock.lock()
    ring.append(Block(us: begin, samples: samples))
    while ring.count > 300 || (ring.first.map { begin - $0.us > 5_000_000 } ?? false) { ring.removeFirst() }
    lock.unlock()
  }

  func slice(from: Int64, to: Int64) throws -> [Int16] {
    lock.lock(); defer { lock.unlock() }
    if let failure { throw LumixError(failure) }
    let duration = to - from
    if duration <= 0 || duration > 5_000_000 { throw LumixError("收音窗口长度异常") }
    let n = Int(duration * Int64(AudioRing.rate) / 1_000_000)
    var out = [Int16](repeating: 0, count: n)
    var covered = [Bool](repeating: false, count: n)
    for block in ring {
      let start = Int((block.us - from) * Int64(AudioRing.rate) / 1_000_000)
      let source = max(0, -start), dest = max(0, start)
      let count = min(block.samples.count - source, n - dest)
      if count > 0 { for i in 0..<count { out[dest + i] = block.samples[source + i]; covered[dest + i] = true } }
    }
    if Double(covered.lazy.filter { $0 }.count) < Double(n) * 0.85 { throw LumixError("环境声缓存不足，这次动态照片没有声音") }
    return out
  }

  func close() {
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    lock.lock(); ring.removeAll(); lock.unlock()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }
}
