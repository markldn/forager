// Agents, flowers and light. The renderer only sees flat Float32Arrays built here.
import { add, sub, scl, norm, cross, dot, len, lerp, clamp, smooth, mix3, basis } from './math.js';
import { CELL, flowerInCell, height, wind, sunDir, hash, HIVE, PATCH } from './world.js';
import { FLOWER_INFO, COMB } from './render.js';

export const BEE_S = .013;                      // 13 mm worker
export const ENTRANCE = [HIVE[0], HIVE[1] + .348, HIVE[2] + .215];
export const LANDING = [HIVE[0], HIVE[1] + .342, HIVE[2] + .28];
export function syncHive() { ENTRANCE[1] = HIVE[1] + .348; LANDING[1] = HIVE[1] + .342; }

// ------------------------------------------------------------------ light model
export function light(tod, inside) {
  const sun = sunDir(tod), sy = Math.max(sun[1], 0);
  const m = Math.min(1 / (sy + .025 * Math.exp(-11 * sy)), 38), day = smooth(-.06, .08, sun[1]);
  const ex = k => Math.exp(-k * m);
  const skyI = .04 + .96 * smooth(-.12, .35, sun[1]), dusk = 1 - smooth(.0, .3, sun[1]);
  const L = {
    uSun: sun,
    uSunC: [3.3 * ex(.03), 3.05 * ex(.07), 2.75 * ex(.16)].map(x => x * day),
    uBSun: [3.0 * ex(.07), 2.5 * ex(.15), 1.5 * ex(.32)].map(x => x * day),
    uSkyZ: mix3([.11, .25, .62], [.12, .17, .35], dusk).map(x => x * skyI),
    uSkyH: mix3([.48, .6, .78], [1.05, .62, .36], dusk * .9).map(x => x * skyI),
    uBSkyZ: mix3([.2, .5, 1.25], [.2, .35, .6], dusk).map(x => x * skyI),
    uBSkyH: mix3([.5, .72, 1.05], [.9, .6, .45], dusk * .9).map(x => x * skyI),
    uGndC: [.09, .1, .045].map(x => x * (skyI * .7 + day * .5)), uBGnd: [.1, .03, .02].map(x => x * (skyI * .7 + day * .5)),
    uLampP: [0, -1e4, 0], uLampC: [0, 0, 0], uFogD: .00045, uT: 0
  };
  if (inside) Object.assign(L, {
    uSunC: [0, 0, 0], uBSun: [0, 0, 0], uSkyZ: [.012, .008, .004], uSkyH: [.0, .0, .0], uGndC: [.02, .012, .005],
    uBSkyZ: [.01, .006, .004], uBSkyH: [0, 0, 0], uBGnd: [.012, .006, .003],
    uLampP: add(COMB.origin, [.16, -.06, .12]), uLampC: [3.2, 2.6, 1.9], uFogD: 1.6
  });
  return L;
}

// ------------------------------------------------------------------ flowers
export class Flowers {
  constructor() { this.cache = new Map(); this.list = []; this.c = [1e9, 0, 1e9]; this.R = 50; this.dirty = true; }
  cell(i, j) { const k = i * 65536 + j; let f = this.cache.get(k); if (f === undefined) { f = flowerInCell(i, j); this.cache.set(k, f); } return f; }
  update(p) {
    if (Math.hypot(p[0] - this.c[0], p[2] - this.c[2]) < 2.5 && !this.dirty) return null;
    if (this.cache.size > 400000) this.cache.clear();
    this.c = p.slice(); this.dirty = false;
    const R = this.R, i0 = Math.floor((p[0] - R) / CELL), i1 = Math.floor((p[0] + R) / CELL), j0 = Math.floor((p[2] - R) / CELL), j1 = Math.floor((p[2] + R) / CELL);
    const out = [0, 1, 2, 3, 4].map(() => [[], []]); this.list = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const f = this.cell(i, j); if (!f) continue;
      const d = Math.hypot(f.x - p[0], f.z - p[2]); if (d > R) continue;
      this.list.push(f);
      out[f.sp][d < 9 ? 0 : 1].push(f.x, f.y, f.z, f.yaw, f.sc, f.ph, f.nectar, f.tilt);
    }
    return out.map(a => a.map(x => new Float32Array(x)));
  }
  head(f, t) { // world-space head (landing) point incl. the same sway as the vertex shader
    const I = FLOWER_INFO[f.sp], c = Math.cos(f.yaw), s = Math.sin(f.yaw);
    const hx = I.head[0] * f.sc, hz = I.head[2] * f.sc;
    const w = wind(f.x, f.z, t); const wx = w[0] * .45 + Math.sin(t * 1.7 + f.ph) * .05, wz = w[1] * .45 + Math.cos(t * 1.3 + f.ph) * .05;
    const H = I.H * f.sc;
    return [f.x + c * hx - s * hz + wx * H, f.y + I.head[1] * f.sc - (wx * wx + wz * wz) * H * .3, f.z + s * hx + c * hz + wz * H];
  }
  up(f) { const I = FLOWER_INFO[f.sp], c = Math.cos(f.yaw), s = Math.sin(f.yaw); return [c * I.up[0] - s * I.up[2], I.up[1], s * I.up[0] + c * I.up[2]]; }
  near(p, r, pred) { let best = null, bd = r; for (const f of this.list) { if (pred && !pred(f)) continue; const d = Math.hypot(f.x - p[0], f.z - p[2]); if (d < bd) { bd = d; best = f; } } return best; }
  some(p, r, n, pred) { return this.list.filter(f => Math.hypot(f.x - p[0], f.z - p[2]) < r && (!pred || pred(f))).sort(() => Math.random() - .5).slice(0, n); }
}
export const hasSpider = f => f.sp === 3 && hash(f.id, 42) < .12;
export const NECTAR = [.22, 0, .16, .12, .3];   // poppies give pollen only

// ------------------------------------------------------------------ bee agent
export class Bee {
  constructor(pos, seed = Math.random()) {
    this.pos = pos.slice(); this.vel = [0, 0, 0]; this.fwd = [0, 0, 1]; this.up = [0, 1, 0];
    this.land = 0; this.pollen = 0; this.waggle = 0; this.pump = .4; this.prob = 0; this.walk = 0; this.seed = seed; this.gait = 0; this.kind = 0;
    this.wing = seed * 100; this.state = 'fly'; this.t = 0; this.tgt = null; this.flower = null; this.scale = BEE_S;
  }
  // flight attitude from velocity
  orient(dt, accel = [0, 0, 0]) {
    const sp = len(this.vel);
    if (sp > .15) {
      const h = norm([this.vel[0], 0, this.vel[2]]); const pitch = clamp(.45 - sp * .06, .05, .45) + clamp(this.vel[1] / (sp + .5), -.4, .4) * .6;
      const f = norm(add(scl(h, Math.cos(pitch)), [0, Math.sin(pitch), 0]));
      this.fwd = norm(mix3(this.fwd, f, clamp(dt * 6, 0, 1)));
      const right = norm(cross([0, 1, 0], h)), bank = clamp(dot(accel, right) * -.05, -.7, .7);
      this.up = norm(mix3(this.up, add([0, 1, 0], scl(right, bank)), clamp(dt * 5, 0, 1)));
    } else {
      const h = norm([this.fwd[0], 0, this.fwd[2]]); this.fwd = norm(mix3(this.fwd, norm(add(h, [0, .55, 0])), clamp(dt * 3, 0, 1)));
      this.up = norm(mix3(this.up, [0, 1, 0], clamp(dt * 3, 0, 1)));
    }
  }
  step(dt, slow = 1) { this.wing = (this.wing + dt * slow * 6.2832 * 230) % 6.2832; }
  row(out, o) {
    const m = basis(this.pos, this.fwd, this.up, this.scale); m[3] = this.kind; m[7] = this.gdir || 0; out.set(m, o);
    out.set([this.wing, this.land, this.pollen, this.waggle, this.pump, this.prob, this.walk, this.gait], o + 16);
  }
}
export function packRows(list) { const a = new Float32Array(list.length * 24); list.forEach((b, i) => b.row(a, i * 24)); return a; }

// NPC forager: flies flower -> flower, lands, drinks, leaves
export function npcStep(b, dt, t, flowers, home) {
  b.step(dt); b.t -= dt;
  b.onFlower = b.state === 'land';
  if (b.state === 'land') {
    b.land = Math.min(1, b.land + dt * 4); b.prob = Math.min(1, b.prob + dt * 2);
    if (b.flower) { const h = flowers.head(b.flower, t), u = flowers.up(b.flower); b.pos = add(h, scl(u, .0022)); b.up = mix3(b.up, u, .1); b.fwd = norm(cross(b.up, cross([Math.cos(b.seed * 9 + t * .3), 0, Math.sin(b.seed * 9 + t * .3)], b.up)).map(x => -x)); }
    b.pollen = Math.min(1, b.pollen + dt * .03);
    if (b.t < 0) { b.state = 'fly'; b.flower = null; b.tgt = null; b.vel = add(scl(b.up, .6), [0, .3, 0]); }
    return;
  }
  b.land = Math.max(0, b.land - dt * 5); b.prob = Math.max(0, b.prob - dt * 3);
  if (!b.tgt || b.t < 0) {
    if (home && Math.random() < .35) { b.tgt = { p: ENTRANCE.slice(), home: 1 }; }
    else { const f = flowers.some(b.pos, 7, 1, f => !hasSpider(f))[0]; b.tgt = f ? { f } : { p: add(b.pos, [(Math.random() - .5) * 6, Math.random() * .5, (Math.random() - .5) * 6]) }; }
    b.t = 12;
  }
  const tp = b.tgt.f ? flowers.head(b.tgt.f, t) : b.tgt.p;
  const d = sub(tp, b.pos), dist = len(d);
  if (b.tgt.f && dist < .02) { b.state = 'land'; b.flower = b.tgt.f; b.t = 2 + Math.random() * 5; b.vel = [0, 0, 0]; return; }
  if (b.tgt.home && dist < .03) { b.pos = add(ENTRANCE, [(Math.random() - .5) * .1, .2, .6]); b.tgt = null; return; }
  // final approach: wander jitter fades out and she slows, so she can actually touch down (jitter > tolerance = endless circling)
  const near = b.tgt.f ? clamp(dist / .25, 0, 1) : 1, sp = clamp(dist * 2.2, .06 + .19 * near, 4.5), jit = .3 * near;
  const want = add(scl(norm(d), sp), [Math.sin(t * 3 + b.seed * 40) * jit, Math.sin(t * 2.3 + b.seed * 20) * jit * .5, Math.cos(t * 2.7 + b.seed * 30) * jit]);
  const acc = scl(sub(want, b.vel), clamp(dt * (3 + 6 * (1 - near)), 0, 1));
  b.vel = add(b.vel, acc);
  b.pos = add(b.pos, scl(b.vel, dt));
  const gy = height(b.pos[0], b.pos[2]) + .02; if (b.pos[1] < gy) { b.pos[1] = gy; b.vel[1] = Math.abs(b.vel[1]); }
  b.orient(dt, scl(acc, 1 / Math.max(dt, 1e-3)));
}

// ------------------------------------------------------------------ hive interior (bees on a vertical comb)
export function combPos(x, y, lift = .0022) { return add(COMB.origin, [x, y, lift]); }
// Bees on the comb: stop-and-go walkers with bodies. Each bee is two circles (head+thorax, abdomen) and the
// crowd resolves overlaps every frame, so they jostle instead of passing through each other. Real workers on comb
// walk in short bursts (~1-3 cm/s), pause, and turn on the spot; dance followers walk to keep facing the dancer.
const turnTo = (h, g, k) => h + Math.atan2(Math.sin(g - h), Math.cos(g - h)) * Math.min(1, k);
export class CombCrowd {
  constructor(n, nFollow = 0) {
    this.b = []; this.nf = nFollow;
    const cw = COMB.cols * COMB.w, chh = COMB.rows * COMB.w * .866;
    for (let i = 0; i < n; i++) {
      const b = new Bee([0, 0, 0], Math.random()); b.land = 1;
      for (let k = 0; k < 40; k++) { b.cx = .01 + Math.random() * (cw - .02); b.cy = .01 + Math.random() * (chh - .02); if (this.b.every(o => Math.hypot(o.cx - b.cx, o.cy - b.cy) > .013)) break; }
      Object.assign(b, { h: Math.random() * 6.28, v: 0, want: 0, spin: 0, st: 'pause', tm: Math.random() * 2, fi: i, follow: i < nFollow, still: i >= nFollow && Math.random() < .25 });
      this.b.push(b);
    }
    this.cw = cw; this.ch = chh;
  }
  step(dt, t, obstacles = [], dancer = null) {
    const B = this.b, R = .0034;
    for (const b of B) {
      b.step(dt); b.wing = 0;
      if (b.follow && dancer) { // stay ~1.2 body lengths from the dancer, facing her
        const a = dancer.h + Math.PI + (b.fi - (this.nf - 1) / 2) * .8, tx = dancer.x + Math.sin(a) * .017, ty = dancer.y + Math.cos(a) * .017;
        const dx = tx - b.cx, dy = ty - b.cy, d = Math.hypot(dx, dy);
        if (d > .004) { // walk there head-first (insects mostly walk forwards), slowing while still turning
          const g = Math.atan2(dx, dy); b.h = turnTo(b.h, g, dt * 7); const al = Math.cos(Math.atan2(Math.sin(g - b.h), Math.cos(g - b.h)));
          const sp = Math.min(d * 5, .03) * Math.max(0, al); b.cx += Math.sin(b.h) * sp * dt; b.cy += Math.cos(b.h) * sp * dt;
        } else b.h = turnTo(b.h, Math.atan2(dancer.x - b.cx, dancer.y - b.cy), dt * 5);
        b.v = 0;
      } else {
        if ((b.tm -= dt) < 0) {
          const r = Math.random();
          if (b.still) { b.st = r < .2 ? 'turn' : 'pause'; b.want = 0; b.spin = b.st === 'turn' ? (Math.random() < .5 ? -1.5 : 1.5) : 0; b.tm = b.st === 'turn' ? .4 : 1 + Math.random() * 4; }
          else if (r < .55) { b.st = 'walk'; b.want = .012 + .015 * Math.random(); b.tm = .4 + 2 * Math.random(); b.spin = (Math.random() - .5) * 1.2; }
          else if (r < .87) { b.st = 'pause'; b.want = 0; b.tm = .4 + 2.5 * Math.random(); b.spin = 0; }
          else { b.st = 'turn'; b.want = 0; b.spin = (Math.random() < .5 ? -1 : 1) * (2 + 2 * Math.random()); b.tm = .3 + .6 * Math.random(); }
        }
        if (b.st === 'walk') for (const o of B) { // somebody right ahead: stop and turn away before touching
          if (o === b) continue; const ox = o.cx - b.cx, oy = o.cy - b.cy, od = Math.hypot(ox, oy);
          if (od < .0115 && (ox * Math.sin(b.h) + oy * Math.cos(b.h)) > od * .55) { b.st = 'turn'; b.want = 0; b.spin = (ox * Math.cos(b.h) - oy * Math.sin(b.h) > 0 ? 1 : -1) * 3; b.tm = .3 + Math.random() * .4; break; }
        }
        b.v += (b.want - b.v) * Math.min(1, dt * 8);
        b.h += (b.spin + (b.st === 'walk' ? Math.sin(t * 2.3 + b.seed * 40) * .6 : 0)) * dt;
        b.cx += Math.sin(b.h) * b.v * dt; b.cy += Math.cos(b.h) * b.v * dt;
      }
      if (b.cx < .008 || b.cx > this.cw - .008 || b.cy < .008 || b.cy > this.ch - .008) {
        b.cx = clamp(b.cx, .008, this.cw - .008); b.cy = clamp(b.cy, .008, this.ch - .008);
        if (b.st === 'walk') { b.st = 'turn'; b.want = 0; b.spin = 3; b.tm = .6; }
      }
    }
    // bodies: two circles per bee; pairwise separation (cheap at a few hundred bees)
    const circ = (x, y, h) => [[x + Math.sin(h) * .0032, y + Math.cos(h) * .0032], [x - Math.sin(h) * .0038, y - Math.cos(h) * .0038]];
    const tot = B.map(() => [0, 0]);
    for (let it = 0; it < 3; it++) { // position-based separation, three full passes
      const C = B.map(b => circ(b.cx, b.cy, b.h)), push = B.map(() => [0, 0]);
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
        if (Math.abs(B[i].cx - B[j].cx) > .016 || Math.abs(B[i].cy - B[j].cy) > .016) continue;
        for (const p of C[i]) for (const q of C[j]) {
          const dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy);
          if (d < 2 * R && d > 1e-6) { const o = (2 * R - d) / d * .5; push[i][0] += dx * o; push[i][1] += dy * o; push[j][0] -= dx * o; push[j][1] -= dy * o; }
        }
      }
      for (const ob of obstacles) { const oc = circ(ob.x, ob.y, ob.h);
        B.forEach((b, i) => { if (Math.abs(b.cx - ob.x) > .02 || Math.abs(b.cy - ob.y) > .02) return;
          for (const p of C[i]) for (const q of oc) { const dx = p[0] - q[0], dy = p[1] - q[1], d = Math.hypot(dx, dy); if (d < 2.1 * R && d > 1e-6) { const o = (2.1 * R - d) / d; push[i][0] += dx * o; push[i][1] += dy * o; } } }); }
      B.forEach((b, i) => { const l = Math.hypot(push[i][0], push[i][1]), m = Math.min(1, .003 / Math.max(l, 1e-9)); b.cx += push[i][0] * m; b.cy += push[i][1] * m; tot[i][0] += push[i][0] * m; tot[i][1] += push[i][1] * m; });
    }
    B.forEach((b, i) => {
      const [px, py] = tot[i];
      // walked into someone: stop and turn away
      if (b.st === 'walk' && (px * Math.sin(b.h) + py * Math.cos(b.h)) < -.0003) { b.st = 'turn'; b.want = 0; b.v *= .3; b.spin = (px * Math.cos(b.h) - py * Math.sin(b.h) > 0 ? 1 : -1) * 3; b.tm = .25 + Math.random() * .4; }
      b.pos = combPos(b.cx, b.cy); b.up = [0, 0, 1]; b.fwd = [Math.sin(b.h), Math.cos(b.h), 0];
    });
  }
}
// waggle dance: run direction a (rad from vertical, + = clockwise/right), run seconds rs. Figure-of-eight:
// a straight waggle run, then a semicircular return alternately to the right and left.
export function dancePose(t, a, rs, cx, cy) {
  const P = tt => {
    const loop = rs + 1.1, k = Math.floor(tt / loop), u = tt - k * loop, side = k % 2 ? 1 : -1;
    const L = .006 + rs * .03, dir = [Math.sin(a), Math.cos(a)], rt = [dir[1], -dir[0]];
    if (u < rs) { const s = u / rs - .5; return [cx + dir[0] * s * L, cy + dir[1] * s * L, 1]; }
    const th = Math.PI * (u - rs) / 1.1, c = Math.cos(th) * L * .5, sn = Math.sin(th) * L * .5 * side;
    return [cx + dir[0] * c + rt[0] * sn, cy + dir[1] * c + rt[1] * sn, 0];
  };
  const p = P(t), q = P(t + .03);
  return { x: p[0], y: p[1], h: Math.atan2(q[0] - p[0], q[1] - p[1]), wag: p[2] };
}

// Gait driven by real displacement: one tripod cycle = two stances = 4 x 0.085 body lengths of travel, so stance feet stay planted.
export function gaitStep(bees, dt) {
  for (const b of bees) {
    const d = b._lp ? len(sub(b.pos, b._lp)) : 0; b._lp = b.pos.slice();
    const rot = b._lf ? Math.acos(clamp(dot(b.fwd, b._lf), -1, 1)) : 0; b._lf = b.fwd.slice();
    const walking = b.land > .5 && !b.onFlower && d < .05;
    if (walking && d > 1e-6 && b._lp0) { // direction of travel in the body frame -> legs side-step when shoved sideways
      const dv = sub(b.pos, b._lp0), x = cross(b.up, b.fwd), ga = Math.atan2(dot(dv, x), dot(dv, b.fwd));
      b.gdir = (b.gdir || 0) + Math.atan2(Math.sin(ga - (b.gdir || 0)), Math.cos(ga - (b.gdir || 0))) * Math.min(1, dt * 12);
    }
    b._lp0 = b.pos.slice();
    // one cycle = two tripod stances = 4 x 0.06 body lengths of travel; turning on the spot also steps (~2.5 cycles per turn)
    if (walking) b.walk = (b.walk + 6.2832 * d / (.24 * b.scale) + rot * 2.5) % 6.2832;
    const sp = walking ? d / Math.max(dt, 1e-3) : 0, rs = walking ? rot / Math.max(dt, 1e-3) : 0;
    b.gait += ((sp > .0015 || rs > .6 ? 1 : 0) - b.gait) * Math.min(1, dt * 12);
  }
}
