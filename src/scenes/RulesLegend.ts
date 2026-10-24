import Phaser from 'phaser';
import { LINES } from '../config/balance';
import { STATUS, type StatusType } from '../config/statuses';
import { STATUS_NAMES } from '../render/buffText';
import { TILES, type TileType } from '../config/tiles';
import { barrelFor } from '../render/icons';
import { drawBuffPips, drawPieceOutlines, drawSynergyLines } from '../render/lines';
import { COLORS, css, FONT } from '../render/palette';
import { TEX } from '../render/textures';
import { findBridges, updateOnline } from '../sim/connectivity';
import { createCity, facingAngle, type CityState } from '../sim/grid';
import { computeSynergies } from '../sim/synergies';

/** Panel size and layout (screen px) of the rules legend (concept-v2.md §3.3). */
const PANEL = { w: 820, h: 620, pad: 28, cell: 30, exampleW: 210, rowH: 104, titleH: 44 };

/** Example tiles per character; each character is its own group. */
const CHARS: Record<string, TileType> = {
  C: 'core',
  g: 'gatling',
  e: 'generator',
  d: 'shield',
  r: 'repair',
  h: 'hull',
  H: 'hull',
  f: 'flamethrower',
};

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** A small city from an ASCII picture, online state worked out. */
function exampleCity(rows: string[]): CityState {
  const city = createCity(1);
  city.tiles = [];
  const groups = new Map<string, number>();
  rows.forEach((row, gy) =>
    [...row].forEach((ch, gx) => {
      const type = CHARS[ch];
      if (!type) return;
      let groupId = groups.get(ch);
      if (groupId === undefined) groups.set(ch, (groupId = city.nextGroupId++));
      const maxHp = TILES[type].maxHp;
      city.tiles.push({
        id: city.nextTileId++,
        type,
        gx,
        gy,
        hp: maxHp,
        maxHp,
        groupId,
        online: false,
        facing: 0,
      });
    }),
  );
  updateOnline(city);
  return city;
}

/** One line per status: who applies it, what it does, who profits (from config). */
function comboText(): string {
  const types = Object.keys(TILES) as TileType[];
  const names = (list: TileType[]) => list.map((t) => TILES[t].name).join(', ');
  const effect: Record<StatusType, string> = {
    burning: 'burns',
    snagged: 'slowed',
    staggered: 'stopped',
    marked: '',
  };
  const lines = (Object.keys(STATUS_NAMES) as StatusType[]).map((s) => {
    const by = types.filter((t) => TILES[t].combo?.applies === s);
    const profit = types.filter((t) => TILES[t].combo?.profitsFrom?.includes(s));
    const what = effect[s] ? ` (${effect[s]})` : '';
    return `${names(by)} → ${STATUS_NAMES[s]}${what} → ${names(profit)}`;
  });
  return (
    `Combos: weapons put a status on enemies they hit; others deal +${pct(STATUS.comboBonus)} ` +
    `to them.\n${lines.join('\n')}`
  );
}

function sections(): { rows: string[]; bridges?: boolean; text: string }[] {
  const gen = TILES.generator.support;
  const shield = TILES.shield.support;
  const repair = TILES.repair.support;
  const step = LINES.chainBonusStep;
  return [
    {
      rows: ['Cggg'],
      text:
        `Chains: ${LINES.chainMin} or more identical tiles in a straight line, facing the same way, ` +
        `get +${pct(step)} / +${pct(2 * step)} / +${pct(LINES.chainMaxBonus)} for ` +
        `${LINES.chainMin} / ${LINES.chainMin + 1} / ${LINES.chainMin + 2}+. Weapons gain damage. ` +
        'Generators and Engines chain too (facing ignored), boosting their own effect. ' +
        'Mortars and Crossbows ignore facing.',
    },
    {
      rows: ['dg.', 'Ceg', '.gr'],
      text:
        `Neighbour buffs: Generators give the 4 tiles next to them +${pct(gen?.amount ?? 0)} fire rate ` +
        `(cap +${pct(gen?.cap ?? 0)}), Shield Emitters −${pct(shield?.amount ?? 0)} damage taken ` +
        `(cap −${pct(shield?.cap ?? 0)}), Repair Bays ${repair?.amount ?? 0} HP/s. ` +
        'A coloured pip per buff type shows what a tile gets. Hover a tile for the numbers.',
    },
    {
      rows: ['Chh.h'],
      bridges: true,
      text:
        'Connected or useless: every tile must link to the Core. A bridge (ringed; B shows all) ' +
        'holds other tiles on, and losing it cuts them off. Offline tiles (grey) do nothing.',
    },
    {
      rows: ['gfC'],
      text: comboText(),
    },
    {
      rows: ['ChhH', '.hHH'],
      text:
        'Pieces: a thick dark line marks where a piece ends, a thin seam joins the tiles of ' +
        'one piece.',
    },
  ];
}

/**
 * The rules legend in the build screen (? or H): one panel listing chains,
 * neighbour buffs, bridges and offline tiles, and piece outlines, each with a
 * small drawn example (concept-v2.md §3.3).
 */
export class RulesLegend {
  private readonly container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, layer: Phaser.GameObjects.Layer, cx: number, cy: number) {
    const x0 = cx - PANEL.w / 2;
    const y0 = cy - PANEL.h / 2;
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.ink, 0.25);
    bg.fillRect(0, 0, scene.scale.width, scene.scale.height);
    bg.fillStyle(COLORS.panel, 1);
    bg.fillRoundedRect(x0, y0, PANEL.w, PANEL.h, 14);
    bg.lineStyle(2, COLORS.panelBorder, 1);
    bg.strokeRoundedRect(x0, y0, PANEL.w, PANEL.h, 14);
    const items: Phaser.GameObjects.GameObject[] = [bg];
    const textStyle = {
      fontFamily: FONT.family,
      fontStyle: FONT.weight,
      fontSize: '15px',
      color: COLORS.text,
      lineSpacing: 4,
    };
    items.push(
      scene.add.text(x0 + PANEL.pad, y0 + PANEL.pad - 6, 'Rules', {
        ...textStyle,
        fontStyle: FONT.bold,
        fontSize: '22px',
      }),
      scene.add
        .text(x0 + PANEL.w - PANEL.pad, y0 + PANEL.pad, 'H, ? or Esc closes', {
          ...textStyle,
          fontSize: '13px',
          color: css(COLORS.boardEdge),
        })
        .setOrigin(1, 0),
    );

    const g = scene.add.graphics();
    const overlay = scene.add.graphics();
    const cs = PANEL.cell;
    sections().forEach((sec, i) => {
      const top = y0 + PANEL.pad + PANEL.titleH + i * PANEL.rowH;
      const city = exampleCity(sec.rows);
      const syn = computeSynergies(city);
      const width = Math.max(...sec.rows.map((r) => r.length)) * cs;
      const ox = x0 + PANEL.pad + (PANEL.exampleW - width) / 2;
      const oy = top + (PANEL.rowH - 12 - sec.rows.length * cs) / 2;
      for (const t of city.tiles) {
        const tx = ox + (t.gx + 0.5) * cs;
        const ty = oy + (t.gy + 0.5) * cs;
        items.push(scene.add.image(tx, ty, TEX.tile(t.type, !t.online)).setDisplaySize(cs, cs));
        const barrel = barrelFor(t.type);
        if (barrel) {
          const img = scene.add
            .image(tx, ty, TEX.barrel(barrel))
            .setDisplaySize(cs, cs)
            .setRotation(facingAngle(t.facing));
          if (!t.online) img.setTint(COLORS.offline);
          items.push(img);
        }
      }
      drawPieceOutlines(overlay, city.tiles, cs, ox, oy, 1);
      drawSynergyLines(overlay, syn.chains, cs, ox, oy);
      drawBuffPips(overlay, city.tiles, syn, cs, ox, oy);
      if (sec.bridges) {
        const bridges = findBridges(city);
        overlay.lineStyle(3, COLORS.bridge, 1);
        for (const t of city.tiles) {
          if (bridges.has(t.id))
            overlay.strokeCircle(ox + (t.gx + 0.5) * cs, oy + (t.gy + 0.5) * cs, cs * 0.34);
        }
      }
      items.push(
        scene.add.text(x0 + PANEL.pad + PANEL.exampleW + 16, top, sec.text, {
          ...textStyle,
          wordWrap: { width: PANEL.w - 2 * PANEL.pad - PANEL.exampleW - 16 },
        }),
      );
      if (i > 0) {
        g.lineStyle(1, COLORS.panelBorder, 1);
        g.lineBetween(x0 + PANEL.pad, top - 10, x0 + PANEL.w - PANEL.pad, top - 10);
      }
    });
    items.push(g, overlay);
    this.container = scene.add.container(0, 0, items).setDepth(40).setVisible(false);
    layer.add(this.container);
  }

  get visible(): boolean {
    return this.container.visible;
  }

  setVisible(on: boolean): void {
    this.container.setVisible(on);
  }
}
