import Link from "next/link";

import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function NotFound() {
  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-2xl px-6 py-16">
        <SiteHeader appOrigin={app} />
        <main id="main" className="sb-card p-8">
          <div className="sb-title text-2xl font-extrabold">Page not found</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            That URL doesn’t exist.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/"
              className="sb-btn sb-btn-primary px-5 py-2.5 text-xs font-extrabold text-[color:var(--sb-fg)]"
            >
              Back to home
            </Link>
            <a
              href={`${app}/login`}
              className="sb-btn px-5 py-2.5 text-xs font-semibold text-[color:var(--sb-fg)]"
            >
              Sign in
            </a>
          </div>
        </main>
        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}

