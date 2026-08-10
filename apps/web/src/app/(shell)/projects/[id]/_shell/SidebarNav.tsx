'use client';

/**
 * Sidebar navigation section for the project shell — the tool routes that sit
 * below the thread list. Each item is an `AgentInterface.SidebarItem` with a
 * `path` (controlled navigation) except Editor, which is a separate page
 * (opened via `router.push('/editor')`) to keep Monaco + WS out of the shell.
 *
 * Pro-only items (Editor, Models) are hidden for BASIC users.
 */

import { FileText, ListChecks, Rocket, FileCode2, Sliders, Code2 } from 'lucide-react';

import { AgentInterface } from '@openuidev/react-ui/AgentInterface';

export interface SidebarNavProps {
  isPro: boolean;
  onOpenEditor: () => void;
}

/** The route paths the shell navigates between (chat = `undefined`). */
export const SHELL_ROUTES = ['files', 'tasks', 'deploy', 'spec'] as const;
export type ShellRoute = (typeof SHELL_ROUTES)[number];

export function SidebarNav({ isPro, onOpenEditor }: SidebarNavProps) {
  return (
    <div className="openui-agent-sidebar-nav mt-2 flex flex-col gap-0.5 border-t border-border pt-2">
      <AgentInterface.SidebarItem icon={<FileText size="1em" />} path="files">
        Файлы
      </AgentInterface.SidebarItem>
      <AgentInterface.SidebarItem icon={<ListChecks size="1em" />} path="tasks">
        Задачи
      </AgentInterface.SidebarItem>
      <AgentInterface.SidebarItem icon={<Rocket size="1em" />} path="deploy">
        Развёртывания
      </AgentInterface.SidebarItem>
      <AgentInterface.SidebarItem icon={<FileCode2 size="1em" />} path="spec">
        Спецификация
      </AgentInterface.SidebarItem>
      {isPro ? (
        <>
          <AgentInterface.SidebarItem icon={<Code2 size="1em" />} onClick={onOpenEditor}>
            Редактор
          </AgentInterface.SidebarItem>
          <AgentInterface.SidebarItem icon={<Sliders size="1em" />} path="models">
            Модели
          </AgentInterface.SidebarItem>
        </>
      ) : null}
    </div>
  );
}
