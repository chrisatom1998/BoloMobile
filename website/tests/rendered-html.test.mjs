import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the production Bolo landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /<title>Bolo — Hindi for real moments<\/title>/i);
  assert.match(html, /Practice practical Hindi through 30 real-life scenes/i);
  assert.match(html, /<strong>30<\/strong><span>Guided real-life scenes<\/span>/i);
  assert.match(html, /Plus 26 more moments/i);
  assert.match(html, /Asha voice coaching screen/i);
  assert.match(html, /Natural pronunciation coaching/i);
  assert.doesNotMatch(html, /live translat/i);
  assert.match(html, /og:image:width[^>]+content="1731"|content="1731"[^>]+og:image:width/i);
  assert.match(html, /og:image:height[^>]+content="909"|content="909"[^>]+og:image:height/i);
  assert.match(html, /href="https:[^"]+\?page=privacy"/i);
  assert.match(html, /href="https:[^"]+\?page=support"/i);
  assert.match(html, /href="https:[^"]+\?page=terms"/i);
  assert.doesNotMatch(html, /codex-preview|starter project|taking shape|loading skeleton/i);
});

test("keeps production copy and required public artwork checked in", async () => {
  const [page, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    access(new URL("../public/bolo-icon.png", import.meta.url)),
    access(new URL("../public/asha-voice.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);

  assert.doesNotMatch(`${page}\n${layout}`, /\b21\b|Plus 17 more/);
  assert.match(page, /No account\. No pressure\./);
  assert.match(page, /30 written scenes offline/);
  assert.doesNotMatch(`${page}\n${layout}`, /live translat/i);
  assert.match(layout, /summary_large_image/);
});
