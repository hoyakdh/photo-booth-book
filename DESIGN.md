# Design System — Book Photo Booth

현재 적용되어 있는 디자인을 기록한 문서입니다. 키오스크 환경의 어린이 사용자를 겨냥한 **따뜻하고 친근한 포토부스** 톤을 따릅니다.

## 1. Visual Theme & Atmosphere

Book Photo Booth는 동화책에서 바로 튀어나온 듯한 톤을 지향합니다. 전반적인 인상은 "해질녘 크림색 종이 위에 수채화로 그린 키오스크" — 따뜻한 크림 배경(`#fffbf0`)에 선명한 주황색 포인트가 올라가 있어, 어린이가 잠깐 봐도 "뭘 누르면 되는지" 즉시 파악할 수 있습니다. 화면은 대부분 밝고, 진한 색은 오직 행동 버튼과 타이틀에만 등장합니다.

타이포는 시스템 기본 `Geist` 산세리프를 `font-black`/`font-bold` 중심으로 사용해 헤드라인은 두껍고 당당하게, 보조 텍스트는 `text-gray-400/500`으로 한 단계 내려 전체 레이어를 명확히 구분합니다. 모서리는 `rounded-2xl`을 기본 반경으로 하여 딱딱한 키오스크 UI가 아닌 둥근 그림책 장정을 연상시킵니다.

색은 이원화되어 있습니다: **크림 계열 바탕 + 주황 주제색**이 전체 성격을 잡고, 민트·옐로·코랄은 보조 액센트로만 나타납니다. 촬영 화면만은 예외적으로 **검정 캔버스**를 그대로 써서 카메라 프리뷰의 몰입감을 보존합니다.

**Key Characteristics:**
- 크림 배경(`#fffbf0`) + 노랑→오렌지 그라디언트 바디(`bg-gradient-to-b from-yellow-50 to-orange-50`)
- 주황(`#ff6b35`) 단일 주제색 — CTA, 헤드라인 강조, 선택 상태에만 사용
- 굵은 타이포(`font-black`, `font-bold`)로 동화책 제목 같은 헤드라인
- `rounded-2xl` 카드/버튼 — 부드럽고 안전한 실루엣
- `shadow-lg` 흰 카드로 크림 바닥 위에 살짝 들뜬 듯한 입체감
- 촬영 화면만 블랙 캔버스 + 카운트다운 팝 애니메이션
- 터치 피드백 `btn-touch`(`active:scale-95`) 전역 적용
- 키오스크 상주: `overscroll-behavior: none`, `-webkit-tap-highlight-color: transparent`, 100dvh 안전 영역

## 2. Color Palette & Roles

CSS 변수는 [src/app/globals.css](src/app/globals.css)에 정의되어 있고 Tailwind `@theme inline`으로 노출됩니다.

### Primary
- **Cream BG** (`#fffbf0`, `--background`): 페이지 기본 배경. 순백이 아니라 우유빛 크림 — 장시간 키오스크 뷰에서도 눈부심이 적습니다.
- **Ink Navy** (`#1a1a2e`, `--foreground`): 기본 텍스트. 순흑 대신 살짝 푸른 감청색으로 부드럽게.
- **Brand Orange** (`#ff6b35`, `--primary`): 주 CTA, 헤드라인 강조, 선택/활성 상태.
- **Brand Orange Light** (`#ff8c5a`, `--primary-light`): Primary의 hover/보조 변형.

### Accent (보조 — 상태/장식용)
- **Mint Teal** (`#4ecdc4`, `--secondary`): 보조 CTA, 다른 범주 표시.
- **Sun Yellow** (`#ffe66d`, `--accent`): 하이라이트, 장식적 포인트.

### Status
- **Coral Red** (`#ff6b6b`, `--danger`): 삭제·에러. 주황과 구별되는 핑크톤.
- **Mint Green** (`#51cf66`, `--success`): 저장 완료·성공 상태.

### 실사용 계조 (Tailwind 내장)
- **Body Muted** (`text-gray-500`): 서브 타이틀, 보조 설명.
- **Placeholder** (`text-gray-400`): "불러오는 중…", "아직 없어요" 등 빈 상태 카피.
- **Card Surface** (`bg-white`): 책표지 카드, 관리자 폼 패널의 기본 표면.
- **Image Plate** (`bg-gray-50`): 카드 안 이미지 영역 바탕.

### 문서 의도
- 주황은 "눌러야 하는 것"에만 쓴다는 규칙을 유지. 장식적 오렌지 배경은 전역 그라디언트 외에는 쓰지 않습니다.
- 크림 배경 위 흰 카드는 `shadow-lg`로 떠 보이게 하고, 선택 시 `ring-4 ring-primary/30`을 추가해 주황색이 은은히 번지게 합니다.

## 3. Typography Rules

### Font Family
- **Sans**: `Geist` (Google Fonts, `--font-geist-sans`) → 시스템 sans-serif 폴백.
- **Mono**: `Geist Mono` (`--font-geist-mono`) — 현재 UI에서 실사용은 거의 없고 코드/라벨 여지.

### 실사용 계층

| Role | Class 조합 | 용도 |
|------|------------|------|
| Splash Title | `text-3xl sm:text-4xl font-black text-primary` | "Book Photo Booth" 홈 타이틀 |
| Sub Title | `text-base sm:text-lg text-gray-500` | 홈 부제, 화면 설명 |
| Section Heading | `text-2xl font-bold` | 관리자 섹션 제목 |
| Card Title | `font-bold text-sm sm:text-base truncate` | 책표지 카드 이름 |
| Primary Button | `font-bold text-lg` (버튼 내) | CTA 라벨 |
| Secondary Button | `text-sm font-bold` | 완료·취소 등 보조 액션 |
| Body | `text-base` | 일반 설명 |
| Helper | `text-sm text-primary font-bold` | 안내 문구 ("이동할 책을 선택하세요") |
| Micro Link | `text-sm text-gray-400 underline` | 푸터의 "관리자 페이지", "순서 변경" |
| Countdown | `text-[20rem] font-black text-white` (가량) | 촬영 카운트다운 숫자 |

### 원칙
- **Weight는 두 단계로 극단적**: 대부분 `font-bold`(700) 또는 `font-black`(900), 그 외는 기본 400. 중간 무게를 거의 쓰지 않아 "놀이 같은" 타이포 대비를 만듭니다.
- **사이즈는 vw 감각으로 스케일**: `text-3xl sm:text-4xl`처럼 브레이크포인트 프리픽스로 부드럽게 키움.
- 자간/행간 조정은 거의 없고 Tailwind 기본값을 신뢰합니다. 어린이 대상 UX에서 가독성보다 친숙함이 우선.

## 4. Component Stylings

### Buttons

**Primary CTA**
- `px-6 py-3 bg-primary text-white rounded-2xl font-bold text-lg btn-touch`
- 대표 행동: "촬영하기", "책표지 등록하러 가기", "저장".
- 터치 시 `btn-touch:active { transform: scale(0.95) }` 로 눌리는 피드백.

**Secondary / Neutral Button**
- `px-4 py-2 rounded-xl text-sm font-bold bg-gray-200 text-gray-700`
- "완료", "취소" 등 중성적 행동.

**Ghost Link (텍스트 버튼)**
- `text-sm underline text-gray-400` (기본)
- 활성 시 `text-primary font-bold`.
- 푸터의 "관리자 페이지", "순서 변경"처럼 부차적 진입점.

**Danger Button**
- `bg-[var(--danger)] text-white rounded-xl` 계열 — 삭제 확인에 사용.

### Cards & Containers
- **책표지 카드**: `bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-transparent` + 상태에 따라 `hover:border-primary`, `active:scale-95`. 선택 모드에서는 `border-primary scale-95 ring-4 ring-primary/30`.
- **관리자 패널**: `bg-white rounded-2xl shadow-lg p-6` 구성이 반복.
- **이미지 플레이트**: 카드 내부 `aspect-[3/4] bg-gray-50` 바탕 + `object-contain` 이미지 + `group-hover:scale-105 transition-transform duration-300`.

### Navigation / Chrome
- 전통적 내비게이션 바는 없음. 홈 상단 `<header>` 로고 + 하단 `<footer>` 텍스트 링크로 구성.
- 로고 5회 탭 → 관리자 진입 (숨은 입구, 키오스크 모드 보호).

### Capture Screen (예외 영역)
- `bg-black`, 전체 뷰포트. 카운트다운은 흰색 `font-black`으로 `animate-countdown`(0.3→1.2→1 팝) 적용.
- 셔터 순간 `animate-flash`(0.4s) 레이어가 덮고 사라짐.
- 가이드 사각형은 흰 `border-dashed`.

### Sticker / Chroma Editor
- 모달 느낌의 흰 패널 `bg-white rounded-2xl shadow-lg`.
- 툴바는 `flex gap-2` 아이콘 버튼: `rounded-full bg-gray-100 w-10 h-10`.
- 선택된 툴은 `bg-primary text-white`.

## 5. Layout Principles

### Spacing
- 기본 단위: Tailwind 4px 그리드 그대로 — `gap-3`(12px), `gap-4`(16px), `p-4`(16px), `py-3`(12px)가 주류.
- 카드 간격: `gap-3`(모바일) → `gap-4`(관리자).
- 섹션 간 수직 간격: `mb-3` ~ `mb-6`.

### Grid
- 홈 책표지 그리드: `flex flex-wrap gap-3`, 아이템 폭 `w-[calc(50%-0.375rem)]` → sm `33.333%` → md `25%`. CSS Grid 대신 계산된 flex 폭으로 임의 개수에서도 균등.
- 이미지 비율: 모바일 `aspect-[3/4]`, 데스크톱 `md:h-[35dvh]` 고정 높이로 전환.
- 관리자: 단일 열 스택이 기본, 폼은 `max-w-lg` 중앙 정렬.

### Viewport
- 모든 풀스크린 뷰는 `h-[100dvh]` + `overflow-hidden` — 키오스크에서 스크롤 체인/고무줄 효과 차단.
- iOS Safari 대응 `.h-screen-safe` 헬퍼 (`height: 100vh; height: 100dvh;`).

### Whitespace Philosophy
- "카드 자체는 촘촘히, 카드 밖은 여유롭게": 그리드 내부 `gap-3`로 여러 책이 한눈에 보이되, 헤더/푸터는 넉넉한 패딩으로 숨 쉬게 합니다.
- 빈 상태(책 없음)는 문구 하나 + 버튼 하나로 극단적으로 단순화.

### Border Radius
- Micro (`rounded-xl` = 12px): 보조 버튼, 입력.
- Standard (`rounded-2xl` = 16px): 주요 카드, CTA — 시그니처 반경.
- Full (`rounded-full`): 아이콘 버튼, 상태 닷.
- 이보다 큰 반경은 쓰지 않음.

## 6. Depth & Elevation

| Level | 표현 | 용도 |
|-------|------|------|
| Flat | 그라디언트 배경만 | 페이지 전체 바닥 |
| Card (Level 1) | `bg-white shadow-lg` | 책표지 카드, 관리자 패널 |
| Selected (Level 2) | `ring-4 ring-primary/30 scale-95` | 선택 모드 카드 |
| Hover (Desktop) | `hover:border-primary`, `group-hover:scale-105` | 책표지 hover |
| Capture Overlay | `bg-black` 전체 + `animate-flash` 흰 레이어 | 촬영 순간 |

**그림자 철학**: 그림자는 오직 흰 카드를 크림 배경 위로 살짝 띄우는 용도. 복수 레이어 그림자나 dark glow는 쓰지 않습니다. 선택 상태는 그림자 대신 주황 링(`ring-*`)으로 표현해 "선택됨"을 색으로 전달합니다.

## 7. Animations & Motion

`globals.css`에 정의된 전용 키프레임만 사용합니다.

- **countdown-pop** (0.5s, ease-out): `scale(0.3→1.2→1)` + opacity. 촬영 카운트다운 숫자 등장.
- **flash** (0.4s, ease-out): opacity `0→1→0`. 셔터 플래시 오버레이.
- **btn-touch**: `active:scale(0.95)` 0.1s — 전역 버튼 터치 반응.
- Tailwind 기본 `transition-all duration-200` / `transition-transform duration-300` — 카드/이미지 hover에 자연스러운 감속.

과한 회전·튀는 스프링 애니메이션은 의도적으로 피했습니다. 키오스크에서 반복 노출 시 피로를 줄이기 위함.

## 8. Do's and Don'ts

### Do
- 주황(`--primary`)은 **행동/상태 표시에만** 사용한다.
- 카드는 `rounded-2xl bg-white shadow-lg` 세트를 기본으로 쓴다.
- 헤드라인은 `font-black` 또는 `font-bold` — 중간 무게를 섞지 않는다.
- 키오스크 뷰는 `h-[100dvh] overflow-hidden`을 유지해 스크롤 체인을 막는다.
- 터치 버튼에는 `btn-touch` 클래스를 붙여 시각 피드백을 통일한다.
- 어린이 가독성을 위해 본문·버튼 라벨은 최소 `text-base` 이상으로.

### Don't
- 진한 다크 모드를 도입하지 않는다 — 촬영 화면 외에는 항상 크림 배경.
- 추가 액센트 컬러(보라·파랑 등)를 도입하지 않는다. 팔레트 확장이 필요하면 Mint/Yellow/Coral의 명도 조정으로 해결.
- `rounded-3xl` 이상의 과한 반경, 복수 그림자 레이어, 네온 글로우 사용 금지.
- 얇은 폰트 무게(300 이하) 사용 금지 — 어린이 UI에서 시인성 저하.
- 헤더/푸터에 실선 분리선을 넣지 않는다(공간과 색으로 구분).

## 9. Responsive Behavior

### Breakpoints (Tailwind 기본)
| Name | Width | 주요 변화 |
|------|-------|-----------|
| Mobile | <640px | 2열 카드, `aspect-[3/4]` |
| sm | ≥640px | 3열 카드, 타이틀 `text-4xl` |
| md | ≥768px | 4열 카드, 카드 높이 `h-[35dvh]` 고정 |

### 타깃 기기
- 1차 타깃은 세로형 태블릿 키오스크. 가로 데스크톱은 부차.
- 촬영 페이지는 항상 `object-cover` 카메라 프리뷰 + 중앙 가이드로, 화면 비율이 달라도 인물이 중앙에 오도록.

### Touch Targets
- 주요 CTA: `px-6 py-3` → 최소 높이 약 48px, 어린이 손가락에도 넉넉.
- 카드 자체가 탭 영역이며 `active:scale-95`로 반응.

## 10. Agent Prompt Guide

### Quick Reference
- Primary CTA: `bg-primary text-white rounded-2xl font-bold`
- Page 배경: `bg-gradient-to-b from-yellow-50 to-orange-50` (body) / `bg-[#fffbf0]`
- 카드: `bg-white rounded-2xl shadow-lg border-2 border-transparent`
- 선택 상태: `border-primary ring-4 ring-primary/30 scale-95`
- 본문 보조: `text-gray-500` / 빈 상태: `text-gray-400`
- 촬영 화면: `bg-black text-white` + `animate-countdown`, `animate-flash`
- 모든 버튼: `btn-touch` 클래스 추가

### Example Prompts
- "홈 카드 스타일로 공지 배너를 만든다: `bg-white rounded-2xl shadow-lg p-4`, 제목 `font-black text-primary`, 본문 `text-gray-500`."
- "삭제 확인 버튼: `bg-[var(--danger)] text-white rounded-xl px-4 py-2 font-bold btn-touch`."
- "촬영 화면의 카운트다운: 검정 배경 위 흰 숫자, `font-black text-[16rem] animate-countdown`, 등장 순간 `animate-flash` 오버레이."

### Iteration Guide
1. 새 컴포넌트는 반드시 크림 배경 위에서 테스트한다. 흰 배경에서만 예뻐 보이면 탈락.
2. 새로운 색을 쓰기 전에 기존 5색(primary, secondary, accent, danger, success)로 해결 가능한지 점검한다.
3. 어떤 요소가 "누를 수 있는 것"인지 1초 안에 파악되는가? 안 되면 주황을 더한다.
4. 촬영 화면과 일반 화면의 톤을 혼용하지 않는다 — 블랙 캔버스는 카메라 전용.
