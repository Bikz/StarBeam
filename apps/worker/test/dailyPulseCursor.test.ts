import assert from "node:assert/strict";
import test from "node:test";

import { __test__ } from "../src/tasks/enqueueDueDailyPulses";

test("cursor encode/decode round-trip", () => {
  const cur = { createdAt: new Date("2026-02-07T00:00:00.000Z").toISOString(), id: "m_123" };
  const encoded = __test__.encodeCursor(cur);
  assert.equal(typeof encoded, "string");
  assert.deepEqual(__test__.decodeCursor(encoded), cur);
});

test("decodeCursor rejects invalid inputs", () => {
  assert.equal(__test__.decodeCursor(null), null);
  assert.equal(__test__.decodeCursor(""), null);
  assert.equal(__test__.decodeCursor("not json"), null);
  assert.equal(__test__.decodeCursor(JSON.stringify({ id: "x" })), null);
  assert.equal(__test__.decodeCursor(JSON.stringify({ createdAt: "", id: "x" })), null);
});

test("membershipCursorWhere builds stable where clause", () => {
  const where = __test__.membershipCursorWhere({
    createdAt: "2026-02-07T00:00:00.000Z",
    id: "abc",
  });
  assert.ok("OR" in where);
});

test("eligibleNow soft window: eligible after startHour", () => {
  assert.equal(
    __test__.eligibleNow({ hour: 1, startHour: 2, endHour: 5, strictWindow: false }),
    false,
  );
  assert.equal(
    __test__.eligibleNow({ hour: 2, startHour: 2, endHour: 5, strictWindow: false }),
    true,
  );
  assert.equal(
    __test__.eligibleNow({ hour: 20, startHour: 2, endHour: 5, strictWindow: false }),
    true,
  );
});

test("eligibleNow strict window respects endHour", () => {
  assert.equal(
    __test__.eligibleNow({ hour: 1, startHour: 2, endHour: 5, strictWindow: true }),
    false,
  );
  assert.equal(
    __test__.eligibleNow({ hour: 4, startHour: 2, endHour: 5, strictWindow: true }),
    true,
  );
  assert.equal(
    __test__.eligibleNow({ hour: 6, startHour: 2, endHour: 5, strictWindow: true }),
    false,
  );
});
