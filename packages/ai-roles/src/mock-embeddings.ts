/**
 * Mock embeddings path for the OpenAI-compatible provider.
 *
 * Returns a deterministic 1536-dim vector per input so local dev and tests can
 * exercise the RAG pipeline (pgvector writes, similarity) with no network and
 * no key. The vector is a deterministic pseudo-random fill seeded by the text
 * hash: the same input always yields the same vector, so cached queries and
 * snapshot tests are stable across runs. Length 1536 matches
 * text-embedding-3-small so downstream shape checks pass.
 */

/** Length of a text-embedding-3-small vector; matches the live embedding model. */
export const MOCK_EMBEDDING_DIM = 1536;

/**
 * Deterministic 32-bit hash of `s` (FNV-1a variant). Stable per input string,
 * used to seed the per-text PRNG so identical inputs map to identical vectors.
 */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: deterministic float in [0, 1) from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build one deterministic 1536-dim vector for `text`. */
function mockVector(text: string): number[] {
  const rand = mulberry32(hashSeed(text));
  const vec = new Array<number>(MOCK_EMBEDDING_DIM);
  for (let i = 0; i < MOCK_EMBEDDING_DIM; i += 1) {
    vec[i] = rand();
  }
  return vec;
}

/** Return a deterministic 1536-dim vector per input, in order. */
export function mockEmbed(texts: string[]): number[][] {
  return texts.map(mockVector);
}
