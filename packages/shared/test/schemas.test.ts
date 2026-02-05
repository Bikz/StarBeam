import assert from "node:assert/strict";
import test from "node:test";

import {
  DeviceExchangeResponseSchema,
  RoleSchema,
  UserSchema,
  WorkspaceSchema,
} from "../src/index.ts";

test("UserSchema: parses a valid user", () => {
  const user = UserSchema.parse({
    id: "u_123",
    email: "person@example.com",
    name: "Person",
    image: "https://example.com/avatar.png",
  });

  assert.equal(user.id, "u_123");
  assert.equal(user.email, "person@example.com");
});

test("UserSchema: rejects invalid email", () => {
  const result = UserSchema.safeParse({
    id: "u_123",
    email: "not-an-email",
  });

  assert.equal(result.success, false);
});

test("WorkspaceSchema: parses an org workspace", () => {
  const ws = WorkspaceSchema.parse({
    id: "w_123",
    type: "ORG",
    name: "Acme",
    slug: "acme",
  });

  assert.equal(ws.type, "ORG");
});

test("DeviceExchangeResponseSchema: parses a valid exchange response", () => {
  const payload = DeviceExchangeResponseSchema.parse({
    accessToken: "access",
    refreshToken: "refresh",
    expiresIn: 3600,
    user: { id: "u_1", email: "u@example.com" },
    workspaces: [{ id: "w_1", type: "PERSONAL", name: "Personal", slug: "personal-u_1" }],
  });

  assert.equal(payload.user.email, "u@example.com");
  assert.equal(payload.workspaces[0]?.type, "PERSONAL");
});

test("RoleSchema: rejects unknown roles", () => {
  const result = RoleSchema.safeParse("OWNER");
  assert.equal(result.success, false);
});
