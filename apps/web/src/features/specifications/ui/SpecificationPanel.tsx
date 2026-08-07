/**
 * SpecificationPanel — version list for the left artifacts column ('use client').
 *
 * Create lives on the chat composer toolbar; this panel only lists versions and
 * notifies the parent when the user picks one for the right-hand preview.
 * Seeded via `initialSpecs` so first paint is complete (mirrors ChatPanel).
 */
'use client';

import { Card, CardTitle } from '@aiflow/ui';

import type { SpecificationListItemView } from '../model/types';

export type SpecificationPanelProps = {
  /** Version list (controlled by ResearchWorkspace). */
  specs: SpecificationListItemView[];
  /** Highlighted version in the right preview; null when none selected. */
  selectedVersion: number | null;
  /** Parent loads content and opens the preview. */
  onSelectVersion: (version: number) => void;
};

export function SpecificationPanel({
  specs,
  selectedVersion,
  onSelectVersion,
}: SpecificationPanelProps) {
  return (
    <Card className="min-h-0 overflow-auto">
      <CardTitle>Спецификация</CardTitle>
      <ul className="mt-2 flex flex-col gap-1">
        {specs.length === 0 ? (
          <li className="text-sm text-fg-muted">Спецификация не создана</li>
        ) : (
          specs.map((spec) => (
            <li key={spec.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectVersion(spec.version);
                }}
                className={[
                  'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left',
                  selectedVersion === spec.version
                    ? 'bg-surface-muted'
                    : 'hover:bg-surface-muted/60',
                ].join(' ')}
              >
                <span className="text-sm text-fg">
                  Версия {spec.version}
                  {spec.approvedAt ? (
                    <span className="ml-1 text-xs text-fg-muted">· утверждена</span>
                  ) : null}
                </span>
                <span className="text-xs text-fg-muted">{formatDate(spec.createdAt)}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(date),
  );
}
