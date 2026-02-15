"use server";

import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@starbeam/db";

import { authOptions } from "@/lib/auth";
import {
  enqueueAutoFirstNightlyWorkspaceRun,
  enqueueWorkspaceBootstrap,
} from "@/lib/nightlyRunQueue";
import { consumeRateLimit, RateLimitError } from "@/lib/rateLimit";
import { requestIdFromHeaders } from "@/lib/requestId";
import { recordUsageEventSafe } from "@/lib/usageEvents";

export type OnboardingActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: {
    fullName?: string;
    location?: string;
    jobTitle?: string;
    company?: string;
    companyUrl?: string;
    url?: string;
    goal?: string;
  };
};

export const initialOnboardingActionState: OnboardingActionState = { ok: true };

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

async function requireWorkspaceMembership(workspaceSlug: string): Promise<{
  userId: string;
  workspace: { id: string; slug: string };
  membershipId: string;
}> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Unauthorized");

  const membership = await prisma.membership.findFirst({
    where: { userId: session.user.id, workspace: { slug: workspaceSlug } },
    include: { workspace: true },
  });
  if (!membership) throw new Error("Not a member");

  return {
    userId: session.user.id,
    workspace: { id: membership.workspace.id, slug: membership.workspace.slug },
    membershipId: membership.id,
  };
}

const NameSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your name.").max(120),
});

export async function saveName(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const parsed = NameSchema.safeParse({
      fullName: String(formData.get("fullName") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        fieldErrors: {
          fullName: parsed.error.flatten().fieldErrors.fullName?.[0],
        },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { name: parsed.data.fullName },
      }),
      prisma.workspaceMemberProfile.upsert({
        where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
        update: { fullName: parsed.data.fullName },
        create: {
          workspaceId: workspace.id,
          userId,
          fullName: parsed.data.fullName,
        },
      }),
    ]);

    redirect(`/w/${workspace.slug}/onboarding/location`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save name";
    return { ok: false, message: msg };
  }
}

const LocationSchema = z.object({
  location: z.string().trim().min(2, "Enter a city.").max(120),
});

export async function saveLocation(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const parsed = LocationSchema.safeParse({
      location: String(formData.get("location") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        fieldErrors: {
          location: parsed.error.flatten().fieldErrors.location?.[0],
        },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);
    await prisma.workspaceMemberProfile.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: { location: parsed.data.location },
      create: {
        workspaceId: workspace.id,
        userId,
        location: parsed.data.location,
      },
    });

    redirect(`/w/${workspace.slug}/onboarding/role`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save location";
    return { ok: false, message: msg };
  }
}

const RoleSchema = z.object({
  jobTitle: z.string().trim().min(2, "Enter your role.").max(120),
});

export async function saveRole(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const parsed = RoleSchema.safeParse({
      jobTitle: String(formData.get("jobTitle") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        fieldErrors: {
          jobTitle: parsed.error.flatten().fieldErrors.jobTitle?.[0],
        },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);
    await prisma.workspaceMemberProfile.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: { jobTitle: parsed.data.jobTitle },
      create: {
        workspaceId: workspace.id,
        userId,
        jobTitle: parsed.data.jobTitle,
      },
    });

    redirect(`/w/${workspace.slug}/onboarding/company`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save role";
    return { ok: false, message: msg };
  }
}

const CompanySchema = z.object({
  company: z.string().trim().min(2, "Enter a company or project.").max(120),
  companyUrl: z.string().url("Enter a valid URL.").optional(),
});

export async function saveCompany(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const company = String(formData.get("company") ?? "");
    const companyUrlNormalized = normalizeWebsiteUrl(
      String(formData.get("companyUrl") ?? ""),
    );

    const parsed = CompanySchema.safeParse({
      company,
      companyUrl: companyUrlNormalized ?? undefined,
    });
    if (!parsed.success) {
      const flattened = parsed.error.flatten().fieldErrors;
      return {
        ok: false,
        fieldErrors: {
          company: flattened.company?.[0],
          companyUrl: flattened.companyUrl?.[0],
        },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);
    await prisma.workspaceMemberProfile.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: {
        company: parsed.data.company,
        companyUrl: parsed.data.companyUrl ?? null,
      },
      create: {
        workspaceId: workspace.id,
        userId,
        company: parsed.data.company,
        companyUrl: parsed.data.companyUrl ?? null,
      },
    });

    redirect(`/w/${workspace.slug}/onboarding/profile`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save company";
    return { ok: false, message: msg };
  }
}

const PublicProfileSchema = z.object({
  url: z.string().trim().url("Enter a valid URL.").max(400),
});

export async function savePublicProfile(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const parsed = PublicProfileSchema.safeParse({
      url: String(formData.get("url") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        fieldErrors: { url: parsed.error.flatten().fieldErrors.url?.[0] },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);
    const u = new URL(parsed.data.url);
    const host = u.hostname.toLowerCase();

    const data = host.includes("linkedin.com")
      ? { linkedinUrl: parsed.data.url, websiteUrl: null }
      : { websiteUrl: parsed.data.url, linkedinUrl: null };

    await prisma.workspaceMemberProfile.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
      update: data,
      create: { workspaceId: workspace.id, userId, ...data },
    });

    redirect(`/w/${workspace.slug}/onboarding/goals`);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not save profile URL";
    return { ok: false, message: msg };
  }
}

const GoalSchema = z.object({
  goal: z.string().trim().min(3, "Enter a goal or skip for now.").max(160),
});

export async function saveGoal(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  try {
    const parsed = GoalSchema.safeParse({
      goal: String(formData.get("goal") ?? ""),
    });
    if (!parsed.success) {
      return {
        ok: false,
        fieldErrors: { goal: parsed.error.flatten().fieldErrors.goal?.[0] },
      };
    }

    const { userId, workspace } =
      await requireWorkspaceMembership(workspaceSlug);
    await prisma.personalGoal.create({
      data: {
        workspaceId: workspace.id,
        userId,
        title: parsed.data.goal,
        body: "",
        active: true,
      },
    });

    redirect(`/w/${workspace.slug}/onboarding/integrations`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not save goal";
    return { ok: false, message: msg };
  }
}

export async function completeOnboardingAndQueueFirstPulse(
  workspaceSlug: string,
  _prev: OnboardingActionState,
  _formData: FormData,
): Promise<OnboardingActionState> {
  try {
    void _prev;
    void _formData;

    const { userId, workspace, membershipId } =
      await requireWorkspaceMembership(workspaceSlug);

    // Mark onboarding complete (idempotent).
    await prisma.membership.updateMany({
      where: { id: membershipId, onboardingCompletedAt: null },
      data: { onboardingCompletedAt: new Date() },
    });

    const existingPulse = await prisma.pulseEdition.findFirst({
      where: { workspaceId: workspace.id, userId },
      select: { id: true },
    });
    if (existingPulse) {
      redirect(`/w/${workspace.slug}/pulse`);
    }

    try {
      await consumeRateLimit({
        key: `run_now:user:${userId}`,
        windowSec: 60,
        limit: Number(process.env.STARB_RUN_NOW_USER_LIMIT_1M ?? "3") || 3,
      });
      await consumeRateLimit({
        key: `run_now:workspace:${workspace.id}`,
        windowSec: 60,
        limit: Number(process.env.STARB_RUN_NOW_WORKSPACE_LIMIT_1M ?? "5") || 5,
      });
      await consumeRateLimit({
        key: `run_day:workspace:${workspace.id}`,
        windowSec: 24 * 60 * 60,
        limit: Number(process.env.STARB_RUN_WORKSPACE_LIMIT_1D ?? "20") || 20,
      });
    } catch (err) {
      if (err instanceof RateLimitError) {
        return {
          ok: false,
          message: "Too many requests. Please try again shortly.",
        };
      }
      throw err;
    }

    const runAt = new Date();
    const headerStore = await headers();
    const requestId = requestIdFromHeaders(headerStore) ?? undefined;

    await enqueueWorkspaceBootstrap({
      workspaceId: workspace.id,
      userId,
      triggeredByUserId: userId,
      source: "web",
      runAt,
      jobKeyMode: "replace",
      requestId,
    });

    await enqueueAutoFirstNightlyWorkspaceRun({
      workspaceId: workspace.id,
      userId,
      triggeredByUserId: userId,
      source: "web",
      runAt,
      jobKeyMode: "replace",
      requestId,
    });

    await recordUsageEventSafe({
      eventType: "FIRST_PULSE_QUEUED",
      source: "web",
      workspaceId: workspace.id,
      userId,
      metadata: {
        triggeredBy: "onboarding_finish",
        requestId: requestId ?? null,
      },
    });

    redirect(`/w/${workspace.slug}/pulse?queued=1&from=onboarding`);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not start your first pulse";
    return { ok: false, message: msg };
  }
}
