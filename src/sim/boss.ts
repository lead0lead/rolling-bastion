import { SPAWN } from '../config/balance';
import { BOSS } from '../config/enemies';
import { fireEnemyShot } from './combat';
import { spawnEnemy } from './spawner';
import { bossEnraged, cityCentre, type Enemy, type World } from './world';

/**
 * The Colossus's three phases (concept.md §4.3): summons, shot fans and
 * telegraphed charges. Runs every tick while the boss lives.
 */
export function updateBoss(w: World, dt: number): void {
  const boss = w.boss;
  if (!boss || boss.dead) return;
  const st = w.bossState;

  const frac = boss.hp / boss.maxHp;
  const phase = frac < BOSS.phaseAt[1] ? 3 : frac < BOSS.phaseAt[0] ? 2 : 1;
  if (phase !== 1 && phase > st.phase) enterPhase(w, phase);

  const addInterval = BOSS.addInterval[st.phase - 1] ?? 0;
  if (addInterval > 0) {
    st.addTimer -= dt;
    if (st.addTimer <= 0) {
      st.addTimer = addInterval;
      summonRing(w, boss);
    }
  }

  if (st.phase >= 2) {
    st.volleyTimer -= dt;
    if (st.volleyTimer <= 0) {
      st.volleyTimer = BOSS.volley.interval;
      volley(w, boss);
    }
  }

  if (st.phase === 3) updateCharge(w, boss, dt);
}

function enterPhase(w: World, phase: 2 | 3): void {
  const st = w.bossState;
  st.phase = phase;
  st.phaseAt = w.time;
  st.addTimer = BOSS.addInterval[phase - 1] ?? 0;
  st.volleyTimer = BOSS.volley.interval;
  if (phase === 3) {
    st.charge = 'walk';
    st.chargeTimer = BOSS.charge.rest;
  }
  shockwave(w);
  w.events.push({ kind: 'bossPhase', phase });
}

/** Pushes every enemy near the city outward, giving the player room (not the boss). */
function shockwave(w: World): void {
  const c = cityCentre(w);
  const { radius, push } = BOSS.shockwave;
  for (const e of w.enemies) {
    if (e === w.boss) continue;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d > radius) continue;
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    e.kvx += nx * push;
    e.kvy += ny * push;
  }
}

function summonRing(w: World, boss: Enemy): void {
  for (let i = 0; i < BOSS.addCount; i++) {
    const a = (i / BOSS.addCount) * Math.PI * 2;
    const r = boss.radius + SPAWN.clusterScatter;
    spawnEnemy(w, 'swarmer', boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r);
  }
}

/** A fan of shots centred on the city. */
function volley(w: World, boss: Enemy): void {
  const v = BOSS.volley;
  const c = cityCentre(w);
  const mid = Math.atan2(c.y - boss.y, c.x - boss.x);
  const spread = (v.spreadDeg * Math.PI) / 180;
  for (let i = 0; i < v.count; i++) {
    const f = v.count > 1 ? i / (v.count - 1) - 0.5 : 0;
    fireEnemyShot(w, boss.x, boss.y, mid + f * spread, v.speed, v.damage, v.range / v.speed);
  }
}

/** Phase 3: walk (rest) → telegraph toward the city → dash → walk… */
function updateCharge(w: World, boss: Enemy, dt: number): void {
  const st = w.bossState;
  const ch = BOSS.charge;
  st.chargeTimer -= dt;
  if (st.chargeTimer > 0) return;
  if (st.charge === 'walk') {
    const c = cityCentre(w);
    const d = Math.hypot(c.x - boss.x, c.y - boss.y) || 1;
    st.dirX = (c.x - boss.x) / d;
    st.dirY = (c.y - boss.y) / d;
    st.charge = 'telegraph';
    st.chargeTimer = ch.telegraph;
  } else if (st.charge === 'telegraph') {
    st.charge = 'dash';
    st.chargeTimer = ch.distance / ch.speed;
  } else {
    st.charge = 'walk';
    st.chargeTimer = ch.rest;
  }
}

/**
 * Boss movement while telegraphing (stands still) or dashing (straight line).
 * Returns false when it should walk like any other enemy.
 */
export function bossMove(w: World, e: Enemy, dt: number): boolean {
  const st = w.bossState;
  if (st.phase !== 3 || st.charge === 'walk') return false;
  e.px = e.x;
  e.py = e.y;
  if (st.charge === 'dash') {
    e.x += st.dirX * BOSS.charge.speed * dt;
    e.y += st.dirY * BOSS.charge.speed * dt;
  }
  return true;
}

/** Contact damage multiplier of the boss: enrage and dashing. */
export function bossContactFactor(w: World): number {
  const dash = w.bossState.phase === 3 && w.bossState.charge === 'dash';
  return (bossEnraged(w) ? BOSS.enrageDamage : 1) * (dash ? BOSS.charge.damage : 1);
}

/** Where the telegraphed charge will go (start and end), for the renderer; null if none. */
export function chargePath(
  w: World,
): { x0: number; y0: number; x1: number; y1: number; progress: number } | null {
  const boss = w.boss;
  const st = w.bossState;
  if (!boss || st.phase !== 3 || st.charge !== 'telegraph') return null;
  const d = BOSS.charge.distance;
  return {
    x0: boss.x,
    y0: boss.y,
    x1: boss.x + st.dirX * d,
    y1: boss.y + st.dirY * d,
    progress: 1 - st.chargeTimer / BOSS.charge.telegraph,
  };
}
