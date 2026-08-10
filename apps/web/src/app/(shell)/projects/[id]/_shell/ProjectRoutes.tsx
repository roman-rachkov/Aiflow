'use client';

/**
 * `AgentInterface.Route` panels for the project shell. Each Route's `path`
 * matches a `SidebarNav` item; when active, its children replace the thread
 * region. Panels self-load given `projectId` (+ flags), except Files which is
 * SSR-seeded via `initialFiles`. SPEC lazily fetches the latest version's body.
 *
 * Lives in `shared` (not a feature slice) because it composes panels across
 * several slices (files/tasks/deploy/specifications/model-config) — the
 * boundaries policy forbids feature→feature imports.
 */

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { Spinner } from '@aiflow/ui';
import { FilePanel } from '@/features/files/client';
import { TasksPanel } from '@/features/tasks/client';
import { DeploymentsPanel } from '@/features/deploy/client';
import { ModelSettingsForm } from '@/features/model-config/client';
import type { FileListItemView } from '@/features/files';
import type { SpecificationListItemView } from '@/features/specifications';

export interface ProjectRoutesProps {
  projectId: string;
  projectName: string;
  isPro: boolean;
  initialFiles: FileListItemView[];
  initialSpecs: SpecificationListItemView[];
}

export function ProjectRoutes(props: ProjectRoutesProps) {
  return (
    <>
      <AgentInterface.Route path="files">
        <div className="h-full overflow-auto p-4">
          <FilePanel initialFiles={props.initialFiles} projectId={props.projectId} />
        </div>
      </AgentInterface.Route>
      <AgentInterface.Route path="tasks">
        <div className="h-full overflow-auto p-4">
          <TasksPanel
            projectId={props.projectId}
            projectName={props.projectName}
            canPlan={props.isPro}
          />
        </div>
      </AgentInterface.Route>
      <AgentInterface.Route path="deploy">
        <div className="h-full overflow-auto p-4">
          <DeploymentsPanel projectId={props.projectId} canBuild={props.isPro} />
        </div>
      </AgentInterface.Route>
      <AgentInterface.Route path="spec">
        <SpecRoute projectId={props.projectId} specs={props.initialSpecs} />
      </AgentInterface.Route>
      {props.isPro ? (
        <AgentInterface.Route path="models">
          <div className="h-full overflow-auto p-4">
            <ModelSettingsForm projectId={props.projectId} />
          </div>
        </AgentInterface.Route>
      ) : null}
    </>
  );
}

/** SPEC route: lazily fetch the latest version's markdown body and render it. */
function SpecRoute({
  projectId,
  specs,
}: {
  projectId: string;
  specs: SpecificationListItemView[];
}) {
  if (specs.length === 0) {
    return (
      <div className="h-full overflow-auto p-4">
        <h2 className="mb-3 text-base font-semibold text-fg">Спецификация</h2>
        <p className="text-sm text-fg-muted">
          Спецификация ещё не создана. Попросите Аналитика в чате: «Создай спецификацию».
        </p>
      </div>
    );
  }
  const version = specs[0].version;
  const { content, loading } = useSpecContent(projectId, version);
  return (
    <div className="h-full overflow-auto p-4">
      <h2 className="mb-3 text-base font-semibold text-fg">Спецификация · v{version}</h2>
      {loading ? (
        <Spinner />
      ) : content === null ? (
        <p className="text-sm text-fg-muted">Содержание спецификации недоступно.</p>
      ) : (
        <div className="prose-spec text-sm">
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/** Fetch one SPEC version's markdown body, with a cancellation guard. */
function useSpecContent(
  projectId: string,
  version: number,
): {
  content: string | null;
  loading: boolean;
} {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = { cancelled: false };
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/specifications/${String(version)}`);
        if (!r.ok) throw new Error('not ok');
        const v = (await r.json()) as { content?: string };
        if (!handle.cancelled) setContent(v.content ?? null);
      } catch {
        if (!handle.cancelled) setContent(null);
      } finally {
        if (!handle.cancelled) setLoading(false);
      }
    })();
    return () => {
      handle.cancelled = true;
    };
  }, [projectId, version]);

  return { content, loading };
}
