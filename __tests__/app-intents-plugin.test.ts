jest.mock('expo/config-plugins', () => ({
  withAppDelegate: jest.fn(),
}));

const { applyBoloAppIntents } = require('../plugins/with-bolo-app-intents.js') as {
  applyBoloAppIntents: (contents: string) => string;
};

const expo57AppDelegate = `import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()
    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}

internal import Expo

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
}
`;

describe('Bolo App Intents config plugin', () => {
  it('applies every Swift modification exactly once and remains idempotent', () => {
    const first = applyBoloAppIntents(expo57AppDelegate);
    const second = applyBoloAppIntents(first);

    expect(second).toBe(first);
    expect(first.match(/import AppIntents/gu)).toHaveLength(1);
    expect(first.match(/struct PracticeHindiIntent: AppIntent/gu)).toHaveLength(1);
    expect(first.match(/struct BoloAppShortcuts: AppShortcutsProvider/gu)).toHaveLength(1);
  });

  it('fails closed when only part of the generated Swift source is present', () => {
    const partial = expo57AppDelegate.replace(
      '\nclass ReactNativeDelegate:',
      '\nstruct PracticeHindiIntent: AppIntent {}\n\nclass ReactNativeDelegate:',
    );

    expect(() => applyBoloAppIntents(partial)).toThrow(/partial or duplicate generated Swift declarations/u);
  });

  it('fails prebuild when the Expo Swift template no longer exposes the required anchors', () => {
    expect(() => applyBoloAppIntents('import Expo\nclass AppDelegate {}\n')).toThrow(
      /could not find the Expo AppDelegate anchors/u,
    );
  });
});
