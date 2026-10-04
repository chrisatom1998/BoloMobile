#!/usr/bin/env node

// Retired harness: its turn-based Realtime protocol cannot verify GPT-Live.
// The former implementation remains available in git history.
console.error(
  'Unsupported legacy Realtime harness: run-15-minute-voice-chat.mjs does not verify GPT-Live. '
  + 'Use a physical iPhone EAS build configured with BOLO_LIVE_API_URL and the GPT-Live Maestro flows; '
  + 'also verify real overlapping speech and audio playback on the device.',
);
process.exitCode = 1;
