import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHostedShellNetworkPolicy,
  parseHostedShellNetworkProfile,
} from "../src/lib/openai/networkPolicy";

test("parseHostedShellNetworkProfile defaults to BROAD", () => {
  assert.equal(parseHostedShellNetworkProfile(undefined), "BROAD");
  assert.equal(parseHostedShellNetworkProfile("unknown"), "BROAD");
  assert.equal(parseHostedShellNetworkProfile("minimal"), "MINIMAL");
});

test("buildHostedShellNetworkPolicy rejects domains outside approved list", () => {
  assert.throws(() => {
    buildHostedShellNetworkPolicy({
      profile: "MINIMAL",
      requestedDomains: ["evil.example.com"],
    });
  }, /not in approved allowlist/);
});

test("buildHostedShellNetworkPolicy accepts approved subset", () => {
  const policy = buildHostedShellNetworkPolicy({
    profile: "BROAD",
    requestedDomains: ["pypi.org", "github.com"],
  });
  assert.deepEqual(policy, {
    type: "allowlist",
    allowed_domains: ["pypi.org", "github.com"],
  });
});
