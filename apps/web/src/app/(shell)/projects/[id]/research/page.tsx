import { redirect } from 'next/navigation';

/**
 * Legacy `/research` now redirects to the project home — the grown-up chat
 * shell (`/projects/[id]`) subsumed the three-column Researcher workspace.
 */
export default async function ResearchRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
