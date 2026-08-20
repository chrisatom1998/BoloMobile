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
- `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/support/page.tsx` — the
  public policy pages the mobile app and both store listings link to
- `app/legal.tsx` — shared chrome for those pages plus `policyDocuments`, which
  holds each document's version and effective date
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

The privacy, terms, and support pages live here and are linked as `/privacy`,
`/terms`, and `/support`; the mobile app and both store listings point at the
same paths on this site's origin (see `../app.config.js` and
`../store.config.js`). Each document carries a version and an effective date in
`app/legal.tsx` — bump both when its wording changes in substance. The privacy
page also states the AI data-use consent notice version, and `npm test` fails if
it drifts from `AI_CONSENT_VERSION` in `../src/lib/storage.ts`.

The support page publishes the monitored support address from the
`BOLO_SUPPORT_EMAIL` environment variable, the same variable the release scripts
require. No address is checked in; without it the page routes people to the
support contact published with the store listings, so build and deploy with the
variable set.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the site and verify the rendered landing page
- `npm run lint`: run eslint

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
