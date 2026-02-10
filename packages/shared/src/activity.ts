export function activeWindowCutoff(now: Date, windowDays: number): Date {
  const days = Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 0;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isActiveWithinWindow(args: {
  lastActiveAt: Date | null | undefined;
  now: Date;
  windowDays: number;
}): boolean {
  if (!args.lastActiveAt) return false;
  const cutoff = activeWindowCutoff(args.now, args.windowDays);
  return args.lastActiveAt.getTime() >= cutoff.getTime();
}

export function lastActiveUpdateCutoff(now: Date, throttleMins: number): Date {
  const mins =
    Number.isFinite(throttleMins) && throttleMins > 0 ? throttleMins : 0;
  return new Date(now.getTime() - mins * 60 * 1000);
}

export function shouldUpdateLastActiveAt(args: {
  lastActiveAt: Date | null | undefined;
  now: Date;
  throttleMins: number;
}): boolean {
  if (!args.lastActiveAt) return true;
  const cutoff = lastActiveUpdateCutoff(args.now, args.throttleMins);
  return args.lastActiveAt.getTime() < cutoff.getTime();
}
