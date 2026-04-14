# 결과 페이지 로딩 연출 설계서 (책 제본 컨셉)

작성일: 2026-04-14
대상 파일: `src/app/booth/[id]/result/page.tsx` (+ 신규 컴포넌트)

---

## 1. 배경 및 목적

현재 촬영 완료 직후 `/booth/[id]/result`로 진입하면 결과물이 **즉시 노출**된다. 실제로는 캡처·합성 작업이 짧은 시간 내 끝나 있어 "한 컷 → 바로 결과"로 체감되어 **제품이 주는 특별함(포토 "북")** 이 약하다.

본 과제는 결과 페이지 진입 직후 **약 3초간 "책으로 제본하는" 로딩 오버레이**를 연출하여, 포토북이 "제본되어 탄생한다"는 감성적 경험을 더한다.

---

## 2. 요구사항

### 2.1 기능 요구사항
- **FR-1**: 결과 페이지에 진입하면 **3초간 전체 오버레이 로딩**을 표시한 뒤, 기존 결과 UI를 노출한다.
- **FR-2**: 로딩 중에는 "책 제본" 컨셉의 애니메이션과 **단계별 메시지**가 순차적으로 전환된다.
  - 0.0~1.0s: "사진을 정리하고 있어요"
  - 1.0~2.0s: "표지를 입히는 중이에요"
  - 2.0~3.0s: "제본 마무리 중..."
- **FR-3**: 로딩 중에는 하단 버튼/썸네일 등 결과 UI와의 상호작용이 차단된다.
- **FR-4**: `photos.length === 0` 인 경우(촬영 없이 진입)에는 로딩을 생략하고 기존 빈 상태 UI로 바로 이동.
- **FR-5**: 로딩이 끝난 후 결과 이미지 노출 시 **페이드인(200~300ms)** 트랜지션을 준다.

### 2.2 비기능 요구사항
- **NFR-1**: 외부 애니메이션 라이브러리를 도입하지 않는다(Tailwind + CSS keyframes).
- **NFR-2**: `prefers-reduced-motion: reduce` 환경에서는 **애니메이션을 정적 텍스트**로 대체하되, 3초 지연은 동일하게 유지(연출이 목적이므로).
- **NFR-3**: 키오스크 설정에 `showResultLoading` 플래그(기본 true)를 도입해 운영자가 끌 수 있게 한다.
- **NFR-4**: 뒤로가기/새로고침·재진입 시에도 오버레이는 다시 표시된다(세션 상태 저장 X, 로컬 state로만 관리).

---

## 3. UX 상세

### 3.1 레이아웃
```
┌──────────────────────────────────┐
│                                  │
│          📖 (책 펼침)             │
│        ✨ (반짝이 파티클)          │
│                                  │
│      사진을 정리하고 있어요        │
│         ● ● ○  (단계 도트)        │
│                                  │
└──────────────────────────────────┘
배경: 크림톤 그라디언트 (#FFF8EF → #F2E4C9)
```

### 3.2 애니메이션 요소
| 요소 | 구현 | 동작 |
|------|------|------|
| 책 아이콘 | 큰 이모지 `📖` 또는 SVG | 페이지 넘김 효과(0.8s 간격 `rotateY` 키프레임) |
| 반짝이 | CSS 파티클 `::before/::after` + `@keyframes sparkle` | 투명도 + 스케일 루프 |
| 단계 메시지 | `useEffect` + `setTimeout` 체인 | 1초마다 텍스트 교체, 페이드 인/아웃 |
| 진행 도트 | 3개 도트, 현재 단계 채움 | `aria-valuenow` 로 접근성 |
| 진행 바 (선택) | 하단 3px 바 `width: 0 → 100%` | `transition: width 3s linear` |

### 3.3 접근성
- `role="status"`, `aria-live="polite"`로 단계 메시지 읽기.
- `prefers-reduced-motion: reduce` 시 책/반짝이 애니메이션 off, 텍스트만 교체.

---

## 4. 설계

### 4.1 파일 구성
| 파일 | 역할 |
|------|------|
| `src/components/result/BindingLoader.tsx` (신규) | 로딩 오버레이 컴포넌트 |
| `src/app/booth/[id]/result/page.tsx` (수정) | `isLoading` 상태 + 오버레이 마운트 |
| `src/lib/kiosk.ts` (수정, 선택) | `showResultLoading?: boolean` 필드 추가 |

### 4.2 상태 흐름
```
ResultPage mount
   ├─ photos.length === 0 → 빈 상태 UI (로딩 스킵)
   └─ else
         ├─ isLoading = true
         ├─ useEffect: setTimeout(3000) → isLoading = false
         ├─ 오버레이(BindingLoader) 렌더
         └─ 3초 후: 결과 UI fade-in
```

### 4.3 컴포넌트 인터페이스
```ts
interface BindingLoaderProps {
  duration?: number;       // 기본 3000
  onDone?: () => void;     // 완료 콜백(선택, 부모가 타이머 관리 시 불필요)
}
```
내부에서 `step` 상태(0→1→2)를 1초 간격으로 업데이트.

### 4.4 페이지 수정 포인트 (`result/page.tsx`)

```ts
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  if (photos.length === 0) { setIsLoading(false); return; }
  const k = loadKioskConfig();
  if (k.enabled && k.showResultLoading === false) { setIsLoading(false); return; }
  const t = setTimeout(() => setIsLoading(false), 3000);
  return () => clearTimeout(t);
}, [photos.length]);

// 렌더링
return (
  <div className="h-screen-safe flex flex-col bg-gray-100">
    {isLoading && <BindingLoader />}
    {/* 기존 결과 UI — isLoading 중엔 pointer-events-none opacity-0 또는 hidden */}
    <div className={isLoading ? "invisible" : "animate-fadeIn contents"}>
      ...
    </div>
  </div>
);
```

> 주의: 기존 UI 트리를 `invisible`로만 가리고, 버튼 클릭은 `busy || isLoading`으로 잠금. 트리 자체를 언마운트하면 `ref`(`printRef`) 등이 초기화되므로 **숨김 방식 유지**.

### 4.5 CSS 키프레임 (Tailwind `globals.css` 추가)
```css
@keyframes pageFlip {
  0%   { transform: rotateY(0deg); }
  50%  { transform: rotateY(-160deg); }
  100% { transform: rotateY(0deg); }
}
@keyframes sparkle {
  0%, 100% { opacity: 0; transform: scale(0.8); }
  50%      { opacity: 1; transform: scale(1.1); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.animate-page-flip { animation: pageFlip 1.6s ease-in-out infinite; transform-origin: left center; }
.animate-sparkle   { animation: sparkle 1.2s ease-in-out infinite; }
.animate-fadeIn    { animation: fadeIn 300ms ease-out both; }

@media (prefers-reduced-motion: reduce) {
  .animate-page-flip, .animate-sparkle, .animate-fadeIn { animation: none; }
}
```

---

## 5. 대안 검토

| 대안 | 채택 | 이유 |
|------|------|------|
| 별도 `/loading` 라우트 분리 | ✗ | Zustand 스토어 유실 위험, 뒤로가기 흐름 복잡 |
| `capture` 완료 후 로딩 표시 | ✗ | 결과 페이지 진입 전이라 "제본" 메타포가 약함 |
| **결과 페이지 내 오버레이 (채택)** | ✓ | 상태 유지, 구현 단순, 뒤로가기에도 일관 |

---

## 6. 테스트 계획

| # | 시나리오 | 기대 |
|---|---------|------|
| T1 | 정상 진입 | 3초 오버레이 후 결과 페이드인 |
| T2 | 사진 0장 진입 | 오버레이 생략, 빈 상태 즉시 |
| T3 | 로딩 중 뒤로가기 | 타이머 cleanup, 메모리 누수 없음 |
| T4 | `prefers-reduced-motion` | 애니메이션 정지, 텍스트만 전환 |
| T5 | 키오스크 `showResultLoading=false` | 로딩 스킵 |
| T6 | 로딩 중 버튼 클릭 시도 | 상호작용 차단 |
| T7 | 3초 후 결과 이미지 클릭/저장 | 정상 동작 |

---

## 7. 구현 체크리스트

- [ ] `globals.css`에 `pageFlip`/`sparkle`/`fadeIn` 키프레임 추가
- [ ] `src/components/result/BindingLoader.tsx` 신규 작성 (step 상태, 3개 메시지)
- [ ] `result/page.tsx`에 `isLoading` state + `useEffect` 타이머 추가
- [ ] 기존 UI 트리를 `invisible`/`animate-fadeIn`으로 감싸기
- [ ] `busy` 계산식에 `isLoading` 포함 고려 (버튼 잠금 일관성)
- [ ] `loadKioskConfig()`에 `showResultLoading` 플래그 추가 (기본 true)
- [ ] `prefers-reduced-motion` 미디어 쿼리 적용
- [ ] 실기기 체감 확인 (3초가 지루하지 않은지 — 필요 시 2.5s로 조정)

---

## 8. 향후 과제 (범위 외)

- 단계 메시지에 **실제 작업(예: GIF 프리 인코딩)** 을 바인딩하여 진짜 체감 로딩으로 치환.
- 로티(Lottie) 책 제본 애니메이션 도입(퀄리티 업그레이드 시).
- 사운드(페이지 넘김 SFX) 추가 옵션.
