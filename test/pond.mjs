// pond views: shoreline, shallows, lily pads, reeds
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = process.argv[2] || '/tmp/claude-1000/pond';
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
await p.goto('http://127.0.0.1:9050/' + (process.argv[3] || 'dev.html')); await p.waitForTimeout(1200);
await p.evaluate(() => __bee.start('fly')); await p.waitForTimeout(500);
const views = [[-95, 70, 30, 2.5, 0], [-95, 70, 22, .5, 1.2], [-95, 70, 17, .25, 2.6], [-95, 70, 8, 6, 4.2], [-95, 70, 19, .12, 5.4], [-95, 70, 40, 12, .3]];
for (const [i, v] of views.entries()) {
  await p.evaluate(v => { const [cx, cz, r, h, a] = v; window.__cam = sc => { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, y = __bee.height(x, z) + h;
    __bee.play.me.pos = [x, y + 50, z]; return { cam: { pos: [x, y, z], tgt: [cx, __bee.height(cx, cz) + h * .2, cz], fov: .9, near: .01, far: 3000 }, dof: { focus: 5, ap: 0 }, eye: 0 }; }; }, v);
  await p.waitForTimeout(900); await p.screenshot({ path: `${out}/p${i}.png` });
}
await b.close();
