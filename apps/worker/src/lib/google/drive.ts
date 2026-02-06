type DriveListResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    modifiedTime?: string;
    webViewLink?: string;
    size?: string;
  }>;
  nextPageToken?: string;
};

export type DriveFileRef = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink?: string;
  sizeBytes?: number;
};

async function googleGetJson<T>(url: string, accessToken: string): Promise<T> {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const text = await resp.text();
  if (!resp.ok) throw new Error(`Drive API failed (${resp.status}): ${text}`);
  return JSON.parse(text) as T;
}

async function googleGetBytes(url: string, accessToken: string): Promise<{ bytes: Buffer; contentType?: string }> {
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const contentType = resp.headers.get("content-type") ?? undefined;
  const buf = Buffer.from(await resp.arrayBuffer());
  if (!resp.ok) {
    const text = buf.toString("utf8").slice(0, 800);
    throw new Error(`Drive download failed (${resp.status}): ${text}`);
  }
  return { bytes: buf, contentType };
}

function toRfc3339(d: Date): string {
  return d.toISOString();
}

function exportMimeTypeForGoogleMime(mimeType: string): string | null {
  if (mimeType === "application/vnd.google-apps.document") return "text/plain";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "text/csv";
  if (mimeType === "application/vnd.google-apps.presentation") return "application/pdf";
  return null;
}

export async function listRecentlyModifiedFiles(args: {
  accessToken: string;
  modifiedAfter: Date;
  maxResults: number;
}): Promise<DriveFileRef[]> {
  const out: DriveFileRef[] = [];
  let pageToken: string | undefined;

  while (out.length < args.maxResults) {
    const batch = Math.min(100, args.maxResults - out.length);
    const q = `modifiedTime > '${toRfc3339(args.modifiedAfter)}' and trashed = false`;

    const params = new URLSearchParams({
      q,
      orderBy: "modifiedTime desc",
      pageSize: String(batch),
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,size)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const resp = await googleGetJson<DriveListResponse>(url, args.accessToken);

    const files = Array.isArray(resp.files) ? resp.files : [];
    for (const f of files) {
      const id = typeof f?.id === "string" ? f.id : "";
      if (!id) continue;
      const name = typeof f.name === "string" && f.name.trim() ? f.name.trim() : "(untitled)";
      const mimeType = typeof f.mimeType === "string" && f.mimeType ? f.mimeType : "application/octet-stream";
      const modifiedTime = typeof f.modifiedTime === "string" && f.modifiedTime ? f.modifiedTime : new Date().toISOString();
      const webViewLink = typeof f.webViewLink === "string" ? f.webViewLink : undefined;
      const sizeBytes = typeof f.size === "string" && f.size ? Number(f.size) : undefined;

      out.push({ id, name, mimeType, modifiedTime, webViewLink, sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : undefined });
      if (out.length >= args.maxResults) break;
    }

    pageToken = typeof resp.nextPageToken === "string" ? resp.nextPageToken : undefined;
    if (!pageToken) break;
  }

  return out;
}

export async function downloadDriveFile(args: {
  accessToken: string;
  fileId: string;
  mimeType: string;
}): Promise<{ bytes: Buffer; contentType?: string }> {
  const exportMime = exportMimeTypeForGoogleMime(args.mimeType);
  if (exportMime) {
    const params = new URLSearchParams({ mimeType: exportMime, supportsAllDrives: "true" });
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}/export?${params.toString()}`;
    return googleGetBytes(url, args.accessToken);
  }

  const params = new URLSearchParams({ alt: "media", supportsAllDrives: "true" });
  const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}?${params.toString()}`;
  return googleGetBytes(url, args.accessToken);
}

