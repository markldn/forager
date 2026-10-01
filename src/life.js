// Ambient meadow life shared by FLY and the film: bumblebees and hoverflies (bee rig), butterflies, dragonflies.
import { add, sub, scl, norm, len, clamp, mix3 } from './math.js';
import { height, POND, POND_R, WATER_Y } from './world.js';
import { Bee, npcStep, hasSpider } from './sim.js';
const R = (a, b) => a + Math.random() * (b - a);

export class Life {
  constructor(flowers) {
    this.f = flowers;
    this.bumbles = Array.from({ length: 6 }, () => Object.assign(new Bee([0, -1e3, 0], Math.random()), { kind: 7, scale: .021 }));
    this.hovers = Array.from({ length: 6 }, () => Object.assign(new Bee([0, -1e3, 0], Math.random()), { kind: 8, scale: .011, st: 'hover', tm: 0 }));
    this.flies = Array.from({ length: 8 }, (_, i) => ({ pos: [0, -1e3, 0], vel: [0, 0, 0], fwd: [0, 0, 1], up: [0, 1, 0], s: i % 3 ? .026 : .03, var: i % 3 ? 0 : 1, ph: Math.random() * 9, land: 0, tm: 0, tgt: null, A: [0, 0, 0, 0] }));
    this.drag = Array.from({ length: 3 }, () => ({ pos: [POND[0], WATER_Y + .6, POND[1]], vel: [0, 0, 0], fwd: [1, 0, 0], up: [0, 1, 0], s: .078, tm: 0, tgt: null, hunt: 0, A: [0, 0, 0, 0] }));
  }
  near(c) { const a = R(0, 6.283), d = R(3, 14); const x = c[0] + Math.cos(a) * d, z = c[2] + Math.sin(a) * d; return [x, height(x, z) + R(.3, .9), z]; }
  // c: where the action is (camera / player); player: hunted Bee or null. Returns an event string if something caught her.
  step(dt, t, c, player, sc) {
    let ev = null;
    for (const b of this.bumbles) { if (len(sub(b.pos, c)) > 28) { b.pos = this.near(c); b.state = 'fly'; b.tgt = null; } npcStep(b, dt, t, this.f, false); }
    for (const h of this.hovers) { // hover dead still, then dart
      if (len(sub(h.pos, c)) > 25) { h.pos = this.near(c); h.tgt = h.pos.slice(); }
      h.step(dt); h.tm -= dt;
      if (h.tm < 0) { h.st = h.st === 'hover' ? 'dart' : 'hover'; h.tm = h.st === 'hover' ? R(.8, 3) : R(.15, .4); if (h.st === 'dart') { const p = add(h.pos, [R(-1.5, 1.5), R(-.3, .3), R(-1.5, 1.5)]); p[1] = Math.max(p[1], height(p[0], p[2]) + .25); h.tgt = p; } }
      const want = h.st === 'dart' ? scl(sub(h.tgt, h.pos), 6) : scl(sub(h.tgt || h.pos, h.pos), 3);
      h.vel = mix3(h.vel, want, clamp(dt * (h.st === 'dart' ? 12 : 6), 0, 1)); h.pos = add(h.pos, scl(h.vel, dt));
      if (h.st === 'hover') h.pos = add(h.pos, [Math.sin(t * 9 + h.seed * 30) * .0004, Math.sin(t * 7 + h.seed * 9) * .0006, 0]);
      h.land = 0; if (len(h.vel) > .3) h.fwd = norm(mix3(h.fwd, norm([h.vel[0], 0, h.vel[2]]), clamp(dt * 8, 0, 1))); h.up = [0, 1, 0];
    }
    for (const b of this.flies) { // fluttering butterflies that visit flowers and sit with wings closed
      if (len(sub(b.pos, c)) > 26) { b.pos = this.near(c); b.tgt = null; b.land = 0; }
      b.tm -= dt; b.ph += dt * 6.2832 * (b.land > .5 ? 0 : 9);
      if (b.land > .5) {
        if (b.tgt) b.pos = add(this.f.head(b.tgt, t), [0, .004, 0]);
        b.A = [Math.sin(t * .7 + b.s * 99) > .6 ? 1.2 : 0, .8 + .2 * Math.sin(t * .9 + b.s * 50), b.var, 0];
        if (b.tm < 0) { b.land = 0; b.tgt = null; b.vel = [0, .6, 0]; b.tm = R(3, 7); }
      } else {
        if (!b.tgt || b.tm < -12) { b.tgt = this.f.some(b.pos, 8, 1, f => !hasSpider(f))[0] || null; b.tm = R(4, 9); }
        const tp = b.tgt ? this.f.head(b.tgt, t) : add(b.pos, [1, 0, 0]), d = sub(tp, b.pos), dl = len(d);
        const want = add(scl(norm(d), Math.min(1.3, dl * 2 + .2)), [Math.sin(t * 2.1 + b.s * 70) * .9, Math.sin(b.ph * .5) * .5 + .15, Math.cos(t * 1.7 + b.s * 40) * .9].map(x => x * Math.min(1, dl * 3)));
        b.vel = mix3(b.vel, want, clamp(dt * 3, 0, 1)); b.pos = add(b.pos, scl(b.vel, dt));
        const gy = height(b.pos[0], b.pos[2]) + .15; if (b.pos[1] < gy) b.pos[1] = gy;
        if (b.tgt && dl < .03 && b.tm < 0) { b.land = 1; b.tm = R(3, 8); }
        b.A = [b.ph, 0, b.var, 0];
      }
      if (len(b.vel) > .1 && b.land < .5) b.fwd = norm(mix3(b.fwd, norm([b.vel[0], 0, b.vel[2]]), clamp(dt * 4, 0, 1)));
    }
    const atPond = Math.hypot(c[0] - POND[0], c[2] - POND[1]) < POND_R * 4;
    for (const d of this.drag) { // dash-and-hover patrols over the pond; hunt small insects in the air
      if (!atPond) { d.off = 1; continue; } d.off = 0;
      d.tm -= dt; d.A[0] += dt * 6.2832 * 30;
      const pl = player && player.land < .5 && len(sub(player.pos, d.pos)) < 3 && Math.hypot(player.pos[0] - POND[0], player.pos[2] - POND[1]) < POND_R * 1.5;
      d.hunt = pl ? Math.min(1, d.hunt + dt * 2) : Math.max(0, d.hunt - dt);
      if (d.tm < 0 || !d.tgt) { const a = R(0, 6.283), r = R(0, POND_R * .9); d.tgt = [POND[0] + Math.cos(a) * r, WATER_Y + R(.3, 1.2), POND[1] + Math.sin(a) * r]; d.tm = R(.6, 2.2); }
      const tg = d.hunt > .5 ? player.pos : d.tgt, dd = sub(tg, d.pos), dl = len(dd);
      const want = scl(norm(dd), d.hunt > .5 ? 8 : Math.min(6, dl * 4));
      d.vel = mix3(d.vel, want, clamp(dt * 5, 0, 1)); d.pos = add(d.pos, scl(d.vel, dt));
      if (len(d.vel) > .4) d.fwd = norm(mix3(d.fwd, norm([d.vel[0], d.vel[1] * .3, d.vel[2]]), clamp(dt * 10, 0, 1)));
      if (d.hunt > .5 && dl < .045) ev = 'dragonfly';
    }
    for (const b of this.bumbles) b.step(0);
    sc.bees.push(...this.bumbles, ...this.hovers);
    sc.butterflies = this.flies; sc.dragons = this.drag.filter(d => !d.off);
    return ev;
  }
}
