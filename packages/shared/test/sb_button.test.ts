import test from "node:test";
import assert from "node:assert/strict";
import { sbButtonClass } from "../src/ui/sb_button";

test("sbButtonClass: defaults to secondary", () => {
  assert.match(sbButtonClass(), /\bsb-btn\b/);
  assert.doesNotMatch(sbButtonClass(), /\bsb-btn-primary\b/);
  assert.doesNotMatch(sbButtonClass(), /\bsb-btn-ghost\b/);
});

test("sbButtonClass: primary includes base + primary", () => {
  const cn = sbButtonClass({ variant: "primary" });
  assert.match(cn, /\bsb-btn\b/);
  assert.match(cn, /\bsb-btn-primary\b/);
});

test("sbButtonClass: ghost includes base + ghost", () => {
  const cn = sbButtonClass({ variant: "ghost" });
  assert.match(cn, /\bsb-btn\b/);
  assert.match(cn, /\bsb-btn-ghost\b/);
});

test("sbButtonClass: size mapping works", () => {
  assert.match(sbButtonClass({ size: "sm" }), /\bh-9\b/);
  assert.match(sbButtonClass({ size: "md" }), /\bh-11\b/);
  assert.match(sbButtonClass({ size: "lg" }), /\bh-12\b/);
  assert.match(sbButtonClass({ size: "icon" }), /\bw-10\b/);
});

test("sbButtonClass: appends className", () => {
  assert.match(sbButtonClass({ className: "extra-class" }), /\bextra-class\b/);
});
