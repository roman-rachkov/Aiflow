'use client';

/**
 * Re-export of the shared `ProjectIdContext`. The context itself lives in
 * `shared/chat-project-context` so both the `chat` and `specifications` feature
 * slices can consume it without a feature→feature import (forbidden by the
 * boundaries policy). Kept here as a convenience import path for this slice's
 * own components.
 */

export { ProjectIdContext, useProjectId } from '@/shared/chat-project-context';
