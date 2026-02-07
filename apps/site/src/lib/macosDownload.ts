export function macosMinVersion(): string {
  return (process.env.NEXT_PUBLIC_MACOS_MIN_VERSION || "macOS 14+").trim();
}

export function macosDownloadUrl(): string | null {
  const raw = (process.env.NEXT_PUBLIC_MACOS_DOWNLOAD_URL || "").trim();
  return raw ? raw : null;
}

