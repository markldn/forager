// FLY: open-world forager. Fill the crop, dodge bee-eaters and crab spiders, follow the home vector back, dance.
import { add, sub, scl, norm, cross, dot, len, clamp, smooth, mix3, lerp } from './math.js';
import { HIVE, PATCH, height, sunDir, WATER_Y, POND, WORLD } from './world.js';
import { Bee, npcStep, ENTRANCE, LANDING, hasSpider, NECTAR, CombCrowd, dancePose, combPos } from './sim.js';
import { SPECIES } from './mesh.js';
import { Life } from './life.js';

export function createPlay(flowers, input, opt = {}) {
  const me = new Bee(add(LANDING, [0, .15, .25]), .31);
  const P = { me, yaw: 0, pitch: .12, crop: 0, pollen: 0, delivered: 0, trips: 0, msg: '', msgT: 0, camMode: 0, tod: WORLD.tod,
    npc: [], birds: [], dead: 0, last: null, landed: null, dance: 0, danceInfo: null, crowd: null, visited: 0, odo: 0 };
  for (let i = 0; i < 26; i++) P.npc.push(new Bee(add(HIVE, [(Math.random() - .5) * 8, .3 + Math.random(), (Math.random() - .5) * 8]), Math.random()));
  P.life = new Life(flowers);
  for (let i = 0; i < 3; i++) P.birds.push({ pos: [0, 12, 0], fwd: [1, 0, 0], ph: Math.random() * 9, c: [Math.random() * 60 - 30, 0, Math.random() * 60 - 30], hunt: 0, A: [0, 0, 0, 0] });
  const say = (m, t = 4) => { P.msg = m; P.msgT = t; };
  // enemies: yellow-legged hornets hawk at the hive door; European beewolves hunt bees sitting on flowers
  P.hornets = [0, 1].map(i => { const b = new Bee(add(ENTRANCE, [i - .5, .4, .6]), Math.random()); b.kind = 3; b.scale = .025; b.mode = 'hawk'; return b; });
  P.wolves = [0, 1].map(() => { const b = new Bee(add(HIVE, [0, 5, 0]), Math.random()); b.kind = 4; b.scale = .016; b.c = null; return b; });
  { const sun = sunDir(P.tod), az = Math.atan2(sun[0], -sun[2]), bear = Math.atan2(PATCH[0], -PATCH[1]), a = Math.atan2(Math.sin(bear - az), Math.cos(bear - az));
    const deg = Math.round(Math.abs(a) * 57.3), dist = Math.round(Math.hypot(PATCH[0], PATCH[1]) / 10) * 10, col = { 0: 'yellow', 2: 'blue', 3: 'white' }[WORLD.dom];
    say(`Meadow #${WORLD.seed}. The dancer ran ${deg}° ${a > 0 ? 'right' : 'left'} of up for ${(dist / 1000).toFixed(2)} s: fly ${deg}° ${a > 0 ? 'right' : 'left'} of the sun, about ${dist} m, to a ${col} patch. Drink, then bring the nectar home.`, 11); }
  if (opt.beeEye) { P.beeEye = P.auto = P.vision = true; P.vis = 1; me.pos = [PATCH[0] - 20, height(PATCH[0] - 20, PATCH[1] + 15) + .6, PATCH[1] + 15];
    say('Through her eyes: she forages on her own — move the mouse to look around. Take the controls with W, autopilot with T, B leaves her eyes.', 9); }
  const respawn = why => { say(why, 6); P.dead = 2.2; me.pos = add(LANDING, [0, .03, .08]); me.vel = [0, 0, 0]; P.crop = 0; P.pollen = 0; P.landed = null; P.yaw = 0; };

  function step(dt, t, sc) {
    P.tod = Math.min(.82, P.tod + dt / 2400);
    sc.tod = P.tod;
    if (P.msgT > 0) P.msgT -= dt;
    if (input.pressed('KeyV')) P.vision = !P.vision;
    if (input.pressed('KeyE')) P.eye = !P.eye;
    if (input.pressed('KeyC')) P.camMode = (P.camMode + 1) % 3;
    if (input.pressed('KeyP')) P.pol = !P.pol;
    if (input.pressed('KeyB')) { P.beeEye = !P.beeEye; P.vision = P.beeEye; P.eye = false; } // her eyes always open in the hex (compound-eye) view
    if (input.pressed('KeyT')) { P.auto = !P.auto; P.landed = null; me.state = 'fly'; me.tgt = null; say(P.auto ? 'Autopilot: she forages by herself. Look around with the mouse.' : 'You have the controls.', 3); }
    if (P.dance > 0) return danceStep(dt, t, sc);
    P.dead = Math.max(0, P.dead - dt);
    if (P.auto && ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyQ'].some(k => input.k[k])) {
      P.auto = false; P.yaw = Math.atan2(me.fwd[0], me.fwd[2]); P.pitch = 0; P.ly = P.lp = 0; me.state = 'fly'; say('You have the controls (T: autopilot).', 3);
    }
    if (P.auto) { // she flies herself; the mouse only turns the head-camera
      P.ly = (P.ly || 0) - input.mx * .0025; P.lp = clamp((P.lp || 0) - input.my * .0022, -1.1, 1.1); input.mx = input.my = 0;
      if (!input.k.ShiftLeft) { P.ly *= 1 - Math.min(1, dt * .25); P.lp *= 1 - Math.min(1, dt * .25); }
      // forager loop: patch -> forage -> crop full -> fly home at cruise height -> enter, dance -> back out
      if (P.crop >= .95 && !P.goHome) { P.goHome = 1; say('Crop full. She turns for home — path integration points the way.', 4); }
      const nearF = flowers.some(me.pos, 7, 1, f => !hasSpider(f) && f.nectar > .1 && NECTAR[f.sp] > 0)[0];
      const goal = P.goHome ? ENTRANCE : !nearF && me.state !== 'land' ? (P.last || [PATCH[0], 0, PATCH[1]]) : null;
      const gd = goal ? Math.hypot(goal[0] - me.pos[0], goal[2] - me.pos[2]) : 0;
      if (goal && gd > (P.goHome ? 1.2 : 4)) { // cruise ~1 m above the meadow with a gentle weave
        const dir = norm([goal[0] - me.pos[0], 0, goal[2] - me.pos[2]]), side = [-dir[2], 0, dir[0]];
        const alt = height(me.pos[0], me.pos[2]) + .9 * Math.min(1, gd / 6) + .1;
        const want = add(add(scl(dir, Math.min(5.5, gd * 1.5)), scl(side, Math.sin(t * 1.3) * .6)), [0, (alt - me.pos[1]) * 2, 0]);
        const acc = scl(sub(want, me.vel), clamp(dt * 2.5, 0, 1)); me.vel = add(me.vel, acc); me.pos = add(me.pos, scl(me.vel, dt));
        me.state = 'fly'; me.tgt = null; me.land = Math.max(0, me.land - dt * 5); me.prob = 0; me.step(dt); me.orient(dt, scl(acc, 1 / Math.max(dt, 1e-3)));
      } else if (P.goHome) { // final approach into the entrance slot
        const tg = add(ENTRANCE, [0, 0, .02]), dd = sub(tg, me.pos), want = scl(norm(dd), clamp(len(dd) * 2.5, .15, 2));
        me.vel = mix3(me.vel, want, clamp(dt * 5, 0, 1)); me.pos = add(me.pos, scl(me.vel, dt)); me.step(dt); me.orient(dt);
        if (len(sub(ENTRANCE, me.pos)) < .05) { P.goHome = 0; startDance(t); }
      } else npcStep(me, dt, t, flowers, false);
      if (me.state === 'land' && !me.onFlower) P.visited++; me.onFlower = me.state === 'land'; P.landed = null;
      if (me.onFlower && me.flower && NECTAR[me.flower.sp] > 0) P.last = [me.flower.x, 0, me.flower.z];
      if (me.onFlower && me.flower) { const f = me.flower; const take = Math.min(f.nectar * NECTAR[f.sp], dt * .12, 1 - P.crop);
        if (take > 0) { P.crop += take; f.nectar -= take / Math.max(NECTAR[f.sp], 1e-3); } P.pollen = Math.min(1, P.pollen + dt * .05); }
      me.pollen = P.pollen; P.odo += len(me.vel) * dt * (me.onFlower ? 0 : 1);
      P.yaw = Math.atan2(me.fwd[0], me.fwd[2]);
      step2(dt, t, sc); return;
    }
    // steering
    P.yaw -= input.mx * .0025; P.pitch = clamp(P.pitch - input.my * .0022, -1.2, 1.2); input.mx = input.my = 0;
    if (input.k.ArrowLeft) P.yaw += dt * 1.8; if (input.k.ArrowRight) P.yaw -= dt * 1.8;
    if (input.k.ArrowUp) P.pitch = clamp(P.pitch + dt, -1.2, 1.2); if (input.k.ArrowDown) P.pitch = clamp(P.pitch - dt, -1.2, 1.2);
    const fwd = [Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)], right = norm(cross(fwd, [0, 1, 0]));
    if (P.landed) {
      const f = P.landed, hp = flowers.head(f, t), u = flowers.up(f);
      me.onFlower = true; me.pos = add(hp, scl(u, .0022)); me.land = Math.min(1, me.land + dt * 4); me.up = mix3(me.up, u, .2); me.prob = Math.min(1, me.prob + dt * 2);
      me.fwd = norm(cross(cross(me.up, fwd), me.up).map(x => -x));
      const take = Math.min(f.nectar * NECTAR[f.sp], dt * .12, 1 - P.crop);
      if (take > 0) { P.crop += take; f.nectar -= take / Math.max(NECTAR[f.sp], 1e-3); }
      P.pollen = Math.min(1, P.pollen + dt * (f.sp === 1 ? .12 : .05)); me.pollen = P.pollen;
      if (f.nectar <= .02 && NECTAR[f.sp] > 0 && !P.emptyMsg) { say('Empty. Bees mark drained flowers with scent — move on.', 3); P.emptyMsg = 1; }
      if (P.crop >= .999 && !P.fullMsg) { say('Crop full (~40 mg). Follow the home vector back to the hive.', 5); P.fullMsg = 1; }
      if (input.k.KeyW || input.k.Space || input.pressed('KeyF')) { P.landed = null; P.noLand = .8; me.vel = add(scl(u, 1), scl(fwd, .5)); me.land = 0; P.emptyMsg = 0; }
      step2(dt, t, sc); return;
    }
    me.onFlower = false; me.land = Math.max(0, me.land - dt * 5); me.prob = Math.max(0, me.prob - dt * 3);
    const boost = input.k.ShiftLeft || input.k.ShiftRight ? 3.2 : 1;
    let thrust = [0, 0, 0];
    if (input.k.KeyW) thrust = add(thrust, scl(fwd, 6.5 * boost));
    if (input.k.KeyS) thrust = add(thrust, scl(fwd, -2));
    if (input.k.KeyA) thrust = add(thrust, scl(right, -2.5)); if (input.k.KeyD) thrust = add(thrust, scl(right, 2.5));
    if (input.k.Space) thrust = add(thrust, [0, 2.5, 0]); if (input.k.KeyQ || input.k.ControlLeft) thrust = add(thrust, [0, -2.5, 0]);
    const acc = scl(sub(thrust, me.vel), clamp(dt * 2.5, 0, 1));
    me.vel = add(me.vel, acc); me.pos = add(me.pos, scl(me.vel, dt));
    P.odo += len(me.vel) * dt;
    const gy = height(me.pos[0], me.pos[2]); if (me.pos[1] < gy + .012) { me.pos[1] = gy + .012; me.vel[1] = Math.max(0, me.vel[1]); }
    if (Math.hypot(me.pos[0] - POND[0], me.pos[2] - POND[1]) < 26 && me.pos[1] < WATER_Y + .01) { me.pos[1] = WATER_Y + .01; me.vel[1] = .3; }
    // hive box collision
    const lp = sub(me.pos, HIVE); if (Math.abs(lp[0]) < .28 && lp[1] < 1.07 && lp[1] > 0 && Math.abs(lp[2]) < .23) { me.pos[2] = HIVE[2] + (lp[2] > 0 ? .23 : -.23); me.vel[2] *= -.3; }
    me.fwd = norm(mix3(me.fwd, norm(add(fwd, [0, .15, 0])), clamp(dt * 8, 0, 1))); me.orient(dt * .5, acc.map(x => x / Math.max(dt, 1e-3)));
    me.step(dt);
    // landing
    const sp = len(me.vel), fl = flowers.near(me.pos, .3);
    P.hint = '';
    if (fl) {
      const hp = flowers.head(fl, t), d = len(sub(hp, me.pos));
      if (d < .08) P.hint = `${SPECIES[fl.sp]} — ${fl.sp === 1 ? 'pollen only' : fl.nectar > .05 ? 'nectar' : 'drained'} · press F to land`;
      P.noLand = Math.max(0, (P.noLand || 0) - dt);
      if (d < .08 && !P.noLand && (input.pressed('KeyF') || (d < .02 && sp < 1.5))) {
        if (hasSpider(fl)) { respawn('A crab spider was waiting in the daisy. You wake again at the hive.'); }
        else { P.landed = fl; P.visited++; me.vel = [0, 0, 0]; if (fl.sp === 1 && !P.popMsg) { say('Poppies give no nectar — only dark pollen.', 4); P.popMsg = 1; } }
      }
    }
    // home
    const de = len(sub(ENTRANCE, me.pos));
    if (de < .25) P.hint = P.crop > .05 ? 'Fly into the entrance to unload and dance' : 'Home. The meadow is waiting.';
    if (de < .045 && P.crop > .05) startDance(t);
    step2(dt, t, sc);
  }
  function step2(dt, t, sc) {
    // NPCs and predators
    const home = len(sub(me.pos, HIVE)) < 8;
    for (const b of P.npc) { npcStep(b, dt, t, flowers, home); if (len(sub(b.pos, me.pos)) > 30) { b.pos = add(me.pos, [(Math.random() - .5) * 14, Math.random() * .5 + .2, (Math.random() - .5) * 14]); b.tgt = null; b.state = 'fly'; } }
    const agl = me.pos[1] - height(me.pos[0], me.pos[2]);
    for (const bd of P.birds) {
      bd.ph += dt;
      const c = add(me.pos, bd.c);
      let want;
      const d = len(sub(me.pos, bd.pos));
      if (!P.landed && !P.auto && !P.dead && agl > .55 && d < 22 && (P.clock = (P.clock || 0) + dt / 3) > 45) bd.hunt = Math.min(1, bd.hunt + dt * .4); else bd.hunt = Math.max(0, bd.hunt - dt * .8);
      if (bd.hunt > .6) want = norm(sub(me.pos, bd.pos));
      else { const tg = add(c, [Math.cos(bd.ph * .3) * 18, 9 + Math.sin(bd.ph * .2) * 4 + height(c[0], c[2]), Math.sin(bd.ph * .3) * 18]); want = norm(sub(tg, bd.pos)); }
      bd.fwd = norm(mix3(bd.fwd, want, clamp(dt * (bd.hunt > .6 ? 2.5 : 1), 0, 1)));
      bd.pos = add(bd.pos, scl(bd.fwd, (bd.hunt > .6 ? 11 : 8) * dt));
      const by = height(bd.pos[0], bd.pos[2]) + .6; if (bd.pos[1] < by) { bd.pos[1] = by; bd.fwd[1] = Math.abs(bd.fwd[1]); }
      if (len(sub(bd.pos, me.pos)) > 120) bd.pos = add(me.pos, [Math.random() * 80 - 40, 15, Math.random() * 80 - 40]);
      bd.A = [t * 16 + bd.ph, Math.sin(bd.ph * .7) > .3 ? 1 : 0, -.1, 0];
      if (d < .12 && bd.hunt > .6 && !P.dead) respawn('Snapped up by a bee-eater. Stay low — they hunt above the grass.');
      if (bd.hunt > .6 && d < 10 && !P.warned) { say('A bee-eater is diving — drop into the grass!', 3); P.warned = 1; }
      if (bd.hunt < .2) P.warned = 0;
    }
    enemies(dt, t);
    if (P.life.step(dt, t, me.pos, P.auto || P.dead ? null : me, sc) === 'dragonfly' && !P.dead) respawn('An emperor dragonfly snatched you over the pond. They hunt insects on the wing.');
    sc.bees.push(me, ...P.npc, ...P.hornets, ...P.wolves); sc.nearBees = 1; sc.hero = me;
    sc.birds = P.birds;
    sc.spiders = flowers.list.filter(f => hasSpider(f) && Math.hypot(f.x - me.pos[0], f.z - me.pos[2]) < 12).slice(0, 30).map(f => flowers.head(f, t));
    camera(dt, sc);
  }
  function camera(dt, sc) {
    const f = [Math.sin(P.yaw), 0, Math.cos(P.yaw)];
    const mode = P.eye || P.beeEye ? 2 : P.camMode;
    if (mode === 2) { // the bee's own eyes: from between the compound eyes, very wide field
      let dir;
      if (P.auto) {
        const sp = len(me.vel), hf = norm([me.fwd[0], 0, me.fwd[2]]);
        const want = me.onFlower ? norm(add(hf, [0, -.5, 0])) : sp > .25 ? norm(add(norm(me.vel), [0, -.08, 0])) : hf;
        P.hd = P.hd ? norm(mix3(P.hd, want, clamp(dt * 2.5, 0, 1))) : want;
        const yaw = Math.atan2(P.hd[0], P.hd[2]) + (P.ly || 0), pit = clamp(Math.asin(clamp(P.hd[1], -1, 1)) + (P.lp || 0), -1.3, 1.3);
        dir = [Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)];
      } else dir = [Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch)];
      const head = add(add(me.pos, scl(me.fwd, .0055 * (me.onFlower ? 1 : 0))), scl(me.up, .0025));
      sc.cam = { pos: head, tgt: add(head, dir), fov: P.beeEye ? 1.95 : 1.7, near: .002, far: 3000 }; sc.noSelf = me; sc.beeEye = P.beeEye && !P.eye ? 1 : 0;
      sc.antennae = P.beeEye ? { land: me.land, t: P.t2 = (P.t2 || 0) + dt, sp: len(me.vel) } : null;
    } else {
      const back = mode ? .045 : .1, up = mode ? .012 : .028;
      const dir = [Math.sin(P.yaw) * Math.cos(P.pitch * .6), Math.sin(P.pitch * .6), Math.cos(P.yaw) * Math.cos(P.pitch * .6)];
      const want = add(me.pos, add(scl(dir, -back), [0, up, 0]));
      const off = sub(want, me.pos); P.off = P.off ? mix3(P.off, off, clamp(dt * 5, 0, 1)) : off; P.cp = add(me.pos, P.off);
      const gy = height(P.cp[0], P.cp[2]) + .01; if (P.cp[1] < gy) P.cp[1] = gy;
      sc.cam = { pos: P.cp, tgt: add(me.pos, scl(dir, .04)), fov: 1.0, near: .003, far: 3000 };
    }
    sc.dof = { focus: len(sub(sc.cam.pos, me.pos)), ap: mode === 2 ? 0 : me.land > .5 ? .5 : .05 };
    sc.vision = P.vis = lerp(P.vis || 0, P.vision ? 1 : 0, clamp(dt * 2.5, 0, 1)); sc.eye = P.beeEye ? (P.eye ? .3 : 0) : P.eye ? .9 : 0; sc.pol = P.pol ? 1 : 0;
    sc.shadowFocus = me.pos; sc.fade = P.dead > 0 ? 1 - Math.sin(Math.PI * P.dead / 2.2) : 1;
  }
  // unload + waggle dance inside the hive
  function startDance(t) {
    const sun = sunDir(P.tod), az = Math.atan2(sun[0], -sun[2]);
    const tgt = P.last || PATCH, bear = Math.atan2(tgt[0], -tgt[2]), a = Math.atan2(Math.sin(bear - az), Math.cos(bear - az)), dist = Math.hypot(tgt[0], tgt[2]);
    const mg = P.crop * 40;
    P.delivered += mg; P.trips++;
    P.danceInfo = { a, dist, rs: Math.max(.08, dist / 1000), mg };
    P.dance = 12; P.crop = 0; P.crowd = P.crowd || new CombCrowd(120, 4); P.recruits = Math.round(mg / 8 + Math.random() * 3);
  }
  function danceStep(dt, t, sc) {
    P.dance -= dt; sc.interior = 1;
    const di = P.danceInfo, dp = dancePose(12 - P.dance, di.a, di.rs, .16, .1);
    me.pos = combPos(dp.x, dp.y); me.up = [0, 0, 1]; me.fwd = [Math.sin(dp.h), Math.cos(dp.h), 0]; me.waggle = dp.wag; me.land = 1; me.step(dt); me.wing = 0;
    P.crowd.step(dt, t, [{ x: dp.x, y: dp.y, h: dp.h }], { x: dp.x, y: dp.y, h: dp.h });
    sc.bees.push(me, ...P.crowd.b); sc.nearBees = 6;
    const deg = Math.round(Math.abs(di.a) * 180 / Math.PI);
    P.msg = `You dance: ${deg}° ${di.a > 0 ? 'right' : 'left'} of up = ${deg}° ${di.a > 0 ? 'right' : 'left'} of the sun · waggle ${di.rs.toFixed(2)} s ≈ ${Math.round(di.dist)} m · ${di.mg.toFixed(0)} mg delivered · ${P.recruits} sisters recruited`; P.msgT = 1;
    sc.cam = { pos: add(me.pos, [Math.sin(t * .2) * .04, -.035, .045]), tgt: me.pos, fov: .65, near: .002, far: 50 };
    sc.dof = { focus: len(sub(sc.cam.pos, me.pos)), ap: 1 }; sc.overlay = { dance: 1 };
    if (P.dance <= 0) { me.pos = add(LANDING, [0, .02, .06]); me.vel = [0, .5, 1]; P.yaw = 0; P.pitch = 0; me.land = 0; me.waggle = 0; P.fullMsg = 0; me.state = 'fly'; me.tgt = null; say('Back to the meadow. The day is moving on — watch the sun.', 4); }
    sc.fade = Math.min(smooth(12, 11.2, P.dance), smooth(0, .8, P.dance));
  }
  function enemies(dt, t) {
    for (const h of P.hornets) { // hawking: hover facing the entrance, dart at returning foragers
      h.step(dt);
      const post = add(ENTRANCE, [Math.sin(t * .7 + h.seed * 9) * .4, .22 + .1 * Math.sin(t * 1.3 + h.seed * 4), .55 + .2 * Math.cos(t * .9 + h.seed * 7)]);
      const dme = len(sub(me.pos, h.pos));
      if (h.mode === 'hawk' && !P.landed && !P.dead && P.dance <= 0 && !P.auto && P.odo > 30 && dme < 1.4) {
        h.mode = 'chase'; h.ct = 0; if (!P.hornetMsg) { say('A yellow-legged hornet is hawking at your hive — jink hard, or dive for the door!', 4); P.hornetMsg = 1; } }
      if (h.mode === 'chase') { h.ct += dt; if (h.ct > 5 || dme > 4 || P.dead || P.dance > 0) h.mode = 'hawk'; }
      const tg = h.mode === 'chase' ? me.pos : post, dd = sub(tg, h.pos);
      const want = scl(norm(dd), h.mode === 'chase' ? 7.4 : clamp(len(dd) * 2, .05, 1.5));
      h.vel = mix3(h.vel, want, clamp(dt * (h.mode === 'chase' ? 2.2 : 3), 0, 1)); h.pos = add(h.pos, scl(h.vel, dt));
      const gy = height(h.pos[0], h.pos[2]) + .05; if (h.pos[1] < gy) h.pos[1] = gy;
      if (h.mode === 'hawk') { h.fwd = norm(mix3(h.fwd, norm(add(sub(ENTRANCE, h.pos), [0, .3, 0])), clamp(dt * 3, 0, 1))); h.up = [0, 1, 0]; } else h.orient(dt);
      if (h.mode === 'chase' && dme < .04 && !P.dead) respawn('Caught by a yellow-legged hornet. They hover at hive doors to snatch returning foragers.');
    }
    for (const w of P.wolves) { // patrol low over flowers near you; pounce on a bee that sits still on a flower
      w.step(dt);
      if (!w.c || len(sub(w.c, me.pos)) > 30) { const f = flowers.some(me.pos, 22, 1)[0]; w.c = f ? flowers.head(f, t) : add(me.pos, [12, 0, 12]); w.pos = add(w.c, [0, .6, 0]); }
      const dme = len(sub(me.pos, w.pos)), hunt = (P.landed || (P.auto && me.onFlower)) && dme < 2.5 && !P.dead;
      const tg = hunt ? me.pos : add(w.c, [Math.sin(t * .8 + w.seed * 9) * 1.5, .25 + .12 * Math.sin(t * 2.1 + w.seed), Math.cos(t * .6 + w.seed * 5) * 1.5]);
      const dd = sub(tg, w.pos), want = scl(norm(dd), hunt ? 2.6 : clamp(len(dd) * 1.5, .2, 2.5));
      w.vel = mix3(w.vel, add(want, [Math.sin(t * 7 + w.seed * 20) * .5, 0, Math.cos(t * 6 + w.seed * 9) * .5]), clamp(dt * 4, 0, 1)); w.pos = add(w.pos, scl(w.vel, dt)); w.orient(dt);
      if (hunt && !P.wolfMsg) { say('A beewolf is stalking the flowers — take off!', 3); P.wolfMsg = 1; } if (!hunt) P.wolfMsg = 0;
      if (hunt && dme < .03) { if (P.auto) { me.state = 'fly'; me.t = -1; me.vel = [0, 1, 0]; } else respawn('A European beewolf stung you on the flower. She paralyses honeybees to feed her larvae.'); }
    }
  }
  P.step = step;
  // remember where good flowers were (for the dance)
  P.track = () => { if (P.landed && NECTAR[P.landed.sp] > 0) P.last = [P.landed.x, 0, P.landed.z]; };
  return P;
}
