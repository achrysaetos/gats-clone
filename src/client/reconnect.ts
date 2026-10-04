import type { ClientState } from './state.ts';

export const BACKOFF = { firstMs: 500, capMs: 5000, budgetMs: 45_000 } as const;
/** The server closes with 1008 when a socket breaks its rules (message flood, join timeout); dialing again would repeat it. */
const POLICY_VIOLATION = 1008;

export type Retry = { attempt: number; startedAt: number; nextAt: number };

/** Which job a closing socket held in the current state. `stale` means the client already let go of it, as on a deliberate leave. */
type SocketRole = 'connecting' | 'session' | 'dial' | 'stale';
type CloseVerdict = 'connect-failed' | 'reconnect' | 'drop' | 'retry-failed' | 'ignore';

export function nextDelay(attempt: number, rand: number): number {
  const ceiling = Math.min(BACKOFF.capMs, BACKOFF.firstMs * 2 ** (attempt - 1));
  return ceiling / 2 + (ceiling / 2) * rand;
}

export const startRetry = (at: number, rand: number): Retry => ({ attempt: 1, startedAt: at, nextAt: at + nextDelay(1, rand) });

/** Returns null once the next dial would land past the budget: time to give up. */
export function retryAfterFailure(retry: Retry, at: number, rand: number): Retry | null {
  const attempt = retry.attempt + 1;
  const nextAt = at + nextDelay(attempt, rand);
  return nextAt - retry.startedAt > BACKOFF.budgetMs ? null : { ...retry, attempt, nextAt };
}

export const retryNow = (retry: Retry, at: number): Retry => ({ ...retry, nextAt: Math.min(retry.nextAt, at) });

export function socketRole(state: ClientState, ws: WebSocket): SocketRole {
  switch (state.phase) {
    case 'menu': return state.status.kind === 'connecting' && state.status.ws === ws ? 'connecting' : 'stale';
    case 'reconnecting': return state.dial === ws ? 'dial' : 'stale';
    case 'playing':
    case 'dead': return state.s.ws === ws ? 'session' : 'stale';
  }
}

export function closeVerdict(role: SocketRole, code: number): CloseVerdict {
  switch (role) {
    case 'connecting': return 'connect-failed';
    case 'session': return code === POLICY_VIOLATION ? 'drop' : 'reconnect';
    case 'dial': return 'retry-failed';
    case 'stale': return 'ignore';
  }
}
