/**
 * MinIO shared client barrel — the only public surface of this slice.
 *
 * License: Apache-2.0 (the `minio` npm package; see client.ts).
 *
 * Deep imports from `client.ts` are blocked by the `import/no-internal-modules`
 * lint gate; consumers must use this barrel.
 */
export { getMinioClient, ensureBucket, putObject, getObject } from './client';
