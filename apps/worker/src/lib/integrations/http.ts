export class HttpError extends Error {
  status: number;
  responseText?: string;

  constructor(message: string, status: number, responseText?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.responseText = responseText;
  }
}

export async function fetchJson<T>(args: {
  url: string;
  init: RequestInit;
  label: string;
}): Promise<T> {
  const resp = await fetch(args.url, args.init);
  const text = await resp.text();

  if (!resp.ok) {
    throw new HttpError(
      `${args.label} failed (${resp.status}).`,
      resp.status,
      text,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${args.label} returned invalid JSON: ${msg}`);
  }
}
