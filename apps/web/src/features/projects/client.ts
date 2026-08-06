/**
 * Client-only public surface of the projects slice.
 *
 * Interactive forms live here; server loaders and RSC views stay on `./index`
 * so a shared barrel cannot drag `'use client'` modules into every server
 * import (and vice versa). See `features/chat/client.ts`.
 */
export { CreateProjectForm } from './ui/CreateProjectForm';
export { DeleteProjectButton } from './ui/DeleteProjectButton';
