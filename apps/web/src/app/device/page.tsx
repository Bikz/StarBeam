import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { sbButtonClass } from "@starbeam/shared";

import { prisma } from "@starbeam/db";

import { approveDevice } from "@/app/device/actions";
import { authOptions } from "@/lib/auth";
import { sha256Hex } from "@/lib/apiTokens";
import { ensureBetaEligibilityProcessed } from "@/lib/betaAccess";

export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; approved?: string; done?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const sp = await searchParams;
  const code = (sp.code ?? "").trim();

  if (!code) notFound();

  if (!session?.user?.id) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/device?code=${code}`)}`,
    );
  }

  const status = await ensureBetaEligibilityProcessed(session.user.id);
  if (!status) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/device?code=${code}`)}&ignoreSession=1`,
    );
  }

  if (!status.hasAccess) {
    redirect("/beta");
  }

  const deviceCodeHash = sha256Hex(code);
  const req = await prisma.deviceAuthRequest.findUnique({
    where: { deviceCodeHash },
    select: {
      status: true,
      expiresAt: true,
      approvedUserId: true,
      approvedAt: true,
      consumedAt: true,
    },
  });

  if (!req) notFound();
  const expired = req.expiresAt <= new Date();

  let headline = "Approve Starbeam";
  let message =
    "Approve this device to sign in to the Starbeam macOS app. You can close this tab after approval.";

  if (expired) {
    headline = "Code expired";
    message =
      "This device code expired. Return to the Starbeam macOS app and start sign-in again.";
  } else if (req.status === "CONSUMED" || sp.done) {
    headline = "All set";
    message =
      "Sign-in completed. You can close this tab and return to the app.";
  } else if (req.status === "APPROVED" || sp.approved) {
    if (req.approvedUserId && req.approvedUserId !== session.user.id) {
      headline = "Already approved";
      message =
        "This device code was approved by another user. Return to the macOS app and start sign-in again.";
    } else {
      headline = "Approved";
      message = "Return to the Starbeam macOS app to finish sign-in.";
    }
  }

  const showApprove =
    !expired &&
    req.status === "PENDING" &&
    (!req.approvedUserId || req.approvedUserId === session.user.id);

  return (
    <div className="sb-bg">
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="sb-card p-8">
          <div className="sb-title text-2xl">{headline}</div>
          <p className="mt-2 text-sm text-[color:var(--sb-muted)] leading-relaxed">
            {message}
          </p>

          <div className="mt-6 sb-card-inset p-4">
            <div className="text-xs font-semibold text-[color:var(--sb-muted)]">
              Device code
            </div>
            <div className="mt-1 font-mono text-sm text-[color:var(--sb-fg)] break-all">
              {code}
            </div>
          </div>

          {showApprove ? (
            <div className="mt-6 flex items-center gap-3">
              <form action={approveDevice.bind(null, code)}>
                <button
                  type="submit"
                  className={sbButtonClass({
                    variant: "primary",
                    className: "h-11 px-6 text-sm font-extrabold",
                  })}
                >
                  Approve
                </button>
              </form>
              <div className="text-xs text-[color:var(--sb-muted)]">
                Signed in as{" "}
                <span className="font-semibold text-[color:var(--sb-fg)]">
                  {session.user.email}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-xs text-[color:var(--sb-muted)]">
              Signed in as{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {session.user.email}
              </span>
            </div>
          )}

          {req.approvedAt ? (
            <div className="mt-3 text-xs text-[color:var(--sb-muted)]">
              Approved at:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {req.approvedAt.toISOString()}
              </span>
            </div>
          ) : null}
          {req.consumedAt ? (
            <div className="mt-1 text-xs text-[color:var(--sb-muted)]">
              Consumed at:{" "}
              <span className="font-semibold text-[color:var(--sb-fg)]">
                {req.consumedAt.toISOString()}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
