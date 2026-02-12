import { Prisma, prisma } from "@starbeam/db";
import { z } from "zod";

export const usageEventTypes = [
  "SIGNED_IN",
  "GOOGLE_CONNECTED",
  "FIRST_PULSE_QUEUED",
  "FIRST_PULSE_READY",
  "PULSE_VIEWED_WEB",
  "OVERVIEW_SYNCED_MACOS",
  "INVITE_ACCEPTED",
] as const;

const UsageEventTypeSchema = z.enum(usageEventTypes);
const UsageEventSourceSchema = z.enum(["web", "macos", "worker"]);

const OptionalIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .optional()
  .nullable();

const UsageEventInputSchema = z.object({
  eventType: UsageEventTypeSchema,
  source: UsageEventSourceSchema,
  workspaceId: OptionalIdSchema,
  userId: OptionalIdSchema,
  metadata: z.unknown().optional(),
});

export type UsageEventInput = z.infer<typeof UsageEventInputSchema>;

export function parseUsageEventInput(input: unknown): UsageEventInput {
  const parsed = UsageEventInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("Invalid usage event payload");
  }
  return parsed.data;
}

function toInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (typeof value === "undefined") return undefined;
  try {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  } catch {
    throw new Error("Usage event metadata must be JSON-serializable");
  }
}

export async function recordUsageEvent(input: unknown): Promise<void> {
  const parsed = parseUsageEventInput(input);
  const metadata = toInputJson(parsed.metadata);

  await prisma.usageEvent.create({
    data: {
      eventType: parsed.eventType,
      source: parsed.source,
      workspaceId: parsed.workspaceId ?? null,
      userId: parsed.userId ?? null,
      ...(typeof metadata === "undefined" ? {} : { metadata }),
    },
  });
}

export async function recordUsageEventSafe(input: unknown): Promise<void> {
  try {
    await recordUsageEvent(input);
  } catch {
    // Telemetry should never block product flows.
  }
}
