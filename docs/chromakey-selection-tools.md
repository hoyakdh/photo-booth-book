# 크로마키 선택 도구 확장 설계서

## 1. 목표

`ChromaKeyEditor.tsx`의 선택 도구를 정교화한다. 기존 **브러시 / 사각형 / 지우개 / 흰색 자동감지**에 다음을 추가한다.

1. **올가미 (Lasso)** — 자유곡선으로 영역 지정
2. **다각형 선택 (Polygon)** — 클릭으로 꼭짓점 찍어 직선 경계
3. **허용치 슬라이더 (Tolerance)** — 흰색 자동감지 임계값 조절
4. **Add / Subtract 모드** — 기존 선택에 추가 / 제외
5. **선택 반전 (Invert)** — 마스크 전체 뒤집기
6. **Undo / Redo** — 최근 N단계 되돌리기

호환성 제약: 순수 Canvas 2D + JS만 사용. 모든 브라우저·OS에서 동일 동작.

---

## 2. 현재 아키텍처 요약

- 편집 캔버스 2장 겹침: `canvasRef`(원본 이미지) + `overlayRef`(선택 마스크, 초록색 + 알파)
- 좌표계: 원본 이미지 픽셀 기준. `getCanvasPos(clientX, clientY)`로 DOM → 캔버스 좌표 변환
- 마스크 = overlay의 알파 > 0 영역. 저장 시 흰/검 PNG로 export
- 스케일: `scaleRef.current` — 브러시 크기는 이 값으로 나눠 실제 픽셀 크기 계산

**확장 원칙**: overlay 캔버스를 마스크 소스 오브 트루스로 유지. 모든 도구는 overlay에 `#00ff00` 채우거나 `destination-out`으로 지우는 결과만 낸다.

---

## 3. 상태 추가

```tsx
type Tool = "brush" | "eraser" | "rect" | "lasso" | "polygon";
type SelectMode = "replace" | "add" | "subtract";

const [tool, setTool] = useState<Tool>("brush");
const [selectMode, setSelectMode] = useState<SelectMode>("add");
const [tolerance, setTolerance] = useState(20);     // 0~100, 기본 20 (=RGB 235 기준)
const [lassoPoints, setLassoPoints] = useState<{x:number;y:number}[]>([]);
const [polygonPoints, setPolygonPoints] = useState<{x:number;y:number}[]>([]);

const historyRef = useRef<ImageData[]>([]);         // Undo 스택
const redoRef = useRef<ImageData[]>([]);
const HISTORY_LIMIT = 20;
```

---

## 4. 공통 헬퍼

### 4.1 커밋/히스토리

모든 도구가 **"영역 확정" 시점**에 호출한다. 중간 프리뷰는 히스토리에 남기지 않는다.

```tsx
const commitOverlay = () => {
  const ctx = overlayRef.current!.getContext("2d")!;
  const snap = ctx.getImageData(0, 0, overlayRef.current!.width, overlayRef.current!.height);
  historyRef.current.push(snap);
  if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
  redoRef.current = [];
};

const undo = () => {
  const h = historyRef.current;
  if (h.length < 2) return;                         // 현재 상태 포함
  redoRef.current.push(h.pop()!);
  const prev = h[h.length - 1];
  overlayRef.current!.getContext("2d")!.putImageData(prev, 0, 0);
};

const redo = () => { /* 대칭 */ };
```

초기화 시 빈 overlay를 1회 push해서 "되돌릴 기준점"을 만든다.

### 4.2 선택 영역 합성 (Add / Subtract / Replace)

도구가 만든 "1단계 선택"을 임시 캔버스(`stageCanvas`)에 그린 뒤, `selectMode`에 따라 overlay에 합성한다.

```tsx
const applyStage = (stage: HTMLCanvasElement) => {
  const ctx = overlayRef.current!.getContext("2d")!;
  if (selectMode === "replace") {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.drawImage(stage, 0, 0);
  } else if (selectMode === "add") {
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(stage, 0, 0);
  } else {                                          // subtract
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(stage, 0, 0);
  }
  ctx.globalCompositeOperation = "source-over";
  commitOverlay();
};
```

→ 기존 브러시·사각형·흰색 자동감지도 이 경로로 통일한다. (브러시는 `add`, 지우개는 `subtract`로 매핑)

---

## 5. 도구별 설계

### 5.1 올가미 (Lasso)

- **입력**: pointerdown → pointermove로 점 배열 누적 → pointerup에서 닫음
- **프리뷰**: overlay와 별도의 `previewCanvas`에 `ctx.beginPath()` + `moveTo/lineTo` + `stroke` (점선)
- **확정**: pointerup에서 stage 캔버스에 같은 패스를 `fill("evenodd")`로 채움 → `applyStage(stage)` → `lassoPoints=[]`

```tsx
const finalizeLasso = () => {
  if (lassoPoints.length < 3) return;
  const stage = makeStageCanvas();                  // overlay 크기, #00ff00 전용
  const sctx = stage.getContext("2d")!;
  sctx.fillStyle = "#00ff00";
  sctx.beginPath();
  sctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
  for (const p of lassoPoints.slice(1)) sctx.lineTo(p.x, p.y);
  sctx.closePath();
  sctx.fill();
  applyStage(stage);
  setLassoPoints([]);
};
```

### 5.2 다각형 (Polygon)

- **입력**: 클릭마다 점 추가, **더블클릭 또는 첫 점 반경 10px 이내 클릭 시 닫힘**
- **프리뷰**: 지금까지 찍힌 점들을 잇는 라인 + 커서 위치까지의 고무줄(rubber band) 라인
- **확정**: 닫힘 조건 충족 시 lasso와 동일하게 stage에 fill → `applyStage` → `polygonPoints=[]`
- **Esc 키**: `polygonPoints=[]`로 취소

고무줄 라인 때문에 `onPointerMove`에서 프리뷰 다시 그리기 필요 (overlay는 건드리지 않음, 별도 preview canvas).

### 5.3 허용치 슬라이더 (Tolerance)

`handleAutoDetectWhite`를 일반화:

```tsx
const threshold = 255 - tolerance * 2;              // tolerance 0=엄격(255), 100=느슨(55)
if (r >= threshold && g >= threshold && b >= threshold) whiteMask[i] = 1;
```

- 기존 로직 유지 (연결요소 분석 + 최소 면적 필터).
- **동작 모드**: 결과를 stage에 그린 뒤 `applyStage` 경로로 통과시켜 Add/Subtract 모드와 연동.
- UI: 자동감지 버튼 옆 슬라이더 (`min=0 max=100 step=5`). 슬라이더 변경 후 다시 버튼을 눌러야 재실행 (실시간 재계산은 비쌈).

### 5.4 Add / Subtract 모드

- 상단 도구바에 **세그먼트 컨트롤** 3개: `교체 / 추가 / 제외`
- 전역 `selectMode` 상태로 올가미·다각형·사각형·흰색감지 모두에 적용
- 브러시/지우개 버튼은 **도구**이자 암묵적 모드 매핑:
  - 브러시 선택 시 `selectMode=add`로 강제
  - 지우개 선택 시 `selectMode=subtract`로 강제
  - 그 외 도구는 사용자 선택대로

### 5.5 선택 반전 (Invert)

```tsx
const invert = () => {
  const ctx = overlayRef.current!.getContext("2d")!;
  const d = ctx.getImageData(0, 0, overlay.width, overlay.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] > 0) { p[i+3] = 0; }
    else              { p[i]=0; p[i+1]=255; p[i+2]=0; p[i+3]=255; }
  }
  ctx.putImageData(d, 0, 0);
  commitOverlay();
};
```

대용량(4K) 이미지에서 ~30ms 수준. 동기 처리로 충분.

### 5.6 Undo / Redo

- 커밋 시점: 브러시/지우개는 **pointerup**에서 1회 commit (드래그 전체를 1스텝). 사각형/올가미/다각형/흰색감지/반전/전체지우기는 확정 시 1회.
- 버튼 + 키보드(`Cmd/Ctrl+Z`, `Shift+Cmd/Ctrl+Z`) 지원. 키오스크 환경이면 버튼만.

---

## 6. UI 레이아웃

상단 도구바를 **2행**으로 확장:

```
[브러시] [사각형] [올가미] [다각형] [지우개] | [크기 슬라이더 ___]
[교체/추가/제외] | [흰색감지] [허용치 ___] | [반전] [Undo] [Redo] [전체지우기]
```

- 좁은 화면: `flex-wrap`으로 자연스럽게 2~3행 감싸기
- 도구 아이콘 + 짧은 한글 라벨 병행 (현재 스타일 유지)

---

## 7. 좌표·스케일 주의사항

- 모든 도구 입력은 `getCanvasPos(clientX, clientY)`로 **원본 이미지 좌표**로 변환해 저장.
- 프리뷰 라인을 DOM으로 그릴 때만 `offsetRef + scaleRef`로 화면 좌표로 역변환.
- 창 리사이즈 시 overlay 내용(=마스크)은 유지되지만 프리뷰 캔버스는 재생성. `useEffect` 의존성에 `imgLoaded`만 있으므로 리사이즈 핸들러 추가 검토(현재 미구현 동일).

---

## 8. 호환성 체크

| 기능 | API | 호환성 |
|---|---|---|
| 올가미 fill | `Path2D` / `ctx.fill("evenodd")` | 전 브라우저 |
| 더블클릭 감지 | `onDoubleClick` / 250ms 이내 2클릭 수동 감지 | 터치 키오스크 주의 → 수동 구현 |
| `destination-out` | Canvas composite | 전 브라우저 |
| `getImageData`/`putImageData` | 대용량 시 수백ms | 4K 사진에서 ~100ms, 허용 범위 |
| 키보드 Undo | `keydown` 리스너 | 키오스크는 버튼만 |

WASM·WebGL·OffscreenCanvas·Web Worker 전부 **사용 안 함** → iOS Safari 14+, 구형 안드로이드 크롬까지 안전.

---

## 9. 구현 순서 (추정 공수)

1. **applyStage / commitOverlay / Undo·Redo 인프라** — 0.5일
   - 기존 브러시/사각형/지우개/흰색감지를 새 경로로 이전
2. **Add/Subtract 모드 세그먼트 UI + 모드 연동** — 0.5일
3. **허용치 슬라이더 + 흰색감지 파라미터화** — 0.25일
4. **선택 반전 / 전체 지우기 커밋** — 0.25일
5. **올가미** — 0.5일
6. **다각형(고무줄 프리뷰 포함)** — 0.75일
7. **키보드 단축키 + UI 정리** — 0.25일

**합계 ≈ 3일**. 올가미/다각형을 뺀 핵심(1~4)은 1.5일.

---

## 10. 테스트 체크리스트

- [ ] 각 도구 드래그 중 프리뷰 OK, 확정 후 overlay 반영
- [ ] Add/Subtract/Replace 모드별 합성 결과가 기대와 일치
- [ ] Undo 20회 이상 제한 동작, Redo 스택이 새 작업 시 비워짐
- [ ] 기존 마스크 불러와 편집 후 저장 시 이전 마스크 손실 없음
- [ ] 모바일 사파리 / 안드로이드 크롬 / 데스크톱 크롬·파이어폭스·사파리에서 Pointer Events 정상
- [ ] 4K 이미지(4000×3000)에서 반전·흰색감지 1초 이내
- [ ] 다각형 중 Esc / 바깥 클릭 / 도구 변경 시 점 배열 클리어
