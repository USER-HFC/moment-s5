import AVFoundation
import CoreGraphics
import Foundation
import ImageIO
import Photos
import UniformTypeIdentifiers

/// Drives one AVAssetWriterInput from its own queue until `step` reports the stream is done.
/// Inputs of one writer must be fed concurrently: the writer interleaves, so draining video
/// first and audio second can wait forever for the other track.
private func pump(_ input: AVAssetWriterInput, _ group: DispatchGroup, label: String, step: @escaping () -> Bool) {
  group.enter()
  let queue = DispatchQueue(label: label)
  var finished = false
  input.requestMediaDataWhenReady(on: queue) {
    while input.isReadyForMoreMediaData && !finished {
      if !step() { finished = true; input.markAsFinished(); group.leave(); return }
    }
  }
}

private func finish(_ writer: AVAssetWriter, _ group: DispatchGroup, timeout: TimeInterval = 60) throws {
  if group.wait(timeout: .now() + timeout) == .timedOut { writer.cancelWriting(); throw LumixError("视频编码超时") }
  let done = DispatchSemaphore(value: 0)
  writer.finishWriting { done.signal() }
  done.wait()
  if writer.status != .completed { throw LumixError("视频编码失败：\(writer.error?.localizedDescription ?? "未知错误")") }
}

/// Offline H.264 from the pre-shutter JPEG ring, with the microphone slice when there is one. Port of VideoEncoder + AudioMux.
enum VideoEncoder {
  static let fps: Int64 = 15

  static func encode(_ frames: [FrameRing.Frame], from: Int64, to: Int64, audio: [Int16]?, output: URL) throws {
    if frames.count < 2 || to <= from { throw LumixError("动态帧不足") }
    guard let first = decode(frames[0].jpeg) else { throw LumixError("预览 JPEG 无法解码") }
    let scale = min(1, 960 / Double(max(first.width, first.height)))
    let width = max(2, Int(Double(first.width) * scale) & ~1), height = max(2, Int(Double(first.height) * scale) & ~1)
    try? FileManager.default.removeItem(at: output)
    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
      AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_000_000, AVVideoMaxKeyFrameIntervalKey: Int(fps)],
    ])
    video.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
    ])
    writer.add(video)
    var sound: AVAssetWriterInput?
    if audio != nil {
      let input = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: AudioRing.rate, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 96_000,
      ])
      input.expectsMediaDataInRealTime = false
      writer.add(input); sound = input
    }
    guard writer.startWriting() else { throw LumixError("视频编码失败：\(writer.error?.localizedDescription ?? "无法开始写入")") }
    writer.startSession(atSourceTime: .zero)

    let total = Int64((Double(to - from) * Double(fps) / 1_000_000).rounded(.up))
    var sent: Int64 = 0, source = -1
    var buffer: CVPixelBuffer?
    var failure: Error?
    let group = DispatchGroup()
    pump(video, group, label: "moment.encode.video") {
      if sent == total || failure != nil { return false }
      let pts = sent * 1_000_000 / fps
      var next = max(source, 0)
      while next + 1 < frames.count && frames[next + 1].us <= from + pts { next += 1 }
      if next != source || buffer == nil {
        guard let image = decode(frames[next].jpeg), let pool = adaptor.pixelBufferPool else { failure = LumixError("动态帧解码失败"); return false }
        var fresh: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &fresh)
        guard let fresh, draw(image, into: fresh) else { failure = LumixError("动态帧解码失败"); return false }
        buffer = fresh; source = next
      }
      if !adaptor.append(buffer!, withPresentationTime: CMTime(value: pts, timescale: 1_000_000)) { failure = writer.error; return false }
      sent += 1
      return true
    }
    if let sound, let samples = audio {
      var offset = 0
      pump(sound, group, label: "moment.encode.audio") {
        if offset >= samples.count || failure != nil { return false }
        let count = min(1024, samples.count - offset)
        guard let chunk = pcmBuffer(Array(samples[offset..<(offset + count)]), at: offset), sound.append(chunk) else { failure = writer.error; return false }
        offset += count
        return true
      }
    }
    do { try finish(writer, group) } catch { try? FileManager.default.removeItem(at: output); throw error }
    if let failure { try? FileManager.default.removeItem(at: output); throw LumixError("视频编码失败：\(failure.localizedDescription)") }
  }

  static func decode(_ jpeg: Data) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(jpeg as CFData, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
  }

  private static func draw(_ image: CGImage, into buffer: CVPixelBuffer) -> Bool {
    CVPixelBufferLockBaseAddress(buffer, []); defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let context = CGContext(data: CVPixelBufferGetBaseAddress(buffer), width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer),
                                  bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue) else { return false }
    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer)))
    return true
  }

  private static func pcmBuffer(_ samples: [Int16], at offset: Int) -> CMSampleBuffer? {
    var asbd = AudioStreamBasicDescription(mSampleRate: Float64(AudioRing.rate), mFormatID: kAudioFormatLinearPCM,
                                           mFormatFlags: kLinearPCMFormatFlagIsSignedInteger | kLinearPCMFormatFlagIsPacked,
                                           mBytesPerPacket: 2, mFramesPerPacket: 1, mBytesPerFrame: 2, mChannelsPerFrame: 1, mBitsPerChannel: 16, mReserved: 0)
    var format: CMAudioFormatDescription?
    guard CMAudioFormatDescriptionCreate(allocator: nil, asbd: &asbd, layoutSize: 0, layout: nil, magicCookieSize: 0, magicCookie: nil, extensions: nil, formatDescriptionOut: &format) == noErr,
          let format else { return nil }
    let bytes = samples.count * 2
    var block: CMBlockBuffer?
    guard CMBlockBufferCreateWithMemoryBlock(allocator: nil, memoryBlock: nil, blockLength: bytes, blockAllocator: nil, customBlockSource: nil,
                                             offsetToData: 0, dataLength: bytes, flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &block) == noErr,
          let block else { return nil }
    let copied = samples.withUnsafeBytes { CMBlockBufferReplaceDataBytes(with: $0.baseAddress!, blockBuffer: block, offsetIntoDestination: 0, dataLength: bytes) }
    guard copied == noErr else { return nil }
    var sample: CMSampleBuffer?
    let pts = CMTime(value: CMTimeValue(offset), timescale: CMTimeScale(AudioRing.rate))
    guard CMAudioSampleBufferCreateReadyWithPacketDescriptions(allocator: nil, dataBuffer: block, formatDescription: format, sampleCount: samples.count,
                                                               presentationTimeStamp: pts, packetDescriptions: nil, sampleBufferOut: &sample) == noErr else { return nil }
    return sample
  }
}

/// JPEG + XMP Container directory + original MP4, byte for byte the layout MotionPhoto.java writes.
/// Kept on iOS so a moment directory is the same on both platforms and shares as one file.
enum MotionPhoto {
  static func write(jpeg: URL, mp4: URL, output: URL, stillUs: Int64) throws {
    if stillUs < -1 { throw LumixError("动态照片的播放位置无效") }
    if jpeg.standardizedFileURL == output.standardizedFileURL || mp4.standardizedFileURL == output.standardizedFileURL { throw LumixError("不能覆盖原始素材") }
    let video = try Data(contentsOf: mp4)
    if video.count < 12 { throw LumixError("视频为空") }
    let still = try Data(contentsOf: jpeg)
    if still.count < 2 || still[0] != 0xFF || still[1] != 0xD8 { throw LumixError("静态照片不是 JPEG；请在 S5 设置 JPEG 或 RAW+JPEG") }
    let xmp = "http://ns.adobe.com/xap/1.0/\u{0}" +
      "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">" +
      "<rdf:Description xmlns:Camera=\"http://ns.google.com/photos/1.0/camera/\" xmlns:Container=\"http://ns.google.com/photos/1.0/container/\" xmlns:Item=\"http://ns.google.com/photos/1.0/container/item/\" Camera:MotionPhoto=\"1\" Camera:MotionPhotoVersion=\"1\" Camera:MotionPhotoPresentationTimestampUs=\"\(stillUs)\">" +
      "<Container:Directory><rdf:Seq><rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"image/jpeg\" Item:Semantic=\"Primary\" Item:Padding=\"0\"/></rdf:li>" +
      "<rdf:li rdf:parseType=\"Resource\"><Container:Item Item:Mime=\"video/mp4\" Item:Semantic=\"MotionPhoto\" Item:Length=\"\(video.count)\"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>"
    let packet = Data(xmp.utf8)
    var out = Data([0xFF, 0xD8, 0xFF, 0xE1, UInt8((packet.count + 2) >> 8), UInt8((packet.count + 2) & 255)])
    out.append(packet); out.append(still.dropFirst(2)); out.append(video)
    let part = output.appendingPathExtension("part")
    do { try out.write(to: part); if FileManager.default.fileExists(atPath: output.path) { try FileManager.default.removeItem(at: output) }; try FileManager.default.moveItem(at: part, to: output) }
    catch { try? FileManager.default.removeItem(at: part); throw error }
  }
}

/// Export to the Photos app. A still moment becomes a photo; a motion moment becomes a Live Photo
/// (the still and a QuickTime copy of motion.mp4, paired by one content identifier).
enum PhotoExport {
  static func save(_ dir: URL, completion: @escaping (Result<String, Error>) -> Void) {
    PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
      guard status == .authorized || status == .limited else {
        completion(.failure(LumixError("没有照片写入权限，请在系统设置里允许「添加照片」"))); return
      }
      do {
        let meta = try MomentStore.metadata(dir)
        let photo = meta["captureMode"] as? String == "photo"
        let rendered = dir.appendingPathComponent("rendered.jpg")
        let still = (meta["lutApplied"] as? Bool ?? false) && FileManager.default.fileExists(atPath: rendered.path) ? rendered : dir.appendingPathComponent("original.jpg")
        guard (try? still.checkResourceIsReachable()) == true else { throw LumixError("没有可导出的照片") }
        let video = dir.appendingPathComponent("motion.mp4")
        var pair: (URL, URL)?
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("live-\(UUID().uuidString)", isDirectory: true)
        if !photo {
          guard meta["complete"] as? Bool ?? false, FileManager.default.fileExists(atPath: video.path) else { throw LumixError("动态照片还在生成，稍后再导出") }
          try FileManager.default.createDirectory(at: scratch, withIntermediateDirectories: true)
          pair = try LivePhoto.make(still: still, video: video, stillUs: (meta["stillUs"] as? NSNumber)?.int64Value ?? 0, in: scratch)
        }
        var identifier: String?
        PHPhotoLibrary.shared().performChanges({
          let request = PHAssetCreationRequest.forAsset()
          let options = PHAssetResourceCreationOptions(); options.originalFilename = dir.lastPathComponent + ".jpg"
          if let (jpeg, mov) = pair {
            request.addResource(with: .photo, fileURL: jpeg, options: options)
            let movie = PHAssetResourceCreationOptions(); movie.originalFilename = dir.lastPathComponent + ".mov"
            request.addResource(with: .pairedVideo, fileURL: mov, options: movie)
          } else {
            request.addResource(with: .photo, fileURL: still, options: options)
          }
          identifier = request.placeholderForCreatedAsset?.localIdentifier
        }) { ok, error in
          try? FileManager.default.removeItem(at: scratch)
          guard ok, let identifier else { completion(.failure(LumixError("写入照片 App 失败：\(error?.localizedDescription ?? "未知错误")"))); return }
          do {
            var meta = try MomentStore.metadata(dir)
            meta["exportAssetId"] = identifier; meta["exportedAt"] = Int64(Date().timeIntervalSince1970 * 1000)
            try MomentStore.write(meta, to: dir)
          } catch {}
          completion(.success("ph://\(identifier)"))
        }
      } catch { completion(.failure(error)) }
    }
  }
}

enum LivePhoto {
  /// Writes still.jpg (Apple MakerNote content identifier) and motion.mov (same identifier plus a still-image-time marker).
  static func make(still: URL, video: URL, stillUs: Int64, in folder: URL) throws -> (URL, URL) {
    let id = UUID().uuidString
    let jpeg = folder.appendingPathComponent("still.jpg"), mov = folder.appendingPathComponent("motion.mov")
    guard let source = CGImageSourceCreateWithURL(still as CFURL, nil),
          let dest = CGImageDestinationCreateWithURL(jpeg as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw LumixError("实况照片静帧写入失败") }
    CGImageDestinationAddImageFromSource(dest, source, 0, [kCGImagePropertyMakerAppleDictionary: ["17": id]] as CFDictionary)
    if !CGImageDestinationFinalize(dest) { throw LumixError("实况照片静帧写入失败") }
    try remux(video, to: mov, identifier: id, stillUs: stillUs)
    return (jpeg, mov)
  }

  private static func remux(_ input: URL, to output: URL, identifier: String, stillUs: Int64) throws {
    let asset = AVURLAsset(url: input)
    let reader = try AVAssetReader(asset: asset)
    let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
    let content = AVMutableMetadataItem()
    content.keySpace = .quickTimeMetadata; content.key = "com.apple.quicktime.content.identifier" as NSString; content.value = identifier as NSString; content.dataType = "com.apple.metadata.datatype.UTF-8"
    writer.metadata = [content]
    var feeds: [(AVAssetReaderTrackOutput, AVAssetWriterInput)] = []
    for track in asset.tracks where track.mediaType == .video || track.mediaType == .audio {
      let out = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
      reader.add(out)
      let hint = track.formatDescriptions.first.map { $0 as! CMFormatDescription }
      let into = AVAssetWriterInput(mediaType: track.mediaType, outputSettings: nil, sourceFormatHint: hint)
      into.expectsMediaDataInRealTime = false
      if track.mediaType == .video { into.transform = track.preferredTransform }
      writer.add(into); feeds.append((out, into))
    }
    guard feeds.contains(where: { $0.1.mediaType == .video }) else { throw LumixError("动态视频没有画面") }
    // The marker Photos looks for to know which frame is the still.
    let spec: [String: Any] = [kCMMetadataFormatDescriptionMetadataSpecificationKey_Identifier as String: "mdta/com.apple.quicktime.still-image-time",
                               kCMMetadataFormatDescriptionMetadataSpecificationKey_DataType as String: kCMMetadataBaseDataType_SInt8 as String]
    var markerFormat: CMFormatDescription?
    CMMetadataFormatDescriptionCreateWithMetadataSpecifications(allocator: nil, metadataType: kCMMetadataFormatType_Boxed, metadataSpecifications: [spec] as CFArray, formatDescriptionOut: &markerFormat)
    let markerInput = AVAssetWriterInput(mediaType: .metadata, outputSettings: nil, sourceFormatHint: markerFormat)
    let marker = AVAssetWriterInputMetadataAdaptor(assetWriterInput: markerInput)
    writer.add(markerInput)

    guard reader.startReading(), writer.startWriting() else { throw LumixError("实况照片视频写入失败：\((writer.error ?? reader.error)?.localizedDescription ?? "未知错误")") }
    writer.startSession(atSourceTime: .zero)
    let item = AVMutableMetadataItem()
    item.key = "com.apple.quicktime.still-image-time" as NSString; item.keySpace = .quickTimeMetadata; item.value = 0 as NSNumber; item.dataType = kCMMetadataBaseDataType_SInt8 as String
    let at = CMTime(value: max(0, stillUs), timescale: 1_000_000)
    marker.append(AVTimedMetadataGroup(items: [item], timeRange: CMTimeRange(start: at, duration: CMTime(value: 1, timescale: 15))))
    markerInput.markAsFinished()

    let group = DispatchGroup()
    for (index, feed) in feeds.enumerated() {
      pump(feed.1, group, label: "moment.live.\(index)") {
        guard let sample = feed.0.copyNextSampleBuffer() else { return false }
        return feed.1.append(sample)
      }
    }
    do { try finish(writer, group) } catch { reader.cancelReading(); throw error }
    if reader.status == .failed { throw LumixError("实况照片视频读取失败：\(reader.error?.localizedDescription ?? "未知错误")") }
  }
}
