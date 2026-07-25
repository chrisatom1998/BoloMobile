const fileSystem = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

function read(path: string) {
  return fileSystem.readFileSync(path, 'utf8');
}

const lifecycleFacts = [
  /requests? microphone (?:access|permission)/iu,
  /opens? (?:a )?(?:peer |WebRTC )?media stream/iu,
  /disabled (?:track )?between turns|disabled between turns/iu,
  /(?:stream(?: and its tracks)? (?:is|are) released|stream release)[\s\S]{0,160}End[\s\S]{0,100}leav/iu,
  /(?:stream(?: and its tracks)? (?:is|are) released|stream release)[\s\S]{0,240}(?:foreground|background)/iu,
  /does not create a recording file/iu,
  /does not[\s\S]{0,100}(?:capture|record)[\s\S]{0,80}(?:in the )?background/iu,
];

describe('live voice privacy copy', () => {
  it('states the complete microphone lifecycle in every checked-in disclosure', () => {
    const listings = JSON.parse(read('store/listings.json')) as {
      apple: { description: string; reviewNotes: string };
      googlePlay: { fullDescription: string };
    };
    const metadata = JSON.parse(read('store.config.json')) as {
      apple: { info: { 'en-US': { description: string } }; review: { notes: string } };
    };
    const disclosures = {
      consent: read('src/components/ai-consent-gate.tsx'),
      inAppPolicy: read('src/app/privacy.tsx'),
      readme: read('README.md'),
      storeChecklist: read('store/console-checklist.md'),
      storeDeclarations: read('store/privacy-declarations.md'),
      storeListings: `${listings.apple.description}\n${listings.apple.reviewNotes}\n${listings.googlePlay.fullDescription}`,
      storeMetadata: `${metadata.apple.info['en-US'].description}\n${metadata.apple.review.notes}`,
    };

    for (const [name, disclosure] of Object.entries(disclosures)) {
      for (const fact of lifecycleFacts) {
        expect({ name, disclosure }).toEqual(expect.objectContaining({ disclosure: expect.stringMatching(fact) }));
      }
    }
  });

  it('declares the contact data collected by the linked support form', () => {
    const declarations = read('store/privacy-declarations.md');

    expect(declarations).toMatch(/Contact Info → Name/iu);
    expect(declarations).toMatch(/Contact Info → Email Address/iu);
    expect(declarations).toMatch(/support form does collect the optional name and email address/iu);
  });

  it('discloses bounded local chat retention and deletion', () => {
    const consent = read('src/components/ai-consent-gate.tsx');
    const inAppPolicy = read('src/app/privacy.tsx');
    const settings = read('src/app/settings.tsx');
    const declarations = read('store/privacy-declarations.md');
    const releaseValidation = read('scripts/validate-release-live.mjs');

    expect(consent).toMatch(/up to 100 recent Asha chat messages[\s\S]{0,80}unencrypted[\s\S]{0,80}this device/iu);
    expect(inAppPolicy).toMatch(/up to 100 recent typed and transcribed Asha chat messages/iu);
    expect(inAppPolicy).toMatch(/Clear chat[\s\S]{0,120}removes only the saved typed and voice chat[\s\S]{0,100}does not delete reports/iu);
    expect(settings).toMatch(/permanently deletes[\s\S]{0,100}recent Asha chat history/iu);
    expect(declarations).toMatch(/Clear chat removes only saved typed and voice chat[\s\S]{0,80}does not delete submitted reports/iu);
    expect(declarations).toMatch(/clearing local data, including chat history/iu);
    expect(releaseValidation).toMatch(/up to 100 recent typed and transcribed Asha chat messages/iu);
    expect(releaseValidation).toMatch(/unencrypted storage on this device/iu);
    expect(releaseValidation).toMatch(/Clear chat[\s\S]{0,80}does not delete reports/iu);
  });
});
