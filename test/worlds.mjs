// random worlds from the air + enemy close-ups
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = process.argv[2] || '/tmp/claude-1000/rw';
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
const shot = async (name, fn, arg) => { await p.evaluate(fn, arg); await p.waitForTimeout(1000); await p.screenshot({ path: `${out}/${name}.png` }); };
for (const seed of [7, 4242, 31337]) {
  await p.goto(`http://127.0.0.1:9050/dev.html?seed=${seed}`); await p.waitForTimeout(1000);
  await p.evaluate(() => __bee.start('fly')); await p.waitForTimeout(600);
  await shot('w' + seed, () => { window.__cam = sc => { const P = __bee.play; P.me.pos = [0, 60, 0]; return { cam: { pos: [-30, __bee.height(0, 0) + 45, 60], tgt: [60, __bee.height(0, 0), -60], fov: 1.1, near: .05, far: 3000 }, dof: { focus: 5, ap: 0 }, eye: 0 }; }; });
}
await shot('hornet', () => { window.__cam = sc => { const h = __bee.play.hornets[0], t = h.pos; return { cam: { pos: [t[0] + .06, t[1] + .02, t[2] + .05], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .08, ap: 0 } }; }; });
await shot('hornets', () => { window.__cam = sc => { const t = __bee.play.hornets[0].pos; return { cam: { pos: [t[0] + .5, t[1] + .1, t[2] + .9], tgt: [t[0], t[1] - .15, t[2] - .4], fov: .8, near: .005, far: 3000 }, dof: { focus: 1, ap: 0 } }; }; });
await shot('wolf', () => { window.__cam = sc => { const w = __bee.play.wolves[0], t = w.pos; return { cam: { pos: [t[0] + .05, t[1] + .02, t[2] + .04], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .07, ap: 0 } }; }; });
await b.close();
