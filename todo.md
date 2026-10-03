# Feature playbook (verbatim)
- [x] 1. `how` over the affected subsystem. skip: greenfield repo, nothing to walk; prior turn surveyed gats.io live.
- [ ] 2. `architect` for parallel design exploration. skip: the data shape (defs.ts + protocol.ts) is written by the lead directly; no competing shapes worth a panel for a table-driven sim.
- [ ] 3. Write the throughput checkpoint as four todo items.
- [ ] 4. Delegate code-writing to a subagent (worktree per delegate).
- [ ] 5. Verify on the matching surface.
- [ ] 6. Rebase into small, ordered commits.
- [ ] 7. If the design is contested, `interrogate` before shipping. skip: not contested.
- [ ] 8. Run **Opening a PR**. skip: no remote configured; user asked for local commits.

# Throughput checkpoint
- Blocking first steps: defs.ts + protocol.ts (lead), committed before fan-out.
- Independent workstreams: (A) sim + server + tests [src/shared/sim.ts, src/server/**, test/**]; (B) browser client [src/client/**, public/**].
- Shared mutable state: only protocol.ts/defs.ts, frozen by the lead; delegates read-only on them. Separate worktrees.
- Smallest safe decomposition: two workers; client and server only meet at protocol.ts.

# Task
- [ ] Merge A and B, e2e: real server + bots + headless ws client test + browser drive
