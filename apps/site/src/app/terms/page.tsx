import SiteFooter from "@/components/site-footer";
import SiteHeader from "@/components/site-header";
import { supportEmail } from "@/lib/supportEmail";
import { webOrigin } from "@/lib/webOrigin";

export default async function TermsPage() {
  const app = webOrigin();
  const email = supportEmail();

  return (
    <div className="sb-bg">
      <a href="#main" className="sb-skip-link">
        Skip to content
      </a>
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <SiteHeader appOrigin={app} />

        <main id="main" className="mt-10 sb-marketing-shell">
          <div className="sb-card p-8 sm:p-10">
            <div className="sb-title text-4xl leading-[1.05] font-extrabold">
              Terms of Service
            </div>
            <p className="mt-3 text-sm text-[color:var(--sb-muted)]">
              Effective date: February 6, 2026
            </p>

            <div className="mt-7 grid gap-6 text-sm text-[color:var(--sb-muted)] leading-relaxed">
              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Beta Product
                </div>
                <div>
                  Starbeam is provided as a private beta. Features may change,
                  break, or be removed. We’re building toward stability, but you
                  should not rely on the service for critical operations yet.
                </div>
              </section>

              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Accounts and Access
                </div>
                <div>
                  You are responsible for your account and for maintaining the
                  confidentiality of any credentials. You may not use Starbeam
                  to violate laws or to access data you do not have rights to
                  access.
                </div>
              </section>

              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Acceptable Use
                </div>
                <ul className="list-disc pl-5 grid gap-2">
                  <li>
                    No abuse, reverse engineering, or attempts to bypass limits.
                  </li>
                  <li>No unlawful content or behavior.</li>
                  <li>No scraping or automated access without permission.</li>
                </ul>
              </section>

              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Disclaimer
                </div>
                <div>
                  Starbeam provides suggestions and summaries. You are
                  responsible for verifying decisions, sources, and outcomes.
                  The service is provided “as is” without warranties.
                </div>
              </section>

              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Limitation of Liability
                </div>
                <div>
                  To the maximum extent permitted by law, StarbeamHQ will not be
                  liable for indirect, incidental, special, consequential, or
                  punitive damages, or any loss of profits or revenues.
                </div>
              </section>

              <section className="grid gap-2">
                <div className="sb-title text-lg font-extrabold text-[color:var(--sb-fg)]">
                  Contact
                </div>
                <div>
                  Questions:{" "}
                  <a
                    href={`mailto:${email}`}
                    className="text-[color:var(--sb-fg)] hover:underline"
                  >
                    {email}
                  </a>
                  .
                </div>
              </section>
            </div>
          </div>
        </main>

        <SiteFooter appOrigin={app} supportEmail={email} />
      </div>
    </div>
  );
}
