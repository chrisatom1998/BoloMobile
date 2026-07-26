import AVFoundation
import ExpoModulesCore

private enum AudioNormalizationError: LocalizedError {
  case emptyAudio
  case invalidFileURL
  case unsupportedAudioFormat

  var errorDescription: String? {
    switch self {
    case .emptyAudio:
      return "The generated speech file did not contain audible samples."
    case .invalidFileURL:
      return "Audio normalization only accepts a local file URL."
    case .unsupportedAudioFormat:
      return "The generated speech decoder returned an unsupported audio format."
    }
  }
}

public final class BoloAudioNormalizerModule: Module {
  private static let targetPeak: Float = 0.95
  private static let maximumGain: Float = 3
  private static let framesPerBuffer: AVAudioFrameCount = 32_768

  public func definition() -> ModuleDefinition {
    Name("BoloAudioNormalizer")

    AsyncFunction("normalizeFile") { (sourceUri: String) -> String in
      let sourceURL = try Self.localFileURL(from: sourceUri)
      return try Self.normalize(sourceURL: sourceURL).absoluteString
    }
  }

  private static func localFileURL(from value: String) throws -> URL {
    guard let url = URL(string: value), url.isFileURL else {
      throw AudioNormalizationError.invalidFileURL
    }
    return url
  }

  private static func normalize(sourceURL: URL) throws -> URL {
    let input = try AVAudioFile(forReading: sourceURL)
    let format = input.processingFormat
    guard
      format.channelCount > 0,
      format.commonFormat == .pcmFormatFloat32,
      !format.isInterleaved,
      let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: framesPerBuffer)
    else {
      throw AudioNormalizationError.unsupportedAudioFormat
    }

    var peak: Float = 0
    while input.framePosition < input.length {
      buffer.frameLength = 0
      try input.read(into: buffer, frameCount: framesPerBuffer)
      guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { break }
      for channel in 0..<Int(format.channelCount) {
        let samples = channels[channel]
        for frame in 0..<Int(buffer.frameLength) {
          peak = max(peak, abs(samples[frame]))
        }
      }
    }
    guard peak.isFinite, peak > 0 else {
      throw AudioNormalizationError.emptyAudio
    }

    let gain = min(maximumGain, targetPeak / peak)
    let outputURL = sourceURL
      .deletingPathExtension()
      .appendingPathExtension("normalized.caf")
    try? FileManager.default.removeItem(at: outputURL)

    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: Int(format.channelCount),
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]

    do {
      let output = try AVAudioFile(
        forWriting: outputURL,
        settings: settings,
        commonFormat: .pcmFormatFloat32,
        interleaved: false
      )
      input.framePosition = 0
      while input.framePosition < input.length {
        buffer.frameLength = 0
        try input.read(into: buffer, frameCount: framesPerBuffer)
        guard buffer.frameLength > 0, let channels = buffer.floatChannelData else { break }
        for channel in 0..<Int(format.channelCount) {
          let samples = channels[channel]
          for frame in 0..<Int(buffer.frameLength) {
            samples[frame] = max(-1, min(1, samples[frame] * gain))
          }
        }
        try output.write(from: buffer)
      }
      return outputURL
    } catch {
      try? FileManager.default.removeItem(at: outputURL)
      throw error
    }
  }
}
