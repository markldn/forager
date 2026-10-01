// FILM: one forager's first trip, as a list of shots. Each shot sets camera, actors and post settings.
import { add, sub, scl, norm, cross, len, lerp, clamp, smooth, mix3, spline, basis } from './math.js';
import { HIVE, PATCH, OAK, height, sunDir } from './world.js';
import { Bee, npcStep, CombCrowd, dancePose, combPos, ENTRANCE, LANDING, BEE_S, light } from './sim.js';
import { COMB } from './render.js';
import { Life } from './life.js';

const TOD_IN = .27, TOD_OUT = .36;
const sunAz = tod => { const s = sunDir(tod); return Math.atan2(s[0], -s[2]); };
const BEAR = Math.atan2(PATCH[0], -PATCH[1]);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const DANCE_A = wrap(BEAR - sunAz(TOD_OUT)), DIST = Math.hypot(PATCH[0], PATCH[1]), RUN_S = DIST / 1000;
const deg = Math.round(Math.abs(DANCE_A) * 180 / Math.PI), side = DANCE_A > 0 ? 'right' : 'left';

const DIR = norm([PATCH[0], 0, PATCH[1]]), PERP = [-DIR[2], 0, DIR[0]];
export function pathPos(s) { // her outbound route (metres from the hive)
  const x = HIVE[0] + DIR[0] * s + PERP[0] * Math.sin(s * .045) * 7, z = HIVE[2] + DIR[2] * s + PERP[2] * Math.sin(s * .045) * 7;
  const alt = (.7 + .35 * Math.sin(s * .11)) * smooth(0, 12, s) + .4;
  return [x, height(x, z) + alt, z];
}
const look = (pos, tgt, fov = .8, near = .003, far = 3000) => ({ pos, tgt, fov, near, far });
const ease = x => x * x * (3 - 2 * x);

export function createFilm(flowers) {
  const F = { her: new Bee(combPos(.12, .07), .31), npc: [], crowd: new CombCrowd(140, 5), dancer: new Bee([0, 0, 0], .77), followers: [], birds: [], t: 0 };
  F.her.land = 1;
  F.followers = F.crowd.b.slice(0, 5);
  for (let i = 0; i < 22; i++) F.npc.push(new Bee(add(HIVE, [(Math.random() - .5) * 6, .3 + Math.random(), (Math.random() - .5) * 6]), Math.random()));
  const dc = [.17, .11];
  let landF = null, spiderF = null;
  const pick = () => { // the flower she lands on, and the daisy with the crab spider beside it
    const p = pathPos(DIST - 8); flowers.dirty = true; flowers.update(p); flowers.dirty = true;
    landF = flowers.near(p, 30, f => f.sp === 0) || flowers.near(p, 60);
    spiderF = landF && (flowers.near([landF.x + .5, 0, landF.z + .5], 25, f => f.sp === 3 && f !== landF) || flowers.near([landF.x + .5, 0, landF.z + .5], 25, f => f !== landF));
  };
  const interiorCrowd = (sc, dt, t, dancing = 1) => {
    F.dancer.step(dt); F.dancer.wing = 0;
    const dp = dancePose(t, DANCE_A, RUN_S, dc[0], dc[1]);
    const shim = dp.wag * dancing * Math.sin(t * 81.7) * .13; // whole-body shimmy during the waggle run (~13 Hz)
    F.dancer.pos = combPos(dp.x, dp.y); F.dancer.up = [0, 0, 1]; F.dancer.fwd = [Math.sin(dp.h + shim), Math.cos(dp.h + shim), 0];
    F.dancer.waggle = dp.wag * dancing; F.dancer.land = 1; F.dancer.pollen = .6;
    const obs = [{ x: dp.x, y: dp.y, h: dp.h }]; if (F.her.cx) obs.push({ x: F.her.cx, y: F.her.cy, h: .2 });
    F.crowd.step(dt, t, obs, dancing ? { x: dp.x, y: dp.y, h: dp.h } : null);
    sc.bees.push(F.dancer, ...F.crowd.b);
  };
  F.life = new Life(flowers);
  const outdoors = (sc, dt, t, home) => { for (const b of F.npc) npcStep(b, dt, t, flowers, home); sc.bees.push(...F.npc); };
  const hover = (b, p, dt) => { b.pos = p; b.step(dt); };

  const SHOTS = [
    { d: 9, sub: [[1.5, 8.5, '']], title: 1, go(l, sc, dt) { // title over the comb
      sc.interior = 1; sc.tod = TOD_IN; interiorCrowd(sc, dt, F.t);
      const c = combPos(.05 + l * .006, .05); sc.cam = look(add(c, [-.02, .01, .075 - l * .002]), add(c, [.03, .0, 0]), .7);
      sc.fade = smooth(0, 3, l); sc.dof = { focus: .08, ap: .25 }; } },
    { d: 15, sub: [[.5, 7, 'Inside the hive it is dark, and the brood nest is held at 35 °C.'], [7.5, 14.5, 'Up to sixty thousand sisters. One queen. A few hundred drones.']], go(l, sc, dt) {
      sc.interior = 1; interiorCrowd(sc, dt, F.t);
      const u = l / 15, c = combPos(.08 + u * .12, .12 - u * .05); sc.cam = look(add(c, [-.015, .025, .045]), add(c, [.01, -.005, 0]), .75);
      sc.dof = { focus: .05, ap: .6 }; } },
    { d: 12, sub: [[.5, 6, 'She is twenty-one days old. She has cleaned cells, fed larvae, built wax and guarded the door.'], [6.5, 11.8, 'Today she becomes a forager.']], go(l, sc, dt) {
      sc.interior = 1; interiorCrowd(sc, dt, F.t);
      const h = F.her, hs = Math.max(0, l - 1.5) * .003 * (l < 9 ? 1 : 0) + Math.max(0, Math.min(l, 9) - 1.5) * .003 * (l >= 9 ? 1 : 0); h.cx = .12 + hs * .196; h.cy = .07 + hs * .98; h.pos = combPos(h.cx, h.cy); h.up = [0, 0, 1]; h.fwd = norm([.2, 1, 0]); h.land = 1; h.step(dt); h.wing = 0;
      sc.bees.unshift(h); sc.nearBees = 6;
      const a = l * .05; sc.cam = look(add(h.pos, [Math.sin(a) * .03 - .01, -.012, .028]), add(h.pos, [0, .002, .002]), .55);
      sc.dof = { focus: len(sub(sc.cam.pos, h.pos)), ap: .7 }; } },
    { d: 26, sub: [[.5, 6, 'A sister has come home with news. She dances.'], [6.5, 13, `The waggle run points ${deg}° ${side} of straight up: fly ${deg}° ${side} of the sun.`],
      [13.5, 19.5, `Each run lasts about ${RUN_S.toFixed(1)} seconds: roughly ${Math.round(DIST / 10) * 10} metres.`], [20, 25.8, 'In the dark the dance is not seen. It is felt — through legs and antennae.']], go(l, sc, dt) {
      sc.interior = 1; interiorCrowd(sc, dt, F.t);
      F.her.cx = 0;
      const c = F.dancer.pos; sc.nearBees = 8;
      const top = l > 6.5 && l < 13;
      sc.cam = top ? look(add(c, [0, -.004, .09]), c, .7, .003) : look(add(c, [Math.sin(l * .2) * .04, -.03, .035]), c, .6);
      sc.slowmo = l > 13.5 && l < 19.5 ? 1 : 0; sc.timeScale = sc.slowmo ? .12 : 1;
      sc.vibe = l > 20 ? 1 : 0;
      sc.dof = { focus: len(sub(sc.cam.pos, c)), ap: top ? .4 : 1.2 }; sc.overlay = top ? { dance: 1 } : null; } },
    { d: 9, sub: [[3, 8.5, 'Light.']], go(l, sc, dt) { // out through the entrance into blinding day
      if (l < 4.5) {
        sc.interior = 1; interiorCrowd(sc, dt, F.t, 0);
        const lamp = add(COMB.origin, [.16, -.06, .12]), st = combPos(.14, .03); const u = ease(l / 4.5);
        const p = mix3(st, lamp, u); const h = F.her; h.pos = p; h.fwd = norm(sub(lamp, st)); h.up = [0, 1, 0]; h.land = 1 - smooth(.3, 1.5, l); h.step(dt); sc.bees.unshift(h);
        sc.cam = look(add(p, [-.02, .01, -.03]), lamp, .8); sc.exposure = 1.6 + smooth(2, 4.5, l) * 25;
      } else {
        sc.tod = TOD_OUT; const u = (l - 4.5) / 4.5, h = F.her;
        h.pos = add(LANDING, [0, .01 + u * .08, .02 + u * .25]); h.fwd = [0, .3, 1]; h.up = [0, 1, 0]; h.land = 0; h.vel = [0, .1, .5]; h.step(dt); sc.bees.unshift(h); outdoors(sc, dt, F.t, 1);
        sc.cam = look(add(LANDING, [.05, .04, -.06]), add(h.pos, [0, 0, .1]), .9); sc.exposure = 1 + (1 - smooth(4.5, 7, l)) * 12; sc.dof = { focus: .15, ap: .5 };
      } } },
    { d: 15, sub: [[.5, 7.5, 'Before leaving, she turns back and learns her home:'], [8, 14.5, 'the blue box, the old oak, the line of the hills.']], go(l, sc, dt) {
      sc.tod = TOD_OUT; outdoors(sc, dt, F.t, 1);
      const h = F.her, a = Math.sin(l * 1.3) * 1.1, r = .4 + l * .15, c = add(ENTRANCE, [0, .05 + l * .07, 0]);
      const p = add(c, [Math.sin(a) * r, Math.sin(l * 2.6) * .05, Math.cos(a) * r]); h.vel = scl(sub(p, h.pos), 1 / Math.max(dt, .001)); h.pos = p;
      h.fwd = norm(sub(ENTRANCE, p)); h.fwd = norm(add(h.fwd, [0, .4, 0])); h.up = [0, 1, 0]; h.land = 0; h.step(dt); sc.bees.unshift(h); sc.nearBees = 1;
      sc.cam = look(add(p, [Math.sin(a + .5) * .12, .03, Math.cos(a + .5) * .12 + .05]), mix3(h.pos, HIVE.map((x, i) => x + [0, .6, 0][i]), .35), .85);
      sc.dof = { focus: len(sub(sc.cam.pos, h.pos)), ap: .35 }; } },
    { d: 15, sub: [[.5, 7, 'Twenty-five kilometres an hour, a metre above the meadow.'], [7.5, 14.5, 'To her the grass is a forest, and every stem streams past.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .01; flightShot(sc, dt, 20 + l * 6.5, { back: .09, up: .02, side: .03 }); sc.dof = { focus: .1, ap: .1 }; } },
    { d: 22, sub: [[.5, 7, 'She has no red receptor. She sees ultraviolet, blue and green.'], [7.5, 14.5, 'Leaves turn dull. The sky blazes with ultraviolet.'], [15, 21.5, 'False colour: her ultraviolet shown as violet, her blue as blue, her green as yellow-green.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .015; flightShot(sc, dt, 120 + l * 4.5, { back: .07, up: .03, side: -.03, eye: l > 9 ? 1 : 0 });
      sc.vision = smooth(3, 6, l); sc.dof = { focus: .08, ap: .06 }; } },
    { d: 14, sub: [[.5, 6.5, 'Her dorsal eye rim reads the polarised sky:'], [7, 13.5, 'a compass that works even when the sun is hidden.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .02; flightShot(sc, dt, 220 + l * 3, { back: .0, up: .0, side: .0 }); sc.bees.shift();
      sc.cam.tgt = add(sc.cam.pos, norm([DIR[0], .75, DIR[2]])); sc.cam.fov = 1.5; sc.vision = 1; sc.pol = smooth(1, 4, l); sc.cloud = 1; sc.rays = 0; } },
    { d: 11, sub: [[.5, 10.5, 'She measures distance by how fast the world streams past her eyes.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .025; flightShot(sc, dt, 270 + l * 7, { back: .0, up: .0, side: 0, fpv: 1, low: 1 }); sc.vision = 1; sc.beeEye = 1; sc.noSelf = F.her; } },
    { d: 24, sub: [[.5, 7.5, 'Black-eyed Susans. Plain yellow to us…'], [8.5, 15.5, '…but to her, every flower wears a bullseye that points to the nectar.'], [16.5, 23.5, 'Poppies, red to us, glow ultraviolet for her — and offer only pollen.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .03; if (!landF) pick(); outdoors(sc, dt, F.t);
      const f = landF, hp = f ? flowers.head(f, F.t) : pathPos(DIST);
      const a = -1.2 + l * .03, p = add(hp, [Math.cos(a) * .35, .12 - l * .003, Math.sin(a) * .35]);
      sc.cam = look(p, add(hp, [0, -.03, 0]), .7); sc.vision = l < 8 ? 0 : l < 16 ? smooth(8.5, 10, l) : 1 - .5 * smooth(16, 17, l) - .5 * (Math.sin(l * 1.5) > 0 ? 1 : 0) * smooth(18, 19, l);
      sc.dof = { focus: len(sub(p, hp)), ap: .25 };
      const h = F.her; hover(h, add(hp, [-.25 + l * .006, .06, -.2]), dt); h.vel = [.2, 0, .1]; h.orient(dt); sc.bees.unshift(h); } },
    { d: 9, sub: [[.8, 8.2, 'Through her own eyes: some eleven thousand facets, each one a single point of the world.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .033; if (!landF) pick(); outdoors(sc, dt, F.t);
      // her final approach, seen through her two compound eyes: the UV bullseye swells in both eye fields
      const hp = flowers.head(landF, F.t), u = flowers.up(landF), k = 1 - Math.pow(smooth(0, 9, l), .7);
      const dir = norm([Math.cos(1.1), .55, Math.sin(1.1)]), pos = add(add(hp, scl(dir, .012 + .6 * k)), scl(u, .004));
      pos[0] += Math.sin(l * 2.1) * .02 * k; pos[1] += Math.sin(l * 2.9) * .012 * k;
      sc.cam = look(pos, add(hp, [0, -.01 * (1 - k), 0]), 1.6, .002); sc.vision = 1; sc.beeEye = 1; sc.noSelf = F.her; } },
    { d: 20, sub: [[1, 7, 'Her tongue unfolds: six millimetres of drinking straw.'], [7.5, 13.5, 'Pollen is brushed, moistened and packed into baskets on her hind legs.'], [14, 19.5, 'Dozens of flowers, sometimes hundreds, to fill her crop: up to forty milligrams.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .035; if (!landF) pick(); outdoors(sc, dt, F.t);
      const f = landF, h = F.her, hp = flowers.head(f, F.t), u = flowers.up(f);
      const land = smooth(0, 2.5, l), app = add(hp, add(scl(u, .003), [-.06 * (1 - land), .03 * (1 - land), -.04 * (1 - land)]));
      h.pos = app; h.land = smooth(1.6, 2.6, l); h.up = norm(mix3([0, 1, 0], u, h.land)); h.fwd = norm(cross(h.up, [1, 0, -.4]).map(x => -x)); h.fwd = norm(cross(cross(h.up, h.fwd), h.up)).map(x => -x);
      h.onFlower = true; h.prob = smooth(3.2, 5.2, l); h.pollen = .25 + smooth(8, 15, l) * .75; h.step(dt); sc.bees.unshift(h); sc.nearBees = 1;
      // camera: settle-in, then low at the side of her head (tongue), then beside the hind leg (pollen basket), then pull back
      const R = norm(cross(h.up, h.fwd)), head = add(add(h.pos, scl(h.fwd, .0055)), scl(h.up, -.0018)), hind = add(add(h.pos, scl(h.fwd, -.002)), add(scl(R, -.003), scl(h.up, -.0022)));
      const shots = [[add(add(h.pos, scl(R, .04)), add(scl(h.up, .02), scl(h.fwd, -.01))), h.pos], [add(head, add(scl(R, .022), add(scl(h.fwd, .012), scl(h.up, .002)))), head],
        [add(hind, add(scl(R, -.02), add(scl(h.fwd, -.008), scl(h.up, .004)))), hind], [add(h.pos, add(scl(R, .05), add(scl(h.up, .03), scl(h.fwd, .02)))), h.pos]];
      const si = l < 2.6 ? 0 : l < 7.3 ? 1 : l < 13.8 ? 2 : 3, sw = smooth(0, .8, l - [0, 2.6, 7.3, 13.8][si]), pr = shots[Math.max(si - 1, 0)], cu = shots[si];
      const cp = mix3(pr[0], cu[0], si ? sw : 1), ct = mix3(pr[1], cu[1], si ? sw : 1);
      sc.cam = look(cp, ct, .55, .0015); sc.dof = { focus: len(sub(cp, ct)), ap: .35 }; sc.shadowFocus = h.pos; } },
    { d: 12, sub: [[.5, 6, 'Not every flower is safe.'], [6.5, 11.8, 'A crab spider waits, white on white — invisible even to her.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .04; if (!landF) pick(); outdoors(sc, dt, F.t);
      const f = spiderF || landF, hp = flowers.head(f, F.t); sc.spiders = [hp];
      const a = 2 + l * .04, cp = add(hp, [Math.cos(a) * .12, .045, Math.sin(a) * .12]);
      sc.cam = look(cp, hp, .5, .002); sc.dof = { focus: len(sub(cp, hp)), ap: .8 }; sc.exposure = .75; sc.vision = smooth(7, 9, l); sc.shadowFocus = hp;
      const h = F.her; h.onFlower = false; const p = add(hp, [-.15 + l * .02, .05 + Math.max(0, l - 6) * .03, .1 - l * .005]); h.vel = [.1, l > 6 ? .3 : 0, -.02]; hover(h, p, dt); h.orient(dt); h.land = 0; h.prob = 0; h.pollen = 1; sc.bees.unshift(h); } },
    { d: 15, sub: [[.5, 6.5, 'Bee-eaters hunt bees on the wing.'], [7.5, 14.5, 'She drops into the grass forest, and the shadow passes.']], go(l, sc, dt) {
      sc.tod = TOD_OUT + .06; const h = F.her, c = pathPos(DIST * .55); c[1] = height(c[0], c[2]);
      const dive = smooth(4.8, 6.2, l);
      const p = add(c, [Math.sin(l * .7) * .15, .85 - dive * .74 + Math.sin(l * 3) * .03 * (1 - dive), .2 - l * .03]);
      h.vel = [Math.cos(l * .7) * .2, -dive * .5, .3]; h.pos = p; h.land = 0; h.pollen = 1; h.step(dt); h.orient(dt); sc.bees.unshift(h); sc.nearBees = 1;
      const bt = (l - 3) / 6, arc = t => add(c, [-11 + 22 * t, 1.25 + 15 * (t - .5) * (t - .5), -1.6 + 1.4 * t]);
      const bp = arc(bt), bv = norm(sub(arc(bt + .01), bp));
      sc.birds = [{ pos: bp, fwd: bv, A: [F.t * 17, Math.abs(bt - .5) < .18 ? .85 : 0, -.1, 0], hunt: l > 4 && l < 6 ? 1 : 0 }];
      const cam = add(c, [.35, .3, 1.5]), w = smooth(2.5, 4.5, l) * (1 - smooth(7.5, 9.5, l)) * .5;
      sc.cam = look(cam, mix3(add(p, [0, .1, 0]), bp, w), .95);
      sc.dof = { focus: len(sub(cam, mix3(p, bp, w))), ap: .08 }; sc.shadowFocus = p; sc.exposure = .85; } },
    { d: 16, sub: [[.5, 7.5, 'Home is found by memory and by the sun.'], [8, 15.5, 'At the door, guards taste her scent. She is family.']], go(l, sc, dt) {
      sc.tod = .5; outdoors(sc, dt, F.t, 1); const h = F.her;
      const u = ease(clamp(l / 9, 0, 1)), st = add(HIVE, [2.5, 1.2, 4]), p = mix3(st, add(LANDING, [0, .004, .01]), u);
      h.vel = scl(sub(add(LANDING, [0, .004, .01]), st), .1 * (1 - u)); h.pos = p; h.land = smooth(8, 9.5, l); h.pollen = 1;
      h.fwd = norm(add(norm(sub(ENTRANCE, p)), [0, .1 * (1 - h.land), 0])); h.up = [0, 1, 0]; h.step(dt); sc.bees.unshift(h); sc.nearBees = 3;
      if (l > 8) { // two guards at the entrance, antennae forward
        for (let i = 0; i < 2; i++) { const g = F.npc[i]; g.pos = add(LANDING, [(i - .5) * .03, .0, -.02]); g.fwd = [-(i - .5) * .5, 0, 1]; g.up = [0, 1, 0]; g.land = 1; g.state = 'guard'; g.vel = [0, 0, 0]; } }
      sc.cam = l < 8 ? look(add(p, [.15 - u * .1, .05, .12]), mix3(p, ENTRANCE, .4), .8) : look(add(LANDING, [.055, .01, .065]), add(LANDING, [-.005, .006, -.02]), .75, .002);
      sc.dof = { focus: len(sub(sc.cam.pos, h.pos)), ap: l < 8 ? .4 : 1.2 }; } },
    { d: 14, sub: [[.5, 6.5, 'Now she dances: the same angle, the same distance.'], [7, 13.5, 'Her sisters follow her out into the light.']], go(l, sc, dt) {
      sc.interior = 1; sc.tod = TOD_IN; interiorCrowd(sc, dt, F.t); F.dancer.seed = .31; F.dancer.pollen = 1;
      const c = F.dancer.pos; sc.cam = look(add(c, [Math.sin(l * .15) * .05, -.04 + l * .002, .04]), c, .6); sc.nearBees = 6;
      sc.dof = { focus: len(sub(sc.cam.pos, c)), ap: 1 }; } },
    { d: 22, sub: [[1, 8, 'A forager lives about three weeks. In that time she may fly eight hundred kilometres.'], [8.5, 15, 'Her whole life’s work: one twelfth of a teaspoon of honey.'], [16, 21.5, 'F O R A G E R']], go(l, sc, dt) {
      sc.tod = .885 + l * .001; outdoors(sc, dt, F.t, 1);
      const u = ease(l / 22), p = add(HIVE, [1.5 + u * 5, .3 + u * 8, 2.5 + u * 10]);
      sc.cam = look(p, add(HIVE, [-1 - u * 2, .5 + u * 2, -u * 5]), .9); sc.fade = 1 - smooth(19.5, 22, l); sc.dof = { focus: len(sub(p, HIVE)), ap: .2 * (1 - u) }; sc.end = l > 16; } },
  ];
  function flightShot(sc, dt, s, o) {
    const h = F.her, p = pathPos(s), p2 = pathPos(s + .5);
    if (o.low) { p[1] = height(p[0], p[2]) + .22; p2[1] = height(p2[0], p2[2]) + .22; }
    h.vel = scl(sub(p2, p), 6.5 / .5); h.pos = p; h.land = 0; h.step(dt); h.orient(dt); sc.bees.unshift(h); sc.nearBees = 1;
    const f = norm(sub(p2, p)), r = norm(cross(f, [0, 1, 0]));
    if (o.fpv) { sc.cam = look(add(p, [0, .005, 0]), add(p, add(scl(f, 1), [0, o.low ? .02 : -.12, 0])), 1.5, .004); sc.bees.shift(); }
    else sc.cam = look(add(add(p, scl(f, -o.back)), add([0, o.up, 0], scl(r, o.side))), add(p, scl(f, .03)), .95, .003);
    const gy = height(sc.cam.pos[0], sc.cam.pos[2]) + .02; sc.cam.pos[1] = Math.max(sc.cam.pos[1], gy);
    sc.shadowFocus = p; for (const b of F.npc) npcStep(b, dt, F.t, flowers); sc.bees.push(...F.npc);
    if (Math.hypot(F.npc[0].pos[0] - p[0], F.npc[0].pos[2] - p[2]) > 30) for (const b of F.npc) b.pos = add(p, [(Math.random() - .5) * 12, Math.random() * .6, (Math.random() - .5) * 12]);
    if (o.eye) sc.eye = 0;
  }
  const total = SHOTS.reduce((a, s) => a + s.d, 0);
  return {
    total, F, SHOTS,
    // fill scene for film time t
    frame(t, dt, sc, wt) {
      F.t = wt ?? t; let acc = 0, shot = SHOTS[SHOTS.length - 1], l = 0, idx = 0;
      for (let i = 0; i < SHOTS.length; i++) { if (t < acc + SHOTS[i].d) { shot = SHOTS[i]; l = t - acc; idx = i; break; } acc += SHOTS[i].d; }
      if (t >= total) l = shot.d;
      sc.shot = idx; sc.bars = .1; sc.tod = TOD_OUT; sc.hero = F.her;
      shot.go(l, sc, dt);
      if (!sc.interior && sc.cam) F.life.step(dt, F.t, sc.cam.pos, null, sc);
      sc.sub = ''; for (const [a, b, s] of shot.sub || []) if (l >= a && l < b) { sc.sub = s; sc.subA = Math.min(smooth(a, a + .6, l), 1 - smooth(b - .6, b, l)); }
      sc.title = shot.title ? smooth(2, 4, l) * (1 - smooth(7.5, 9, l)) : 0;
      if (sc.cam && !sc.interior) { const gy = height(sc.cam.pos[0], sc.cam.pos[2]) + .006; if (sc.cam.pos[1] < gy) sc.cam.pos[1] = gy; }
      // cut fades
      const fin = Math.min(smooth(0, .5, l), 1 - smooth(shot.d - .4, shot.d, l));
      if (idx !== 0 && idx !== 4) sc.fade = Math.min(sc.fade ?? 1, .15 + .85 * fin);
      return t < total;
    }
  };
}
