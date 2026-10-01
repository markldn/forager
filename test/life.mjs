// close-ups of the ambient creatures in FLY mode
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = '/tmp/claude-1000/life';
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/' + (process.argv[2] || 'dev.html') + '?seed=5'); await p.waitForTimeout(1000);
await p.evaluate(() => __bee.start('fly')); await p.waitForTimeout(500);
await p.evaluate(() => { const P = __bee.play, x = __bee.PATCH[0], z = __bee.PATCH[1]; P.me.pos = [x, __bee.height(x, z) + .5, z]; P.me.vel = [0, 0, 0]; });
await p.waitForTimeout(4000);
const pick = { bumble: 'P.life.bumbles[0]', hover: 'P.life.hovers[0]', bfly: 'P.life.flies[1]', peacock: 'P.life.flies[0]' };
for (const [k, expr] of Object.entries(pick)) {
  await p.evaluate(([expr, k]) => { window.__cam = sc => { const P = __bee.play, c = eval(expr), t = c.pos, d = k[0] === 'b' && k !== 'bumble' || k === 'peacock' ? .1 : .05;
    return { cam: { pos: [t[0] + d * .8, t[1] + d * .5, t[2] + d * .6], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: d * 1.1, ap: 0 }, eye: 0, vision: 0 }; }; }, [expr, k]);
  await p.waitForTimeout(900); await p.screenshot({ path: `${out}/${k}.png` });
}
await p.evaluate(() => { window.__cam = null; const P = __bee.play; P.me.pos = [__bee.POND ? 0 : 0, 0, 0]; });
await p.evaluate(() => { const P = __bee.play, d = P.life.drag; window.__cam = sc => { const t = __bee.play.life.drag[0].pos; return { cam: { pos: [t[0] + .15, t[1] + .06, t[2] + .12], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .2, ap: 0 }, eye: 0, vision: 0 }; }; });
await p.evaluate(() => { const P = __bee.play; const pd = P.life.drag[0].pos; P.me.pos = [pd[0] + 3, pd[1] + 3, pd[2] + 3]; });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/dragon.png` });
await b.close();
