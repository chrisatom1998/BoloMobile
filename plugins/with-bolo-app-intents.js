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

function applyBoloAppIntents(contents) {
  if (typeof contents !== 'string') {
    throw new Error('Bolo App Intents expected a Swift AppDelegate source string.');
  }

  const importCount = contents.split('import AppIntents').length - 1;
  const intentCount = contents.split('struct PracticeHindiIntent: AppIntent').length - 1;
  const shortcutsCount = contents.split('struct BoloAppShortcuts: AppShortcutsProvider').length - 1;
  if (
    importCount > 1
    || intentCount > 1
    || shortcutsCount > 1
    || intentCount !== shortcutsCount
  ) {
    throw new Error('Bolo App Intents found partial or duplicate generated Swift declarations.');
  }

  const needsImport = importCount === 0;
  const needsIntent = intentCount === 0;
  const importAnchor = 'internal import Expo\n';
  const delegateAnchor = '\nclass ReactNativeDelegate:';

  if ((needsImport && !contents.includes(importAnchor)) || (needsIntent && !contents.includes(delegateAnchor))) {
    throw new Error('Bolo App Intents could not find the Expo AppDelegate anchors.');
  }

  let nextContents = contents;
  if (needsImport) {
    nextContents = nextContents.replace(importAnchor, `${importAnchor}import AppIntents\n`);
  }
  if (needsIntent) {
    nextContents = nextContents.replace(delegateAnchor, `${appIntentSource}${delegateAnchor}`);
  }
  return nextContents;
}

function withBoloAppIntents(config) {
  return withAppDelegate(config, (result) => {
    if (result.modResults.language !== 'swift') return result;
    result.modResults.contents = applyBoloAppIntents(result.modResults.contents);
    return result;
  });
}

module.exports = withBoloAppIntents;
module.exports.applyBoloAppIntents = applyBoloAppIntents;
