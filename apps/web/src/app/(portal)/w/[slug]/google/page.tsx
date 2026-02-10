import { redirect } from "next/navigation";

export default async function GooglePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    connected?: string;
    disconnected?: string;
    error?: string;
  }>;
}) {
  // Backwards-compatible redirect: integrations now live under /integrations.
  const [{ slug }, sp] = await Promise.all([params, searchParams]);

  const next = new URLSearchParams();
  if (sp.connected) next.set("connected", "google");
  if (sp.disconnected) next.set("disconnected", "google");
  if (sp.error) next.set("error", sp.error);

  const qs = next.toString();
  redirect(`/w/${slug}/integrations${qs ? `?${qs}` : ""}`);
}
