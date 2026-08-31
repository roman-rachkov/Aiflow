'use client';

/**
 * `AgentInterface.Route` panels for the project shell. Each Route's `path`
 * matches a `SidebarNav` item; when active, its children replace the thread
 * region.
 *
 * IMPORTANT: `AgentInterface` extracts Routes via a shallow `Children.forEach`
 * — only **direct** children of type `Route` count. Wrapping them in a
 * component or Fragment leaves `slots.routes` empty and the chat never
 * swaps. `buildProjectRoutes` returns a flat array that flattens under
 * `Children.forEach`.
 *
 * Lives next to the shell (not a feature slice) because it composes panels
 * across several slices — boundaries forbid feature→feature imports.
 */

import { useEffect, useState, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

import { Spinner } from '@aiflow/ui';
import { FilePanel } from '@/features/files/client';
import { TasksPanel } from '@/features/tasks/client';
import { DeploymentsPanel } from '@/features/deploy/client';
import { ModelSettingsForm } from '@/features/model-config/client';
import { SupportBotPanel } from '@/features/support-bot';
import type { FileListItemView } from '@/features/files';
import type { SpecificationListItemView } from '@/features/specifications';
import { SpecApproveButton } from '@/shared/spec-approve-button';

export interface ProjectRoutesProps {
  projectId: string;
  projectName: string;
  isPro: boolean;
  initialFiles: FileListItemView[];
  initialSpecs: SpecificationListItemView[];
}

/** Flat Route siblings for `<AgentInterface>` — do not wrap in a component. */
export function buildProjectRoutes(props: ProjectRoutesProps): ReactElement[] {
  const routes: ReactElement[] = [
    <AgentInterface.Route key="files" path="files">
      <div className="h-full overflow-auto p-4">
        <FilePanel initialFiles={props.initialFiles} projectId={props.projectId} />
      </div>
    </AgentInterface.Route>,
    <AgentInterface.Route key="tasks" path="tasks">
      <div className="h-full overflow-auto p-4">
        <TasksPanel
          projectId={props.projectId}
          projectName={props.projectName}
          canPlan={props.isPro}
        />
      </div>
    </AgentInterface.Route>,
    <AgentInterface.Route key="deploy" path="deploy">
      <div className="h-full overflow-auto p-4">
        <DeploymentsPanel projectId={props.projectId} canBuild={props.isPro} />
      </div>
    </AgentInterface.Route>,
    <AgentInterface.Route key="spec" path="spec">
      <SpecRoute projectId={props.projectId} specs={props.initialSpecs} />
    </AgentInterface.Route>,
  ];
  if (props.isPro) {
    routes.push(
      <AgentInterface.Route key="agents" path="agents">
        <SupportBotPanel projectId={props.projectId} />
      </AgentInterface.Route>,
      <AgentInterface.Route key="models" path="models">
        <div className="h-full overflow-auto p-4">
          <ModelSettingsForm projectId={props.projectId} />
        </div>
      </AgentInterface.Route>,
    );
  }
  return routes;
}

/** SPEC route: empty state or loaded latest version. */
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
  return <SpecRouteBody projectId={projectId} latest={specs[0]} />;
}

/** Loaded SPEC panel — hooks only run when a version exists. */
function SpecRouteBody({
  projectId,
  latest,
}: {
  projectId: string;
  latest: SpecificationListItemView;
}) {
  const { content, loading, approvedAt } = useSpecContent(projectId, latest.version);
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-base font-semibold text-fg">Спецификация · v{latest.version}</h2>
        <SpecApproveButton
          projectId={projectId}
          version={latest.version}
          initiallyApproved={approvedAt !== null || latest.approvedAt != null}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
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
  approvedAt: string | null;
} {
  const [content, setContent] = useState<string | null>(null);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handle = { cancelled: false };
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/specifications/${String(version)}`);
        if (!r.ok) throw new Error('not ok');
        const v = (await r.json()) as { content?: string; approvedAt?: string | null };
        if (!handle.cancelled) {
          setContent(v.content ?? null);
          setApprovedAt(v.approvedAt ?? null);
        }
      } catch {
        if (!handle.cancelled) {
          setContent(null);
          setApprovedAt(null);
        }
      } finally {
        if (!handle.cancelled) setLoading(false);
      }
    })();
    return () => {
      handle.cancelled = true;
    };
  }, [projectId, version]);

  return { content, loading, approvedAt };
}
