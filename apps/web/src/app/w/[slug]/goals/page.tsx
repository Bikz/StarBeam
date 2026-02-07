import { redirect } from "next/navigation";

export default async function GoalsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/w/${slug}/tracks`);
}
