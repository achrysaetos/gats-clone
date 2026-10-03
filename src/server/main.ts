import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { WebSocketServer } from 'ws';
import { WORLD, type ModeId } from '../shared/defs.ts';
import { cleanName } from '../shared/protocol.ts';
import { openAccounts, type Accounts } from './accounts.ts';
import { createRoom, type Room } from './room.ts';

export type ServerOptions = { port: number; dataDir: string; publicDir?: string; timeScale?: number };
export type RunningServer = { port: number; close(): Promise<void> };

const PUBLIC_DIR = resolve(import.meta.dirname, '../../public');
const MAX_BODY = 4096;
const ROOM_MODES: [string, ModeId][] = [['ffa', 'FFA'], ['tdm', 'TDM'], ['dom', 'DOM']];
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.map': 'application/json', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) return null;
    chunks.push(chunk as Buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

function parseCredentials(body: unknown): { name: string; password: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const { name, password } = body as Record<string, unknown>;
  if (typeof name !== 'string' || typeof password !== 'string') return null;
  const clean = cleanName(name);
  if (clean !== name.trim() || clean.length < 3 || password.length < 4 || password.length > 128) return null;
  return { name: clean, password };
}

async function serveStatic(publicDir: string, pathname: string, res: ServerResponse) {
  let file: string;
  try { file = resolve(publicDir, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname)); } catch { file = ''; }
  if (!file.startsWith(publicDir + sep)) { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

async function route(req: IncomingMessage, res: ServerResponse, rooms: Map<string, Room>, accounts: Accounts, publicDir: string) {
  const url = new URL(req.url ?? '/', 'http://x');
  const path = url.pathname;
  if (req.method === 'GET' && path === '/api/servers') return json(res, 200, [...rooms.values()].map((r) => r.info()));
  if (req.method === 'GET' && path === '/api/leaderboard') return json(res, 200, accounts.leaderboard(20));
  if (req.method === 'GET' && path.startsWith('/api/stats/')) {
    const stats = accounts.stats(decodeURIComponent(path.slice('/api/stats/'.length)));
    return stats ? json(res, 200, stats) : json(res, 404, { error: 'No such player' });
  }
  if (req.method === 'POST' && (path === '/api/register' || path === '/api/login')) {
    const creds = parseCredentials(await readBody(req));
    if (!creds) return json(res, 400, { error: 'Name must be 3-16 letters/digits and password at least 4 characters' });
    if (path === '/api/register') {
      const session = await accounts.register(creds.name, creds.password);
      return session ? json(res, 200, session) : json(res, 409, { error: 'Name taken' });
    }
    const session = await accounts.login(creds.name, creds.password);
    return session ? json(res, 200, session) : json(res, 401, { error: 'Wrong name or password' });
  }
  if (path.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
  return serveStatic(publicDir, path, res);
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const accounts = await openAccounts(opts.dataDir);
  const publicDir = opts.publicDir ?? PUBLIC_DIR;
  const rooms = new Map<string, Room>(
    ROOM_MODES.map(([id, mode], i) => [id, createRoom(id, mode, 1000 + i, accounts, opts.timeScale ?? 1)]),
  );

  const http = createServer((req, res) => {
    route(req, res, rooms, accounts, publicDir).catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'Internal error' });
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  wss.on('error', (err) => console.error('websocket server error', err));
  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const room = url.pathname === '/ws' ? rooms.get(url.searchParams.get('room') ?? '') : undefined;
    if (!room) { socket.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
    wss.handleUpgrade(req, socket, head, (ws) => room.connect(ws));
  });

  const timer = setInterval(() => { for (const r of rooms.values()) r.tick(); }, 1000 / WORLD.tickHz);
  await new Promise<void>((done) => http.listen(opts.port, done));

  return {
    port: (http.address() as AddressInfo).port,
    async close() {
      clearInterval(timer);
      for (const r of rooms.values()) r.close();
      wss.close();
      http.closeAllConnections();
      await new Promise<void>((done) => http.close(() => done()));
      await accounts.flush();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const port = Number(process.env.PORT ?? 8080);
  const dataDir = process.env.DATA_DIR ?? resolve(import.meta.dirname, '../../data');
  const server = await startServer({ port, dataDir });
  console.log(`Skirmish listening on http://localhost:${server.port}`);
  const shutdown = async (signal: string) => {
    console.log(`${signal}: saving and shutting down`);
    await server.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}
