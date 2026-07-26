# Bolo marketing website

The public landing page for Bolo, the Hindi-learning app in the repository
root. Built with Next.js on [vinext](https://github.com/cloudflare/vinext) and
served by a Cloudflare Worker (`worker/index.ts`).

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This project does not use `wrangler.jsonc`.

## Layout

- `app/page.tsx` — the single-page Bolo landing page
- `app/layout.tsx` — metadata (Open Graph, icons) derived per request
- `app/globals.css` — all page styling
- `worker/index.ts` — Cloudflare Worker entry; serves the app and guards the
  image-optimization endpoint when no Images binding is configured
- `public/` — icons, screenshots, and the Open Graph image
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings (all unset)
- `app/chatgpt-auth.ts` — unused ChatGPT sign-in helpers kept from the hosting
  template; nothing imports them today. If a page ever calls
  `requireChatGPTUser()`, the site must only be served behind the hosting
  platform's trusted proxy, because the `oai-authenticated-user-*` headers it
  reads are spoofable on any other surface.
- `examples/d1/` — optional D1 example surface, not wired into the build

## Content notes

The page states facts about the mobile app (currently 30 guided scenes). When
scenes are added or removed in `../src/data/scenes.ts`, update the counts in
`app/page.tsx` and the description in `app/layout.tsx`; `npm test` asserts the
footnote copy stays consistent.

The privacy/terms/support links point at the existing public pages that the
mobile app and store listings also use (see `../store.config.json`). Do not
deploy this site over that URL until equivalent pages exist here.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the site and verify the rendered landing page
- `npm run lint`: run eslint

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
