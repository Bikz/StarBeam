import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function AppHome() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) redirect("/dashboard");
  redirect("/login");
}

