import AVFoundation
import ExpoModulesCore
import UIKit

/// expo-audio can pick the AVAudioSession category but cannot choose the voiceChat
/// mode or activate the session on demand. Live voice needs both, or iOS can hand
/// WebRTC a silent microphone.
public final class BoloAudioSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BoloAudioSession")

    // PlayAndRecord + voiceChat, speaker by default, Bluetooth headsets allowed, then active.
    AsyncFunction("activateVoiceChat") { () -> String in
      let session = AVAudioSession.sharedInstance()
      var options: AVAudioSession.CategoryOptions = [.defaultToSpeaker]
      #if compiler(>=6.2)
      options.insert(.allowBluetoothHFP)
      #else
      options.insert(.allowBluetooth)
      #endif
      // Rewriting an identical category under a running WebRTC audio unit can stall its
      // microphone, and this runs again after WebRTC starts, so only change what differs.
      let alreadySet = session.category == .playAndRecord
        && session.mode == .voiceChat
        && session.categoryOptions.isSuperset(of: options)
      if !alreadySet {
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: options)
      }
      try session.setActive(true)
      let input = session.currentRoute.inputs.first?.portName ?? "no input"
      return "\(session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: ""))/\(session.mode.rawValue.replacingOccurrences(of: "AVAudioSessionMode", with: "")) active in:\(input) \(BoloAudioSessionModule.captureFlags(session))"
    }

    // Leaves the category and options alone; only drops the voiceChat mode.
    AsyncFunction("restoreDefaultMode") { () in
      let session = AVAudioSession.sharedInstance()
      guard session.mode == .voiceChat else { return }
      try session.setCategory(session.category, mode: .default, options: session.categoryOptions)
    }
  }

  /// iOS hands an app silent mic buffers when it is not the active foreground app or when
  /// app-wide input mute is on, even while WebRTC keeps sending packets. Show both, plus the
  /// input channel count, on the debug line.
  private static func captureFlags(_ session: AVAudioSession) -> String {
    let readAppState = { () -> String in
      switch UIApplication.shared.applicationState {
      case .active: return "active"
      case .inactive: return "inactive"
      case .background: return "background"
      @unknown default: return "unknown"
      }
    }
    let appState = Thread.isMainThread ? readAppState() : DispatchQueue.main.sync(execute: readAppState)
    var inputMuted = "?"
    if #available(iOS 17.0, *) {
      inputMuted = AVAudioApplication.shared.isInputMuted ? "yes" : "no"
    }
    let channels = session.isInputAvailable ? "\(session.inputNumberOfChannels)ch" : "noinput"
    return "app:\(appState) inMute:\(inputMuted) \(channels)"
  }
}
