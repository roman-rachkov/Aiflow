'use client';

/**
 * Approve control for a SPEC.md version. Shared by the OpenUI artifact
 * preview/detail views and the shell Spec route so «Утвердить» is always
 * reachable without depending on the detailed-view portal.
 */

import { useCallback, useState, type MouseEvent } from 'react';

export interface SpecApproveButtonProps {
  projectId: string;
  version: number;
  /** When true, render the approved state immediately (e.g. from list DTO). */
  initiallyApproved?: boolean;
}

export function SpecApproveButton({
  projectId,
  version,
  initiallyApproved = false,
}: SpecApproveButtonProps) {
  const [approved, setApproved] = useState(initiallyApproved);
  const [approving, setApproving] = useState(false);

  const onApprove = useCallback(
    (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (approved || approving) return;
      setApproving(true);
      fetch(`/api/projects/${projectId}/specifications/${String(version)}/approve`, {
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
    },
    [approved, approving, projectId, version],
  );

  return (
    <button
      type="button"
      onClick={onApprove}
      disabled={approved || approving}
      className="rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary-hover disabled:opacity-50"
    >
      {approved ? '✓ Утверждена' : approving ? '…' : 'Утвердить'}
    </button>
  );
}
