import "./style.css";
import * as THREE from "three";
import { SONGDO, SPAWN } from "./config.js";
import { createProjector } from "./geo/project.js";
import { clearOsmCache } from "./geo/overpass.js";
import { CityStreamer } from "./city/streamer.js";
import { createScene } from "./scene/setup.js";
import { createPostFx } from "./scene/postfx.js";
import { PlayerController } from "./player/controls.js";
import { createHud } from "./ui/hud.js";

const app = document.querySelector("#app");
const hud = createHud();
const { scene, camera, renderer, sun, sunDirection, skyMat, atmosphere } = createScene(app);
const postfx = createPostFx(renderer, scene, camera);

const cityRoot = new THREE.Group();
cityRoot.name = "songdo";
scene.add(cityRoot);

const projector = createProjector(SONGDO.center.lat, SONGDO.center.lon);
const player = new PlayerController(camera, renderer.domElement, []);
player.onModeChange = (mode) => {
  hud.setActiveMode(mode.id);
  hud.setStats({ mode: mode.label });
};
player.onLockChange = (locked) => hud.setLocked(locked);

let streamer = null;
let loaded = false;
let starting = false;

async function startCity({ forceRefresh = false } = {}) {
  if (forceRefresh) clearOsmCache();

  loaded = false;
  streamer?.clear();
  hud.setProgress(12, "센트럴파크 지도·수변 환경 준비…");

  streamer = new CityStreamer({
    sceneRoot: cityRoot,
    projector,
    sunDirection,
    onStats: (s) => {
      hud.setStats({
        buildings: s.buildings,
        roads: s.roads,
        tiles: s.tiles,
      });
    },
    onStatus: (msg) => hud.setStreamStatus(msg),
  });
  // Position is a real OSM footway coordinate, not an arbitrary world offset.
  const spawn = projector.project(SPAWN.lon, SPAWN.lat);
  const target = projector.project(SPAWN.lookAt.lon, SPAWN.lookAt.lat);
  player.position.set(spawn.x, player.mode.eyeHeight, spawn.z);
  player.velocity.set(0, 0, 0);
  player.yaw = Math.atan2(-(target.x - spawn.x), -(target.z - spawn.z));
  player.pitch = 0;
  player.verticalVel = 0;
  player.onGround = true;
  player.keys.clear();
  player.update(0);
  player._yawVel = 0;
  player._pitchVel = 0;

  hud.setProgress(15, "실제 수로·건물·산책로 불러오는 중…");
  await streamer.boot(player.position.x, player.position.z, {
    onProgress: (pct, msg) => {
      hud.setProgress(15 + pct * 80, msg);
    },
  });
  player.setColliders(streamer.getColliders());
  loaded = true;

  hud.setStats({
    mode: player.mode.label,
    buildings: streamer.stats.buildings,
    roads: streamer.stats.roads,
    tiles: streamer.stats.tiles,
    speed: 0,
  });
  hud.setProgress(100, "센트럴파크 입장 완료 — 수변 산책을 시작하세요");
}

hud.on((action) => {
  if (action === "start" || action === "refresh") {
    if (starting) return;
    starting = true;
    hud.showOverlay();
    hud.setBusy(true);
    // Request during the actual click event. Pointer lock after async loading may be blocked.
    player.requestLock();
    startCity({ forceRefresh: action === "refresh" })
      .then(() => hud.hideOverlay())
      .catch(e => { console.error(e); hud.setProgress(0, `오류: ${e.message}`); player.exitLock(); })
      .finally(() => { starting = false; hud.setBusy(false); });
  }
  if (action === "walk" || action === "bike" || action === "car") {
    player.setMode(action);
  }
  if (action === "lock") {
    if (player.locked) player.exitLock();
    else player.requestLock();
  }
});

renderer.domElement.addEventListener("click", () => {
  if (loaded && !player.locked && !renderer.xr.isPresenting) {
    player.requestLock();
  }
});

if (import.meta.env.DEV) {
  window.__YUNSEUL_DEV__ = { player, scene, camera, renderer, get streamer() { return streamer; } };
}

const tmp = new THREE.Vector3();
let lastTime = performance.now();
let colliderTick = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!renderer.xr.isPresenting) {
    if (loaded) player.update(dt);
  } else if (loaded) {
    const session = renderer.xr.getSession();
    if (session) {
      const xrCam = renderer.xr.getCamera();
      xrCam.getWorldDirection(tmp);
      tmp.y = 0;
      if (tmp.lengthSq() > 0) tmp.normalize();
      const right = new THREE.Vector3()
        .crossVectors(tmp, new THREE.Vector3(0, 1, 0))
        .normalize();
      for (const source of session.inputSources) {
        const gp = source.gamepad;
        if (!gp?.axes?.length) continue;
        const ax = gp.axes[2] ?? gp.axes[0] ?? 0;
        const ay = gp.axes[3] ?? gp.axes[1] ?? 0;
        if (Math.abs(ax) < 0.15 && Math.abs(ay) < 0.15) continue;
        player.applyXrMove(tmp, right, ax, ay, dt);
      }
    }
  }

  const t = now * 0.001;
  if (skyMat?.uniforms?.time) skyMat.uniforms.time.value = t;
  atmosphere?.update(dt, t, player.position);

  if (loaded && streamer) {
    streamer.update(player.position.x, player.position.z, t, renderer.xr.isPresenting);
    colliderTick += dt;
    if (colliderTick > 0.4) {
      colliderTick = 0;
      player.setColliders(streamer.getColliders());
    }
    sun.position.copy(player.position).addScaledVector(sunDirection, 650);
    sun.target.position.copy(player.position);
    sun.target.updateMatrixWorld();
    hud.setStats({ speed: player.getSpeedKmh() });
  }

  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else postfx.render();
});
