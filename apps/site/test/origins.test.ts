import test from "node:test";
import assert from "node:assert/strict";

import { siteOrigin } from "../src/lib/siteOrigin";
import { webOrigin } from "../src/lib/webOrigin";

test("siteOrigin returns a valid origin string", () => {
  const v = siteOrigin();
  assert.ok(v.startsWith("http://") || v.startsWith("https://"));
});

test("webOrigin returns a valid origin string", () => {
  const v = webOrigin();
  assert.ok(v.startsWith("http://") || v.startsWith("https://"));
});
