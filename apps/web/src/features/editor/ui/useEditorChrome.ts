'use client';

import { useState } from 'react';

/** Sidebar / git / terminal panel chrome for EditorShell. */
export function useEditorChrome() {
  const [gitOpen, setGitOpen] = useState(false);
  const [termOpen, setTermOpen] = useState(true);
  const [termReady, setTermReady] = useState(false);
  const [termChunks, setTermChunks] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  return {
    gitOpen,
    setGitOpen,
    termOpen,
    setTermOpen,
    termReady,
    setTermReady,
    termChunks,
    setTermChunks,
    sidebarOpen,
    setSidebarOpen,
  };
}

export type EditorChrome = ReturnType<typeof useEditorChrome>;
