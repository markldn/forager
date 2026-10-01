// README screenshot set (1600x900, real GPU): film beats, FLY mode, through-her-eyes, wildlife
import fs from 'fs';
const { chromium } = await import('/home/mark/scripts/tracker/node_modules/playwright/index.mjs');
const out = process.argv[2] || '/tmp/claude-1000/readme';
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ headless: true, args: ['--use-angle=vulkan', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
p.on('pageerror', e => console.log('PAGEERROR', e.message));
const hideHud = () => p.addStyleTag({ content: '#msg,#keys{display:none!important}' });
await p.goto('http://127.0.0.1:9050/index.html'); await p.waitForTimeout(2500);
await p.screenshot({ path: `${out}/00-menu.png` });
await p.evaluate(() => { __bee.start('film'); __bee.setRes(1); });
const film = { '01-title': 5, '02-comb': 29, '03-dance': 44, '04-meadow': 92, '05-bee-vision': 113, '06-polarised-sky': 130, '07-rudbeckia-human': 152, '08-rudbeckia-bee': 162,
  '09-tongue': 186, '10-crab-spider': 205, '11-bee-eater': 217, '12-home': 232, '13-golden-hour': 271 };
for (const [k, t] of Object.entries(film)) { await p.evaluate(t => __bee.seek(t), t); await p.waitForTimeout(1800); await p.screenshot({ path: `${out}/${k}.png` }); }
// FLY mode in a seeded world
await p.goto('http://127.0.0.1:9050/index.html?seed=5'); await p.waitForTimeout(1500);
await p.evaluate(() => __bee.start('fly')); await hideHud();
await p.evaluate(() => { const P = __bee.play, x = __bee.PATCH[0] - 6, z = __bee.PATCH[1] + 4; P.me.pos = [x, __bee.height(x, z) + .45, z]; P.yaw = 2.4; P.pitch = -.08; });
await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/14-fly-patch.png` });
await p.evaluate(() => { window.__cam = sc => { const t = __bee.play.life.bumbles[0].pos; return { cam: { pos: [t[0] + .045, t[1] + .02, t[2] + .035], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .06, ap: .3 } }; }; });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/15-bumblebee.png` });
await p.evaluate(() => { window.__cam = sc => { const t = __bee.play.hornets[0].pos; return { cam: { pos: [t[0] + .07, t[1] + .015, t[2] + .05], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .09, ap: .3 } }; }; });
await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/16-hornet.png` });
await p.evaluate(() => { const P = __bee.play, d = P.life.drag[0]; P.me.pos = [d.pos[0] + 2, d.pos[1] + 2, d.pos[2] + 2]; window.__cam = sc => { const t = __bee.play.life.drag[0].pos; return { cam: { pos: [t[0] + .16, t[1] + .07, t[2] + .12], tgt: t, fov: .6, near: .002, far: 3000 }, dof: { focus: .2, ap: .2 } }; }; });
await p.waitForTimeout(2000); await p.screenshot({ path: `${out}/17-pond-dragonfly.png` });
// through her eyes
await p.goto('http://127.0.0.1:9050/index.html?seed=5'); await p.waitForTimeout(1500);
await p.click('#be'); await hideHud(); await p.waitForTimeout(9000); await p.screenshot({ path: `${out}/18-through-her-eyes.png` });
await b.close();
