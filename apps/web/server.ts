/**
 * Custom HTTP server: Next.js App Router + editor WebSocket upgrades on :3000.
 *
 * Why: App Router has no first-class WS route; `next start` ignores upgrades.
 * This process (a) prepares Next, (b) upgrades `WS /api/projects/[id]/editor/ws`
 * with the `ws` package (MIT), (c) delegates HMR / other upgrades to Next via
 * `getUpgradeHandler()`. Compose still runs `yarn workspace @aiflow/web dev`.
 *
 * REST remains the source of truth; the WS channel is ephemeral state only.
 *
 * Note: no top-level await — tsx transforms this file as CJS in the monorepo.
 * `als-polyfill` must be the first import (before `next`).
 */
import './als-polyfill';

import { createServer } from 'node:http';
import { parse } from 'node:url';

import next from 'next';
import { WebSocketServer } from 'ws';

import { attachEditorWebSocket } from './src/features/editor/model/ws-attach';

const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
// Yarn sets npm_lifecycle_event to the script name (`dev` / `start`).
const dev = process.env.npm_lifecycle_event === 'dev' || process.env.NODE_ENV === 'development';

const EDITOR_WS = /^\/api\/projects\/([^/]+)\/editor\/ws\/?$/;

async function main(): Promise<void> {
  const app = next({ dev, hostname, port });
  await app.prepare();

  const handle = app.getRequestHandler();
  const nextUpgrade = app.getUpgradeHandler();
  const wss = new WebSocketServer({ noServer: true });

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? '', true);
    void handle(req, res, parsedUrl);
  });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url ?? '', true);
    const match = pathname?.match(EDITOR_WS);
    if (match?.[1]) {
      const projectId = match[1];
      wss.handleUpgrade(req, socket, head, (ws) => {
        void attachEditorWebSocket(ws, req, projectId);
      });
      return;
    }
    void nextUpgrade(req, socket, head);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, hostname, () => { resolve(); });
    server.once('error', reject);
  });
  console.log(`> Ready on http://${hostname}:${String(port)}`);
}

void main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
