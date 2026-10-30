import AVFoundation
import ExpoModulesCore

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
      return "\(session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: ""))/\(session.mode.rawValue.replacingOccurrences(of: "AVAudioSessionMode", with: "")) active in:\(input)"
    }

    // Leaves the category and options alone; only drops the voiceChat mode.
    AsyncFunction("restoreDefaultMode") { () in
      let session = AVAudioSession.sharedInstance()
      guard session.mode == .voiceChat else { return }
      try session.setCategory(session.category, mode: .default, options: session.categoryOptions)
    }
  }
}
