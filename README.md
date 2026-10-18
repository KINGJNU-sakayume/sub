# 역 도장깨기

수도권 전철 노선과 역을 무작위로 뽑아 평소 가지 않던 곳을 탐험하고, 방문한 역을 사진 누끼 스티커로 모으는 개인 기록 페이지예요. 무작위 뽑기는 탐험의 시작이고, 직접 방문한 역도 똑같은 도장첩에 남길 수 있어요. 빌드 없이 정적 파일만으로 돌아가고, 기록은 브라우저 안에만 저장돼요.

## 탐험과 기록의 원칙

- **메인은 역 뽑기**: 기존처럼 노선을 먼저, 역을 다음에 무작위로 뽑아요. 낯선 목적지를 발견하는 경험이 앱의 중심이에요.
- **직접 방문도 같은 기록**: 기록 서랍의 '역 직접 찾기', 도장첩의 역 칸, 지도의 역 점에서 역을 열어 사진 스티커를 남길 수 있어요. 직접 찾기는 **뽑기 범위·활성 노선의 제한을 받지 않아요**.
- **하나의 도장첩**: 방문하게 된 계기와 무관하게 역마다 도장은 하나예요. 무작위/자유 방문 등급·배지·스티커 테두리·별도 통계를 만들지 않아요. 도장 수는 중복 환승역을 한 번만 세는 전체 고유 역 기준이에요.
- **사진 누끼 스티커 우선**: 촬영·앨범 선택·누끼 붙여넣기로 사진 스티커를 만들어요. 사진 없는 기본 도장은 선택지로만 남겨 둬요. 사진을 붙여도 기존 날짜는 유지돼요.
- **이미 방문한 역과 추첨**: '도장 없는 역에서만 뽑기'가 켜져 있으면 직접 선택해 찍은 도장도 다음 무작위 후보에서 제외돼요.
- **기록은 실제 방문 기준**: 뽑혔다는 사실만으로 자동 도장을 찍지 않아요. 이용자가 실제 방문 후 스티커나 도장을 남겨요.

뽑기 설정(지역·노선)은 **추첨 후보에만** 영향을 줘요. 도장첩, 직접 찾기, 기록 저장·백업은 이에 따라 사라지거나 분리되지 않아요.

## 실행

```sh
python3 -m http.server 8765      # 저장소 폴더에서
# http://localhost:8765/index.html (역명판) · map.html (지도)
```

서비스 워커(`sw.js`)는 https나 localhost에서만 등록돼요. 배포 때는 `sw.js`의 `__VERSION__`이 커밋 번호로 바뀌어요.

### 검사

```sh
for f in data.js geo.js access.js core/*.js sign.js map.js sw.js; do node --check "$f"; done
node tools/merge-curated.mjs --dry          # '경고'가 나오면 실패
npm install --no-save playwright@1.56.1 && npx playwright install chromium
node tests/smoke.mjs http://localhost:8765/ # 정적 서버가 떠 있어야 해요. CHROMIUM_PATH로 브라우저 지정 가능
```

PR과 main 배포(`pages.yml`)는 모두 `check.yml`(위 세 검사)을 통과해야 진행돼요.

## 파일

| 파일 | 내용 |
| --- | --- |
| `data.js` | 노선(`LINES`), 영문 역명, 지역(`REGION`), 이름 바뀐 역(`RENAMED`), 이 역 근처(`CURATED`) |
| `access.js`, `geo.js` | 장소별 출구·도보 시간, 역 좌표 |
| `core/base.js` | 역 색인, 이벤트, 저장·검증, 뽑기 범위, 사진 DB, 창(모달) 도우미 |
| `core/draw.js`, `core/route.js` | 뽑기 엔진, 길 안내 그래프 |
| `core/sticker.js`, `core/seal.js`, `core/card.js` | 사진 → 스티커, 사진 없는 도장, 공유 카드 |
| `core/board.js`, `core/drawer.js`, `core/origin.js`, `core/backup.js` | 안내판과 사진 도장, 역 직접 찾기·도장첩, 출발역 창, 내보내기·불러오기 |
| `sign.js`, `map.js` | 역명판 화면, 지도 화면 |

`core/*.js`는 `window.Core`를 공유해요. HTML의 `<script>` 순서가 곧 의존 순서라서 바꾸지 않아요.

## 정책

- **'서울' 범위**: `REGION`에 이름이 없는 역이에요. '수도권 전체'를 고르면 모든 역이 들어가요.
- **뽑기 확률**: 켜진 노선 중 하나를 같은 확률로 고른 뒤, 그 노선의 후보 역 중 하나를 같은 확률로 골라요. 역마다 확률이 같지는 않아요(후보가 적은 노선의 역, 여러 노선이 지나는 환승역이 더 자주 나와요). '노선부터 뽑는 재미'를 위한 의도된 방식이에요.
- **길 안내**: 노선별 정거장 수와 환승 비용으로 계산한 어림 경로예요. 시간표·실시간 정보는 쓰지 않아요.
- **몇 번째 도장**: 날짜순, 같은 날은 기록에 들어간 순서(찍은 순서)대로 세요.

## 저장 형식

`localStorage['metro-stamp:v2']` (JSON)

| 필드 | 형식 |
| --- | --- |
| `stamps` | `{ 역 키: { d: 'YYYY-MM-DD', l: 노선 번호, p?: 1 } }` — `p`가 있으면 사진이 IndexedDB에 있어요 |
| `quarantine` | 읽을 때 형식이 틀렸던 도장(날짜 오류 등). 지우지 않고 따로 보관만 해요 |
| `cur`, `origin`, `recentOrigins` | 지금 보는 역 `{ name, line }`, 출발역, 최근 출발역(최대 4) |
| `unvisited`, `sound`, `voice`, `scope`, `lines`, `bookLine`, `mapFold` | 화면 설정 |

읽을 때 필드마다 형태를 검사해요(`core/base.js`의 `load`, `cleanStamp`). 노선이 그 역의 노선이 아니면 역의 첫 노선으로 고쳐요. 저장에 실패하면 화면 위에 알림이 떠요.

사진: IndexedDB `metro-stamp` › `photos`, 키는 역 키, 값은 스티커 PNG Blob.

## 백업

내보내기: `{ version: 2, stamps, photos: { 역 키: 'data:image/png;base64,…' } }`. 사진을 못 읽은 역이 있으면 부분 백업이라고 알려요.

불러오기는 합치기만 해요.
- `version`은 1 또는 2, `stamps`는 객체여야 해요.
- 없던 도장은 더하고, 있던 도장은 그대로 둬요. 있던 도장에 사진이 빠져 있으면 백업 사진으로 채워요.
- 날짜가 틀린 항목은 건너뛰고, 모르는 역은 그대로 둬요.
- 사진은 `data:image/(png|jpeg|webp|gif)` 이고 8MB 이하이며 이미지로 열려야 받아요.

## 이 역 근처 데이터 갱신

1. `tools/curated-draft.mjs`에 장소를 추가해요(주석 처리된 항목은 건너뛰어요).
2. `node tools/merge-curated.mjs --dry`로 바뀔 내용을 확인하고, `--dry` 없이 실행해 `data.js`에 합쳐요.
3. 출구·도보 시간은 `access.js`, 좌표 확인은 `tools/geo-check.html`, 장소 확인은 `tools/place-check.html`로 해요.
