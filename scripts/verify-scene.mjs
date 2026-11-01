import puppeteer from 'puppeteer';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:4173/?quality=low';
const OUT = process.env.OUT || '/home/user/YUNSEUL-VR/verify';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader',
    '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,860'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 860, deviceScaleFactor: 1 });

const errors = [];
const warnings = [];
page.on('console', m => {
  if (m.type() === 'error') errors.push(m.text());
  if (m.type() === 'warning') warnings.push(m.text());
});
page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', r => errors.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('window.__YUNSEUL__ && window.__YUNSEUL__.loaded === true', { timeout: 120000 });
await new Promise(r => setTimeout(r, 4500));

const shot = async (name) => { await page.screenshot({ path: `${OUT}/${name}.png` }); return `${name}.png`; };
const results = {};

// 1. default spawn view (canal + skyline)
results.spawn = await shot('01-spawn');

// 2. wheel: look down at the ground (real wheel events, not a direct pitch assignment)
results.wheelDown = await page.evaluate(async () => {
  const { player } = window.__YUNSEUL__;
  const canvas = document.querySelector('canvas');
  const before = { pitch: player.pitch, fov: player.camera.fov };
  for (let i = 0; i < 24; i++) {
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise(r => setTimeout(r, 260));
  return { before, after: { pitch: player.pitch, fov: player.camera.fov },
    pitchDeg: +(player.pitch * 180 / Math.PI).toFixed(2) };
});
await new Promise(r => setTimeout(r, 700));
results.ground = await shot('02-wheel-ground');

// 3. wheel: look up at the sky
results.wheelUp = await page.evaluate(async () => {
  const { player } = window.__YUNSEUL__;
  const canvas = document.querySelector('canvas');
  for (let i = 0; i < 40; i++) {
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
  }
  await new Promise(r => setTimeout(r, 260));
  return { pitchDeg: +(player.pitch * 180 / Math.PI).toFixed(2), fov: player.camera.fov };
});
await new Promise(r => setTimeout(r, 700));
results.sky = await shot('03-wheel-sky');

// 4. Arts Center rooftop terrace, looking at the water
results.roof = await page.evaluate(async () => {
  const { player, streamer } = window.__YUNSEUL__;
  const platforms = streamer.getPlatforms();
  const roof = platforms.find(p => p.ramp && p.ramp.h0 > 40);
  const terrace = platforms.find(p => p.height && p.height > 40);
  player.setPlatforms(platforms);
  const peak = terrace ? terrace.height : 42.89;
  player.position.set(-963 + 6, peak + 1.7, -108);
  player.yaw = 2.1; player.pitch = -0.12;
  player.velocity.set(0, 0, 0); player.onGround = true;
  player.update(0);
  streamer.requestAround(player.position.x, player.position.z);
  await new Promise(r => setTimeout(r, 2500));
  return {
    platformCount: platforms.length,
    terraceHeight: terrace?.height ?? null,
    ramp: roof?.ramp ?? null,
    eyeY: +player.position.y.toFixed(2),
    standingOn: +player.getGroundHeight().toFixed(2),
  };
});
await new Promise(r => setTimeout(r, 1200));
results.roofShot = await shot('04-arts-center-roof');

// 5. walk up the ramp: start at its foot and hold W
results.rampWalk = await page.evaluate(async () => {
  const { player, streamer } = window.__YUNSEUL__;
  const ramp = streamer.getPlatforms().find(p => p.ramp && p.ramp.h0 > 40);
  if (!ramp) return { error: 'no ramp platform' };
  const start = { x: ramp.ramp.bx - 2, z: ramp.ramp.bz };
  player.position.set(start.x, 1.7, start.z);
  player.setPlatforms(streamer.getPlatforms());
  // Face up the ramp (towards h0 end).
  player.yaw = Math.atan2(-(ramp.ramp.ax - start.x), -(ramp.ramp.az - start.z));
  player.velocity.set(0, 0, 0);
  player.keys.add('KeyW');
  for (let i = 0; i < 240; i++) player.update(1 / 60);
  player.keys.clear();
  const upY = player.position.y;
  return { from: start, eyeY: +upY.toFixed(2), ground: +player.getGroundHeight().toFixed(2), rampTop: ramp.ramp.h0 };
});

// 6. Incheon Bridge: promenade viewpoint looking at the pylons
results.bridge = await page.evaluate(async () => {
  const { player, streamer } = window.__YUNSEUL__;
  const data = await fetch('data/incheon-bridge.json').then(r => r.json());
  const pylon = data.pylons[0];
  // nearest coastline promenade offset: look from Songdo side towards the mast
  const x = pylon.x + 620, z = pylon.z + 520;
  player.position.set(x, 1.7, z);
  player.yaw = Math.atan2(-(pylon.x - x), -(pylon.z - z));
  player.pitch = 0.13;
  player.velocity.set(0, 0, 0);
  player.update(0);
  streamer.requestAround(x, z);
  await new Promise(r => setTimeout(r, 2200));
  return { pylon, from: { x: +x.toFixed(0), z: +z.toFixed(0) }, mastHeight: data.mastHeight };
});
await new Promise(r => setTimeout(r, 1000));
results.bridgeShot = await shot('05-incheon-bridge');

// 7. park sculptures: count and place camera at a claimed totem/horn
results.sculptures = await page.evaluate(async () => {
  const { player, streamer } = window.__YUNSEUL__;
  const groups = [];
  streamer.snapshotGroup?.traverse(o => {
    if (o.userData?.accuracy === 'procedural sculpture approximation') groups.push(o.userData);
  });
  const target = groups.find(g => g.kind === 'totem') || groups[0];
  if (target) {
    const o = [];
    streamer.snapshotGroup.traverse(n => { if (n.userData?.sourceId === target.sourceId) o.push(n); });
    const mesh = o[0];
    if (mesh) {
      const p = mesh.position;
      player.position.set(p.x + 9, 1.7, p.z + 9);
      player.yaw = Math.atan2(-(p.x - (p.x + 9)), -(p.z - (p.z + 9)));
      player.pitch = 0.08;
      player.update(0);
    }
  }
  await new Promise(r => setTimeout(r, 1200));
  return { count: groups.length, kinds: groups.map(g => g.kind), target };
});
await new Promise(r => setTimeout(r, 800));
results.sculptureShot = await shot('06-park-sculpture');

results.stats = await page.evaluate(() => {
  const { streamer, renderer } = window.__YUNSEUL__;
  return { stats: streamer.stats, platforms: streamer.getPlatforms().length,
    colliders: streamer.getColliders().length, calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles, lowPower: renderer.userData.lowPower };
});

results.errors = errors.slice(0, 20);
results.warnings = warnings.slice(0, 10);
fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
await browser.close();
