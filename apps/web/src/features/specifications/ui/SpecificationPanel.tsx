/**
 * SpecificationPanel — the researcher's SPEC.md versions surface ('use client').
 *
 * Version generation and per-version content fetch are browser-driven. The
 * version list is seeded server-side via `initialSpecs` (mirroring ChatPanel's
 * `initialMessages`) so first paint is complete. Russian strings per the
 * product language policy (CLAUDE.md). No modal library, so an opened version
 * renders inline as a `<pre>`; no toast library, so errors are inline text.
 * Async handlers are top-level fns taking one options object and are called
 * with `void` from JSX so onClick stays void-returning (eslint
 * no-misused-promises) and component fns stay compact.
 */
'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

import { Button, Card, CardTitle, Spinner } from '@aiflow/ui';

import type { SpecificationListItemView } from '../model/types';

export type SpecificationPanelProps = {
  /** Preloaded version list (server-rendered). Empty for a fresh project. */
  initialSpecs: SpecificationListItemView[];
  /** Project id — routes each call to /api/projects/{id}/specifications. */
  projectId: string;
};

type SpecListSetter = Dispatch<SetStateAction<SpecificationListItemView[]>>;
type CreatedSpec = { id: string; version: number; createdAt: string };
type SpecContent = { content: string };

export function SpecificationPanel({ initialSpecs, projectId }: SpecificationPanelProps) {
  const [specs, setSpecs] = useState<SpecificationListItemView[]>(initialSpecs);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Спецификация</CardTitle>
        <Button
          size="sm"
          disabled={creating}
          onClick={() => void createSpec({ projectId, setSpecs, setCreating, setError })}
        >
          {creating ? <Spinner size="sm" label={null} /> : 'Создать спецификацию'}
        </Button>
      </div>

      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}

      <ul className="mt-3 flex flex-col gap-2">
        {specs.length === 0 ? (
          <li className="text-sm text-fg-muted">Спецификация не создана</li>
        ) : (
          specs.map((spec) => <SpecRow key={spec.id} spec={spec} projectId={projectId} />)
        )}
      </ul>
    </Card>
  );
}

/** One version row: header button + lazily-fetched inline content. */
function SpecRow({ spec, projectId }: { spec: SpecificationListItemView; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

  return (
    <li className="border-t border-border pt-2">
      <button
        type="button"
        onClick={() =>
          void toggleSpec({
            version: spec.version,
            projectId,
            open,
            content,
            setOpen,
            setLoading,
            setContent,
            setRowError,
          })
        }
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm text-fg">Версия {spec.version}</span>
        <span className="text-xs text-fg-muted">{formatDate(spec.createdAt)}</span>
      </button>
      <SpecContentBlock open={open} loading={loading} content={content} rowError={rowError} />
    </li>
  );
}

/** Collapsed/expanded content area, split out to keep SpecRow under 50 lines. */
function SpecContentBlock(props: {
  open: boolean;
  loading: boolean;
  content: string | null;
  rowError: string | null;
}) {
  const { open, loading, content, rowError } = props;
  if (!open) return null;
  return (
    <div className="mt-2">
      {rowError ? <p className="text-xs text-danger">{rowError}</p> : null}
      {loading ? (
        <Spinner size="sm" label="Загрузка версии" />
      ) : content !== null ? (
        <pre className="max-h-80 overflow-auto rounded-md bg-surface-muted p-2 text-xs break-words whitespace-pre-wrap text-fg">
          {content}
        </pre>
      ) : null}
    </div>
  );
}

type CreateOpts = {
  projectId: string;
  setSpecs: SpecListSetter;
  setCreating: (v: boolean) => void;
  setError: (v: string | null) => void;
};

/** Generate a new version and prepend it (createdBy AI, unapproved). */
async function createSpec({ projectId, setSpecs, setCreating, setError }: CreateOpts) {
  setCreating(true);
  setError(null);
  try {
    const res = await fetch(`/api/projects/${projectId}/specifications`, { method: 'POST' });
    if (!res.ok) throw new Error('create failed');
    const created = (await res.json()) as CreatedSpec;
    setSpecs((prev) => [toListItem(created), ...prev]);
  } catch {
    setError('Не удалось создать спецификацию');
  } finally {
    setCreating(false);
  }
}

type ToggleOpts = {
  version: number;
  projectId: string;
  open: boolean;
  content: string | null;
  setOpen: (v: boolean) => void;
  setLoading: (v: boolean) => void;
  setContent: (v: string | null) => void;
  setRowError: (v: string | null) => void;
};

/** Toggle a row open/closed, lazily fetching content on first open. */
async function toggleSpec({
  version,
  projectId,
  open,
  content,
  setOpen,
  setLoading,
  setContent,
  setRowError,
}: ToggleOpts) {
  if (open) {
    setOpen(false);
    return;
  }
  setOpen(true);
  if (content !== null) return;
  setLoading(true);
  setRowError(null);
  try {
    const res = await fetch(`/api/projects/${projectId}/specifications/${String(version)}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = (await res.json()) as SpecContent;
    setContent(data.content);
  } catch {
    setRowError('Не удалось загрузить версию');
  } finally {
    setLoading(false);
  }
}

/** Map a create response into a list-item view (AI-authored, unapproved). */
function toListItem(created: CreatedSpec): SpecificationListItemView {
  return {
    id: created.id,
    version: created.version,
    createdAt: new Date(created.createdAt),
    createdBy: 'AI',
    approvedAt: null,
  };
}

/** Locale-formatted timestamp for a version row. Hoisted to keep rows simple. */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(date),
  );
}
