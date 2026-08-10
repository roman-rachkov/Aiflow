import { redirect } from 'next/navigation';

/**
 * Legacy `/chat` preview now redirects to the project home — the chat IS the
 * home since Stage D. Kept so old links don't 404.
 */
export default async function ChatRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
