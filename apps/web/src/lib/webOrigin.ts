export function webOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_WEB_ORIGIN ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  );
}

