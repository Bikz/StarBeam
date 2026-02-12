import { prisma } from "@starbeam/db";

export class RateLimitError extends Error {
  status = 429 as const;

  constructor(message = "Too many requests") {
    super(message);
  }
}

function windowStartUtc(now: Date, windowSec: number): Date {
  const ms = windowSec * 1000;
  const t = Math.floor(now.getTime() / ms) * ms;
  return new Date(t);
}

export async function consumeRateLimit(args: {
  key: string;
  windowSec: number;
  limit: number;
}): Promise<{ count: number }> {
  const now = new Date();
  const windowStart = windowStartUtc(now, args.windowSec);

  const row = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key: args.key, windowStart } },
    update: { count: { increment: 1 }, windowSec: args.windowSec },
    create: { key: args.key, windowStart, windowSec: args.windowSec, count: 1 },
    select: { count: true },
  });

  if (row.count > args.limit) {
    throw new RateLimitError();
  }

  return row;
}
