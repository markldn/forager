// Renderer: shadow cascades -> 4x MSAA MRT (human + bee bands) -> resolve -> combine -> mip chain -> final post.
import { gl, initGL, program, mesh, tex, fbo, rbo } from './gl.js';
import * as S from './glsl.js';
import { perspective, ortho, lookAt, mul, invert, add, scl, sub, norm, dot, cross } from './math.js';
import { beeMesh, wingMesh, birdMesh, spiderMesh, flowerMesh, treeMesh, hiveMesh, cellMesh, butterflyMesh, dragonflyMesh } from './mesh.js';
import { TREES, HIVE } from './world.js';

export const FLOWER_INFO = [];
export const COMB = { w: .0054, cols: 60, rows: 44, origin: [0, -200, 0] };

export function createRenderer(canvas) {
  initGL(canvas);
  const V = vs => S.HEAD + '\n' + S.COMMON + vs, F = (fs, sh) => S.HEAD + '\n' + (sh ? '#define SH\n' : '') + S.COMMON + S.LIGHT + fs;
  const P2 = (vs, fs) => ({ m: program(V(vs), F(fs)), s: program(V(vs), F(fs, 1)) });
  const prog = {
    sky: program(V(S.SKY_VS), F(S.SKY_FS)), terr: program(V(S.TERR_VS), F(S.TERR_FS)), water: program(V(S.WATER_VS), F(S.WATER_FS)),
    grass: P2(S.GRASS_VS, S.GRASS_FS), flower: P2(S.FLOWER_VS, S.FLOWER_FS), cre: P2(S.CRE_VS, S.CRE_FS), stat: P2(S.STAT_VS, S.STAT_FS),
    tree: P2(S.TREE_VS, S.TREE_FS), comb: program(V(S.COMB_VS), F(S.COMB_FS)), wing: program(V(S.WING_VS), F(S.WING_FS)),
    part: program(V(S.PART_VS), F(S.PART_FS)),
    combine: program(S.HEAD + S.COMMON + S.FS_VS, S.HEAD + S.COMMON + S.COMBINE_FS), final: program(S.HEAD + S.COMMON + S.FS_VS, S.HEAD + S.COMMON + S.FINAL_FS),
  };
  // ---- meshes
  const quad = mesh({ G: [-1, -1, 3, -1, -1, 3] }, ['G']);
  const N = 256, tg = { G: [], I: [] };
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) tg.G.push(i / N * 2 - 1, j / N * 2 - 1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; tg.I.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1); }
  const terrain = mesh(tg, ['G']);
  const wg = { G: [], I: [] }; for (let j = 0; j <= 16; j++) for (let i = 0; i <= 16; i++) wg.G.push(i / 8 - 1, j / 8 - 1);
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) { const a = j * 17 + i; wg.I.push(a, a + 1, a + 18, a, a + 18, a + 17); }
  const water = mesh(wg, ['G']);
  const blade = { B: [] }; for (let i = 0; i <= 5; i++) { const y = i / 6; blade.B.push(-.5, y, .5, y); } blade.B.push(0, 1);
  const grass = mesh(blade, ['B']);
  const ALL = ['P', 'Q', 'N', 'V', 'C', 'M'];
  const bee = [mesh(beeMesh(1), ALL), mesh(beeMesh(0), ALL)];
  const wing = mesh(wingMesh(), ['P', 'W']);
  const bird = mesh(birdMesh(), ALL), spider = mesh(spiderMesh(), ALL), bfly = mesh(butterflyMesh(), ALL), dfly = mesh(dragonflyMesh(), ALL);
  const flowers = [];
  for (let sp = 0; sp < 5; sp++) {
    const hi = flowerMesh(sp, 1), lo = flowerMesh(sp, 0);
    FLOWER_INFO[sp] = { head: hi.head, up: hi.up, H: hi.H };
    flowers.push([mesh(hi.geo, ['P', 'N', 'C', 'M'], [{ name: 'iA', size: 4 }, { name: 'iB', size: 4 }]), mesh(lo.geo, ['P', 'N', 'C', 'M'], [{ name: 'iA', size: 4 }, { name: 'iB', size: 4 }])]);
  }
  const tree = mesh(treeMesh(), ['P', 'N', 'M'], [{ name: 'iA', size: 4 }, { name: 'iS', size: 1 }]);
  const setTrees = () => { tree.setInst('iA', new Float32Array(TREES.flatMap(t => [t.x, t.y, t.z, t.yaw]))); tree.setInst('iS', new Float32Array(TREES.map(t => t.s))); }; setTrees();
  const hive = mesh(hiveMesh(), ['P', 'N', 'C', 'M']);
  const cell = mesh(cellMesh(COMB.w), ['P', 'N', 'M']);
  // comb frame bars
  const frameG = hiveMeshFrame();
  const frameMesh = mesh(frameG, ['P', 'N', 'C', 'M']);
  const pg = { P: [] }; for (let i = 0; i < 900; i++) pg.P.push(Math.random() * 6, Math.random() * 6, Math.random() * 6, Math.random());
  const parts = mesh(pg, ['P']);
  // ---- data textures for creatures
  const dataTex = () => { const t = tex(6, 1, gl.RGBA32F, gl.RGBA, gl.FLOAT, gl.NEAREST); return { t, h: 1 }; };
  const dBee = dataTex(), dBird = dataTex(), dSpider = dataTex(), dBfly = dataTex(), dDfly = dataTex();
  const upload = (d, arr) => { const n = arr.length / 24; gl.bindTexture(gl.TEXTURE_2D, d.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 6, Math.max(n, 1), 0, gl.RGBA, gl.FLOAT, n ? arr : new Float32Array(24)); return n; };
  // ---- shadow maps
  const SM = 2048, SMS = [4096, 2048];
  const shTex = SMS.map(S => { const t = tex(S, S, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL); return t; });
  const shFbo = shTex.map(t => fbo([], t));
  // ---- screen targets
  let W = 0, H = 0, T = {};
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  function resize(w, h) {
    if (w === W && h === H) return; W = w; H = h;
    for (const k in T) { const o = T[k]; if (o instanceof WebGLTexture) gl.deleteTexture(o); }
    const cH = rbo(w, h, gl.RGBA16F, samples), cB = rbo(w, h, gl.RGBA16F, samples), dR = rbo(w, h, gl.DEPTH_COMPONENT32F, samples);
    T.ms = fbo([cH, cB], dR);
    T.h = tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT); T.b = tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT);
    T.d = tex(w, h, gl.DEPTH_COMPONENT32F, gl.DEPTH_COMPONENT, gl.FLOAT, gl.NEAREST);
    T.rh = fbo([T.h], null); T.rb = fbo([T.b], null); T.rd = fbo([], T.d);
    T.c = tex(w, h, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR, true); T.cf = fbo([T.c], null);
  }
  const flowerBuf = [[], [], [], [], []].map(() => [{ a: null, n: 0 }, { a: null, n: 0 }]);
  function setFlowers(lists) { // lists[sp][lod] = Float32Array (8 floats per instance)
    for (let sp = 0; sp < 5; sp++) for (let l = 0; l < 2; l++) {
      const d = lists[sp][l]; const m = flowers[sp][l]; const n = d.length / 8;
      const A = new Float32Array(n * 4), B = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { A.set(d.subarray(i * 8, i * 8 + 4), i * 4); B.set(d.subarray(i * 8 + 4, i * 8 + 8), i * 4); }
      m.setInst('iA', A); m.setInst('iB', B); flowerBuf[sp][l].n = n;
    }
  }
  const GRASS = [{ cs: .03, n: 200 }, { cs: .09, n: 200 }, { cs: .27, n: 200 }, { cs: .8, n: 170 }];

  function frame(sc) {
    const cw = canvas.width, ch = canvas.height, rw = Math.round(cw * sc.res), rh = Math.round(ch * sc.res);
    resize(rw, rh);
    const cam = sc.cam, asp = rw / rh; HIVE_M[13] = HIVE[1];
    const proj = perspective(cam.fov, asp, cam.near, cam.far), view = lookAt(cam.pos, cam.tgt, cam.up || [0, 1, 0]);
    const VP = mul(proj, view);
    const U = sc.light; // frame uniforms prepared by caller
    const inside = sc.interior;
    // ---------- shadow cascades
    const sun = U.uSun;
    const shM = [];
    const cascades = [{ c: sc.shadowFocus || cam.pos, s: 7, d: 30 }, { c: add(cam.pos, scl(norm(sub(cam.tgt, cam.pos)), 55)), s: 150, d: 400 }];
    cascades.forEach((cs, i) => {
      const lv = lookAt(add(cs.c, scl(sun, cs.d * .5)), cs.c, Math.abs(sun[1]) > .99 ? [1, 0, 0] : [0, 1, 0]);
      // snap to texels
      const tx = cs.s * 2 / SMS[i]; lv[12] = Math.round(lv[12] / tx) * tx; lv[13] = Math.round(lv[13] / tx) * tx;
      shM[i] = mul(ortho(-cs.s, cs.s, -cs.s, cs.s, 0, cs.d), lv);
    });
    const FU = Object.assign({}, U, { uSh0M: shM[0], uSh1M: shM[1], uSh0: 6, uSh1: 7, uShOn: inside ? 0 : 1, uView: view });
    gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null);
    const nBee = upload(dBee, sc.beeData), nBird = upload(dBird, sc.birdData), nSp = upload(dSpider, sc.spiderData), nBf = upload(dBfly, sc.bflyData), nDf = upload(dDfly, sc.dragData);
    const bindData = d => { gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, d.t); };

    const drawGrass = (p, layers, foc) => { for (const li of layers) { const L = GRASS[li], prev = li ? GRASS[li - 1].n * GRASS[li - 1].cs * .5 : -1, ext = L.n * L.cs * .5;
      p.setAll({ uCs: L.cs, uN: L.n, uExt: ext, uPrev: prev, uLast: li === 3 ? 1 : 0, uWid: .0055 * Math.pow(L.cs / .03, .55), uFoc: foc }); grass.draw(gl.TRIANGLE_STRIP, L.n * L.n); } };
    const drawFlowers = (p, lods) => { for (let sp = 0; sp < 5; sp++) for (const l of lods) { const n = flowerBuf[sp][l].n; if (!n) continue; p.set('uH', FLOWER_INFO[sp].H); flowers[sp][l].draw(gl.TRIANGLES, n); } };
    const drawCre = (p, shells) => {
      p.set('uData', 5); p.set('uShell', 0);
      if (nBee) { bindData(dBee); p.set('uKind', 0); bee[0].draw(gl.TRIANGLES, nBee);
        if (shells && sc.nearBees) { p.set('uShellMax', 1); for (let i = 1; i <= 5; i++) { p.set('uShell', i / 5); bee[0].draw(gl.TRIANGLES, Math.min(sc.nearBees, nBee)); } p.set('uShell', 0); } }
      if (nBird) { bindData(dBird); p.set('uKind', 1); bird.draw(gl.TRIANGLES, nBird); }
      if (nSp) { bindData(dSpider); p.set('uKind', 2); spider.draw(gl.TRIANGLES, nSp); }
      if (nBf) { bindData(dBfly); p.set('uKind', 5); bfly.draw(gl.TRIANGLES, nBf); }
      if (nDf) { bindData(dDfly); p.set('uKind', 6); if (shells) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); dfly.draw(gl.TRIANGLES, nDf); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE); }
    };
    if (!inside) {
      gl.colorMask(false, false, false, false);
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, shFbo[i]); gl.viewport(0, 0, SMS[i], SMS[i]); gl.clear(gl.DEPTH_BUFFER_BIT);
        const SU = Object.assign({}, FU, { uVP: shM[i] });
        if (i === 0) { drawGrass(prog.grass.s.use().setAll(SU), [0, 1, 2], cam.pos); }
        drawFlowers(prog.flower.s.use().setAll(SU), i ? [1] : [0, 1]);
        drawCre(prog.cre.s.use().setAll(SU), false);
        prog.stat.s.use().setAll(SU).set('uM', HIVE_M); hive.draw();
        if (i === 1) { prog.tree.s.use().setAll(SU); tree.draw(gl.TRIANGLES, TREES.length); }
      }
      gl.colorMask(true, true, true, true);
    }
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, shTex[0]); gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, shTex[1]);
    // ---------- main pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms); gl.viewport(0, 0, rw, rh);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 1]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 1]); gl.clearBufferfv(gl.DEPTH, 0, [1]);
    const MU = Object.assign({}, FU, { uVP: VP, uIVP: invert(VP), uPol: sc.pol || 0, uCloud: sc.cloud || 0 });
    if (!inside) {
      gl.depthMask(false); prog.sky.use().setAll(MU); quad.draw(); gl.depthMask(true);
      prog.terr.use().setAll(MU).set('uC', [Math.round(cam.pos[0] / .25) * .25, Math.round(cam.pos[2] / .25) * .25]); terrain.draw();
      prog.stat.m.use().setAll(MU).set('uM', HIVE_M); hive.draw();
      gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE); prog.tree.m.use().setAll(MU); tree.draw(gl.TRIANGLES, TREES.length); gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      drawGrass(prog.grass.m.use().setAll(MU), [0, 1, 2, 3], cam.pos);
      drawFlowers(prog.flower.m.use().setAll(MU), [0, 1]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); prog.water.use().setAll(MU); water.draw(); gl.disable(gl.BLEND);
    } else {
      prog.comb.use().setAll(MU).setAll({ uM: COMB_M, uCols: COMB.cols, uW: COMB.w }); cell.draw(gl.TRIANGLES, COMB.cols * COMB.rows);
      prog.stat.m.use().setAll(MU).set('uM', COMB_M); frameMesh.draw();
    }
    drawCre(prog.cre.m.use().setAll(MU), true);
    // transparent
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    if (nBee) { const K = sc.slowmo ? 1 : 7; bindData(dBee); prog.wing.use().setAll(MU).setAll({ uData: 5, uK: K, uSpan: sc.slowmo ? 0 : 1 }); wing.draw(gl.TRIANGLES, nBee * 4 * K); }
    prog.part.use().setAll(MU).set('uSz', rh * (inside ? .004 : .0025)); parts.draw(gl.POINTS);
    gl.depthMask(true); gl.disable(gl.BLEND);
    // ---------- resolve
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms);
    gl.readBuffer(gl.COLOR_ATTACHMENT0); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.rh); gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.readBuffer(gl.COLOR_ATTACHMENT1); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.rb); gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.rd); gl.blitFramebuffer(0, 0, rw, rh, 0, 0, rw, rh, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    // ---------- combine (vision blend)
    gl.disable(gl.DEPTH_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.cf); gl.viewport(0, 0, rw, rh);
    tbind(0, T.h); tbind(1, T.b); tbind(2, T.d);
    prog.combine.use().setAll({ uH: 0, uB: 1, uD: 2, uVis: sc.vision, uExp: sc.exposure, uWipe: .5, uAsp: asp }); quad.draw();
    gl.bindTexture(gl.TEXTURE_2D, T.c); tbind(0, T.c); gl.generateMipmap(gl.TEXTURE_2D);
    // ---------- final
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
    let sunS = [0, 0], rays = 0;
    if (!inside) { const s = add(cam.pos, scl(sun, 1000)), c = mulv(VP, [...s, 1]); if (c[3] > 0) { sunS = [c[0] / c[3] * .5 + .5, c[1] / c[3] * .5 + .5]; rays = sc.rays ?? .6; } }
    tbind(0, T.c); tbind(1, T.d);
    prog.final.use().setAll({ uC: 0, uD: 1, uAsp: asp, uFoc: sc.dof?.focus || 1, uAp: sc.dof?.ap || 0, uNear: cam.near, uFar: cam.far, uEye: sc.eye || 0,
      uBars: sc.bars || 0, uT2: sc.t, uFade: sc.fade ?? 1, uGrain: .035, uSat: sc.sat ?? 1.05, uWarm: sc.warm ?? .3, uLevels: Math.max(rw, rh) * 1.0, uSunS: sunS, uRays: sc.beeEye ? 0 : rays, uT: sc.t, uBE: sc.beeEye || 0 });
    quad.draw();
    gl.enable(gl.DEPTH_TEST);
    return { VP, view, proj };
  }
  function tbind(u, t) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); }
  return { frame, setFlowers, setTrees, gl };
}
const mulv = (m, v) => [0, 1, 2, 3].map(r => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * v[3]);
const HIVE_M = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, HIVE[0], HIVE[1], HIVE[2], 1]);
const COMB_M = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, COMB.origin[0], COMB.origin[1], COMB.origin[2], 1]);
function hiveMeshFrame() { // wooden frame bars around the comb, plus the dark neighbouring comb behind
  const g = { P: [], N: [], C: [], M: [], I: [] }; let n = 0;
  const w = COMB.cols * COMB.w + COMB.w, h = COMB.rows * COMB.w * .866 + COMB.w;
  const box = (x0, y0, z0, x1, y1, z1, col, mat) => {
    for (const [nx, ny, nz] of [[0, 0, 1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]]) {
      const c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], e = [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2];
      const nrm = [nx, ny, nz], t = nx ? [0, 1, 0] : [1, 0, 0], b = [nrm[1] * t[2] - nrm[2] * t[1], nrm[2] * t[0] - nrm[0] * t[2], nrm[0] * t[1] - nrm[1] * t[0]];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.P.push(...[0, 1, 2].map(k => c[k] + nrm[k] * e[k] + t[k] * u * e[k] + b[k] * v * e[k])); g.N.push(nx, ny, nz); g.C.push(...col, .04); g.M.push(u, v, mat, 0);
      }
      g.I.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
    }
  };
  const x0 = -COMB.w, y0 = -COMB.w;
  box(x0 - .02, h + y0, -.012, w + .02, h + y0 + .02, .004, [.45, .33, .2], 3);
  box(x0 - .02, y0 - .01, -.012, x0, h + y0, .004, [.45, .33, .2], 3);
  box(w, y0 - .01, -.012, w + .02, h + y0, .004, [.45, .33, .2], 3);
  box(x0 - .02, y0 - .02, -.012, w + .02, y0, .004, [.45, .33, .2], 3);
  box(x0 - .5, y0 - .3, -.03, w + .5, h + .3, -.012, [.12, .07, .03], 4);
  return g;
}
