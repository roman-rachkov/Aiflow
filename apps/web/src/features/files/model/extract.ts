/**
 * Text extraction for the indexing pipeline (task 2.x). Pure module: takes raw
 * bytes plus a MIME type, returns the embedded text, or `null` when extraction
 * fails or the MIME is not one we extract from. The caller (indexing service)
 * turns a `null` return into a `FAILED` document status — see
 * `model/service.ts` `createUserFile` for the linked `Document` row.
 *
 * JSON is returned as its raw utf8 text rather than re-stringified from a
 * reparse: the embedding model sees the document exactly as it was uploaded,
 * and we avoid inventing a canonical shape that could mask the real content.
 *
 * PDF extraction delegates to `pdf-parse` (License: Apache-2.0, verified from
 * node_modules/pdf-parse/LICENSE and the package `license` field — allowed by
 * the §8.2 allowlist, which permits Apache-2.0 alongside MIT). Any throw from
 * the parser (corrupt file, encrypted PDF, worker failure) is caught and
 * surfaced as `null` so a single bad upload fails that document, not the batch.
 *
 * DEVIATIONS from the task brief (reported):
 *  1. The brief described `pdf-parse` as MIT; the current `pdf-parse@2.4.5`
 *     is Apache-2.0 (still allowlisted — §8.2).
 *  2. The brief assumed the classic 1.x `pdf-parse(bytes)` default-function
 *     API and a synchronous `extractText`. `pdf-parse@2.4.5` exports the
 *     `PDFParse` class and `getText()` is async-only, so `extractText` is
 *     `async` and returns `Promise<string | null>`. The text/plain, markdown,
 *     and JSON branches remain synchronous in effect; only PDF awaits.
 */
import { PDFParse } from 'pdf-parse';

/**
 * Extract embedded text from a file's bytes. Async because PDF parsing is
 * async-only in `pdf-parse@2.x`; the text/markdown/json branches resolve at the
 * first `await` and never throw.
 *
 * @param bytes     Raw file bytes (Buffer from the MinIO fetch).
 * @param mimeType  Upload MIME type, as recorded on the `UserFile` row.
 * @returns         The extracted text, or `null` for unsupported MIME types
 *                  and for PDFs whose text layer could not be parsed.
 */
export async function extractText(bytes: Buffer, mimeType: string): Promise<string | null> {
  switch (mimeType) {
    case 'text/plain':
    case 'text/markdown':
      return bytes.toString('utf8');
    case 'application/json':
      // Embed JSON structure as-is — do not collapse to a re-stringified form.
      return bytes.toString('utf8');
    case 'application/pdf':
      return extractPdf(bytes);
    default:
      return null;
  }
}

/**
 * PDF text-layer extraction. Isolated so `extractText` stays a clean switch.
 * Returns `null` on any failure so the caller can mark the document `FAILED`.
 *
 * `PDFParse` accepts `Uint8Array`; a Node `Buffer` is a `Uint8Array` subclass
 * but copying into a fresh view keeps the typed-array contract explicit and
 * avoids transferring ownership of the caller's buffer to the pdf.js worker.
 */
async function extractPdf(bytes: Buffer): Promise<string | null> {
  try {
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    const result = await parser.getText();
    return result.text;
  } catch {
    return null;
  }
}
