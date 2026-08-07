/**
 * Registry allowlist proxy for sandbox egress (npm/yarn/pypi/GitHub CDNs).
 * HTTP forward + CONNECT; only ALLOWED_HOSTS may be reached.
 */

import express from 'express';
import http from 'node:http';

import { parseAllowedHosts } from './allowlist';
import { handleConnect, handleHttpProxy } from './proxy';

const PORT = Number(process.env.PORT ?? 3128);
const allowed = parseAllowedHosts(process.env.ALLOWED_HOSTS);

function logDenied(host: string, via: string): void {
  console.warn(`[registry-proxy] denied ${via} host=${host}`);
}

const deps = { allowed, logDenied };

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use((req, res) => {
  handleHttpProxy(req, res, deps);
});

const server = http.createServer(app);
server.on('connect', (req, socket, head) => {
  handleConnect(req, socket, head, deps);
});

server.listen(PORT, () => {
  console.log(`[registry-proxy] listening on ${String(PORT)}`);
  console.log(`[registry-proxy] allowed: ${allowed.join(',')}`);
});
