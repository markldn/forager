// Procedural geometry. Everything is a parametric surface or a tube.
// Vertex layout (all meshes): P pos, Q alt pose pos, N normal, V pivot, C (rgb, uv-reflectance), M (u, v, part/mat, extra)
import { add, sub, scl, norm, cross, dot, len, lerp, clamp } from './math.js';
import { hash } from './world.js';
const PI = Math.PI, TAU = PI * 2;

export class Geo {
  constructor() { this.P = []; this.Q = []; this.N = []; this.V = []; this.C = []; this.M = []; this.I = []; this.n = 0; }
  vert(p, n, c, m, q = p, v = [0, 0, 0]) { this.P.push(...p); this.Q.push(...q); this.N.push(...n); this.V.push(...v); this.C.push(...c); this.M.push(...m); return this.n++; }
  tri(a, b, c) { this.I.push(a, b, c); }
}

// grid surface: fn(u,v) -> {p, c, m, q?, v?}; normals by central differences of p (and N = dPu x dPv)
export function surf(g, nu, nv, fn, o = {}) {
  const base = g.n, e = 1e-3;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = i / nu, v = j / nv, r = fn(u, v);
    const pu = sub(fn(Math.min(u + e, 1), v).p, fn(Math.max(u - e, 0), v).p), pv = sub(fn(u, Math.min(v + e, 1)).p, fn(u, Math.max(v - e, 0)).p);
    let n = cross(pu, pv); if (len(n) < 1e-12) n = o.pole ? sub(r.p, o.center) : [0, 1, 0]; n = norm(n);
    if (o.center && dot(n, sub(r.p, o.center)) < 0) n = scl(n, -1);
    if (o.flip) n = scl(n, -1);
    g.vert(r.p, n, r.c, r.m, r.q || r.p, r.v || [0, 0, 0]);
  }
  const W = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = base + j * W + i, b = a + 1, c = a + W + 1, d = a + W;
    g.tri(a, b, c); g.tri(a, c, d);
  }
}
// ellipsoid around c with radii r; fn(u,v,p) -> {c, m}; u = longitude along z axis (0 back pole .. 1 front pole)
export function ellip(g, c, r, nu, nv, fn, warp) {
  surf(g, nu, nv, (u, v) => {
    const th = PI * u, ph = TAU * v;
    let p = [c[0] + r[0] * Math.sin(th) * Math.cos(ph), c[1] + r[1] * Math.sin(th) * Math.sin(ph), c[2] - r[2] * Math.cos(th)];
    if (warp) p = warp(p, u, v);
    return { p, ...fn(u, v, p) };
  }, { center: c, pole: true });
}
function frame(t) { const up = Math.abs(t[1]) < .9 ? [0, 1, 0] : [1, 0, 0]; const b = norm(cross(t, up)); return [b, cross(b, t)]; }
// tube through points A (and optionally pose B with identical topology)
export function tube(g, A, B, rad, seg, fn) {
  B = B || A; const n = A.length, base = g.n;
  const ringPts = (pts, i) => { const t = norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])); return frame(t); };
  for (let i = 0; i < n; i++) {
    const [ba, na] = ringPts(A, i), [bb, nb] = ringPts(B, i), r = typeof rad === 'function' ? rad(i / (n - 1)) : rad;
    for (let k = 0; k <= seg; k++) {
      const a = TAU * k / seg, ca = Math.cos(a), sa = Math.sin(a);
      const dA = add(scl(ba, ca), scl(na, sa)), dB = add(scl(bb, ca), scl(nb, sa));
      const at = fn(i / (n - 1), k / seg);
      g.vert(add(A[i], scl(dA, r)), dA, at.c, at.m, add(B[i], scl(dB, r)), at.v || [0, 0, 0]);
    }
  }
  const W = seg + 1;
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < seg; k++) { const a = base + i * W + k; g.tri(a, a + W, a + W + 1); g.tri(a, a + W + 1, a + 1); }
}
const bez = (P, t) => { let p = P.map(x => x.slice()); while (p.length > 1) p = p.slice(1).map((q, i) => q.map((x, k) => lerp(p[i][k], x, t))); return p[0]; };
const curve = (P, n) => Array.from({ length: n }, (_, i) => bez(P, i / (n - 1)));

// ============================================================= HONEYBEE (body length 1, +z forward)
export function beeMesh(det = 1) {
  const g = new Geo(), q = det ? 1 : .5, R = x => Math.max(3, Math.round(x * q));
  const black = [.04, .03, .025, .03], hairT = [.36, .26, .14, .03];
  // thorax
  ellip(g, [0, .02, .14], [.15, .145, .17], R(14), R(18), () => ({ c: [.07, .05, .03, .03], m: [0, 0, 1, .032] }));
  // head (wider at top, flattened front-back)
  ellip(g, [0, .02, .37], [.13, .13, .085], R(12), R(16), () => ({ c: [.05, .04, .03, .03], m: [0, 0, 0, .014] }),
    (p) => [p[0] * (1 + .25 * (p[1] - .02) / .13), p[1], p[2]]);
  // compound eyes (~5500 ommatidia each) and three ocelli
  for (const s of [-1, 1]) ellip(g, [s * .108, .045, .372], [.058, .122, .075], R(10), R(14), (u, v) => ({ c: [.05, .04, .03, .08], m: [u, v, 3, 0] }));
  for (const [x, z] of [[0, .41], [-.035, .385], [.035, .385]]) ellip(g, [x, .145, z], [.016, .016, .016], 5, 6, () => ({ c: [.02, .02, .02, .1], m: [0, 0, 0, 0] }));
  // abdomen: 6 tergites, slightly curved down, pivot at petiole
  const piv = [0, .0, -.02];
  surf(g, R(18), R(18), (u, v) => {
    const t = u, z = -.03 - t * .62, r = .158 * Math.pow(Math.sin(PI * (t * .88 + .1)), .65) * (1 - .12 * t), ph = TAU * v;
    const seg = (t * 5.6) % 1, ridge = 1 - .045 * Math.pow(Math.max(0, seg - .8) / .2, 2);
    const p = [r * ridge * Math.cos(ph), -.05 - .1 * t * t + r * ridge * Math.sin(ph) * .92, z];
    return { p, c: [.1, .07, .04, .03], m: [t, v, 2, 0], v: piv };
  }, { center: [0, -.08, -.32] });
  // legs: femur/tibia/tarsus in flight pose (A, tucked, hind legs hanging) and standing pose (B)
  const legs = [[.24, .12], [.15, .1], [.06, .1]];
  for (let li = 0; li < 6; li++) {
    const s = li % 2 ? -1 : 1, pair = li >> 1, [z0] = legs[pair], hip = [s * .07, -.08, z0];
    const fl = pair === 0 ? [[s * .11, -.16, z0 + .1], [s * .1, -.24, z0 + .06], [s * .08, -.3, z0 + .02]] :
      pair === 1 ? [[s * .14, -.17, z0 - .02], [s * .13, -.28, z0 - .07], [s * .11, -.34, z0 - .12]] :
        [[s * .15, -.17, z0 - .08], [s * .13, -.3, z0 - .24], [s * .1, -.37, z0 - .34]];
    // standing pose: crouched — femora angled up/out, knees above the body line, tarsi just below the belly
    const st = pair === 0 ? [[s * .17, -.02, z0 + .07], [s * .21, -.13, z0 + .15], [s * .22, -.175, z0 + .21]] :
      pair === 1 ? [[s * .21, -.01, z0 - .02], [s * .27, -.13, z0 - .05], [s * .29, -.175, z0 - .08]] :
        [[s * .21, -.02, z0 - .12], [s * .26, -.14, z0 - .27], [s * .26, -.175, z0 - .4]];
    const A = [hip, ...fl], B = [hip, ...st];
    const Ac = curve([A[0], A[1], A[1], A[2], A[2], A[3]], 10), Bc = curve([B[0], B[1], B[1], B[2], B[2], B[3]], 10);
    tube(g, Ac, Bc, t => (pair === 2 && t > .3 && t < .7 ? .03 : .018) * (1 - .55 * t), det ? 6 : 4, (t) => ({ c: t > .35 && pair === 2 ? [.12, .08, .04, .03] : [.05, .035, .025, .03], m: [t, li, 4, .007] }));
    if (pair === 2) { // corbicula: the pollen load is moulded onto the outer face of the hind tibia, elongated along it
      const ta = sub(A[2], A[1]), tl = len(ta), T = scl(ta, 1 / tl), O = norm(cross(T, [0, 0, 1]).map(x => x * s));
      const U = cross(T, O), c0 = add(add(A[1], scl(ta, .55)), scl(O, .028)), dl = sub(add(add(B[1], scl(sub(B[2], B[1]), .55)), scl(O, .028)), c0);
      const k0 = g.n;
      ellip(g, [0, 0, 0], [1, 1, 1], 8, 10, (u, v) => ({ c: [.95, .58, .08, .02], m: [u, v, 6, 0], v: c0 }),
        p => add(c0, add(add(scl(T, p[2] * tl * .42), scl(O, p[0] * .06 * (1 + .3 * p[0]))), scl(U, p[1] * .07))));
      for (let k = k0; k < g.n; k++) { g.Q[k * 3] += dl[0]; g.Q[k * 3 + 1] += dl[1]; g.Q[k * 3 + 2] += dl[2]; }
    }
  }
  // antennae: scape + elbowed flagellum
  for (const s of [-1, 1]) {
    const b = [s * .03, .07, .45];
    const A = curve([b, [s * .05, .16, .5], [s * .06, .2, .52], [s * .12, .22, .66], [s * .16, .16, .78]], 14);
    tube(g, A, null, t => .014 * (1 - .3 * t), 5, () => ({ c: [.05, .04, .03, .03], m: [0, s, 5, 0], v: b }));
  }
  // proboscis (glossa ~6 mm), folded when scale -> 0
  // proboscis: extended pose built here (forward and down to the florets); the shader folds it back under the head
  const pb = [0, -.085, .42];
  tube(g, curve([pb, [0, -.15, .5], [0, -.21, .58], [0, -.25, .66]], 12), null, t => .02 * (1 - .55 * t), 6, (t) => ({ c: t > .7 ? [.55, .42, .25, .04] : [.22, .12, .05, .03], m: [t, 0, 7, t > .7 ? .004 : 0], v: pb }));
  // mandibles
  for (const s of [-1, 1]) ellip(g, [s * .03, -.1, .43], [.025, .02, .04], 5, 6, () => ({ c: [.25, .15, .05, .03], m: [0, 0, 0, 0] }));
  return g;
}
// wing: unit span grid, aW = (span, chord)
export function wingMesh() {
  const P = [], W = [], I = [], nu = 10, nv = 4;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const s = i / nu, c = j / nv - .5; P.push(s, 0, c * 2.2); W.push(s, c); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; I.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1); }
  return { P, W, I };
}

// ============================================================= EUROPEAN BEE-EATER (Merops apiaster), metres
export function birdMesh() {
  const g = new Geo();
  const col = (p) => { // plumage by region
    const [x, y, z] = p;
    if (z > .1) { // head
      if (Math.abs(y - .012) < .006 && z < .13) return [.01, .01, .01, .02];                 // eye stripe
      if (y > .01) return [.42, .14, .05, .03];                                               // chestnut crown
      if (y < -.008) return z > .115 ? [.95, .8, .1, .2] : [.02, .02, .02, .02];            // yellow throat, black gorget
      return [.95, .9, .75, .3];
    }
    if (y > .005) return z > -.02 ? [.45, .17, .05, .03] : [.8, .62, .1, .1];                 // chestnut mantle, golden scapulars
    return [.12, .55, .62, .45];                                                             // turquoise underparts (UV-bright)
  };
  ellip(g, [0, 0, .02], [.028, .03, .095], 14, 16, (u, v, p) => ({ c: col(p), m: [u, v, 0, 0] }));
  ellip(g, [0, .01, .11], [.022, .022, .026], 10, 12, (u, v, p) => ({ c: col(p), m: [u, v, 0, 0] }));
  tube(g, curve([[0, .008, .13], [0, .003, .16], [0, -.006, .18]], 6), null, t => .006 * (1 - t) + .0005, 5, () => ({ c: [.02, .02, .02, .02], m: [0, 0, 0, 0] }));
  for (const s of [-1, 1]) { // wings, pivot at shoulder
    const sh = [s * .022, .01, .035];
    surf(g, 18, 6, (u, v) => { // long pointed wing; serrated trailing edge = individual flight feathers
      const span = .2 * u, saw = u > .25 ? 1 + .14 * (1 - Math.abs(((u * 11) % 1) * 2 - 1)) * v * v : 1;
      const ch = .085 * (1 - .72 * Math.pow(u, 1.4)) * saw, back = u * u * .07;
      const p = [sh[0] + s * span, sh[1] + .012 * Math.sin(u * PI) - .006 * v * v, sh[2] - back - (v - .2) * ch];
      const c = v < .35 ? (u < .55 ? [.5, .2, .06, .05] : [.12, .42, .4, .35]) :
        (u < .45 ? (v > .82 ? [.03, .03, .04, .03] : [.15, .52, .46, .4]) : (v > .72 || u > .86 ? [.03, .03, .04, .03] : [.1, .38, .42, .35]));
      return { p, c, m: [u, v, s > 0 ? 1 : 2, 0], v: sh };
    });
  }
  surf(g, 8, 6, (u, v) => { // tail with central streamers
    const w = .022 * (1 - .4 * u) * (v - .5) * 2, str = Math.abs(v - .5) < .1 ? .035 * Math.min(1, u * 1.5) : 0;
    return { p: [w, -.004, -.07 - (.09 + str) * u], c: [.12, .4, .3, .3], m: [u, v, 3, 0], v: [0, 0, -.07] };
  });
  return g;
}

// ============================================================= CRAB SPIDER (Misumena vatia female), body length ~0.55 = ~9 mm at scale .016
// Flattened, crab-like: legs I-II long and held open sideways in ambush, III-IV short; abdomen widest at the rear;
// waxy white with faint crimson lateral bands; eight eyes on white tubercles. Feet rest on y = 0.
export function spiderMesh() {
  const g = new Geo();
  const white = [.93, .92, .84, .04];
  // cephalothorax: low, slightly square
  ellip(g, [0, .085, .1], [.15, .07, .15], 12, 16, (u, v, p) => ({ c: [.9, .89, .8, .04], m: [u, v, 0, 0] }),
    p => [p[0] * (1 + .25 * Math.max(0, (p[2] - .05) / .2)), p[1] - .02 * Math.abs(p[0]) / .15, p[2]]);
  // eyes: two rows of four on tubercles
  for (const [x, z, r] of [[-.075, .225, .018], [.075, .225, .018], [-.03, .24, .012], [.03, .24, .012], [-.1, .19, .016], [.1, .19, .016], [-.045, .2, .011], [.045, .2, .011]]) {
    ellip(g, [x, .135, z], [r * 1.5, r * 1.1, r * 1.5], 4, 6, () => ({ c: [.97, .96, .9, .05], m: [0, 0, 0, 0] }));
    ellip(g, [x, .15, z + r * .5], [r * .8, r * .8, r * .8], 4, 6, () => ({ c: [.03, .02, .02, .05], m: [0, 0, 3, 0] }));
  }
  // abdomen: flattened, broader behind, faint wrinkles, two soft crimson lateral bands
  ellip(g, [0, .1, -.24], [.25, .12, .27], 16, 22, (u, v, p) => {
    const side = Math.abs(p[0]) / (.25 * (1 + .35 * Math.max(0, (-.24 - p[2]) / .27))), band = Math.exp(-Math.pow((side - .78) / .1, 2)) * (p[1] > .08 ? 1 : .3);
    const c = [.95 - .2 * band, .94 - .62 * band, .82 - .58 * band, .04];
    return { c, m: [u, v, 0, 0] };
  }, p => { const back = Math.max(0, (-.24 - p[2]) / .27); return [p[0] * (1 + .35 * back), p[1] * (p[1] > .1 ? .85 : 1) + .006 * Math.sin(p[2] * 60) * (p[1] > .1 ? 1 : 0), p[2]]; });
  // legs: coxa at the carapace edge -> femur (up) -> patella/tibia (out, down) -> metatarsus/tarsus (foot on y=0)
  const legs = [[.55, 1, .06], [1.15, .92, .1], [2.15, .45, .04], [2.65, .48, .02]]; // angle from forward, length, raise of foot
  for (let li = 0; li < 8; li++) {
    const s = li % 2 ? -1 : 1, k = li >> 1, [ang, L, raise] = legs[k];
    const d = [s * Math.sin(ang), 0, Math.cos(ang)], hip = [s * .11, .07, .13 - k * .055];
    const knee = add(hip, [d[0] * L * .34, k < 2 ? .1 : .17 * L + .03, d[2] * L * .34]);
    const ank = add(knee, [d[0] * L * .36, k < 2 ? -.03 : -.1 * L, d[2] * L * .36 + (k < 2 ? .1 * L : 0)]);
    const foot = add(ank, [d[0] * L * .26 * (k < 2 ? .7 : 1), raise - ank[1], d[2] * L * .26 + (k < 2 ? .12 * L : 0)]);
    const pts = [], seg = (a, b, n) => { for (let i = 0; i < n; i++) pts.push(add(a, scl(sub(b, a), i / n))); };
    seg(hip, knee, 5); seg(knee, ank, 5); seg(ank, foot, 5); pts.push(foot);
    const thick = k < 2 ? .036 : .024;
    tube(g, pts, null, t => thick * (1 - .55 * t) * (1 + .25 * Math.exp(-Math.pow((t - 1 / 3) * 18, 2)) + .2 * Math.exp(-Math.pow((t - 2 / 3) * 18, 2))), 6,
      (t) => ({ c: t > .66 && k < 2 ? [.82, .78, .62, .04] : [.9, .9, .8, .04], m: [t, li, 4, 0] }));
  }
  // pedipalps
  for (const s of [-1, 1]) tube(g, curve([[s * .04, .06, .23], [s * .07, .1, .3], [s * .08, .05, .35]], 6), null, t => .018 * (1 - .4 * t), 5, () => ({ c: white, m: [0, 0, 0, 0] }));
  return g;
}

// ============================================================= FLOWERS (metres)
// returns {geo, head:[x,y,z], up:[...], H}
export const SPECIES = ['Rudbeckia', 'Poppy', 'Cornflower', 'Oxeye daisy', 'White clover'];
export function flowerMesh(sp, det) {
  const g = new Geo(), L = det ? 1 : 0;
  const H = [.62, .55, .55, .45, .13][sp], tilt = [.35, .2, .3, .4, .1][sp];
  const top = [0, H, Math.sin(tilt) * H * .25];
  const up = norm([0, Math.cos(tilt), Math.sin(tilt)]);
  const green = [.12, .3, .06, .03];
  // stem
  const stem = curve([[0, 0, 0], [0, H * .5, 0], [0, H * .85, top[2] * .4], top], det ? 10 : 4);
  tube(g, stem, null, t => (sp === 4 ? .0012 : .0022) * (1 - .3 * t), det ? 5 : 3, (t, k) => ({ c: green, m: [t, k, 0, 0] }));
  // leaves
  const nl = sp === 4 ? 0 : det ? 3 : 1;
  for (let i = 0; i < nl; i++) {
    const y = H * (.15 + i * .2), a = i * 2.4 + sp, Lf = [.1, .09, .08, .06][sp] * (1 - i * .2), Wd = sp === 2 ? .004 : sp === 1 ? .012 : .01;
    const dx = Math.cos(a), dz = Math.sin(a);
    surf(g, det ? 6 : 2, 2, (u, v) => {
      const w = Wd * Math.sin(PI * Math.pow(u, .8)) * (v - .5) * 2, dr = u * Lf, droop = -u * u * Lf * .35;
      const lob = sp === 1 ? 1 + .4 * Math.sin(u * 30) : 1;
      return { p: [dx * dr - dz * w * lob, y + droop + u * Lf * .2 + Math.abs(v - .5) * .004, dz * dr + dx * w * lob], c: green, m: [u, v - .5, 5, 0] };
    });
  }
  // head frame
  const hb = top, ex = norm(cross(up, [0, 0, 1])).some(isNaN) ? [1, 0, 0] : [1, 0, 0];
  const ez = norm(cross(ex, up));
  const H2W = (x, y, z) => add(hb, add(add(scl(ex, x), scl(up, y)), scl(ez, z))); // head-local -> mesh
  const ring = (n, fn) => { for (let k = 0; k < n; k++) fn(k, TAU * k / n + .3 * hash(k, sp)); };
  const petal = (a, len, wid, rise, droop, cup, col, uv, mat, guide, r0, nu, nv) => {
    const ca = Math.cos(a), sa = Math.sin(a);
    surf(g, nu, nv, (u, v) => {
      const s = (v - .5) * 2, w = wid * Math.pow(Math.sin(PI * Math.min(1, u * .95 + .05)), .55) * (mat === 2 ? 1 : 1 - .3 * u);
      const r = r0 + u * len, y = rise * u - droop * u * u + cup * s * s * w * 4 + (mat === 2 ? .004 * Math.sin(u * 17 + s * 5) : 0);
      const x = r, z = s * w + (sp === 0 ? .0008 * Math.sin(u * 40) : 0);
      return { p: H2W(x * ca - z * sa, y, x * sa + z * ca), c: [...col, uv], m: [u, s, mat, guide] };
    });
  };
  const disc = (r, h, col, uv, nu) => surf(g, nu, nu * 2, (u, v) => {
    const a = TAU * v, rr = r * Math.sin(PI * .5 * u), y = h * Math.cos(PI * .5 * u);
    return { p: H2W(rr * Math.cos(a), y, rr * Math.sin(a)), c: [...col, uv], m: [u, v, 3, 0] };
  }, { center: H2W(0, -r, 0) });
  const nu = det ? 7 : 2, nv = det ? 3 : 1;
  if (sp === 0) { // Rudbeckia hirta: rays with UV-absorbing base -> bullseye for bees
    ring(13, (k, a) => petal(a, .036, .0085, -.002, .012, .05, [.98, .62, .02], .5, 1, .42, .009, nu, nv));
    disc(.0105, .012, [.12, .055, .02], .02, det ? 7 : 3);
  } else if (sp === 1) { // Papaver rhoeas: 4 cupped red petals (UV-reflective), black basal blotch
    ring(4, (k, a) => petal(a + (k % 2) * .1, .042, .028, .022, .004, .12, [.86, .05, .02], .3, 2, .0, .003 + (k % 2) * .001, det ? 8 : 2, det ? 5 : 1));
    ellip(g, H2W(0, .008, 0), [.006, .009, .006], 6, 8, () => ({ c: [.35, .45, .25, .05], m: [0, 0, 0, 0] }), p => p);
    disc(.007, .0025, [.1, .08, .12], .03, det ? 4 : 2);
    if (det) ring(40, (k, a) => { const r = .007 + .002 * hash(k, 3); ellip(g, H2W(r * Math.cos(a), .009 + .002 * hash(k, 4), r * Math.sin(a)), [.0012, .0009, .0012], 3, 4, () => ({ c: [.06, .05, .12, .04], m: [0, 0, 4, 0] })); });
  } else if (sp === 2) { // Centaurea cyanus: ring of blue funnel florets on a scaly involucre
    ellip(g, H2W(0, -.004, 0), [.0065, .009, .0065], 6, 8, () => ({ c: [.25, .32, .15, .03], m: [0, 0, 5, 0] }));
    ring(det ? 9 : 6, (k, a) => {
      const ca = Math.cos(a), sa = Math.sin(a), tl = .016;
      surf(g, det ? 5 : 2, det ? 10 : 5, (u, v) => {
        const ph = TAU * v, rr = .0012 + .0055 * Math.pow(u, 2.2) * (1 + .25 * Math.max(0, Math.sin(ph * 5)) * u), x = .004 + u * tl, y = .002 + u * .006;
        const lx = x, ly = y + rr * Math.cos(ph) * .7, lz = rr * Math.sin(ph);
        return { p: H2W(lx * ca - lz * sa, ly, lx * sa + lz * ca), c: [.16, .32, .9, .14], m: [u, v, 1, 0] };
      });
    });
    ellip(g, H2W(0, .006, 0), [.004, .004, .004], 5, 6, () => ({ c: [.35, .12, .45, .1], m: [0, 0, 4, 0] }));
  } else if (sp === 3) { // Leucanthemum: white UV-absorbing rays, yellow disc
    ring(det ? 22 : 14, (k, a) => petal(a, .026, .0045, .0, .004, .02, [.8, .8, .76], .06, 1, 0, .0085, nu, nv));
    disc(.0085, .004, [.98, .78, .05], .02, det ? 6 : 3);
  } else { // Trifolium repens: globe of florets + trefoil leaves
    ellip(g, H2W(0, .006, 0), [.004, .004, .004], 4, 6, () => ({ c: green, m: [0, 0, 0, 0] }));
    const nf = det ? 36 : 10;
    for (let k = 0; k < nf; k++) {
      const th = Math.acos(1 - 2 * (k + .5) / nf) * .85, ph = k * 2.39996, d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      const b = H2W(d[0] * .003, .006 + d[1] * .003, d[2] * .003), e = H2W(d[0] * .011, .006 + d[1] * .011 - (th > 1.2 ? .002 : 0), d[2] * .011);
      const old = th > 1.3;
      tube(g, curve([b, e], 3), null, t => .0011 + .0008 * t, 4, () => ({ c: old ? [.6, .45, .35, .05] : [.97, .93, .9, .08], m: [0, 0, 5, 0] }));
    }
    for (let i = 0; i < (det ? 3 : 1); i++) { // trefoils
      const a = i * 2.1 + .5, b = [Math.cos(a) * .02, 0, Math.sin(a) * .02], top2 = [Math.cos(a) * .03, .07 + i * .01, Math.sin(a) * .03];
      tube(g, curve([b, top2], 4), null, .0008, 3, () => ({ c: green, m: [0, 0, 0, 0] }));
      for (let f = 0; f < 3; f++) {
        const fa = f * TAU / 3 + a, fx = Math.cos(fa), fz = Math.sin(fa);
        surf(g, det ? 5 : 2, det ? 4 : 2, (u, v) => {
          const r = u * .012, s = (v - .5) * 2, w = .008 * Math.sin(PI * Math.pow(u, .6)) * s;
          return { p: [top2[0] + fx * r - fz * w, top2[1] + .002 * s * s, top2[2] + fz * r + fx * w], c: Math.abs(u - .55) < .06 && Math.abs(s) < .7 ? [.4, .5, .3, .04] : [.1, .28, .07, .03], m: [u, s, 5, 0] };
        });
      }
    }
  }
  return { geo: g, head: H2W(0, [.0125, .011, .009, .0045, .016][sp], 0), up, H };
}

// ============================================================= TREE (oak-like), metres, ~11 m
export function treeMesh() {
  const g = new Geo(); let seed = 1;
  const rnd = () => hash(seed++, 77);
  const branch = (p, d, L, r, depth) => {
    const e = add(p, scl(d, L)), m = add(add(p, scl(d, L * .5)), [(rnd() - .5) * L * .2, (rnd() - .2) * L * .1, (rnd() - .5) * L * .2]);
    tube(g, curve([p, m, e], depth > 1 ? 6 : 3), null, t => r * (1 - .45 * t), depth > 1 ? 8 : 4, (t, k) => ({ c: [0, 0, 0, 0], m: [t, k, 0, rnd()] }));
    if (depth === 0) {
      for (let i = 0; i < 9; i++) { // leaf cards around the tip
        const c = add(e, [(rnd() - .5) * 1.6, (rnd() - .3) * 1.2, (rnd() - .5) * 1.6]), a = rnd() * TAU, b = rnd() * PI, s = .7 + rnd() * .4, id = rnd();
        const ax = [Math.cos(a) * s, Math.sin(b) * s * .3, Math.sin(a) * s], ay = norm(cross(ax, [Math.sin(b), 1, Math.cos(b)])).map(x => x * s);
        const n = norm(cross(ax, ay)), base = g.n;
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) g.vert(add(c, add(scl(ax, u - .5), scl(ay, v - .5))), n, [0, 0, 0, 0], [u, v, 1, id]);
        g.tri(base, base + 1, base + 2); g.tri(base, base + 2, base + 3);
      }
      return;
    }
    const kids = depth === 3 ? 4 : 3;
    for (let i = 0; i < kids; i++) {
      const a = rnd() * TAU, sp = depth === 3 ? .9 : .7, nd = norm(add(scl(d, 1 - sp), [Math.cos(a) * sp, .45 + rnd() * .3, Math.sin(a) * sp]));
      branch(add(p, scl(sub(e, p), .55 + .45 * (i / kids))), nd, L * (.55 + rnd() * .2), r * .5, depth - 1);
    }
  };
  branch([0, -.3, 0], [0, 1, 0], 4.5, .42, 3);
  return g;
}

// ============================================================= HIVE (Langstroth-style), metres, entrance faces +z
export function hiveMesh() {
  const g = new Geo();
  const box = (x0, y0, z0, x1, y1, z1, col, uv, mat) => {
    const F = [[[1, 0, 0], [x1, y0, z0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [x0, y0, z1], [0, 1, 0], [0, 0, -1]], [[0, 1, 0], [x0, y1, z0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [x0, y0, z0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [x0, y0, z1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [x1, y0, z0], [-1, 0, 0], [0, 1, 0]]];
    const S = [x1 - x0, y1 - y0, z1 - z0];
    for (const [n, o, a, b] of F) {
      const la = Math.abs(dot(a, S)), lb = Math.abs(dot(b, S)), base = g.n;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) g.vert(add(o, add(scl(a, u * la), scl(b, v * lb))), n, [...col, uv], [u, v, mat, 0]);
      g.tri(base, base + 1, base + 2); g.tri(base, base + 2, base + 3);
    }
  };
  const W = .26, D = .21;
  for (const [x, z] of [[-.22, -.17], [.22, -.17], [-.22, .17], [.22, .17]]) box(x - .05, 0, z - .05, x + .05, .3, z + .05, [.5, .5, .48], .04, 4);
  box(-W - .02, .3, -D - .02, W + .02, .34, D + .12, [.42, .3, .2], .04, 3);           // bottom board + landing board
  box(-W, .34, -D, W, .585, D, [.33, .55, .78], .25, 0);                                   // brood box (pale blue)
  box(-W, .585, -D, W, .83, D, [.86, .7, .28], .06, 0);                                  // second deep (yellow)
  box(-W, .83, -D, W, .99, D, [.78, .8, .76], .04, 0);                                  // super (white)
  box(-W - .025, .99, -D - .025, W + .025, 1.06, D + .025, [.6, .62, .64], .1, 1);       // telescoping cover
  box(-.1, .34, D - .004, .1, .356, D + .002, [0, 0, 0], 0, 2);                          // entrance slot
  for (const z of [-D, D]) for (const y of [.46, .7]) box(-.07, y, z - .003 * Math.sign(-z || 1) - (z > 0 ? 0 : .001), .07, y + .025, z + (z > 0 ? .002 : .0), [0, 0, 0], 0, 2); // hand holds
  return g;
}

// ============================================================= COMB CELL (hexagonal, worker 5.4 mm pitch)
export function cellMesh(w) {
  const g = new Geo(), ri = w * .5 / Math.cos(PI / 6) * .955, ro = w * .5 / Math.cos(PI / 6) * 1.02, dep = .011;
  const hv = k => { const a = PI / 2 + k * PI / 3; return [Math.cos(a), Math.sin(a)]; };
  for (let k = 0; k < 6; k++) {
    const [ax, ay] = hv(k), [bx, by] = hv(k + 1), n = norm([-(ax + bx), -(ay + by), 0]);
    surf(g, 1, 4, (u, v) => { const x = lerp(ax, bx, u) * ri, y = lerp(ay, by, u) * ri; return { p: [x, y, -dep * (1 - v)], c: [0, 0, 0, 0], m: [u, v, 0, 0] }; });
    const b = g.n; // rim
    for (const [r, z] of [[ri, 0], [ro, 0], [ri, .0005], [ro, .0005]]) { }
    g.vert([ax * ri, ay * ri, .0003], [0, 0, 1], [0, 0, 0, 0], [0, 1, 0, 0]); g.vert([bx * ri, by * ri, .0003], [0, 0, 1], [0, 0, 0, 0], [0, 1, 0, 0]);
    g.vert([bx * ro, by * ro, 0], [0, 0, 1], [0, 0, 0, 0], [0, 1, 0, 0]); g.vert([ax * ro, ay * ro, 0], [0, 0, 1], [0, 0, 0, 0], [0, 1, 0, 0]);
    g.tri(b, b + 1, b + 2); g.tri(b, b + 2, b + 3);
  }
  const hexDisk = (z, part, r) => { const c = g.vert([0, 0, z], [0, 0, 1], [0, 0, 0, 0], [0, 1, part, 0]); for (let k = 0; k < 6; k++) { const [x, y] = hv(k); g.vert([x * r, y * r, z], [0, 0, 1], [0, 0, 0, 0], [0, 1, part, 0]); } for (let k = 0; k < 6; k++) g.tri(c, c + 1 + k, c + 1 + (k + 1) % 6); };
  hexDisk(-dep, 0, ri); hexDisk(-.0004, 1, ri); hexDisk(-.004, 2, ri);
  // larva: C-shaped grub curled on the cell floor
  const L = []; for (let i = 0; i <= 10; i++) { const a = -2.2 + 4.4 * i / 10; L.push([Math.cos(a) * w * .22, Math.sin(a) * w * .22, -dep + .0012]); }
  tube(g, L, null, t => w * .13 * Math.sin(PI * (.1 + .8 * t)), 6, () => ({ c: [0, 0, 0, 0], m: [0, 1, 3, 0] }));
  tube(g, curve([[0, 0, -dep], [0, 0, -dep + .0015]], 3), null, .00025, 4, () => ({ c: [0, 0, 0, 0], m: [0, 1, 4, 0] }));
  return g;
}

// ============================================================= BUTTERFLY (cabbage white / peacock), body length 1 ~ 2.6 cm
// wings: part 1 right, 2 left, pivot on the body axis; aM = (span u, chord v, part, 0 fore / 1 hind)
export function butterflyMesh() {
  const g = new Geo(), body = [.12, .11, .1, .04];
  ellip(g, [0, 0, .06], [.06, .06, .13], 8, 10, () => ({ c: body, m: [0, 0, 0, .02] }));
  ellip(g, [0, -.01, -.2], [.045, .045, .2], 8, 10, () => ({ c: body, m: [0, 0, 0, .01] }));
  ellip(g, [0, 0, .21], [.05, .05, .05], 6, 8, () => ({ c: body, m: [0, 0, 3, 0] }));
  for (const s of [-1, 1]) {
    tube(g, curve([[s * .02, .03, .24], [s * .1, .15, .45], [s * .13, .2, .55]], 8), null, t => .008 + .012 * Math.pow(t, 8), 4, () => ({ c: body, m: [0, 0, 0, 0] }));
    const pv = [s * .03, .02, .05], part = s > 0 ? 1 : 2;
    surf(g, 10, 6, (u, v) => { // forewing: rounded triangle, apex forward-out
      const lead = .14 + .06 * u, trail = -.04 - .3 * u * (1 - .35 * u), round = Math.sqrt(Math.max(0, 1 - Math.pow(u, 6)));
      const z = lead + (trail - lead) * v * (.25 + .75 * round) - (1 - round) * .05;
      return { p: [pv[0] + s * (.03 + u * .95), pv[1] + .01 * u, z], c: [1, 1, 1, .05], m: [u, v, part, 0], v: pv };
    });
    surf(g, 8, 6, (u, v) => { // hindwing: rounded fan behind
      const r = .02 + u * .62, a = -.25 - v * 1.15, sc = Math.sqrt(Math.max(0, 1 - Math.pow(v * 2 - 1, 8) * .3)) * (1 - .25 * Math.pow(u, 3));
      return { p: [pv[0] + s * (.02 + Math.cos(a) * r * sc), pv[1], -.02 + Math.sin(a) * r * sc * .9], c: [1, 1, 1, .05], m: [u, v, part, 1], v: pv };
    });
  }
  return g;
}
// ============================================================= EMPEROR DRAGONFLY (Anax imperator), length 1 ~ 7.8 cm
export function dragonflyMesh() {
  const g = new Geo();
  ellip(g, [0, 0, .45], [.06, .055, .045], 8, 10, () => ({ c: [.15, .35, .2, .05], m: [0, 0, 0, 0] }));
  for (const s of [-1, 1]) ellip(g, [s * .04, .02, .47], [.05, .055, .05], 8, 10, (u, v) => ({ c: [.12, .45, .55, .2], m: [u, v, 3, 0] }));
  ellip(g, [0, .01, .3], [.065, .075, .11], 10, 12, (u, v, p) => ({ c: Math.abs(Math.sin(p[2] * 60 + p[0] * 30)) < .2 ? [.03, .04, .03, .03] : [.25, .55, .18, .05], m: [0, 0, 0, 0] }));
  surf(g, 26, 8, (u, v) => { // long abdomen: sky-blue with a black dorsal stripe and segment rings
    const z = .19 - u * .78, r = (.032 - .01 * u) * (1 + .3 * Math.exp(-u * 30)) * (1 - .3 * Math.pow(u, 6)), a = v * 6.2832;
    const p = [Math.cos(a) * r, Math.sin(a) * r - .01 * u, z], seg = (u * 10) % 1;
    const c = Math.sin(a) > .75 || seg > .9 ? [.03, .03, .04, .03] : [.18, .48, .88, .35];
    return { p, c, m: [u, v, 0, 0] };
  }, { center: [0, 0, -.2] });
  for (const s of [-1, 1]) for (const hind of [0, 1]) { // four long narrow wings, nearly transparent
    const pv = [s * .04, .06, hind ? .26 : .34], part = s > 0 ? 1 : 2;
    surf(g, 12, 3, (u, v) => {
      const ch = .095 * (hind ? 1.25 : 1) * Math.sqrt(Math.max(0, 1 - Math.pow(u, 4))) * (u < .05 ? .6 : 1);
      return { p: [pv[0] + s * (.02 + u * .62), pv[1], pv[2] - (v - .3) * ch], c: [.8, .82, .85, .2], m: [u, v, part, hind], v: pv };
    });
  }
  return g;
}
