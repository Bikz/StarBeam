type GmailListResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailHeader = { name?: string; value?: string };

type GmailMessage = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string; // ms since epoch, as string
  payload?: {
    headers?: GmailHeader[];
  };
};

async function googleGetJson<T>(
  url: string,
  accessToken: string,
): Promise<T> {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Gmail API failed (${resp.status}): ${text}`);
  }

  return JSON.parse(text) as T;
}

export function headerValue(message: GmailMessage, name: string): string {
  const headers = message.payload?.headers ?? [];
  const target = name.toLowerCase();
  for (const h of headers) {
    if (!h?.name) continue;
    if (h.name.toLowerCase() === target) return h.value ?? "";
  }
  return "";
}

export async function listMessageRefs(args: {
  accessToken: string;
  afterUnixSeconds: number;
  maxResults: number;
}): Promise<Array<{ id: string; threadId?: string }>> {
  const out: Array<{ id: string; threadId?: string }> = [];
  let pageToken: string | undefined;

  while (out.length < args.maxResults) {
    const batch = Math.min(100, args.maxResults - out.length);
    const q = `after:${args.afterUnixSeconds}`;
    const params = new URLSearchParams({
      q,
      includeSpamTrash: "false",
      maxResults: String(batch),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`;
    const resp = await googleGetJson<GmailListResponse>(url, args.accessToken);

    const refs = Array.isArray(resp.messages) ? resp.messages : [];
    for (const r of refs) {
      if (typeof r?.id !== "string" || !r.id) continue;
      out.push({ id: r.id, threadId: typeof r.threadId === "string" ? r.threadId : undefined });
      if (out.length >= args.maxResults) break;
    }

    pageToken = typeof resp.nextPageToken === "string" ? resp.nextPageToken : undefined;
    if (!pageToken) break;
  }

  return out;
}

export async function fetchMessageMetadata(args: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessage> {
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "Subject",
  });
  // Repeated keys are allowed; URLSearchParams will serialize as `metadataHeaders=...&metadataHeaders=...`
  params.append("metadataHeaders", "From");
  params.append("metadataHeaders", "To");
  params.append("metadataHeaders", "Date");

  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(args.messageId)}?${params.toString()}`;
  return googleGetJson<GmailMessage>(url, args.accessToken);
}
