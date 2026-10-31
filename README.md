# YUNSEUL VR — 송도 시티

공개 **OpenStreetMap** 건물·도로·공원·수면 데이터로 인천 송도국제도시를 3D로 재구성하고, 걷기 / 자전거 / 자동차로 이동할 수 있는 WebXR VR 환경입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 표시된 주소(기본 `http://localhost:5173`)를 연 뒤 **도시 불러오기**를 누르세요.

VR 헤드셋(Meta Quest 등)은 같은 URL을 열고 좌측 **ENTER VR** 버튼을 사용합니다. HTTPS 또는 `localhost`가 필요합니다.

## 조작

| 입력 | 동작 |
|------|------|
| WASD / 화살표 | 이동 |
| 마우스 (잠금 후) | 시점 |
| Shift | 가속 |
| Space | 점프 (걷기) |
| 1 / 2 / 3 | 걷기 / 자전거 / 자동차 |
| ESC | 마우스 잠금 해제 |

## 데이터

- **출처:** [OpenStreetMap](https://www.openstreetmap.org/copyright) (ODbL)
- **API:** Overpass (`overpass-api.de` 등 미러)
- **범위:** 송도 센트럴파크·컨벤시아 일대 (`src/config.js`의 `SONGDO.bbox`)
- **캐시:** 브라우저 `localStorage`에 7일 보관
- Overpass가 막히면 로컬 **폴백 격자 도시**로 전환됩니다.

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
