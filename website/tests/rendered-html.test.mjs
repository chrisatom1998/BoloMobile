import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render({ path = "/", headers = {}, assets } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html", ...headers } }),
    { ASSETS: assets ?? { fetch: async () => new Response("Not found", { status: 404 }) } },
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

test("renders despite a malformed forwarded-host header", async () => {
  const response = await render({
    headers: {
      "x-forwarded-host": "a.example.com, b.example.com",
      "x-forwarded-proto": "https, http",
    },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Bolo — Hindi for real moments<\/title>/i);
  assert.match(html, /property="og:url" content="https:\/\/a\.example\.com"/);
});

test("image endpoint falls back to the raw asset without an IMAGES binding", async () => {
  const served = [];
  const response = await render({
    path: "/_vinext/image?url=%2Fbolo-icon.png&w=640&q=75",
    assets: {
      fetch: async (request) => {
        served.push(new URL(request.url).pathname);
        return new Response("png-bytes", {
          status: 200,
          headers: { "content-type": "image/png" },
        });
      },
    },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(served, ["/bolo-icon.png"]);
});

test("image endpoint rejects non-relative sources without an IMAGES binding", async () => {
  const response = await render({
    path: "/_vinext/image?url=https%3A%2F%2Fevil.example%2Fx.png&w=640&q=75",
  });
  assert.equal(response.status, 400);
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
