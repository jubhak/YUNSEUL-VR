export function createHud() {
  const root = document.createElement("div");
  root.id = "hud";
  root.innerHTML = `
    <div id="top-bar">
      <div id="brand" class="panel">
        <h1>YUNSEUL VR · 송도</h1>
        <p>스트리밍 로드 · 현실감 시티</p>
      </div>
      <div id="status" class="panel">
        <div class="row"><span class="label">모드</span><span data-field="mode">걷기</span></div>
        <div class="row"><span class="label">속도</span><span data-field="speed">0 km/h</span></div>
        <div class="row"><span class="label">건물</span><span data-field="buildings">—</span></div>
        <div class="row"><span class="label">도로</span><span data-field="roads">—</span></div>
        <div class="row"><span class="label">타일</span><span data-field="tiles">—</span></div>
        <div class="row stream"><span class="label">로드</span><span data-field="stream">대기</span></div>
      </div>
    </div>

    <div id="crosshair"></div>

    <div id="mode-bar" class="panel">
      <button class="mode-btn active" data-mode="walk" type="button">걷기 (1)</button>
      <button class="mode-btn" data-mode="bike" type="button">자전거 (2)</button>
      <button class="mode-btn" data-mode="car" type="button">자동차 (3)</button>
      <button class="action-btn" data-action="lock" type="button">마우스 잠금</button>
    </div>

    <div id="help" class="panel">
      <strong>조작</strong><br/>
      WASD — 이동 · 마우스 — 시점(속도 제한)<br/>
      휠 — 확대/축소<br/>
      Shift 가속 · Space 점프(걷기)<br/>
      1 / 2 / 3 모드 · ESC 잠금 해제
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.innerHTML = `
    <div class="card">
      <h1>송도 시티 VR</h1>
      <p class="subtitle">
        GTA처럼 현재 위치만 빠르게 불러 입장하고, 이동하면서 캐릭터 주변 도시를
        계속 스트리밍합니다. (시작 로딩 ≤ 20초)
      </p>
      <ul>
        <li>빠른 시작 + 이동 중 주변 프리로드</li>
        <li>통유리·상가·차도 · 송도 전역 이동</li>
        <li>센트럴파크 수로·시그니처 타워</li>
      </ul>
      <div class="actions">
        <button class="action-btn primary" data-action="start" type="button">바로 시작</button>
        <button class="action-btn secondary" data-action="refresh" type="button">캐시 비우고 다시</button>
      </div>
      <div id="loading-bar"><span></span></div>
      <div id="loading-text">준비됨</div>
    </div>
  `;

  document.body.appendChild(root);
  document.body.appendChild(overlay);

  const fields = {
    mode: root.querySelector('[data-field="mode"]'),
    speed: root.querySelector('[data-field="speed"]'),
    buildings: root.querySelector('[data-field="buildings"]'),
    roads: root.querySelector('[data-field="roads"]'),
    tiles: root.querySelector('[data-field="tiles"]'),
    stream: root.querySelector('[data-field="stream"]'),
  };
  const crosshair = root.querySelector("#crosshair");
  const loadingBar = overlay.querySelector("#loading-bar > span");
  const loadingText = overlay.querySelector("#loading-text");
  const modeButtons = [...root.querySelectorAll(".mode-btn")];

  return {
    root,
    overlay,
    on(handler) {
      const bind = (el) =>
        el.addEventListener("click", (e) => {
          const a =
            e.currentTarget.getAttribute("data-action") ||
            e.currentTarget.getAttribute("data-mode");
          if (a) handler(a, e);
        });
      root.querySelectorAll("[data-action], [data-mode]").forEach(bind);
      overlay.querySelectorAll("[data-action]").forEach(bind);
    },
    setProgress(pct, text) {
      loadingBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      if (text) loadingText.textContent = text;
    },
    hideOverlay() {
      overlay.classList.add("hidden");
    },
    showOverlay() {
      overlay.classList.remove("hidden");
    },
    setStats({ mode, speed, buildings, roads, tiles }) {
      if (mode != null) fields.mode.textContent = mode;
      if (speed != null) fields.speed.textContent = `${speed.toFixed(0)} km/h`;
      if (buildings != null) fields.buildings.textContent = String(buildings);
      if (roads != null) fields.roads.textContent = String(roads);
      if (tiles != null) fields.tiles.textContent = String(tiles);
    },
    setStreamStatus(msg) {
      if (fields.stream) fields.stream.textContent = msg;
    },
    setActiveMode(id) {
      modeButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.mode === id);
      });
    },
    setLocked(locked) {
      crosshair.classList.toggle("visible", locked);
      const lockBtn = root.querySelector('[data-action="lock"]');
      if (lockBtn) lockBtn.textContent = locked ? "잠금 해제 (ESC)" : "마우스 잠금";
    },
  };
}
