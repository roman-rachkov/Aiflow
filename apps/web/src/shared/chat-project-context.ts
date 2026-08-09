'use client';

/**
 * Carries the active `projectId` to components rendered inside the chat shell
 * that cannot receive it as a prop (e.g. the OpenUI message-renderer slot,
 * which has a fixed signature).
 *
 * Lives in `shared` rather than a feature slice because both `chat` (message
 * components) and `specifications` (the SPEC artifact renderer) consume it,
 * and the feature→feature boundary policy forbids cross-slice imports. A
 * shared module is the neutral seam both slices may import.
 */

import { createContext, useContext } from 'react';

export const ProjectIdContext = createContext<string>('');

export function useProjectId(): string {
  return useContext(ProjectIdContext);
}
