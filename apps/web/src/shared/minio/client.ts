/**
 * MinIO shared client.
 *
 * License: Apache-2.0 (the `minio` npm package).
 *
 * Reads four env vars on first use — S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY,
 * S3_BUCKET (default `ai-studio`) — and exposes a lazy singleton `Client` plus
 * idempotent bucket/put/get helpers. `ensureBucket()` is invoked lazily from
 * `putObject` so app boot is never blocked on a network call.
 *
 * The `S3_ENDPOINT` value matches `.env.example` (`minio:9000`, no scheme).
 * A scheme is tolerated: `https://` forces useSSL, `http://` forces it off, and
 * either is stripped before splitting host:port. The bare `host:port` form is
 * the default.
 */
import { Client, type ClientOptions } from 'minio';
import { Readable } from 'node:stream';

let client: Client | undefined;
let bucketEnsured = false;

/** Default bucket name if S3_BUCKET is unset. Matches the .env.example value. */
const DEFAULT_BUCKET = 'ai-studio';

/** Parse S3_ENDPOINT into minio's { endPoint, port, useSSL } triple. */
function parseEndpoint(raw: string): Pick<ClientOptions, 'endPoint' | 'port' | 'useSSL'> {
  let useSSL = false;
  let rest = raw;
  if (rest.startsWith('https://')) {
    useSSL = true;
    rest = rest.slice('https://'.length);
  } else if (rest.startsWith('http://')) {
    useSSL = false;
    rest = rest.slice('http://'.length);
  }
  const host = rest.split(':', 1)[0] ?? rest;
  const portStr = rest.slice(host.length + 1);
  const port = portStr ? Number(portStr) : undefined;
  return { endPoint: host, port: Number.isFinite(port) ? port : undefined, useSSL };
}

/** Build ClientOptions from env on first call. Exported for tests. */
export function buildOptions(): ClientOptions {
  const raw = process.env.S3_ENDPOINT ?? '';
  if (!raw) throw new Error('S3_ENDPOINT is not set');
  const { endPoint, port, useSSL } = parseEndpoint(raw);
  if (!endPoint) throw new Error(`S3_ENDPOINT has no host: ${raw}`);
  const accessKey = process.env.S3_ACCESS_KEY ?? '';
  const secretKey = process.env.S3_SECRET_KEY ?? '';
  return { endPoint, port, useSSL, accessKey, secretKey };
}

/** Lazy singleton. The first call constructs the Client; later calls reuse it. */
export function getMinioClient(): Client {
  if (!client) client = new Client(buildOptions());
  return client;
}

/** The bucket name from S3_BUCKET (default `ai-studio`). */
export function getBucketName(): string {
  return process.env.S3_BUCKET || DEFAULT_BUCKET;
}

/** Idempotent: create the bucket if missing. Safe to call repeatedly. */
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const bucket = getBucketName();
  const exists = await getMinioClient().bucketExists(bucket);
  if (!exists) await getMinioClient().makeBucket(bucket);
  bucketEnsured = true;
}

/** Put bytes under storageKey. Ensures the bucket on first use. */
export async function putObject(
  storageKey: string,
  bytes: Buffer,
  metaData?: Record<string, string>,
): Promise<void> {
  await ensureBucket();
  await getMinioClient().putObject(getBucketName(), storageKey, bytes, bytes.length, metaData);
}

/** Read an object fully into a Buffer. */
export async function getObject(storageKey: string): Promise<Buffer> {
  const stream = await getMinioClient().getObject(getBucketName(), storageKey);
  return accumulate(stream);
}

/** Drain a minio object stream into a single Buffer. */
async function accumulate(stream: Readable): Promise<Buffer> {
  // minio's getObject yields a plain `Readable` whose chunks are typed `any`.
  // Narrow each chunk explicitly to Uint8Array so no-unsafe-argument stays
  // happy, then concat (Buffer.concat accepts readonly Uint8Array[]).
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(toBytes(chunk));
  }
  return Buffer.concat(chunks);
}

/** Coerce a minio stream chunk (Buffer | string | unknown) to Uint8Array. */
function toBytes(chunk: unknown): Uint8Array {
  if (typeof chunk === 'string') return Buffer.from(chunk);
  if (chunk instanceof Uint8Array) return chunk;
  throw new Error(`Unexpected minio stream chunk type: ${typeof chunk}`);
}
