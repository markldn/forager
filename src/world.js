// World definition shared by physics and rendering. The noise here is bit-identical to the GLSL
// version in glsl.js (same integer hash), so the terrain the bee collides with is the terrain drawn.
import { clamp, smooth, lerp } from './math.js';

// SEED offsets the whole noise lattice: [0,0] is the film's world, anything else is a new meadow.
export const SEED = [0, 0];
export function hash(x, z) {
  x = (x + SEED[0]) | 0; z = (z + SEED[1]) | 0;
  let h = (Math.imul(x, 1597334677) ^ Math.imul(z, -482951495)) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, -2048144777) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, -1028477379) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}
// rotated octaves (same constants as GLSL)
export function fbm(x, z, o) {
  let s = 0, a = 0.5;
  for (let i = 0; i < o; i++) { s += a * vnoise(x, z); const nx = 1.6 * x + 1.2 * z + 17.3, nz = -1.2 * x + 1.6 * z + 9.1; x = nx; z = nz; a *= 0.5; }
  return s;
}

export const HIVE = [0, 0, 0];          // y filled in below
export const POND = [-95, 70], POND_R = 16;
export const PATCH = [262, -275];       // the danced patch: ~380 m away
export const OAK = [-9, 6];

function rawH(x, z) {
  let h = (fbm(x / 420, z / 420, 4) - 0.5) * 26;
  h += (fbm(x / 70 + 5, z / 70, 3) - 0.5) * 3.2;
  h += (vnoise(x / 6, z / 6) - 0.5) * 0.3;
  h += (vnoise(x / 0.7, z / 0.7) - 0.5) * 0.035;
  return h;
}
export const terrainConsts = { hiveBase: 0, pondBase: 0 };
export let WATER_Y = 0;
export const WORLD = { seed: 0, dom: 0, sec: 2, patchCol: [.5, .38, .04], tod: .34 };
export function height(x, z) {
  const { hiveBase, pondBase } = terrainConsts;
  let h = rawH(x, z);
  const dh = Math.hypot(x, z);
  h = lerp(hiveBase + (h - hiveBase) * 0.15, h, smooth(8, 40, dh));
  // pond: a level shore shelf, then a basin whose outline is warped by noise -> irregular natural shoreline
  const dp = Math.hypot(x - POND[0], z - POND[1]);
  h = lerp(pondBase + .35 + (h - pondBase) * .3, h, smooth(POND_R * 1.8, POND_R * 3.2, dp));
  const dw = dp * (1 + .45 * (vnoise(x / 9, z / 9) - .5) + .2 * (vnoise(x / 3.1, z / 3.1) - .5));
  h = lerp(pondBase - 1.6, h, smooth(POND_R * .3, POND_R * 1.15, dw));
  return h;
}

export function normalAt(x, z) {
  const e = 0.05, hx = height(x + e, z) - height(x - e, z), hz = height(x, z + e) - height(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz);
  return [-hx / l, 2 * e / l, -hz / l];
}

// ---- Flowers -------------------------------------------------------------------------------
// species: 0 rudbeckia, 1 poppy, 2 cornflower, 3 oxeye daisy, 4 white clover
export const CELL = 0.55;
export function flowerInCell(i, j) {
  const r = hash(i * 7 + 3, j * 13 + 1);
  const x = (i + 0.15 + 0.7 * hash(i, j + 911)) * CELL, z = (j + 0.15 + 0.7 * hash(i + 377, j)) * CELL;
  const dp = Math.hypot(x - PATCH[0], z - PATCH[1]);
  const dhv = Math.hypot(x, z);
  const field = fbm(x / 38 + 40, z / 38, 3);
  let dens = 0.045 + smooth(0.58, 0.72, field) * 0.45;       // wildflower clusters everywhere
  const inPatch = 1 - smooth(30, 60, dp);
  dens = Math.max(dens, inPatch * 0.9);
  const clover = smooth(0.55, 0.7, fbm(x / 9, z / 9 + 50, 2)) * (1 - smooth(20, 70, dhv)) * .6;
  if (Math.abs(x) < 1.6 && Math.abs(z) < 1.6) return null;  // clear around hive
  if (Math.hypot(x - POND[0], z - POND[1]) < POND_R * 2.2 && height(x, z) < WATER_Y + .08) return null;
  if (r > Math.max(dens, clover * 0.7)) return null;
  const s = hash(i + 51, j - 77);
  let sp;
  if (clover * 0.7 > dens && r < clover * 0.7) sp = 4;
  else if (inPatch > 0.3) sp = s < 0.55 ? WORLD.dom : s < 0.75 ? 1 : s < 0.9 ? WORLD.sec : 3;
  else { const f2 = fbm(x / 60, z / 60 + 9, 2); sp = f2 < 0.4 ? 1 : f2 < 0.5 ? 3 : f2 < 0.6 ? 2 : s < 0.5 ? 0 : 3; }
  return { x, z, y: height(x, z), sp, yaw: hash(i - 5, j + 5) * 6.2832, sc: 0.75 + 0.5 * hash(i + 9, j + 2),
    ph: hash(i + 2, j + 9) * 6.28, tilt: 0.15 + 0.4 * hash(i + 4, j + 4), nectar: 1, id: i * 100003 + j };
}

// Wind: one shared field, also evaluated in GLSL (windVec)
export function wind(x, z, t) {
  const g = Math.sin(x * 0.11 + t * 1.3) * 0.5 + Math.sin(z * 0.07 - t * 0.9 + x * 0.05) * 0.5;
  const gust = 0.35 + 0.65 * smooth(0.2, 0.9, vnoise(x / 25 + t * 0.12, z / 25));
  return [0.8 * gust * (0.6 + 0.4 * g), 0.45 * gust * (0.6 + 0.4 * g)];
}

// Trees (oaks/hawthorn) — landmarks matter to bees
export const TREES = [];
function buildTrees() {
  TREES.length = 0;
  TREES.push({ x: OAK[0], z: OAK[1], s: 1.25, yaw: 0.6 });
  const hedge = WORLD.seed ? hash(1, 99) * 3.14 : 0;
  for (let i = 0; i < 70; i++) {
    const a = hash(i, 4) * 6.283, d = 60 + hash(i, 9) * 900;
    let x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (i < 30) { const t = (i / 30) * 2 - 1, hx = -160 + t * 30 + hash(i, 1) * 8, hz = t * 600; x = hx * Math.cos(hedge) - hz * Math.sin(hedge); z = hx * Math.sin(hedge) + hz * Math.cos(hedge); }
    if (Math.hypot(x - PATCH[0], z - PATCH[1]) < 70 || Math.hypot(x - POND[0], z - POND[1]) < 40 || Math.hypot(x, z) < 25) continue;
    TREES.push({ x, z, s: 0.6 + hash(i, 7) * 0.7, yaw: hash(i, 3) * 6.28 });
  }
  for (const t of TREES) t.y = height(t.x, t.z);
}
// Seeded world: 0 = the film's meadow. Others move the noise lattice, the pond, the danced patch (direction,
// distance, dominant species), the oak, the hedgerow and the time of day.
export function setSeed(n) {
  WORLD.seed = n;
  if (!n) { SEED[0] = SEED[1] = 0; POND.splice(0, 2, -95, 70); PATCH.splice(0, 2, 262, -275); OAK.splice(0, 2, -9, 6); Object.assign(WORLD, { dom: 0, sec: 2, patchCol: [.5, .38, .04], tod: .34 }); }
  else {
    let a = n >>> 0; const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    SEED[0] = Math.floor(r() * 2e6) - 1e6; SEED[1] = Math.floor(r() * 2e6) - 1e6;
    const pa = r() * 6.283, pd = 70 + r() * 90, ba = pa + 1.2 + r() * 3.9, bd = 220 + r() * 300;
    POND.splice(0, 2, Math.cos(pa) * pd, Math.sin(pa) * pd); PATCH.splice(0, 2, Math.cos(ba) * bd, Math.sin(ba) * bd);
    const oa = r() * 6.283; OAK.splice(0, 2, Math.cos(oa) * (8 + r() * 6), Math.sin(oa) * (8 + r() * 6));
    const dom = [0, 0, 2, 3][Math.floor(r() * 4)], sec = [0, 2, 3, 4].filter(x => x !== dom)[Math.floor(r() * 3)];
    Object.assign(WORLD, { dom, sec, patchCol: { 0: [.5, .38, .04], 2: [.14, .22, .55], 3: [.62, .62, .56] }[dom], tod: .28 + r() * .3 });
  }
  terrainConsts.hiveBase = rawH(0, 0); terrainConsts.pondBase = rawH(POND[0], POND[1]) - 0.3; WATER_Y = terrainConsts.pondBase - .25;
  HIVE[1] = height(0, 0);
  buildTrees();
}
setSeed(0);

// Sun direction from time of day (0..1 = 05:00..21:00), mid-latitude summer.
export function sunDir(tod) {
  const a = (tod - 0.5) * Math.PI * 1.05;          // hour angle
  const el = Math.cos(a) * 1.0 - 0.12;              // elevation (rad-ish)
  const az = a * 1.15 + Math.PI;                    // sweeps east -> south -> west
  const ce = Math.cos(clamp(el, -0.3, 1.2));
  // +X east, -Z north: azimuth measured from north clockwise
  return norm3([Math.sin(az) * ce, Math.sin(clamp(el, -0.3, 1.2)), -Math.cos(az) * ce]);
}
function norm3(v) { const l = Math.hypot(...v); return v.map(c => c / l); }
