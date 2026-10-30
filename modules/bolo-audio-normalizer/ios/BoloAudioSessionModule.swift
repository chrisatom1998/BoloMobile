import AVFoundation
import ExpoModulesCore
import UIKit

/// expo-audio can pick the AVAudioSession category but cannot choose the voiceChat
/// mode or activate the session on demand. Live voice needs both, or iOS can hand
/// WebRTC a silent microphone.
public final class BoloAudioSessionModule: Module {
  /// Audio-session notifications seen since the last drain, oldest first, for the debug line.
  private var sessionEvents: [String] = []
  private let sessionEventsLock = NSLock()
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("BoloAudioSession")

    OnCreate {
      self.observeSessionNotifications()
    }

    OnDestroy {
      self.observers.forEach { NotificationCenter.default.removeObserver($0) }
      self.observers.removeAll()
    }

    // The session as it is right now, sampled beside the mic level, so the debug line
    // shows whether the category, mode, route or app state changed under the running call.
    AsyncFunction("readSessionState") { () -> String in
      BoloAudioSessionModule.describe(AVAudioSession.sharedInstance())
    }

    // Route changes (with reason), interruptions and media-server resets since the last call.
    AsyncFunction("drainSessionEvents") { () -> [String] in
      self.sessionEventsLock.lock()
      defer { self.sessionEventsLock.unlock() }
      let events = self.sessionEvents
      self.sessionEvents.removeAll()
      return events
    }

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
      return BoloAudioSessionModule.describe(session, activated: true)
    }

    // Leaves the category and options alone; only drops the voiceChat mode.
    AsyncFunction("restoreDefaultMode") { () in
      let session = AVAudioSession.sharedInstance()
      guard session.mode == .voiceChat else { return }
      try session.setCategory(session.category, mode: .default, options: session.categoryOptions)
    }
  }

  /// "PlayAndRecord/VoiceChat active in:iPhone Microphone app:active inMute:no 1ch".
  private static func describe(_ session: AVAudioSession, activated: Bool = false) -> String {
    let category = session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: "")
    let mode = session.mode.rawValue.replacingOccurrences(of: "AVAudioSessionMode", with: "")
    let input = session.currentRoute.inputs.first?.portName ?? "no input"
    return "\(category)/\(mode)\(activated ? " active" : "") in:\(input) \(captureFlags(session))"
  }

  private func record(_ event: String) {
    sessionEventsLock.lock()
    defer { sessionEventsLock.unlock() }
    // Keep the buffer bounded if JS stops draining it.
    if sessionEvents.count >= 32 { sessionEvents.removeFirst() }
    sessionEvents.append(event)
  }

  /// A category change, interruption or media-server reset under a running WebRTC call is the
  /// usual way an iPhone microphone goes silent while packets keep flowing. Record each one.
  private func observeSessionNotifications() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] notification in
      let raw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
      let reason: String
      switch AVAudioSession.RouteChangeReason(rawValue: raw) ?? .unknown {
      case .newDeviceAvailable: reason = "newDevice"
      case .oldDeviceUnavailable: reason = "deviceGone"
      case .categoryChange: reason = "categoryChange"
      case .override: reason = "override"
      case .wakeFromSleep: reason = "wake"
      case .noSuitableRouteForCategory: reason = "noRoute"
      case .routeConfigurationChange: reason = "configChange"
      default: reason = "unknown(\(raw))"
      }
      let session = AVAudioSession.sharedInstance()
      let input = session.currentRoute.inputs.first?.portName ?? "no input"
      let category = session.category.rawValue.replacingOccurrences(of: "AVAudioSessionCategory", with: "")
      let mode = session.mode.rawValue.replacingOccurrences(of: "AVAudioSessionMode", with: "")
      self?.record("route:\(reason) -> \(category)/\(mode) in:\(input)")
    })
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] notification in
      let raw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt ?? 0
      if AVAudioSession.InterruptionType(rawValue: raw) == .began {
        // "micMuted" is the hardware/system input mute; "suspended" is the app going to the background.
        var detail = ""
        if let rawReason = notification.userInfo?[AVAudioSessionInterruptionReasonKey] as? UInt,
          let reason = AVAudioSession.InterruptionReason(rawValue: rawReason) {
          switch reason {
          case .appWasSuspended: detail = "(suspended)"
          case .builtInMicMuted: detail = "(micMuted)"
          default: detail = "(reason \(rawReason))"
          }
        }
        self?.record("interrupt:began\(detail)")
      } else {
        let options = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let resume = AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)
        self?.record(resume ? "interrupt:ended(resume)" : "interrupt:ended")
      }
    })
    observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
      self?.record("mediaServicesReset")
    })
    observers.append(center.addObserver(forName: AVAudioSession.silenceSecondaryAudioHintNotification, object: nil, queue: nil) { [weak self] notification in
      let raw = notification.userInfo?[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt ?? 0
      self?.record(AVAudioSession.SilenceSecondaryAudioHintType(rawValue: raw) == .begin ? "otherAudio:began" : "otherAudio:ended")
    })
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
