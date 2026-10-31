const fileSystem = jest.requireActual('fs') as {
  readFileSync(path: string, encoding: 'utf8'): string;
};

function read(path: string) {
  return fileSystem.readFileSync(path, 'utf8');
}

const lifecycleFacts = [
  /requests? microphone (?:access|permission)/iu,
  /opens? (?:a )?(?:peer |WebRTC )?media stream/iu,
  /microphone stays on continuously until you mute it/iu,
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

  it('discloses the on-device Asha session log, its retention, hidden recovery records, and queued reports', () => {
    const inAppPolicy = read('src/app/privacy.tsx');

    expect(inAppPolicy).toMatch(/Last session shows your latest conversation\. Up to two older conversations are kept briefly for crash recovery but hidden\. All saved conversations expire within 30 days\./u);
    expect(inAppPolicy).toMatch(/session log[\s\S]{0,600}transcript/iu);
    expect(inAppPolicy).toMatch(/session log[\s\S]{0,900}(?:no|never|without)[\s\S]{0,20}audio/iu);
    expect(inAppPolicy).toMatch(/session log[\s\S]{0,900}not uploaded/iu);
    expect(inAppPolicy).toMatch(/report[\s\S]{0,120}(?:could not|cannot) be sent[\s\S]{0,160}(?:kept|saved|queued) on (?:this|your) device[\s\S]{0,200}existing AI consent[\s\S]{0,40}7 days/iu);
    expect(inAppPolicy).toMatch(/withdraw AI consent[\s\S]{0,200}removes any reports still waiting[\s\S]{0,60}without sending them/iu);
    expect(inAppPolicy).toMatch(/Clear chat also removes the transcript lines[\s\S]{0,300}keeps reports still waiting to be sent/iu);
    expect(inAppPolicy).toMatch(/Delete Bolo data[\s\S]{0,400}session log[\s\S]{0,120}reports still waiting in the send queue/iu);
  });
});
