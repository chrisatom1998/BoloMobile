const { withAppDelegate } = require('expo/config-plugins');

const appIntentSource = `
@available(iOS 16.0, *)
struct PracticeHindiIntent: AppIntent {
  static let title: LocalizedStringResource = "Practice Hindi"
  static let description = IntentDescription("Open Bolo for a short practical Hindi session.")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult & ProvidesDialog {
    return .result(dialog: "Opening your next Bolo practice.")
  }
}

@available(iOS 16.0, *)
struct BoloAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: PracticeHindiIntent(),
      phrases: [
        "Practice Hindi with \\(.applicationName)",
        "Start a Hindi lesson in \\(.applicationName)",
        "Speak Hindi with \\(.applicationName)"
      ],
      shortTitle: "Practice Hindi",
      systemImageName: "text.bubble.fill"
    )
  }
}
`;

module.exports = function withBoloAppIntents(config) {
  return withAppDelegate(config, (result) => {
    if (result.modResults.language !== 'swift') return result;
    let contents = result.modResults.contents;
    if (!contents.includes('import AppIntents')) {
      contents = contents.replace('internal import Expo\n', 'internal import Expo\nimport AppIntents\n');
    }
    if (!contents.includes('struct PracticeHindiIntent: AppIntent')) {
      contents = contents.replace('\nclass ReactNativeDelegate:', `${appIntentSource}\nclass ReactNativeDelegate:`);
    }
    result.modResults.contents = contents;
    return result;
  });
};
