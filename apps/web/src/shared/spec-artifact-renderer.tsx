'use client';

/**
 * OpenUI artifact renderer for a generated SPEC.md.
 *
 * Registered once at mount on `<AgentInterface artifactRenderers={[…]>`. When
 * the Analyst calls the `spec:generate` tool, the framework matches this
 * renderer, runs `parser` against the tool result `{ id, version, content }`,
 * and (a) renders `preview` inline in the chat, (b) registers the artifact in
 * the workspace rail, (c) mounts `actual` into the detailed-view side panel.
 * No `ArtifactStorage` is needed — the rail reads the in-memory thread context.
 *
 * `actual` renders the SPEC markdown (react-markdown) plus an Approve button
 * wired to the existing `/specifications/{version}/approve` endpoint.
 */

import { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { defineArtifactRenderer, type ArtifactRendererControls } from '@openuidev/react-headless';

import { useProjectId } from '@/shared/chat-project-context';

/** The props the parser extracts from the tool result. */
export interface SpecArtifactProps {
  id: string;
  version: number;
  content: string;
}

/** The tool-result payload shape produced by the `/run` spec:generate executor. */
interface SpecToolResult extends SpecArtifactProps {
  createdAt?: string;
}

/** A failed generation carries `{ error }` instead of content. */
function isErrorResult(response: unknown): response is { error: string } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as { error?: unknown }).error === 'string'
  );
}

export const specArtifactRenderer = defineArtifactRenderer<SpecArtifactProps>({
  type: 'spec',
  toolName: 'spec:generate',
  label: 'SPEC',
  parser: ({ response }) => {
    if (!response || isErrorResult(response)) return null;
    const r = response as SpecToolResult;
    return {
      props: { id: r.id, version: r.version, content: r.content },
      meta: {
        id: r.id,
        version: r.version,
        heading: `SPEC.md · v${String(r.version)}`,
        type: 'spec',
      },
    };
  },
  preview: (props, controls) => <SpecPreviewCard props={props} controls={controls} />,
  actual: (props, controls) => <SpecDetailedView props={props} controls={controls} />,
});

/** Inline chat preview: a compact card that opens the detailed view on click. */
function SpecPreviewCard({
  props,
  controls,
}: {
  props: SpecArtifactProps;
  controls: ArtifactRendererControls;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        controls.open();
      }}
      className="my-1 flex w-full max-w-md items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-muted"
    >
      <span className="text-xl">📄</span>
      <span className="flex flex-col">
        <span className="text-sm font-medium text-fg">Спецификация SPEC.md · v{props.version}</span>
        <span className="text-xs text-fg-muted">Нажмите, чтобы открыть и проверить</span>
      </span>
    </button>
  );
}

/** Detailed side-panel view: full SPEC markdown + approve. */
function SpecDetailedView({
  props,
}: {
  props: SpecArtifactProps;
  controls: ArtifactRendererControls;
}) {
  const projectId = useProjectId();
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);

  const onApprove = useCallback(() => {
    setApproving(true);
    fetch(`/api/projects/${projectId}/specifications/${String(props.version)}/approve`, {
      method: 'POST',
    })
      .then((res) => {
        if (res.ok) setApproved(true);
      })
      .catch(() => {
        /* keep button actionable on failure */
      })
      .finally(() => {
        setApproving(false);
      });
  }, [projectId, props.version]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-fg">SPEC.md · v{props.version}</span>
        <button
          type="button"
          onClick={onApprove}
          disabled={approved || approving}
          className="rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover disabled:opacity-50"
        >
          {approved ? '✓ Утверждена' : approving ? '…' : 'Утвердить'}
        </button>
      </div>
      <div className="prose-spec min-h-0 flex-1 overflow-auto px-4 py-3 text-sm">
        <ReactMarkdown>{props.content}</ReactMarkdown>
      </div>
    </div>
  );
}
