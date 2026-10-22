import { STATUS, type StatusType } from '../config/statuses';
import { TILES, type TileType } from '../config/tiles';
import type { CityState, PlacedTile } from '../sim/grid';
import { buffsReceived, type Synergies } from '../sim/synergies';
import { perk, typeLevel } from '../sim/upgrades';

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** Display names of enemy statuses (concept-v2.md §2.12). */
export const STATUS_NAMES: Record<StatusType, string> = {
  burning: 'Burning',
  snagged: 'Snagged',
  staggered: 'Staggered',
  marked: 'Marked',
};

/** "Applies: Marked · +50% vs Staggered" for a weapon type, or '' if it has no combo. */
export function comboLine(type: TileType): string {
  const combo = TILES[type].combo;
  if (!combo) return '';
  const parts: string[] = [];
  if (combo.applies) parts.push(`Applies: ${STATUS_NAMES[combo.applies]}`);
  if (combo.profitsFrom?.length) {
    const names = combo.profitsFrom.map((s) => STATUS_NAMES[s]).join(' or ');
    parts.push(`+${pct(STATUS.comboBonus)} vs ${names}`);
  }
  return parts.join(' · ');
}
const num = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/**
 * Tooltip for a placed tile (concept-v2.md §3.3): name, level and HP, what it
 * receives from neighbours and chains with numbers, and what it gives.
 */
export function tileDetails(city: CityState, syn: Synergies, t: PlacedTile): string {
  const def = TILES[t.type];
  const lines = [`${def.name} L${typeLevel(city, t.type)} — ${Math.ceil(t.hp)}/${t.maxHp} HP`];
  if (!t.online) lines.push('Offline: not connected to the Core');
  const combo = comboLine(t.type);
  if (combo) lines.push(combo);
  const mods = syn.mods.get(t.id);
  const got = buffsReceived(syn, t.id);
  const received: string[] = [];
  const times = (n: number) => `(×${n})`;
  if (got.generator) {
    const g = got.generator;
    const capped = mods && mods.fireRate - 1 < g.total - 1e-9;
    let line = `Generator +${pct(g.total)} fire rate ${times(g.count)}`;
    if (capped && mods) line += `, capped at +${pct(mods.fireRate - 1)}`;
    const dmg = perk(city, 'generator', 'neighbourDamage');
    if (dmg) line += `; +${pct(dmg.bonus * g.count)} damage`;
    received.push(line);
  }
  if (got.shield) {
    const s = got.shield;
    const capped = mods && 1 - mods.damageTaken < s.total - 1e-9;
    let line = `Shield −${pct(s.total)} damage taken ${times(s.count)}`;
    if (capped && mods) line += `, capped at −${pct(1 - mods.damageTaken)}`;
    received.push(line);
  }
  if (got.repair)
    received.push(`Repair Bay +${num(got.repair.total)} HP/s ${times(got.repair.count)}`);
  if (got.hull)
    received.push(`Hull bracing +${pct(got.hull.total)} max HP ${times(got.hull.count)}`);
  const chain = longestChainAt(syn, t);
  if (chain && mods) {
    const bonus = pct(mods.chainBonus);
    if (def.family === 'weapon') received.push(`Chain ×${chain} +${bonus} damage`);
    else if (t.type === 'generator')
      received.push(`Chain ×${chain} +${bonus} to its fire rate gift`);
    else if (t.type === 'engine') received.push(`Chain ×${chain} +${bonus} to its speed bonus`);
  }
  if (received.length) lines.push('Receives:', ...received.map((r) => `   ${r}`));
  const given = syn.links.filter((l) => l.from === t.id).length;
  if (given > 0) lines.push(`Buffs ${given} neighbour${given > 1 ? 's' : ''}`);
  return lines.join('\n');
}

/** Length of the longest chain the tile is part of, or 0. */
function longestChainAt(syn: Synergies, t: PlacedTile): number {
  let best = 0;
  for (const c of syn.chains) {
    const inX = t.gx >= Math.min(c.x0, c.x1) && t.gx <= Math.max(c.x0, c.x1);
    const inY = t.gy >= Math.min(c.y0, c.y1) && t.gy <= Math.max(c.y0, c.y1);
    if (inX && inY && c.type === t.type) best = Math.max(best, c.length);
  }
  return best;
}
