type CalendarEvent = {
  id?: string;
  htmlLink?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
};

type CalendarListResponse = {
  items?: CalendarEvent[];
  nextPageToken?: string;
};

async function googleGetJson<T>(url: string, accessToken: string): Promise<T> {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Calendar API failed (${resp.status}): ${text}`);
  }

  return JSON.parse(text) as T;
}

function parseGoogleDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function eventStart(event: CalendarEvent): Date | null {
  return parseGoogleDate(event.start?.dateTime ?? event.start?.date);
}

export function eventEnd(event: CalendarEvent): Date | null {
  return parseGoogleDate(event.end?.dateTime ?? event.end?.date);
}

export async function listPrimaryEvents(args: {
  accessToken: string;
  timeMin: Date;
  timeMax: Date;
  maxResults: number;
}): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;

  while (out.length < args.maxResults) {
    const batch = Math.min(250, args.maxResults - out.length);
    const params = new URLSearchParams({
      timeMin: args.timeMin.toISOString(),
      timeMax: args.timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(batch),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`;
    const resp = await googleGetJson<CalendarListResponse>(
      url,
      args.accessToken,
    );

    const items = Array.isArray(resp.items) ? resp.items : [];
    for (const e of items) {
      out.push(e);
      if (out.length >= args.maxResults) break;
    }

    pageToken =
      typeof resp.nextPageToken === "string" ? resp.nextPageToken : undefined;
    if (!pageToken) break;
  }

  return out;
}
