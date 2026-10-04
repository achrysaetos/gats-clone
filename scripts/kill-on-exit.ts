import type { ChildProcess } from 'node:child_process';

const children = new Set<ChildProcess>();

function killAll() {
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
}

function exitAfterKilling(code: number) {
  return (reason?: unknown) => {
    if (reason instanceof Error || typeof reason === 'string') console.error(reason);
    killAll();
    process.exit(code);
  };
}

/** Kills `child` however this process ends (normal exit, Ctrl-C, SIGTERM, a thrown error), so a failed or interrupted run never leaves a headless browser behind. */
export function killOnExit<T extends ChildProcess>(child: T): T {
  if (children.size === 0) {
    process.on('exit', killAll);
    process.once('SIGINT', exitAfterKilling(130));
    process.once('SIGTERM', exitAfterKilling(143));
    process.once('SIGHUP', exitAfterKilling(129));
    process.on('uncaughtException', exitAfterKilling(1));
    process.on('unhandledRejection', exitAfterKilling(1));
  }
  children.add(child);
  return child;
}
