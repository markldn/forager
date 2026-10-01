import { createRenderer } from './render.js';
import { Flowers, light, packRows, Bee, gaitStep, syncHive } from './sim.js';
import { createFilm } from './story.js';
import { createPlay } from './play.js';
import { createAudio } from './audio.js';
import { basis, len, sub, add, norm, clamp, smooth } from './math.js';
import { HIVE, PATCH, POND, sunDir, height, setSeed, SEED, WORLD, terrainConsts, WATER_Y } from './world.js';

const $ = id => document.getElementById(id);
const cv = $('c'), ov = $('o'), ctx = ov.getContext('2d');
let R;
try { R = createRenderer(cv); } catch (e) { $('menu').innerHTML = '<h1>FORAGER</h1><p>' + e.message + '</p>'; throw e; }
const flowers = new Flowers();
// ---- input
const input = { k: {}, p: {}, mx: 0, my: 0, pressed(c) { const v = this.p[c]; this.p[c] = 0; return v; } };
addEventListener('keydown', e => { if (!input.k[e.code]) input.p[e.code] = 1; input.k[e.code] = 1; if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => { input.k[e.code] = 0; });
addEventListener('mousemove', e => { if (document.pointerLockElement === cv) { input.mx += e.movementX; input.my += e.movementY; } });
let touch = null;
cv.addEventListener('touchstart', e => { const t = e.touches[0]; touch = [t.clientX, t.clientY]; input.k.KeyW = 1; e.preventDefault(); }, { passive: false });
cv.addEventListener('touchmove', e => { const t = e.touches[0]; if (touch) { input.mx += (t.clientX - touch[0]) * 2; input.my += (t.clientY - touch[1]) * 2; touch = [t.clientX, t.clientY]; } e.preventDefault(); }, { passive: false });
cv.addEventListener('touchend', () => { touch = null; input.k.KeyW = 0; });
cv.addEventListener('click', () => { if (mode === 'fly' && cv.requestPointerLock) cv.requestPointerLock(); });

let mode = 'menu', film = null, play = null, audio = null, filmT = 0, worldT = 0, res = 1, paused = false, lastShot = -1;
const ft = [];
function start(m, opt) {
  if (!audio) try { audio = createAudio(); } catch (e) { }
  audio?.ctx.resume();
  $('menu').style.display = 'none'; mode = m;
  const qs = +new URLSearchParams(location.search).get('seed');
  setSeed(m === 'film' ? 0 : qs || 1 + Math.floor(Math.random() * 99999)); syncHive(); R.setTrees(); flowers.cache.clear(); flowers.dirty = true;
  if (m === 'film') { film = createFilm(flowers); filmT = 0; $('hud').style.display = 'none'; }
  else { play = createPlay(flowers, input, opt); $('hud').style.display = 'block'; cv.requestPointerLock?.(); }
}
$('bf').onclick = () => start('film'); $('bp').onclick = () => start('fly'); $('be').onclick = () => start('fly', { beeEye: 1 });
addEventListener('keydown', e => {
  if (e.code === 'Escape' && mode !== 'menu') { mode = 'menu'; $('menu').style.display = 'flex'; $('hud').style.display = 'none'; document.exitPointerLock?.(); }
  if (mode === 'film' && film) {
    const starts = []; let a = 0; for (const s of film.SHOTS) { starts.push(a); a += s.d; }
    const cur = starts.findLastIndex(x => x <= filmT);
    if (e.code === 'ArrowRight') filmT = starts[Math.min(cur + 1, starts.length - 1)] + .01;
    if (e.code === 'ArrowLeft') filmT = starts[Math.max(cur - (filmT - starts[cur] < 1.5 ? 1 : 0), 0)] + .01;
    if (e.code === 'Space') paused = !paused;
  }
  if (e.code === 'KeyM') audio?.mute(audio.muted = !audio.muted);
});
window.__bee = { flowers, height, PATCH, HIVE, get mode() { return mode; }, start, seek: t => { filmT = t; }, get filmT() { return filmT; }, get total() { return film?.total; }, input, get play() { return play; }, get res() { return res; }, setRes: r => { res = r; fixedRes = 1; } };
let fixedRes = 0;

function size() { const d = Math.min(devicePixelRatio || 1, 1.5); cv.width = Math.round(innerWidth * d); cv.height = Math.round(innerHeight * d); ov.width = cv.width; ov.height = cv.height; }
addEventListener('resize', size); size();

let last = performance.now(), menuT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min((now - last) / 1000, 1 / 20); last = now;
  ft.push(dt); if (ft.length > 30) ft.shift();
  if (!fixedRes && ft.length === 30) { const avg = ft.reduce((a, b) => a + b) / 30; if (avg > 1 / 40 && res > .5) res -= .02; else if (avg < 1 / 57 && res < 1) res += .01; }
  const sc = { t: now / 1000, bees: [], birds: [], spiders: [], vision: 0, eye: 0, pol: 0, fade: 1, bars: 0, res, nearBees: 0, timeScale: 1 };
  if (mode === 'film') {
    if (!paused) filmT += dt;
    film.frame(filmT, dt, sc, worldT);
    worldT += (paused ? 0 : dt) * (sc.timeScale || 1);
    if (filmT > film.total + 1) { mode = 'menu'; $('menu').style.display = 'flex'; }
  } else if (mode === 'fly') {
    worldT += dt; play.step(dt, worldT, sc); play.track();
  } else { // menu: slow drift over the meadow
    menuT += dt; worldT += dt; sc.tod = .7; const a = menuT * .03;
    sc.cam = { pos: add(HIVE, [Math.cos(a) * 3, .5, Math.sin(a) * 3]), tgt: add(HIVE, [0, .6, 0]), fov: .9, near: .01, far: 3000 };
    sc.dof = { focus: 3, ap: .2 };
  }
  sc.t = worldT;
  if (window.__cam) { const o = window.__cam(sc); if (o) Object.assign(sc, o); }
  const L = light(sc.tod ?? .4, sc.interior); L.uT = worldT; L.uCam = sc.cam.pos; sc.light = L;
  Object.assign(L, { HB: terrainConsts.hiveBase, PB: terrainConsts.pondBase, WY: WATER_Y, POND, PATCH, uSeed: SEED, uPatchC: WORLD.patchCol });
  sc.exposure = sc.exposure ?? (sc.interior ? 1.5 : 1);
  if (!sc.interior) { const fl = flowers.update(sc.cam.pos); if (fl) R.setFlowers(fl); }
  // creature rows: hero first (shells), then by distance
  gaitStep(sc.bees, dt * (sc.timeScale || 1));
  const cp = sc.cam.pos;
  const bees = sc.bees.filter(b => b !== sc.noSelf && len(sub(b.pos, cp)) < (sc.interior ? 2 : 40));
  if (sc.hero && bees.includes(sc.hero)) { bees.splice(bees.indexOf(sc.hero), 1); bees.unshift(sc.hero); }
  const hero = sc.nearBees ? bees.slice(0, 1) : [];
  const rest = bees.slice(hero.length).sort((a, b) => len(sub(a.pos, cp)) - len(sub(b.pos, cp)));
  sc.beeData = packRows([...hero, ...rest]);
  sc.nearBees = Math.min(bees.length, Math.max(sc.nearBees, 1) + rest.filter(b => len(sub(b.pos, cp)) < .25).length);
  const brow = new Float32Array(sc.birds.length * 24);
  sc.birds.forEach((b, i) => { brow.set(basis(b.pos, b.fwd, [0, 1, 0], 1), i * 24); brow.set(b.A, i * 24 + 16); });
  sc.birdData = brow;
  const srow = new Float32Array(sc.spiders.length * 24);
  sc.spiders.forEach((p, i) => { const a = 2.4 + i * 2.1, o = [Math.cos(a), 0, Math.sin(a)]; srow.set(basis(add(p, [o[0] * .0115, -.0035, o[2] * .0115]), o, [0, 1, 0], .016), i * 24); }); // sits on the petals at the disc edge, facing out
  sc.spiderData = srow;
  const rows = (list, f) => { const r = new Float32Array(list.length * 24); list.forEach((b, i) => { r.set(basis(b.pos, b.fwd, b.up || [0, 1, 0], b.s), i * 24); r.set(b.A, i * 24 + 16); }); return r; };
  sc.bflyData = rows((sc.butterflies || []).filter(b => len(sub(b.pos, cp)) < 30)); sc.dragData = rows((sc.dragons || []).filter(b => len(sub(b.pos, cp)) < 40));
  const m = R.frame(sc);
  hud(sc, m, dt);
  if (audio) {
    const hb = sc.hero || sc.bees[0], d = hb ? len(sub(hb.pos, cp)) : 9, sp = hb?.vel ? len(hb.vel) : 0;
    const near = sc.bees.filter(b => b !== hb).reduce((a, b) => a + clamp(.4 / (len(sub(b.pos, cp)) + .05), 0, 1), 0);
    audio.update({ buzz: hb && hb.land < .5 ? clamp(.06 / (d + .02), 0, 1) : 0, pitch: clamp(sp / 7, 0, 1), swarm: clamp(near * .3, 0, 1), inside: !!sc.interior, wind: clamp(sp / 7, 0, 1),
      waggle: sc.interior ? (sc.bees.find(b => b.waggle > .5) ? 1 : 0) * (sc.slowmo ? 0 : 1) : 0, music: mode === 'fly' ? .35 : 1, eater: sc.birds.some(b => b.hunt > .6 && Math.random() < .004) });
  }
}
requestAnimationFrame(loop);

function proj(VP, p) { const x = VP[0] * p[0] + VP[4] * p[1] + VP[8] * p[2] + VP[12], y = VP[1] * p[0] + VP[5] * p[1] + VP[9] * p[2] + VP[13], w = VP[3] * p[0] + VP[7] * p[1] + VP[11] * p[2] + VP[15]; return w > 0 ? [(x / w * .5 + .5) * ov.width, (1 - (y / w * .5 + .5)) * ov.height] : null; }
function hud(sc, m, dt) {
  const W = ov.width, H = ov.height, s = H / 900;
  // a width reset always wipes the canvas and its state (clearRect alone left stale pixels on some GPU canvases)
  if (hud.dirty) { ov.width = W; hud.dirty = 0; }
  if (sc.overlay || sc.vibe || sc.antennae || mode === 'fly') hud.dirty = 1;
  // subtitles / titles
  const sub = $('sub'); sub.textContent = sc.sub || ''; sub.style.opacity = sc.sub ? sc.subA : 0;
  $('title').style.opacity = sc.title || 0;
  $('end').style.opacity = sc.end ? sc.fade : 0;
  if (sc.overlay?.dance && mode === 'film' && film) danceInset(W - 300 * s, H * .14, s, film.F.dancer, true);
  if (sc.vibe && film) { const p = proj(m.VP, film.F.dancer.pos); if (p) for (let i = 0; i < 6; i++) { const r = ((sc.t * 60 + i * 40) % 240) * s; ctx.strokeStyle = `rgba(255,190,90,${(1 - r / (240 * s)) * .5})`; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.stroke(); } }
  const vl = $('vis'); vl.style.opacity = sc.vision > .5 ? 1 : 0; vl.textContent = sc.antennae || sc.beeEye ? (sc.beeEye ? 'THROUGH HER TWO COMPOUND EYES · ~5,500 facets each, ~1° acuity · UV→violet  blue→blue  green→yellow-green ' + (mode === 'fly' ? ' · E: plain wide view' : '') : 'HER VIEW · near-panoramic field · E: compound eyes') : sc.eye > .1 ? 'BEE VISION · COMPOUND EYE (~5,500 ommatidia per eye)' : 'BEE VISION · false colour: UV→violet  blue→blue  green→yellow-green';
  // antennae only in the plain wide view: in her compound-eye view they sit in the blind gap between the two eye fields
  if (sc.antennae && !sc.beeEye) antennae(W, H, sc.antennae);
  if (mode !== 'fly' || !play) return;
  const P = play, me = P.me;
  $('crop').style.width = (P.crop * 100) + '%'; $('pol').style.width = (P.pollen * 100) + '%';
  const home = sub2(HIVE, me.pos), dist = Math.hypot(home[0], home[2]);
  const ang = Math.atan2(home[0], home[2]) - P.yaw;
  $('stats').innerHTML = `Meadow #${WORLD.seed} · ${P.delivered.toFixed(0)} mg delivered · ${P.trips} trips · ${P.visited} flowers · ${(P.odo / 1000).toFixed(2)} km flown<br>${clock(P.tod)}`;
  $('msg').textContent = P.msgT > 0 ? P.msg : P.hint || ''; $('msg').style.opacity = P.msgT > 0 || P.hint ? 1 : 0;
  // home vector (path integration) + sun compass
  const cx = W - 110 * s, cy = H - 120 * s, r = 70 * s;
  ctx.fillStyle = 'rgba(10,10,6,.45)'; ctx.beginPath(); ctx.arc(cx, cy, r + 18 * s, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,230,170,.5)'; ctx.lineWidth = 1.5 * s; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  const arrow = (a, col, lw, l) => { ctx.strokeStyle = col; ctx.lineWidth = lw * s; ctx.beginPath(); ctx.moveTo(cx, cy); const x = cx - Math.sin(a) * l, y = cy - Math.cos(a) * l; ctx.lineTo(x, y); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, lw * 1.6 * s, 0, 7); ctx.fill(); };
  arrow(-ang, '#ffd257', 4, r * .85);
  const sd = sunDir(P.tod), sa = Math.atan2(sd[0], sd[2]) - P.yaw; ctx.fillStyle = '#fff6c0'; ctx.beginPath(); ctx.arc(cx - Math.sin(-sa) * (r + 9 * s), cy - Math.cos(-sa) * (r + 9 * s), 7 * s, 0, 7); ctx.fill();
  const pa = Math.atan2(PATCH[0] - me.pos[0], PATCH[1] - me.pos[2]) - P.yaw; ctx.fillStyle = '#ffb02e'; ctx.font = `${13 * s}px system-ui`; ctx.textAlign = 'center';
  ctx.fillText('✿', cx - Math.sin(-pa) * r * .55, cy - Math.cos(-pa) * r * .55 + 5 * s);
  ctx.fillStyle = '#ffe9b0'; ctx.fillText(`home ${dist < 1000 ? dist.toFixed(dist < 10 ? 1 : 0) + ' m' : (dist / 1000).toFixed(2) + ' km'}`, cx, cy + r + 34 * s);
  if (P.dance > 0) danceInset(W - 300 * s, H * .14, s, me, false, P.danceInfo.a);
}
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clock = tod => { const h = 5 + tod * 16, hh = Math.floor(h), mm = Math.floor((h - hh) * 60); return `${hh}:${String(mm).padStart(2, '0')} · ${tod < .3 ? 'morning' : tod < .55 ? 'midday' : tod < .75 ? 'afternoon' : 'evening'}`; };
// inset: comb (gravity = sun) and the map it encodes
function danceInset(x, y, s, dancer, film, aOverride) {
  const a = aOverride ?? (film ? FILM_A() : 0), w = 260 * s, h = 150 * s;
  ctx.fillStyle = 'rgba(12,10,6,.6)'; ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(255,220,150,.35)'; ctx.strokeRect(x, y, w, h);
  ctx.font = `${12 * s}px system-ui`; ctx.fillStyle = '#ffe2a8'; ctx.textAlign = 'center';
  const c1 = [x + w * .27, y + h * .55], c2 = [x + w * .73, y + h * .55], R2 = 45 * s;
  ctx.fillText('on the comb', c1[0], y + 16 * s); ctx.fillText('in the meadow', c2[0], y + 16 * s);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([3 * s, 3 * s]);
  ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c1[0], c1[1] - R2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(c2[0], c2[1] - R2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#bbb'; ctx.fillText('up', c1[0], c1[1] - R2 - 4 * s); ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.arc(c2[0], c2[1] - R2 - 6 * s, 6 * s, 0, 7); ctx.fill();
  const dir = (c, col, l) => { ctx.strokeStyle = col; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[0] + Math.sin(a) * l, c[1] - Math.cos(a) * l); ctx.stroke(); };
  dir(c1, '#ffb02e', R2); dir(c2, '#ffb02e', R2);
  ctx.fillStyle = '#ffb02e'; ctx.fillText('✿', c2[0] + Math.sin(a) * (R2 + 8 * s), c2[1] - Math.cos(a) * (R2 + 8 * s) + 4 * s);
  ctx.fillStyle = '#ffe2a8'; ctx.fillText(`${Math.round(Math.abs(a) * 57.3)}°`, (c1[0] + c2[0]) / 2, c1[1] - 10 * s);
  ctx.fillText('⌂', c2[0], c2[1] + 14 * s);
}
import { DANCE_A } from './story.js';
const FILM_A = () => DANCE_A;

// her own antennae, seen from between her eyes: they rise from the face below the view, elbow, and the
// flagella reach forward (towards the centre of perspective), sweeping; when landed they tap the flower
function antennae(W, H, a) {
  for (const sd of [-1, 1]) {
    const t = a.t, sw = Math.sin(t * (2.2 + sd * .3) + sd) * .5 + Math.sin(t * 5.1 + sd * 2) * .25, tap = a.land * Math.max(0, Math.sin(t * 6 + sd * 1.3));
    const P = [[W / 2 + sd * W * .09, H * 1.03], [W / 2 + sd * W * (.14 + .02 * sw), H * (.8 - .04 * Math.min(a.sp, 4) / 4)],
      [W / 2 + sd * W * (.22 + .06 * sw), H * (.76 + .1 * a.land + .07 * tap)]];
    const q = u => u < .45 ? (v => [P[0][0] + (P[1][0] - P[0][0]) * v, P[0][1] + (P[1][1] - P[0][1]) * v])(u / .45)
      : (v => [P[1][0] + (P[2][0] - P[1][0]) * v + sd * Math.sin(v * 3) * W * .008, P[1][1] + (P[2][1] - P[1][1]) * v - Math.sin(v * 3) * H * .025])((u - .45) / .55);
    ctx.lineCap = 'round';
    for (const [blur, col, k] of [[8, 'rgba(0,0,0,.2)', 1.1], [2.5, 'rgba(30,21,12,.72)', .55]]) {
      ctx.filter = `blur(${blur}px)`; ctx.strokeStyle = col;
      for (let i = 0; i < 18; i++) { const u0 = i / 18, u1 = (i + (i > 8 ? .78 : 1.02)) / 18, [x0, y0] = q(u0), [x1, y1] = q(Math.min(u1, 1));
        ctx.lineWidth = H * k * (u0 < .45 ? .05 - .02 * u0 / .45 : .03 * (1 - .6 * (u0 - .45) / .55)); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    }
    ctx.filter = 'none';
  }
}
