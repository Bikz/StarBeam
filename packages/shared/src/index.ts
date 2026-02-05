import { z } from "zod";

export const WorkspaceTypeSchema = z.enum(["personal", "org"]);
export type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;

export const RoleSchema = z.enum(["admin", "manager", "member"]);
export type Role = z.infer<typeof RoleSchema>;

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  type: WorkspaceTypeSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1).optional(),
  image: z.string().url().optional(),
});
export type User = z.infer<typeof UserSchema>;

export const DeviceStartResponseSchema = z.object({
  deviceCode: z.string().min(1),
  verificationUrl: z.string().url(),
});
export type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;

export const DeviceExchangeResponseSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
  user: UserSchema,
  workspaces: z.array(WorkspaceSchema),
});
export type DeviceExchangeResponse = z.infer<typeof DeviceExchangeResponseSchema>;

