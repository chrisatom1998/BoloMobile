const { readFileSync } = require('fs');
const { join } = require('path');

describe('Asha native integration boundary', () => {
  it('keeps text chat and phrase picker while adding the lesson-aware native voice panel', () => {
    const source = readFileSync(join(__dirname, '../src/app/(tabs)/live.tsx'), 'utf8');
    expect(source).toContain('<LiveComposer');
    expect(source).toContain('<TranscriptPhrasePicker');
    expect(source).toContain('ashaContext={ashaSessionContext}');
    expect(source).toContain('learnerLevel: learnerProfile.level');
    expect(source).toContain('recentContext: buildAshaRecentContext(chatHistory)');
    expect(source).toContain("relevantVocabulary: (activeAshaLesson?.words ?? [])");
    expect(source).not.toContain('savedPhraseCount');
    expect(source).not.toContain('duePhraseCount');
    expect(source).not.toContain('phrases.slice(0, 12)');
    expect(source).not.toContain('messages: state.chatHistory.slice(-6)');
    expect(source).not.toContain('WebView');
  });

  it('keeps Asha behind the current consent gate', () => {
    const live = readFileSync(join(__dirname, '../src/app/(tabs)/live.tsx'), 'utf8');
    const voiceButton = readFileSync(join(__dirname, '../src/components/realtime-voice-button.tsx'), 'utf8');
    expect(live).toContain('<AiConsentGate actionLabel="Enable live practice"');
    expect(live).toContain('disabled={!aiConsent || !screenFocused || busy}');
    expect(voiceButton).toContain('disabled={props.disabled}');
  });

  it('keeps the last orb-first layout and progressively reveals new Asha tools', () => {
    const panel = readFileSync(join(__dirname, '../src/components/asha-live-panel.tsx'), 'utf8');
    expect(panel).toContain('testID="realtime-voice-orb"');
    expect(panel).toContain("optionsOpen ? 'Hide options' : 'Conversation options'");
    expect(panel).toContain("optionsOpen ? <View");
    expect(panel).toContain('label="Interrupt"');
    expect(panel).toContain('label="Save phrase"');
    expect(panel).toContain('label="Hear again"');
    expect(panel).toContain('label="Speak slower"');
    expect(panel).toContain('label="Explain"');
  });

  it('selects Asha only on native iOS and preserves the existing voice path elsewhere', () => {
    const source = readFileSync(join(__dirname, '../src/components/realtime-voice-button.tsx'), 'utf8');
    expect(source).toContain("Platform.OS === 'ios' && props.ashaContext");
    expect(source).toContain('<LegacyRealtimeVoiceButton {...props} />');
  });
});
