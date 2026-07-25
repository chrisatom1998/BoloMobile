const appConfig = require('../app.config.js') as (input: { config: Record<string, unknown> }) => {
  plugins: unknown[];
};

function fixture() {
  return {
    plugins: [
      'expo-router',
      ['expo-audio', { microphonePermission: 'Allow Bolo to use your microphone.' }],
      './plugins/with-bolo-app-intents',
      ['expo-widgets', {
        bundleIdentifier: 'com.bolo.hindi.widgets',
        groupIdentifier: 'group.com.bolo.hindi',
        widgets: [{ name: 'BoloPracticeWidget' }],
      }],
    ],
  };
}

describe('Expo app configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.BOLO_APP_IDENTIFIER;
    delete process.env.EAS_BUILD_PROFILE;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('derives the default widget identifiers from the default app identifier', () => {
    const { plugins } = appConfig({ config: fixture() });

    expect(plugins.at(-1)).toEqual(['expo-widgets', {
      bundleIdentifier: 'com.bolo.hindi.widgets',
      groupIdentifier: 'group.com.bolo.hindi',
      widgets: [{ name: 'BoloPracticeWidget' }],
    }]);
  });

  it('rederives the widget identifiers when the publisher owns a different domain', () => {
    process.env.BOLO_APP_IDENTIFIER = 'com.acme.speak';

    const { plugins } = appConfig({ config: fixture() });

    expect(plugins.at(-1)).toEqual(['expo-widgets', {
      bundleIdentifier: 'com.acme.speak.widgets',
      groupIdentifier: 'group.com.acme.speak',
      widgets: [{ name: 'BoloPracticeWidget' }],
    }]);
  });

  it('leaves every other plugin entry untouched', () => {
    process.env.BOLO_APP_IDENTIFIER = 'com.acme.speak';

    const { plugins } = appConfig({ config: fixture() });

    expect(plugins.slice(0, 3)).toEqual(fixture().plugins.slice(0, 3));
  });
});
