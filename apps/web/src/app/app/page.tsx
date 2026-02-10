import { redirect } from "next/navigation";

import { webOrigin } from "@/lib/webOrigin";

export default function AppRedirectPage() {
  redirect(`${webOrigin()}/login`);
}
