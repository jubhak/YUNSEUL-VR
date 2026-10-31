# YUNSEUL VR — 송도 시티

공개 **OpenStreetMap** 건물·도로·공원·수면 데이터로 인천 송도국제도시를 3D로 재구성하고, 걷기 / 자전거 / 자동차로 이동할 수 있는 WebXR VR 환경입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 표시된 주소(기본 `http://localhost:5173`)를 연 뒤 **센트럴파크 입장**를 누르세요.

VR 헤드셋(Meta Quest 등)은 같은 URL을 열고 좌측 **ENTER VR** 버튼을 사용합니다. HTTPS 또는 `localhost`가 필요합니다.

## 조작

| 입력 | 동작 |
|------|------|
| WASD / 화살표 | 이동 |
| 마우스 (잠금 후) | 시점 · 아래 보기 최대 18° |
| 마우스 휠 | 확대/축소 · 확대 시에도 수평선 유지 |
| Shift | 가속 |
| Space | 점프 (걷기) |
| 1 / 2 / 3 | 걷기 / 자전거 / 자동차 |
| ESC | 마우스 잠금 해제 |

## 데이터

- **출처:** [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
- **API:** Overpass (`overpass-api.de` 등 미러)
- **범위:** 송도 센트럴파크·컨벤시아 일대 (`src/config.js`의 `SONGDO.bbox`)
- **캐시:** 브라우저 `localStorage`에 7일 보관
- 센트럴파크 기본 지도(`public/data/central-park.json`)는 프로젝트에 포함됩니다. 외부 Overpass가 실패해도 공원은 표시되며, 가짜 격자 도시를 생성하지 않습니다.

건물 높이는 `height` / `building:levels` 태그를 쓰고, 없으면 용도별로 추정합니다. OSM에 높이가 없는 고층은 실제와 다를 수 있습니다.

## 스택

- Vite + Three.js
- WebXR (`VRButton`)
- OSM Overpass → footprint extrude / road ribbons

## 빌드

```bash
npm run build
npm run preview
```

## 수변 환경 개선판

시작 위치는 실제 OSM 산책로 좌표 **37.3929286, 126.6386891**이며, 센트럴파크 수로 건너편을 바라봅니다. 위치와 바라보는 방향은 `src/config.js`의 `SPAWN`에서 조정합니다.

기존의 원형 수로와 임의 배치 랜드마크 대신 실제 지도 건물 윤곽·산책로·수로를 사용합니다. OSM 멀티폴리곤의 분리된 경계와 안쪽 섬도 연결/보존합니다. 재질은 PBR 기반으로 변경했고, 주 수로는 데스크톱에서 건물/나무의 평면 반사, VR에서는 별도의 반사 카메라를 사용하지 않는 환경 반사 재질을 사용합니다. 지면에는 잔디·아스팔트·포장 표면, 하늘에는 대기 산란과 구름, 수목에는 인스턴싱된 가지·잎을 적용했습니다. 공원 수목은 실제 개별 나무 위치가 아니라 지도 공원 경계 안에서 절차적으로 배치합니다.

마우스를 계속 내려도 기본 하향 각도는 18°에서 멈춥니다. 휠로 확대했을 때는 FOV를 고려해 제한을 더 줄여 화면 상단에 수평선 여유를 남깁니다. 위쪽은 약 65°까지 올려볼 수 있습니다. 이 제한은 마우스 시점에만 적용하며, VR 헤드셋의 실제 머리 회전은 강제로 제한하지 않습니다.

### 검증

```bash
npm ci
npm test
npm run build
npm run dev
```

`tests/regression.test.js`는 반복 하향 입력, 모든 줌 범위에서의 수평선 유지, 실제 공원/산책로 위의 시작점, 수로의 섬 보존, 도로 면 방향, 지도 파싱의 재현성을 검사합니다. `dist/`는 사전 빌드 결과입니다. `index.html`을 파일로 직접 여는 대신 Vite 서버나 정적 웹 서버를 사용하세요. 하위 경로 배포를 위해 Vite base는 상대 경로입니다.

### 데이터와 구현 한계

포함 지도는 OpenStreetMap API에서 가져온 센트럴파크 일대 데이터입니다. 출처: https://www.openstreetmap.org/api/0.6/map?bbox=126.628,37.385,126.650,37.400 . © OpenStreetMap contributors, ODbL 1.0: https://opendatacommons.org/licenses/odbl/1-0/ . 원본 데이터와 출처 메타데이터는 `public/data/central-park.json`에 들어 있습니다. 외부 사진, 유료 텍스처, AI 생성 이미지는 사용하지 않습니다.

실제 사진 기반 포토그래메트리/실측 3D 모델이 아니라 지도 윤곽과 높이 태그를 활용한 절차적 재구성입니다. 높이 태그가 없는 건물의 높이와 외벽 디테일은 추정이며 실제 건물과 동일하지 않습니다. 외곽 지도 확장은 외부 Overpass 연결에 의존합니다. 실제 VR 기기 성능과 브라우저별 동작은 별도 확인이 필요합니다.
