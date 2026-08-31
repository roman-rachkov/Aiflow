/**
 * System prompt for the Support Bot.
 *
 * The bot answers questions about the user's application using indexed project
 * documents (SPEC, uploaded files). When context is empty the bot politely
 * declines, avoiding hallucination. Internal reasoning is English; responses
 * are in the user's language (Russian for Russian-speaking users).
 */

const BASE_PROMPT = [
  'You are the AI Support Bot embedded in an application built with AI Studio.',
  'Your sole purpose: answer user questions using the project documentation provided below.',
  'Rules:',
  '- If the provided context does not contain enough information, say so honestly.',
  '- Never fabricate facts not present in the context.',
  '- Reply in the same language the user writes in.',
  '- Keep answers concise and helpful.',
].join('\n');

/**
 * Build the full support-bot system prompt, optionally injected with RAG
 * context wrapped as untrusted document data (B4 safety invariant).
 *
 * Empty context returns BASE_PROMPT unchanged so the bot can still handle
 * the empty-context case gracefully.
 */
export function buildSupportSystemPrompt(ragContext: string): string {
  if (!ragContext.trim()) return BASE_PROMPT;
  return `${BASE_PROMPT}\n\n${ragContext}`;
}
