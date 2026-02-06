export function macosDownloadUrl(): string | null {
  const url = (process.env.NEXT_PUBLIC_MACOS_DOWNLOAD_URL || "").trim();
  return url || null;
}

export function macosMinVersion(): string {
  return (process.env.NEXT_PUBLIC_MACOS_MIN_VERSION || "macOS 13+").trim();
}

