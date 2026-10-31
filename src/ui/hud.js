export function createHud() {
  const root = document.createElement("div");
  root.id = "hud";
  root.innerHTML = `
    <div id="top-bar">
      <div id="brand" class="panel">
        <h1>YUNSEUL VR · 송도</h1>
        <p>SONGDO · 실제 지도 기반 · 건물 외관 근사</p>
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
    <div id="map-attribution">지도 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> · ODbL</div>

    <div id="tour-bar" class="panel"><label>송도 장소 이동 <select id="tour-select" aria-label="송도 장소 이동"><option value="">목적지 선택</option></select></label></div>

    <div id="help" class="panel">
      <strong>조작</strong><br/>
      ↑ / ↓ — 앞 / 뒤 · ← / → — 시선 회전<br/>
      W/S — 앞/뒤 · A/D — 옆걸음 · 마우스 — 시점<br/>
      휠 — 확대/축소<br/>
      Shift 가속 · Space 점프(걷기)<br/>
      기본 걷기 · 1 / 2 / 3 — 속도 전환 (선택)
    </div>
  `;

  const overlay = document.createElement("div");
  overlay.id = "overlay";
  overlay.innerHTML = `
    <div class="card">
      <div class="eyebrow">YUNSEUL / SONGDO</div>
      <h1>송도,<br/>도시를 따라 걷다.</h1>
      <p class="subtitle">
        송도 센트럴파크 수변 산책로에서 시작합니다.
        실제 지도 위에 햇살, 물결, 나무 그늘을 더했습니다.
      </p>
      <ul>
        <li>실제 수로와 산책로 · 기본 지도 포함</li>
        <li>수면 반사 · 유리 파사드 · 자연광과 그림자</li>
        <li>안정적인 시선 · 하향 각도 제한</li>
      </ul>
      <div class="actions">
        <button class="action-btn primary" data-action="start" type="button">센트럴파크 입장</button>
        <button class="action-btn secondary" data-action="refresh" type="button">캐시 비우고 다시</button>
      </div>
      <div id="loading-bar"><span></span></div>
      <div id="loading-text">지도 자동 로딩 중</div>
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
    setBusy(busy) {
      overlay.querySelectorAll("button").forEach(b => b.disabled = busy);
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
    setDestinations(destinations, onSelect) {
      const select=root.querySelector("#tour-select");
      select.replaceChildren(new Option("목적지 선택", ""));
      for (const d of destinations) {const opt=document.createElement("option");opt.value=d.id;opt.textContent=d.name;select.appendChild(opt);}
      select.onchange=()=>{const d=destinations.find(d=>d.id===select.value);if(d)onSelect(d);select.value="";select.blur();};
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
