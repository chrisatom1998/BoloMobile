/* eslint-disable @typescript-eslint/no-require-imports */
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const root = resolve(process.cwd());
const patchScript = join(root, 'scripts/patch-query-string-decoder.mjs');
const patchScriptUrl = pathToFileURL(patchScript).href;
const appRequire = createRequire(join(root, 'package.json'));
const routerRequire = createRequire(appRequire.resolve('expo-router/package.json'));
const queryStringPath = routerRequire.resolve('query-string');
const queryStringUrl = pathToFileURL(queryStringPath).href;

function runNode(program: string, timeout = 5000) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: root,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
  });
}

function evaluate(program: string) {
  const result = runNode(`
    import * as queryString from ${JSON.stringify(queryStringUrl)};
    ${program}
  `);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

describe('Expo Router query-string decoder compatibility', () => {
  test('loads the actual ESM decoder through the Jest Expo transform', () => {
    const queryString = require(queryStringPath);
    expect(queryString.parse('greeting=' + encodeURIComponent('नमस्ते'))).toEqual({ greeting: 'नमस्ते' });
  });

  test('preserves the default and named synchronous parse/stringify APIs', () => {
    expect(evaluate(`
      const parsed = queryString.parse('lesson=hello');
      process.stdout.write(JSON.stringify({
        namedParse: typeof queryString.parse,
        namedStringify: typeof queryString.stringify,
        defaultParse: typeof queryString.default.parse,
        defaultStringify: typeof queryString.default.stringify,
        parsed,
        defaultParsed: queryString.default.parse('lesson=hello'),
        serialized: queryString.default.stringify(parsed),
      }));
    `)).toEqual({
      namedParse: 'function',
      namedStringify: 'function',
      defaultParse: 'function',
      defaultStringify: 'function',
      parsed: { lesson: 'hello' },
      defaultParsed: { lesson: 'hello' },
      serialized: 'lesson=hello',
    });
  });

  test('round-trips Hindi and Unicode route values with Router stringify options', () => {
    expect(evaluate(`
      const params = { greeting: 'नमस्ते दुनिया', symbol: '☀️', accent: 'café' };
      const encoded = queryString.stringify(params, { sort: false });
      process.stdout.write(JSON.stringify({ encoded, parsed: queryString.parse(encoded) }));
    `)).toEqual({
      encoded: 'greeting=%E0%A4%A8%E0%A4%AE%E0%A4%B8%E0%A5%8D%E0%A4%A4%E0%A5%87%20%E0%A4%A6%E0%A5%81%E0%A4%A8%E0%A4%BF%E0%A4%AF%E0%A4%BE&symbol=%E2%98%80%EF%B8%8F&accent=caf%C3%A9',
      parsed: { greeting: 'नमस्ते दुनिया', symbol: '☀️', accent: 'café' },
    });
  });

  test('keeps malformed escapes literal while decoding valid runs', () => {
    expect(evaluate(`
      const mixed = encodeURIComponent('नमस्ते') + '%zz';
      process.stdout.write(JSON.stringify(queryString.parse(
        'bad=%E0%A4%A&trailing=%&unknown=%zz&mixed=' + mixed
      )));
    `)).toEqual({ bad: '%E0%A4%A', trailing: '%', unknown: '%zz', mixed: 'नमस्ते%zz' });
  });

  test('preserves repeated parameters, empty values, flags, and plus signs', () => {
    expect(evaluate(`
      const parsed = queryString.parse('lesson=%E0%A5%A7&lesson=%E0%A5%A8&flag&blank=&plus=hello+world&literal=%2B');
      process.stdout.write(JSON.stringify({ parsed, roundTrip: queryString.parse(queryString.stringify(parsed)) }));
    `)).toEqual({
      parsed: { lesson: ['१', '२'], flag: null, blank: '', plus: 'hello world', literal: '+' },
      roundTrip: { lesson: ['१', '२'], flag: null, blank: '', plus: 'hello world', literal: '+' },
    });
  });

  test('also supports a callable CommonJS decoder export', () => {
    expect(evaluate(`
      import { readFileSync } from 'node:fs';
      import { createRequire } from 'node:module';
      import { runInNewContext } from 'node:vm';
      const queryRequire = createRequire(${JSON.stringify(queryStringUrl)});
      const decoder = queryRequire('decode-uri-component').default;
      const exports = {};
      runInNewContext(readFileSync(${JSON.stringify(queryStringPath)}, 'utf8'), {
        exports,
        require: name => name === 'decode-uri-component' ? decoder : queryRequire(name),
      });
      process.stdout.write(JSON.stringify(exports.parse('greeting=' + encodeURIComponent('नमस्ते'))));
    `)).toEqual({ greeting: 'नमस्ते' });
  });

  test('handles the advisory payload within a bounded child process', () => {
    // GHSA-qr28-fpjm-wq7f: many distinct encoded runs plus an invalid suffix
    // forced repeated full-input scans in decoder versions through 0.5.0.
    const result = runNode(`
      import queryString from ${JSON.stringify(queryStringUrl)};
      let payload = '';
      for (let index = 0; index < 32000; index++) {
        const high = Math.floor(index / 256).toString(16).padStart(2, '0');
        const low = (index % 256).toString(16).padStart(2, '0');
        payload += '%' + high + '%' + low + 'x';
      }
      payload += '%zz';
      const parsed = queryString.parse('value=' + payload);
      process.stdout.write(JSON.stringify({
        prefix: parsed.value.slice(0, 6),
        suffix: parsed.value.slice(-3),
        next: queryString.parse('ready=yes').ready,
      }));
    `);
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({ prefix: '\u0000\u0000x\u0000\u0001x', suffix: '%zz', next: 'yes' });
  });
});

describe('decoder install patch guardrails', () => {
  test('can run repeatedly after a clean install without changing the patched parser', () => {
    const before = readFileSync(queryStringPath, 'utf8');
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = runNode(`
        import { patchQueryStringDecoder } from ${JSON.stringify(patchScriptUrl)};
        process.stdout.write(patchQueryStringDecoder());
      `);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toBe('already patched');
    }
    expect(readFileSync(queryStringPath, 'utf8')).toBe(before);
  });

  test.each([
    ['7.1.4', '0.5.1', 'Expected query-string 7.1.3'],
    ['7.1.3', '0.5.0', 'Expected decode-uri-component 0.5.1'],
    ['7.1.3', '0.5.1', 'Unrecognized query-string 7.1.3 source'],
  ])('rejects unexpected installed packages (%s / %s) without writing', (queryVersion, decoderVersion, message) => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'bolo-query-string-patch-'));
    try {
      writeFileSync(join(fixtureRoot, 'package.json'), '{}');
      for (const [name, version] of [
        ['expo-router', '57.0.29'],
        ['query-string', queryVersion],
        ['decode-uri-component', decoderVersion],
      ]) {
        const directory = join(fixtureRoot, 'node_modules', name);
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
        writeFileSync(join(directory, 'index.js'), 'unexpected source\n');
      }
      const result = runNode(`
        import { patchQueryStringDecoder } from ${JSON.stringify(patchScriptUrl)};
        patchQueryStringDecoder({ appRoot: ${JSON.stringify(fixtureRoot)} });
      `);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(readFileSync(join(fixtureRoot, 'node_modules/query-string/index.js'), 'utf8')).toBe('unexpected source\n');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
