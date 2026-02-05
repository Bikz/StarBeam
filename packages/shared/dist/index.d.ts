import { z } from 'zod';

declare const WorkspaceTypeSchema: z.ZodEnum<{
    personal: "personal";
    org: "org";
}>;
type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;
declare const RoleSchema: z.ZodEnum<{
    admin: "admin";
    manager: "manager";
    member: "member";
}>;
type Role = z.infer<typeof RoleSchema>;
declare const WorkspaceSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        personal: "personal";
        org: "org";
    }>;
    name: z.ZodString;
    slug: z.ZodString;
}, z.core.$strip>;
type Workspace = z.infer<typeof WorkspaceSchema>;
declare const UserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    image: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type User = z.infer<typeof UserSchema>;
declare const DeviceStartResponseSchema: z.ZodObject<{
    deviceCode: z.ZodString;
    verificationUrl: z.ZodString;
}, z.core.$strip>;
type DeviceStartResponse = z.infer<typeof DeviceStartResponseSchema>;
declare const DeviceExchangeResponseSchema: z.ZodObject<{
    accessToken: z.ZodString;
    refreshToken: z.ZodString;
    expiresIn: z.ZodNumber;
    user: z.ZodObject<{
        id: z.ZodString;
        email: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        image: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    workspaces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            personal: "personal";
            org: "org";
        }>;
        name: z.ZodString;
        slug: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
type DeviceExchangeResponse = z.infer<typeof DeviceExchangeResponseSchema>;

export { type DeviceExchangeResponse, DeviceExchangeResponseSchema, type DeviceStartResponse, DeviceStartResponseSchema, type Role, RoleSchema, type User, UserSchema, type Workspace, WorkspaceSchema, type WorkspaceType, WorkspaceTypeSchema };
