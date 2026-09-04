import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the server-rendered shell remains branded and intentional", async () => {
  const [layout, page] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /Amazing Operations Dashboard/);
  assert.match(page, /Loading operations/);
  assert.match(page, /Amazing Operations/);
  assert.doesNotMatch(`${layout}${page}`, /codex-preview|Building your site|react-loading-skeleton/);
});
