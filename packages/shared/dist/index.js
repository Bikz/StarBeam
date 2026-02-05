// src/index.ts
import { z } from "zod";
var WorkspaceTypeSchema = z.enum(["personal", "org"]);
var RoleSchema = z.enum(["admin", "manager", "member"]);
var WorkspaceSchema = z.object({
  id: z.string().min(1),
  type: WorkspaceTypeSchema,
  name: z.string().min(1),
  slug: z.string().min(1)
});
var UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  image: z.string().url().optional()
});
var DeviceStartResponseSchema = z.object({
  deviceCode: z.string().min(1),
  verificationUrl: z.string().url()
});
var DeviceExchangeResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: UserSchema,
  workspaces: z.array(WorkspaceSchema)
});
export {
  DeviceExchangeResponseSchema,
  DeviceStartResponseSchema,
  RoleSchema,
  UserSchema,
  WorkspaceSchema,
  WorkspaceTypeSchema
};
