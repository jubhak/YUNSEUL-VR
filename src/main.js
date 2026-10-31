import "./style.css";
import * as THREE from "three";
import { SONGDO } from "./config.js";
import { createProjector } from "./geo/project.js";
import { clearOsmCache } from "./geo/overpass.js";
import { createSongdoLandmarks } from "./city/landmarks.js";
import { CityStreamer } from "./city/streamer.js";
import { createScene } from "./scene/setup.js";
import { createPostFx } from "./scene/postfx.js";
import { PlayerController } from "./player/controls.js";
import { createHud } from "./ui/hud.js";

const app = document.querySelector("#app");
const hud = createHud();
const { scene, camera, renderer, sun, skyMat, atmosphere } = createScene(app);
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

async function startCity({ forceRefresh = false } = {}) {
  if (forceRefresh) clearOsmCache();

  // reset
  while (cityRoot.children.length) {
    cityRoot.remove(cityRoot.children[0]);
  }

  hud.setProgress(12, "송도 시그니처·수로 배치…");
  const landmarks = createSongdoLandmarks(projector.project);
  cityRoot.add(landmarks.group);

  streamer = new CityStreamer({
    sceneRoot: cityRoot,
    projector,
    onStats: (s) => {
      hud.setStats({
        buildings: s.buildings,
        roads: s.roads,
        tiles: s.tiles,
      });
    },
    onStatus: (msg) => hud.setStreamStatus(msg),
  });
  streamer.setBaseColliders(landmarks.colliders);

  // spawn: 센트럴파크 남측 산책로 근처
  player.position.set(12, player.mode.eyeHeight, 72);
  player.velocity.set(0, 0, 0);
  player.yaw = Math.PI;
  player.pitch = 0;
  player._yawVel = 0;
  player._pitchVel = 0;

  hud.setProgress(70, "즉시 진입 — 주변 OSM 스트리밍…");
  // 랜드마크로 바로 시작, OSM은 백그라운드
  const bootPromise = streamer.boot(player.position.x, player.position.z);
  player.setColliders(streamer.getColliders());
  loaded = true;

  hud.setStats({
    mode: player.mode.label,
    buildings: streamer.stats.buildings,
    roads: streamer.stats.roads,
    tiles: streamer.stats.tiles,
    speed: 0,
  });
  hud.setProgress(100, "준비됨 — 주변은 이동하며 자동 로딩됩니다");

  bootPromise.catch((e) => console.warn("stream boot", e));
}

hud.on((action) => {
  if (action === "start") {
    hud.setProgress(5, "빠른 시작…");
    startCity({ forceRefresh: false })
      .then(() => {
        hud.hideOverlay();
        player.requestLock();
      })
      .catch((e) => {
        console.error(e);
        hud.setProgress(0, `오류: ${e.message}`);
      });
  }
  if (action === "refresh") {
    hud.setProgress(5, "캐시 삭제 후 재시작…");
    startCity({ forceRefresh: true })
      .then(() => {
        hud.hideOverlay();
        player.requestLock();
      })
      .catch((e) => {
        console.error(e);
        hud.setProgress(0, `오류: ${e.message}`);
      });
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

const tmp = new THREE.Vector3();
let lastTime = performance.now();
let colliderTick = 0;

renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!renderer.xr.isPresenting) {
    player.update(dt);
  } else {
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
    streamer.update(player.position.x, player.position.z);
    colliderTick += dt;
    if (colliderTick > 0.4) {
      colliderTick = 0;
      player.setColliders(streamer.getColliders());
    }
    sun.position.set(
      player.position.x + 220,
      420,
      player.position.z + 140,
    );
    sun.target.position.copy(player.position);
    sun.target.updateMatrixWorld();
    hud.setStats({ speed: player.getSpeedKmh() });
  }

  if (renderer.xr.isPresenting) renderer.render(scene, camera);
  else postfx.render();
});
