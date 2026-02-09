import Link from "next/link";

import SignOutCard from "./signout-card";

export default async function SignOutPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrlRaw = (sp.callbackUrl ?? "/login").trim() || "/login";
  const callbackUrl = callbackUrlRaw.startsWith("/") ? callbackUrlRaw : "/login";

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">Sign out</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            You can sign back in anytime.
          </p>

          <div className="mt-6">
            <SignOutCard callbackUrl={callbackUrl} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            <Link href={callbackUrl} className="text-[color:var(--sb-muted)] hover:underline">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

