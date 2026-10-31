# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Model roles

Use Claude Code first for all coding work. Use Cursor (grok-4.7, fast off, medium effort) only as a backup when Claude Code can't do the task, and ask Chris before using any pricier model.

# Cloud Agent

Node.js must be the exact version in `.nvmrc`. The environment install places that build on `/usr/local/bin` and prefers it for login shells. That setup lives in the Cloud Agent environment config, not this repo. Confirm the pin with `npm run toolchain:check`; if it fails, run `export PATH="/usr/local/bin:$PATH"`.

`npm run verify` needs `BOLO_LIVE_API_URL=https://live.example.test`. That value is a static configuration fixture and does not contact a server. The marketing site is a separate package: `npm ci --prefix website`, then `npm run lint --prefix website` and `npm test --prefix website`.

On boot, the marketing site listens on port 3000 and the Expo app listens on port 8081 (`npx expo start --web --host lan`). GPT-Live speech still needs a native development build. This Linux environment has no iOS simulator.
