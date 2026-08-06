/**
 * Client-only public surface of the editor slice.
 *
 * Interactive UI lives here so the server barrel (`./index`) cannot drag
 * `'use client'` / Monaco into RSC imports.
 */
export { EditorShell } from './ui/EditorShell';
