# 📖 Book Photo Booth - 구현 계획서

## 1. 프로젝트 개요

**목적**: 초등학생을 위한 책표지 포토부스 웹 애플리케이션
**핵심 컨셉**: 책표지의 초록색(#00FF00) 영역을 카메라 영상으로 대체하여, 마치 책 속에 들어간 것 같은 사진을 촬영

### 주요 기능
- 책표지 선택 → 촬영 → 결과 확인 → 다운로드
- 관리자 페이지에서 책표지 등록/관리
- 크로스 브라우저 & 모바일 완벽 지원

---

## 2. 기술 스택

| 구분 | 기술 | 선택 이유 |
|------|------|-----------|
| **프레임워크** | Next.js 14 (App Router) | React 기반, SSR/SSG, Vercel 무료 배포 |
| **언어** | TypeScript | 타입 안전성, 코드 품질 |
| **스타일링** | Tailwind CSS | 반응형 디자인, 빠른 개발 |
| **상태관리** | Zustand | 가볍고 심플한 상태관리 |
| **카메라** | WebRTC (getUserMedia) | 브라우저 네이티브 카메라 API |
| **이미지처리** | Canvas API | 크로마키 합성, 이미지 저장 |
| **저장소** | localStorage + IndexedDB | 서버 없이 로컬 데이터 관리 |
| **배포** | Vercel (무료) | Next.js 최적 호환, HTTPS 자동 제공 |

### 왜 서버리스/로컬 저장소인가?
- 무료 호스팅 조건 충족
- 별도 DB 서버 불필요
- 책표지 이미지는 IndexedDB에 저장 (용량 충분)
- 관리자가 등록한 책표지는 브라우저에 캐싱

---

## 3. 화면 구성 (총 5개 화면)

### 3.1 홈 화면 (`/`)
```
┌─────────────────────────┐
│    📖 Book Photo Booth   │
│                         │
│  ┌─────┐ ┌─────┐ ┌────┐│
│  │책표지│ │책표지│ │책표지││
│  │  1  │ │  2  │ │ 3  ││
│  └─────┘ └─────┘ └────┘│
│  ┌─────┐ ┌─────┐ ┌────┐│
│  │책표지│ │책표지│ │책표지││
│  │  4  │ │  5  │ │ 6  ││
│  └─────┘ └─────┘ └────┘│
│                         │
│     [관리자 페이지]       │
└─────────────────────────┘
```
- 등록된 책표지 그리드 목록
- 책표지 탭 시 선택 → 시작 화면으로 이동
- 하단에 관리자 페이지 진입 링크

### 3.2 시작 화면 (`/booth/[id]`)
```
┌─────────────────────────┐
│                         │
│                         │
│    선택한 책표지 이미지    │
│    (화면 꽉 채움)         │
│                         │
│                         │
│      [ 📸 START ]       │
│                         │
└─────────────────────────┘
```
- 선택된 책표지가 화면 전체에 표시
- 하단 중앙에 START 버튼
- 버튼 클릭 시 카메라 권한 요청 → 촬영 화면 진입

### 3.3 촬영 화면 (`/booth/[id]/capture`)
```
┌─────────────────────────┐
│                         │
│   책표지 오버레이         │
│   ┌───────────────┐     │
│   │ 초록색 영역 =  │     │
│   │ 카메라 미리보기 │     │
│   │ (좌우반전/거울) │     │
│   └───────────────┘     │
│                         │
│      [ 📸 셔터 ]        │
│                         │
└─────────────────────────┘

셔터 클릭 시:
┌─────────────────────────┐
│                         │
│          ③              │
│        (또는 ②, ①)      │
│                         │
└─────────────────────────┘
```
- 책표지가 화면에 오버레이로 표시
- 책표지의 #00FF00 초록색 영역 → 카메라 실시간 피드로 대체 (크로마키)
- 카메라 영상은 좌우반전 (거울 모드)
- 셔터 버튼 클릭 → 3, 2, 1 카운트다운 → 촬영
- 촬영 시 Canvas에 합성 이미지 생성

### 3.4 결과 화면 (`/booth/[id]/result`)
```
┌─────────────────────────┐
│                         │
│  ┌──────┐  ┌──────┐    │
│  │촬영1 │  │촬영2 │    │
│  │  ✓   │  │      │    │
│  └──────┘  └──────┘    │
│  ┌──────┐  ┌──────┐    │
│  │촬영3 │  │촬영4 │    │
│  └──────┘  └──────┘    │
│                         │
│  [💾 저장] [📸 다시촬영]  │
└─────────────────────────┘
```
- 촬영한 사진들 썸네일 목록
- 원하는 사진 선택 (체크)
- 저장 버튼 → PNG 파일 다운로드
- 다시 촬영 버튼 → 촬영 화면으로 복귀

### 3.5 관리자 페이지 (`/admin`)
```
┌─────────────────────────┐
│  📖 관리자 - 책표지 관리  │
│                         │
│  [ + 새 책표지 등록 ]     │
│                         │
│  ┌─────┐ 책이름1        │
│  │thumb│ [수정] [삭제]   │
│  └─────┘                │
│  ┌─────┐ 책이름2        │
│  └─────┘ [수정] [삭제]   │
│                         │
│  [← 홈으로]              │
└─────────────────────────┘
```
- 책표지 이미지 업로드 (파일 선택)
- 책 이름 입력
- 등록된 책표지 목록 (수정/삭제)
- 업로드된 이미지는 IndexedDB에 저장

---

## 4. 핵심 기술 구현

### 4.1 크로마키 합성 (Green Screen)
```
입력: 책표지 이미지 + 카메라 영상
처리: Canvas API로 픽셀 단위 합성
  1. 책표지 이미지를 Canvas에 그림
  2. 각 픽셀 검사 → #00FF00(초록) 영역 찾기
  3. 초록 영역 → 카메라 프레임의 해당 좌표 픽셀로 교체
  4. 허용 범위(tolerance) 설정으로 자연스러운 합성
출력: 합성된 이미지
```

### 4.2 카메라 처리
```javascript
// 미러 모드 (CSS transform)
video { transform: scaleX(-1); }

// 실제 촬영 시 Canvas에서도 좌우반전 적용
ctx.translate(canvas.width, 0);
ctx.scale(-1, 1);
ctx.drawImage(video, 0, 0);
```

### 4.3 카운트다운 & 촬영
```
셔터 클릭 → 3초 카운트다운(화면 중앙 큰 숫자) → 촬영음 → 캡처
```

### 4.4 이미지 저장
```javascript
// Canvas → PNG Blob → 다운로드
canvas.toBlob((blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'photo-booth.png';
  a.click();
}, 'image/png');
```

---

## 5. 데이터 구조

### 책표지 (BookCover)
```typescript
interface BookCover {
  id: string;          // UUID
  name: string;        // 책 이름
  imageData: string;   // Base64 또는 IndexedDB Blob key
  createdAt: number;   // 등록 시간
}
```

### 촬영 결과 (CapturedPhoto)
```typescript
interface CapturedPhoto {
  id: string;          // UUID
  bookCoverId: string; // 사용된 책표지 ID
  imageData: string;   // Base64 PNG
  capturedAt: number;  // 촬영 시간
}
```

---

## 6. 크로스 플랫폼 호환성

### 브라우저 지원
| 브라우저 | 데스크탑 | iOS | Android |
|---------|---------|-----|---------|
| Chrome | ✅ | ✅ | ✅ |
| Safari | ✅ | ✅ (필수) | - |
| Firefox | ✅ | ✅ | ✅ |
| Samsung Internet | - | - | ✅ |
| Edge | ✅ | - | ✅ |

### 핵심 호환성 대응
1. **iOS Safari 카메라**: `playsinline` 속성 필수, `facingMode: 'user'` 설정
2. **권한 요청**: HTTPS 필수 (Vercel 자동 지원)
3. **반응형 레이아웃**: Tailwind CSS breakpoints (`sm`, `md`, `lg`)
4. **터치 이벤트**: 모바일 셔터 버튼 크게, 터치 영역 충분히
5. **화면 방향**: 세로 모드 우선, 가로 모드도 대응
6. **성능**: 모바일에서 Canvas 크로마키 연산 최적화 (requestAnimationFrame)

---

## 7. 프로젝트 구조

```
photo-booth-book/
├── public/
│   └── sounds/
│       └── shutter.mp3          # 촬영음
├── src/
│   ├── app/
│   │   ├── layout.tsx           # 루트 레이아웃
│   │   ├── page.tsx             # 홈 (책표지 선택)
│   │   ├── booth/
│   │   │   └── [id]/
│   │   │       ├── page.tsx     # 시작 화면
│   │   │       ├── capture/
│   │   │       │   └── page.tsx # 촬영 화면
│   │   │       └── result/
│   │   │           └── page.tsx # 결과 화면
│   │   └── admin/
│   │       └── page.tsx         # 관리자 페이지
│   ├── components/
│   │   ├── BookCoverGrid.tsx    # 책표지 그리드
│   │   ├── Camera.tsx           # 카메라 컴포넌트
│   │   ├── ChromaKey.tsx        # 크로마키 합성
│   │   ├── Countdown.tsx        # 카운트다운
│   │   ├── PhotoGallery.tsx     # 촬영 결과 갤러리
│   │   └── ui/                  # 공통 UI 컴포넌트
│   ├── hooks/
│   │   ├── useCamera.ts         # 카메라 훅
│   │   ├── useChromaKey.ts      # 크로마키 훅
│   │   └── useBookCovers.ts     # 책표지 데이터 훅
│   ├── lib/
│   │   ├── db.ts                # IndexedDB 래퍼
│   │   ├── chromakey.ts         # 크로마키 로직
│   │   └── utils.ts             # 유틸리티
│   ├── store/
│   │   └── usePhotoStore.ts     # Zustand 스토어
│   └── types/
│       └── index.ts             # TypeScript 타입
├── DESIGN.md                    # 디자인 시스템
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 8. 구현 순서 (단계별)

### Phase 1: 프로젝트 셋업 & 기본 구조
1. Next.js + TypeScript + Tailwind CSS 프로젝트 초기화
2. 디자인 시스템 적용 (DESIGN.md)
3. 기본 라우팅 & 레이아웃 구성
4. IndexedDB 래퍼 구현

### Phase 2: 관리자 페이지
5. 책표지 등록 폼 (이미지 업로드 + 이름)
6. 책표지 목록 / 수정 / 삭제
7. IndexedDB CRUD 완성

### Phase 3: 홈 & 시작 화면
8. 홈 화면 - 책표지 그리드 목록
9. 시작 화면 - 선택 책표지 풀스크린 + START 버튼

### Phase 4: 카메라 & 크로마키 (핵심)
10. 카메라 접근 & 미러모드 구현
11. 크로마키 합성 엔진 (Canvas 기반)
12. 실시간 미리보기 (책표지 + 카메라 합성)
13. 카운트다운 & 촬영 기능

### Phase 5: 결과 & 저장
14. 촬영 결과 갤러리
15. 사진 선택 & PNG 다운로드
16. 다시 촬영 플로우

### Phase 6: 크로스 플랫폼 & 최적화
17. iOS Safari / Android 브라우저 테스트 & 대응
18. 반응형 디자인 완성
19. 성능 최적화 (Canvas 연산, 이미지 리사이즈)
20. PWA 지원 (오프라인, 홈화면 추가)

### Phase 7: 배포
21. Vercel 배포 설정
22. 도메인 연결 (선택)
23. 최종 테스트

---

## 9. 성능 최적화 전략 (react-best-practices 스킬 적용)

- **Dynamic Import**: 카메라/크로마키 컴포넌트는 `dynamic(() => import(...), { ssr: false })`로 로드
- **Direct Import**: barrel import 회피, 필요한 컴포넌트만 직접 import
- **Canvas 최적화**: `requestAnimationFrame` 루프, `OffscreenCanvas` (지원 시)
- **이미지 최적화**: 업로드 시 리사이즈, WebP 변환 고려
- **Lazy State Init**: Zustand store에서 IndexedDB 데이터 지연 로드

---

## 10. 보안 & UX 고려사항

### 보안
- 카메라 접근은 반드시 사용자 동의 후
- 모든 데이터는 로컬(브라우저)에만 저장, 서버 전송 없음
- 관리자 페이지 접근은 간단한 PIN 코드로 보호

### UX (초등학생 대상)
- 큰 버튼, 큰 텍스트
- 직관적인 아이콘 사용
- 밝고 컬러풀한 디자인
- 촬영 시 재미있는 효과음/애니메이션
- 카운트다운 숫자를 크고 명확하게
- 오류 시 친근한 메시지 ("카메라를 찾을 수 없어요 😢")
