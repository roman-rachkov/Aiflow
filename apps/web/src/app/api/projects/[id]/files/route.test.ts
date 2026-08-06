import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for the files upload/list route handler.
 *
 * Every external dependency is mocked: auth, the project-schema resolver, the
 * files persistence service, and MinIO. No real HTTP server, no DB, no S3.
 * The tests drive `POST`/`GET` directly with multipart `Request`s and assert
 * on status, body, and which service functions ran. Mirrors the chat route
 * test for the mock harness shape.
 */

const requireUser = vi.fn();
const resolveProjectSchema = vi.fn();
const createUserFile = vi.fn();
const listFiles = vi.fn();
const putObject = vi.fn();

vi.mock('@/features/auth', () => ({ requireUser }));
vi.mock('@/features/projects', () => ({ resolveProjectSchema }));
vi.mock('@/features/files', () => ({ createUserFile, listFiles }));
vi.mock('@/shared/minio', () => ({ putObject }));

const { POST, GET } = await import('./route');

const URL = 'http://localhost/api/projects/p1/files';

afterEach(() => {
  vi.clearAllMocks();
});

/** Build a multipart POST request carrying a single file. */
function makeUploadRequest(file: File | null): Request {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request(URL, { method: 'POST', body: form });
}

/** Wire the happy-path mocks so an upload test only asserts on the response. */
function mockHappyPath(): void {
  requireUser.mockResolvedValue({ id: 'u1' });
  resolveProjectSchema.mockResolvedValue('project_x');
  putObject.mockResolvedValue(undefined);
}

describe('POST /api/projects/[id]/files — happy path', () => {
  it('uploads a valid text file, stores it, and answers 201 with the five-field body', async () => {
    mockHappyPath();
    createUserFile.mockResolvedValue({
      id: 'f1',
      fileName: 'a.txt',
      fileSize: 5,
      mimeType: 'text/plain',
      storageKey: 'project_x/uuid',
      createdAt: new Date('2026-01-01'),
    });

    const form = new FormData();
    form.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }));
    const request = new Request(URL, { method: 'POST', body: form });

    const response = await POST(request, { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({
      id: 'f1',
      fileName: 'a.txt',
      fileSize: 5,
      mimeType: 'text/plain',
      storageKey: 'project_x/uuid',
    });
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(putObject).toHaveBeenCalledWith(
      expect.stringContaining('project_x/'),
      expect.any(Buffer),
      { 'content-type': 'text/plain' },
    );
    expect(createUserFile).toHaveBeenCalledWith('project_x', {
      fileName: 'a.txt',
      fileSize: 5,
      mimeType: 'text/plain',
      storageKey: expect.stringContaining('project_x/'),
    });
  });
});

describe('POST /api/projects/[id]/files — validation', () => {
  it('answers 400 when no file is attached', async () => {
    mockHappyPath();

    const response = await POST(makeUploadRequest(null), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
    expect(createUserFile).not.toHaveBeenCalled();
  });

  it('answers 400 for an unsupported MIME type', async () => {
    mockHappyPath();

    const form = new FormData();
    form.append('file', new File([new Uint8Array([0])], 'p.png', { type: 'image/png' }));
    const request = new Request(URL, { method: 'POST', body: form });

    const response = await POST(request, { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(400);
    expect(putObject).not.toHaveBeenCalled();
    expect(createUserFile).not.toHaveBeenCalled();
  });
});

describe('POST /api/projects/[id]/files — authorization', () => {
  it('answers 404 when the project cannot be resolved', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue(null);

    const form = new FormData();
    form.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }));
    const request = new Request(URL, { method: 'POST', body: form });

    const response = await POST(request, { params: Promise.resolve({ id: 'p1' }) });

    expect(response.status).toBe(404);
    expect(putObject).not.toHaveBeenCalled();
    expect(createUserFile).not.toHaveBeenCalled();
  });
});

describe('GET /api/projects/[id]/files', () => {
  it('answers 200 with the list array', async () => {
    requireUser.mockResolvedValue({ id: 'u1' });
    resolveProjectSchema.mockResolvedValue('project_x');
    listFiles.mockResolvedValue([
      {
        id: 'f1',
        fileName: 'a.txt',
        fileSize: 5,
        mimeType: 'text/plain',
        indexStatus: 'PENDING',
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const response = await GET(new Request(URL, { method: 'GET' }), {
      params: Promise.resolve({ id: 'p1' }),
    });

    expect(response.status).toBe(200);
    expect(listFiles).toHaveBeenCalledWith('project_x');
    const body = await response.json();
    expect(body).toEqual([
      {
        id: 'f1',
        fileName: 'a.txt',
        fileSize: 5,
        mimeType: 'text/plain',
        indexStatus: 'PENDING',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });
});
