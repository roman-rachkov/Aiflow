'use client';

type Props = {
  open: boolean;
  onToggle: () => void;
  ready: boolean;
  chunks: string[];
};

/**
 * Terminal stub (SPEC): shows placeholder copy; accepts `terminal.output` /
 * `terminal.ready` from WS but does not send commands.
 */
export function TerminalStub({ open, onToggle, ready, chunks }: Props) {
  return (
    <div className="border-t border-border bg-fg text-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs"
        onClick={onToggle}
      >
        <span>
          Терминал{ready ? ' · готов' : ''}
          {open ? '' : ' (свёрнут)'}
        </span>
        <span>{open ? '▼' : '▲'}</span>
      </button>
      {open ? (
        <div className="h-28 overflow-auto px-3 pb-2 font-mono text-xs">
          <p className="text-fg-muted opacity-80">Терминал будет доступен позже</p>
          {chunks.map((chunk, i) => (
            <pre key={i} className="whitespace-pre-wrap">
              {chunk}
            </pre>
          ))}
        </div>
      ) : null}
    </div>
  );
}
