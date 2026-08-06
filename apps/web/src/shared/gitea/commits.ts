/**
 * Commit history and single-commit diff via Gitea REST v1.
 */
import { requestJson } from './http';
import type {
  CommitDiff,
  CommitDiffFile,
  CommitSummary,
  GitIdentity,
  ListCommitsOptions,
} from './types';

type RawCommit = {
  sha: string;
  url: string;
  created: string;
  commit: {
    message: string;
    author: { name: string; email: string; date?: string };
    committer: { name: string; email: string; date?: string };
  };
};

type RawGitCommit = {
  sha: string;
  commit?: { message?: string };
  files?: Array<{
    filename: string;
    status: string;
    additions?: number;
    deletions?: number;
    patch?: string;
  }>;
};

/** GET commits — paginated history for a ref. */
export async function listCommits(
  owner: string,
  repo: string,
  options: ListCommitsOptions = {},
): Promise<CommitSummary[]> {
  const params = new URLSearchParams();
  if (options.ref) params.set('sha', options.ref);
  if (options.page != null) params.set('page', String(options.page));
  if (options.limit != null) params.set('limit', String(options.limit));
  const qs = params.size > 0 ? `?${params.toString()}` : '';
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await requestJson<RawCommit[]>(`${base}/commits${qs}`);
  return raw.map(mapCommit);
}

/** GET git/commits/{sha} — commit message + per-file patches. */
export async function getCommitDiff(owner: string, repo: string, sha: string): Promise<CommitDiff> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const raw = await requestJson<RawGitCommit>(`${base}/git/commits/${encodeURIComponent(sha)}`);
  const files: CommitDiffFile[] = (raw.files ?? []).map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions ?? 0,
    deletions: f.deletions ?? 0,
    patch: f.patch,
  }));
  return {
    sha: raw.sha,
    message: raw.commit?.message ?? '',
    files,
  };
}

function mapCommit(raw: RawCommit): CommitSummary {
  const author: GitIdentity & { date?: string } = raw.commit.author;
  const committer: GitIdentity & { date?: string } = raw.commit.committer;
  return {
    sha: raw.sha,
    message: raw.commit.message,
    url: raw.url,
    author,
    committer,
    created: raw.created,
  };
}
