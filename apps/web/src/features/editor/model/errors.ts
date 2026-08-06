/**
 * Typed editor domain errors. Routes map these to HTTP status codes;
 * messages stay English here — Russian copy belongs at the route boundary.
 */

/** File exists but is not editable text (route → 415). */
export class BinaryFileError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Binary file cannot be opened in the editor: ${path}`);
    this.name = 'BinaryFileError';
    this.path = path;
  }
}

/** Blob SHA mismatch / concurrent edit (route → 409). */
export class ConflictError extends Error {
  readonly path?: string;

  constructor(message = 'SHA conflict', path?: string) {
    super(message);
    this.name = 'ConflictError';
    this.path = path;
  }
}

/** Missing project path or blob (route → 404). */
export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function isBinaryFileError(err: unknown): err is BinaryFileError {
  return err instanceof BinaryFileError;
}

export function isConflictError(err: unknown): err is ConflictError {
  return err instanceof ConflictError;
}

export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof NotFoundError;
}
