import { EXT } from '../shared/defs.ts';
import type { ExtTeam, ExtView, Team } from '../shared/protocol.ts';
import { clock } from './derive.ts';

export type ExtRole = 'attack' | 'defend';

export const roleOf = (ext: ExtView, team: Team): ExtRole | null => (team === 'red' || team === 'blue' ? (team === ext.attackers ? 'attack' : 'defend') : null);

const TEAM_NAME: Record<ExtTeam, string> = { red: 'Red', blue: 'Blue' };

export const padCenter = (ext: ExtView) => ({ x: ext.pad.x + ext.pad.w / 2, y: ext.pad.y + ext.pad.h / 2 });

/** The objective checklist: hack, take the case, reach the pad, each ticked once done this round. */
export function extSteps(ext: ExtView): { label: string; done: boolean }[] {
  const k = ext.case.k;
  const taken = k === 'carried' || ext.between?.why === 'extracted';
  return [
    { label: 'Hack the terminal', done: k !== 'hacking' },
    { label: 'Take the data case', done: taken },
    { label: 'Reach the extraction pad', done: ext.between?.why === 'extracted' },
  ];
}

/** The one line under the checklist: what is happening to the case right now, from `role`'s side, with `name` naming a carrier. */
export function extStatus(ext: ExtView, role: ExtRole | null, myId: number, now: number, name: (id: number) => string): string {
  if (ext.between) {
    const next = `round ${ext.round + 1} in ${Math.max(0, Math.ceil((ext.between.nextAt - now) / 1000))}s`;
    return `${TEAM_NAME[ext.between.winner]} ${ext.between.why === 'extracted' ? 'extracted the case' : 'held to the clock'} · ${next}`;
  }
  const c = ext.case;
  switch (c.k) {
    case 'hacking': return c.contested ? 'Hack contested' : `Hacking ${Math.floor(c.progress * 100)}%`;
    case 'ready': return role === 'defend' ? 'Case exposed at the terminal' : 'Case ready: grab it at the terminal';
    case 'carried': return c.by === myId ? 'You have the case: get to the pad' : role === 'defend' ? `${name(c.by)} has the case: stop them` : `Escort ${name(c.by)} to the pad`;
    case 'dropped': return `Case dropped · returns in ${Math.max(0, Math.ceil((c.returnAt - now) / 1000))}s`;
  }
}

/** Where `role`'s next objective is, for an off-screen arrow and a world marker, or null when it is here with them. */
export function extGoal(ext: ExtView, role: ExtRole | null, myId: number): { x: number; y: number; label: string } | null {
  const c = ext.case;
  if (ext.between || role === null) return null;
  switch (c.k) {
    case 'hacking': return { ...ext.terminal, label: role === 'attack' ? 'HACK' : 'DEFEND' };
    case 'ready': return { x: c.x, y: c.y, label: role === 'attack' ? 'TAKE CASE' : 'DEFEND' };
    case 'dropped': return { x: c.x, y: c.y, label: role === 'attack' ? 'TAKE CASE' : 'RETURN CASE' };
    case 'carried': return c.by === myId ? { ...padCenter(ext), label: 'EXTRACT' } : { x: c.x, y: c.y, label: role === 'attack' ? 'ESCORT' : 'STOP CARRIER' };
  }
}

/** The pill's centre: the round and its clock. */
export const roundLabel = (ext: ExtView, now: number): string =>
  `R${ext.round} · ${ext.roundEndsAt === null ? '--:--' : clock(Math.max(0, ext.roundEndsAt - now))}`;

export const sideTag = (ext: ExtView, team: ExtTeam): string => (team === ext.attackers ? 'ATK' : 'DEF');

export const firstTo = `First to ${EXT.roundsToWin}`;
