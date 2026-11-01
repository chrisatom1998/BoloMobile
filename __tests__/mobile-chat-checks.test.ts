/** @jest-environment node */
const { spawnSync } = require('child_process') as {
  spawnSync: (command: string, args: string[], options: { cwd: string; encoding: 'utf8' }) => { status: number | null; stderr: string; stdout: string };
};
const { readFileSync } = require('fs') as { readFileSync: (path: string, encoding: 'utf8') => string };

/** The helper is native ESM, so it is exercised in a child Node process like the other script checks. */
function runChecks(script: string) {
  const invocation = [
    "import * as checks from './scripts/lib/mobile-chat-checks.mjs';",
    'const results = {};',
    'const attempt = (name, run) => { try { results[name] = { ok: true, value: run() }; } catch (error) { results[name] = { ok: false, message: error.message }; } };',
    script,
    'console.log(JSON.stringify(results));',
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', invocation], { cwd: process.cwd(), encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout.trim()) as Record<string, { ok: boolean; message?: string; value?: unknown }>;
}

const valid = {
  version: 1,
  intro: 'Ask politely:',
  phrases: [{ devanagari: 'चाय में चीनी कम डालिए।', romanized: 'chaay mein cheeni kam daaliye.', english: 'Please put less sugar in the tea.' }],
  corrections: [{ youSaid: { devanagari: 'डालो', romanized: 'daalo' }, say: { devanagari: 'डालिए', romanized: 'daaliye', english: 'please put' }, note: 'daalo is for friends.' }],
};

describe('mobile-chat acceptance checks', () => {
  it('accepts Devanagari or Romanized Hindi replies and keeps the English check sensible', () => {
    const results = runChecks(`
      attempt('hindiDevanagari', () => checks.assertHindiReplyScript('आप आज कैसे हैं?', 'hi'));
      attempt('hindiRomanized', () => checks.assertHindiReplyScript('Aap aaj kaise hain?', 'hi'));
      attempt('hindiEmpty', () => checks.assertHindiReplyScript('123 ?!', 'hi'));
      attempt('englishPlain', () => checks.assertEnglishReplyScript('Say "I need water."', 'en'));
      attempt('englishWithPhrase', () => checks.assertEnglishReplyScript('You can say मुझे पानी चाहिए (mujhe paani chahiye) to ask for water politely.', 'en'));
      attempt('englishMostlyHindi', () => checks.assertEnglishReplyScript('मुझे पानी चाहिए। कृपया पानी दीजिए। ok', 'en'));
      attempt('englishNone', () => checks.assertEnglishReplyScript('मुझे पानी चाहिए।', 'en'));
    `);
    expect(results.hindiDevanagari).toEqual({ ok: true, value: 'Devanagari' });
    expect(results.hindiRomanized).toEqual({ ok: true, value: 'Romanized' });
    expect(results.hindiEmpty?.ok).toBe(false);
    expect(results.englishPlain).toEqual({ ok: true, value: 'Romanized' });
    expect(results.englishWithPhrase).toEqual({ ok: true, value: 'mixed' });
    expect(results.englishMostlyHindi?.ok).toBe(false);
    expect(results.englishNone?.message).toContain('no Latin text');
  });

  it('validates the structured block shape', () => {
    const results = runChecks(`
      const valid = ${JSON.stringify(valid)};
      attempt('valid', () => checks.assertStructuredReplyShape(valid, 'x'));
      attempt('version', () => checks.assertStructuredReplyShape({ ...valid, version: 2 }, 'x'));
      attempt('romanizedDevanagari', () => checks.assertStructuredReplyShape({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay चाय', english: 'tea' }] }, 'x'));
      attempt('devanagariLatin', () => checks.assertStructuredReplyShape({ version: 1, phrases: [{ devanagari: 'chaay', romanized: 'chaay', english: 'tea' }] }, 'x'));
      attempt('englishEmpty', () => checks.assertStructuredReplyShape({ version: 1, phrases: [{ devanagari: 'चाय', romanized: 'chaay', english: ' ' }] }, 'x'));
      attempt('introDevanagari', () => checks.assertStructuredReplyShape({ version: 1, intro: 'नमस्ते', phrases: valid.phrases }, 'x'));
      attempt('empty', () => checks.assertStructuredReplyShape({ version: 1 }, 'x'));
      attempt('youSaidMissing', () => checks.assertStructuredReplyShape({ version: 1, corrections: [{ youSaid: {}, say: valid.corrections[0].say }] }, 'x'));
      attempt('tooMany', () => checks.assertStructuredReplyShape({ version: 1, phrases: Array.from({ length: 9 }, () => valid.phrases[0]) }, 'x'));
    `);
    expect(results.valid).toEqual({ ok: true, value: { corrections: 1, phrases: 1 } });
    expect(results.version?.message).toContain('version must be 1');
    expect(results.romanizedDevanagari?.message).toContain('romanized must be Latin letters without Devanagari');
    expect(results.devanagariLatin?.message).toContain('devanagari must be Devanagari script');
    expect(results.englishEmpty?.message).toContain('english must be non-empty');
    expect(results.introDevanagari?.message).toContain('intro must be English prose');
    expect(results.empty?.ok).toBe(false);
    expect(results.youSaidMissing?.message).toContain('youSaid needs Devanagari or a romanization');
    expect(results.tooMany?.message).toContain('at most 8');
  });

  it('keeps the acceptance runner parseable and sending the structured request field', () => {
    const check = spawnSync(process.execPath, ['--check', 'scripts/validate-live-services.mjs'], { cwd: process.cwd(), encoding: 'utf8' });
    expect(check.status).toBe(0);
    const source = readFileSync('scripts/validate-live-services.mjs', 'utf8');
    expect(source.match(/replyFormat: STRUCTURED_REPLY_FORMAT/gu)).toHaveLength(2);
    expect(source).toContain('assertHindiReplyScript(reply');
    expect(source).toContain('checkOptionalStructured(result.payload');
  });
});
