const appConfig = require('../app.config.js') as (input: { config: Record<string, unknown> }) => {
  plugins: unknown[];
  extra: Record<string, unknown>;
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
    delete process.env.BOLO_PUBLIC_SITE_URL;
    delete process.env.BOLO_API_URL;
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

  it('publishes the deployed public pages and API base by default', () => {
    const { extra } = appConfig({ config: fixture() });

    expect(extra).toMatchObject({
      publicPrivacyUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/privacy',
      publicSupportUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/support',
      publicTermsUrl: 'https://74e39779183cf78fed.v2.appdeploy.ai/terms',
      boloApiUrl: 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed',
    });
  });

  it('rebuilds every public page URL from an overridden public site', () => {
    process.env.BOLO_PUBLIC_SITE_URL = 'https://pages.example.test/';
    process.env.BOLO_API_URL = 'https://api.example.test/app/bolo/';

    const { extra } = appConfig({ config: fixture() });

    expect(extra).toMatchObject({
      publicPrivacyUrl: 'https://pages.example.test/privacy',
      publicSupportUrl: 'https://pages.example.test/support',
      publicTermsUrl: 'https://pages.example.test/terms',
      boloApiUrl: 'https://api.example.test/app/bolo',
    });
  });

  it('refuses public and API URLs that are not HTTPS', () => {
    process.env.BOLO_PUBLIC_SITE_URL = 'http://pages.example.test';
    expect(() => appConfig({ config: fixture() })).toThrow(/BOLO_PUBLIC_SITE_URL must use https/u);

    delete process.env.BOLO_PUBLIC_SITE_URL;
    process.env.BOLO_API_URL = 'http://api.example.test';
    expect(() => appConfig({ config: fixture() })).toThrow(/BOLO_API_URL must use https/u);
  });

  it('refuses a public site URL that is not an absolute URL', () => {
    process.env.BOLO_PUBLIC_SITE_URL = 'pages.example.test';

    expect(() => appConfig({ config: fixture() })).toThrow(/BOLO_PUBLIC_SITE_URL must be an absolute https URL/u);
  });

  it('declares the app-owned iOS data collection without tracking', () => {
    const appJson = require('../app.json') as {
      expo: {
        ios: {
          privacyManifests: {
            NSPrivacyTracking: boolean;
            NSPrivacyCollectedDataTypes: {
              NSPrivacyCollectedDataType: string;
              NSPrivacyCollectedDataTypeLinked: boolean;
              NSPrivacyCollectedDataTypeTracking: boolean;
              NSPrivacyCollectedDataTypePurposes: string[];
            }[];
          };
        };
      };
    };
    const manifest = appJson.expo.ios.privacyManifests;
    const expectedTypes = [
      'NSPrivacyCollectedDataTypeOtherUserContent',
      'NSPrivacyCollectedDataTypeAudioData',
      'NSPrivacyCollectedDataTypeDeviceID',
      'NSPrivacyCollectedDataTypeProductInteraction',
    ];

    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyCollectedDataTypes).toHaveLength(expectedTypes.length);
    expect(new Set(manifest.NSPrivacyCollectedDataTypes.map((entry) => entry.NSPrivacyCollectedDataType)))
      .toEqual(new Set(expectedTypes));
    for (const entry of manifest.NSPrivacyCollectedDataTypes) {
      expect(entry).toMatchObject({
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      });
    }
  });
});
