import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInsightReasonCode } from "../src/lib/insightInteractions";

test("normalizeInsightReasonCode uppercases and normalizes separators", () => {
  const normalized = normalizeInsightReasonCode("not relevant / weak timing");
  assert.equal(normalized, "NOT_RELEVANT_WEAK_TIMING");
});

test("normalizeInsightReasonCode returns null for empty input", () => {
  assert.equal(normalizeInsightReasonCode("   "), null);
  assert.equal(normalizeInsightReasonCode(null), null);
});
