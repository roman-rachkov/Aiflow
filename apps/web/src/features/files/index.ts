/**
 * Public surface of the files feature slice — CRUD + types only.
 *
 * RAG helpers (`retrieveContext`, extract/chunk) live in `./rag` so pages that
 * only list files (Researcher) never evaluate `pdf-parse` / `pdfjs-dist`.
 * Webpackizing those inside the RSC graph throws
 * `Object.defineProperty called on non-object`.
 */
export type { CreateUserFileInput, FileListItemView, UserFileView } from './model/types';
export { createUserFile, listFiles } from './model/service';
export { indexDocument } from './model/index-service';
export type { IndexResult } from './model/index-service';
