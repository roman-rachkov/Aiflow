/**
 * Wrap an OpenAI-compatible provider so LLM entry points assert role policy
 * (MVP-3 A4) before any network / mock stream starts.
 */

import { assertRoleMayCallLlm } from './policy';
import type { OpenAICompatibleProvider } from './types';

/** Return a provider that runs {@link assertRoleMayCallLlm} on every chat path. */
export function withPolicyGuard(inner: OpenAICompatibleProvider): OpenAICompatibleProvider {
  return {
    async *chat(messages, cfg) {
      assertRoleMayCallLlm();
      yield* inner.chat(messages, cfg);
    },
    chatWithUsage(messages, cfg) {
      assertRoleMayCallLlm();
      return inner.chatWithUsage(messages, cfg);
    },
    chatWithTools(messages, cfg) {
      assertRoleMayCallLlm();
      return inner.chatWithTools(messages, cfg);
    },
    embed(texts) {
      assertRoleMayCallLlm();
      return inner.embed(texts);
    },
  };
}
