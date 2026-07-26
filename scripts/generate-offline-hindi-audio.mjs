import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const sourceFiles = ['scenes.ts', 'additional-scenes.ts', 'lesson-plans.ts'];
const outputDirectory = join(root, 'assets/audio/hindi-core');
const generatedModule = join(root, 'src/data/offline-hindi-audio.ts');
const spokenPropertyNames = new Set(['hi', 'npc', 'reply', 'cueHi']);
const pronunciationProfile = JSON.parse(readFileSync(join(root, 'src/data/hindi-pronunciation-profile.json'), 'utf8'));
const pronunciationOverrides = new Map(Object.entries(pronunciationProfile.overrides));
const ashaVoiceProfile = JSON.parse(readFileSync(join(root, 'src/data/voice-profile.json'), 'utf8'));
const DEFAULT_API_URL = 'https://api-v2.appdeploy.ai/app/74e39779183cf78fed';
const apiUrl = (process.env.BOLO_API_URL || DEFAULT_API_URL).trim().replace(/\/$/u, '');
const ASHA_TTS = { model: ashaVoiceProfile.generatedSpeechModel, voice: ashaVoiceProfile.voice };
const generationFingerprint = `${ASHA_TTS.model}:${ASHA_TTS.voice}`;
const MAX_GENERATION_ATTEMPTS = 3;
const workerCount = Math.max(1, Math.min(3, Number.parseInt(process.env.BOLO_TTS_CONCURRENCY || '3', 10) || 3));

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  return '';
}

function collectPlayableText(fileName) {
  const source = readFileSync(join(root, 'src/data', fileName), 'utf8');
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const values = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (spokenPropertyNames.has(name) && ts.isStringLiteralLike(node.initializer)) {
        values.push(node.initializer.text.trim());
      } else if (name === 'words' && ts.isArrayLiteralExpression(node.initializer)) {
        for (const element of node.initializer.elements) {
          if (ts.isStringLiteralLike(element)) values.push(element.text.trim());
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return values.filter(Boolean);
}

async function generateAshaAudio(text) {
  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${apiUrl}/api/phrase-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: 'hi', locale: 'hi-IN' }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await response.json().catch(() => null);
      if (response.ok && payload?.mimeType === 'audio/mpeg' && typeof payload?.audioBase64 === 'string') {
        const audio = Buffer.from(payload.audioBase64, 'base64');
        if (audio.length) return audio;
      }
      if (attempt === MAX_GENERATION_ATTEMPTS || (response.status !== 429 && response.status < 500)) {
        throw new Error(`Could not generate Asha's bundled audio (${response.status}).`);
      }
    } catch (error) {
      if (attempt === MAX_GENERATION_ATTEMPTS) {
        throw error instanceof Error ? error : new Error("Asha's bundled audio generation failed.");
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw new Error("Asha's bundled audio generation could not be retried.");
}

const texts = [...new Set(sourceFiles.flatMap(collectPlayableText))].sort();

mkdirSync(outputDirectory, { recursive: true });
const assets = texts.map((text) => {
  const spokenText = pronunciationOverrides.get(text) ?? text;
  const hashInput = `${generationFingerprint}\0${spokenText === text ? text : `${text}\0${spokenText}`}`;
  const name = createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
  return {
    text,
    spokenText,
    fileName: `${name}.m4a`,
    target: join(outputDirectory, `${name}.m4a`),
    downloadedMp3: join(outputDirectory, `${name}.mp3`),
  };
});

let completed = assets.filter(({ target }) => existsSync(target)).length;
let nextAsset = 0;
async function generateNextAsset() {
  while (nextAsset < assets.length) {
    const asset = assets[nextAsset];
    nextAsset += 1;
    if (!existsSync(asset.target)) {
      const shouldDeleteDownloadedMp3 = !existsSync(asset.downloadedMp3);
      if (shouldDeleteDownloadedMp3) {
        writeFileSync(asset.downloadedMp3, await generateAshaAudio(asset.spokenText));
      }
      try {
        // Keep the bundled voice compact without changing Asha's provider voice.
        execFileSync('afconvert', [asset.downloadedMp3, asset.target, '-f', 'm4af', '-d', 'aac', '-b', '64000']);
      } finally {
        if (shouldDeleteDownloadedMp3) rmSync(asset.downloadedMp3, { force: true });
      }
      completed += 1;
      if (completed % 25 === 0 || completed === assets.length) {
        console.log(`Generated ${completed}/${assets.length} bundled Asha clips.`);
      }
    }
  }
}
await Promise.all(Array.from({ length: workerCount }, () => generateNextAsset()));

const generatedNames = new Set(assets.map(({ fileName }) => fileName));
const entries = assets.map(({ text, fileName }) => (
  `  ${JSON.stringify(text)}: require(${JSON.stringify(`../../assets/audio/hindi-core/${fileName}`)}),`
));

for (const fileName of readdirSync(outputDirectory)) {
  if ((fileName.endsWith('.m4a') || fileName.endsWith('.mp3')) && !generatedNames.has(fileName)) {
    rmSync(join(outputDirectory, fileName));
  }
}

writeFileSync(generatedModule, `// Generated by scripts/generate-offline-hindi-audio.mjs.\n// Fixed ${ASHA_TTS.voice} lesson audio is bundled so it never requires consent or a network request.\nexport const offlineHindiAudio: Record<string, number> = {\n${entries.join('\n')}\n};\n`);
console.log(`Generated ${entries.length} bundled Asha (${ASHA_TTS.voice}) audio clips.`);
