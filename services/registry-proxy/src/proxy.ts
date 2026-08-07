/**
 * HTTP forward + HTTPS CONNECT handlers for the registry allowlist proxy.
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';

import { isHostAllowed } from './allowlist';

export type ProxyDeps = {
  allowed: readonly string[];
  logDenied: (host: string, via: string) => void;
};

function hostFromUrl(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return null;
  }
}

function hostFromAuthority(authority: string): string {
  return authority.includes(':') ? (authority.split(':')[0] ?? authority) : authority;
}

function requestLib(protocol: string): typeof http | typeof https {
  return protocol === 'https:' ? https : http;
}

/** Forward absolute-URL HTTP proxy requests (npm/yarn over HTTP). */
export function handleHttpProxy(req: IncomingMessage, res: ServerResponse, deps: ProxyDeps): void {
  const targetUrl = req.url ?? '';
  const hostname = hostFromUrl(targetUrl);
  if (!hostname) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (!isHostAllowed(hostname, deps.allowed)) {
    deps.logDenied(hostname, 'http');
    res.writeHead(403).end('Host not allowed');
    return;
  }

  const parsed = new URL(targetUrl);
  const headers = { ...req.headers, host: parsed.host };
  const lib = requestLib(parsed.protocol);
  const proxyReq = lib.request(
    {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: parsed.pathname + parsed.search,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Bad gateway');
  });
  req.pipe(proxyReq);
}

/** Tunnel HTTPS via CONNECT when the target host is allowlisted. */
export function handleConnect(
  req: IncomingMessage,
  client: Duplex,
  head: Buffer,
  deps: ProxyDeps,
): void {
  const authority = req.url ?? '';
  const hostname = hostFromAuthority(authority);
  if (!isHostAllowed(hostname, deps.allowed)) {
    deps.logDenied(hostname, 'connect');
    client.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    client.end();
    return;
  }

  const port = authority.includes(':') ? Number(authority.split(':')[1]) : 443;
  const serverSocket = net.connect(port, hostname, () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) serverSocket.write(head);
    serverSocket.pipe(client);
    client.pipe(serverSocket);
  });
  serverSocket.on('error', () => {
    client.end();
  });
  client.on('error', () => {
    serverSocket.end();
  });
}
