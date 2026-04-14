# 결과 페이지 공유 버튼 설계서

작성일: 2026-04-14
대상 파일: `src/app/booth/[id]/result/page.tsx`

---

## 1. 배경 및 목적

현재 결과 페이지(`handleDownload`)는 Web Share API를 "저장" 버튼에 묶어서 사용한다. 즉, **파일 다운로드와 공유가 한 버튼에 섞여** 있어 사용자가 "공유"를 명시적으로 수행하기 어렵고, 공유 UX가 숨겨져 있다.

본 과제는 **결과 페이지에 독립된 "공유" 버튼을 추가**하여, 촬영 결과물(PNG + GIF)을 외부 앱/SNS로 공유하는 UX를 명확히 제공한다.

---

## 2. 요구사항

### 2.1 기능 요구사항
- **FR-1**: 결과 페이지 하단 버튼 그룹에 "공유" 버튼을 신규 추가한다.
- **FR-2**: 버튼 클릭 시 현재 선택된 사진(PNG) + (존재 시) GIF 파일을 Web Share API(`navigator.share({ files })`)로 공유한다.
- **FR-3**: Web Share API 또는 파일 공유를 지원하지 않는 환경에서는 **클립보드 복사 fallback** 또는 안내 alert로 대체한다.
- **FR-4**: 공유 작업 중에는 다른 저장/공유/프린트 버튼과 마찬가지로 `busy` 상태로 잠긴다.
- **FR-5**: 사용자가 공유 시트에서 취소한 경우 에러로 취급하지 않고 조용히 복귀한다.

### 2.2 비기능 요구사항
- **NFR-1**: 기존 `handleDownload`의 다운로드 경로는 유지한다(공유 분리 후에도 저장은 저장대로 동작).
- **NFR-2**: 키오스크 모드에서도 동일하게 노출하되, 추후 `loadKioskConfig()`에 `showShare` 플래그를 도입할 수 있는 구조로 둔다.
- **NFR-3**: GIF 생성 비용이 크므로, **GIF 캐싱**을 도입하여 저장·공유 양쪽이 동일 GIF Blob을 재사용한다.

---

## 3. 현황 분석

| 항목 | 내용 |
|------|------|
| 결과 데이터 | `usePhotoStore.capturedPhotos[selectedIdx].imageData` (Base64 PNG Data URL) |
| GIF 프레임 | `usePhotoStore.gifFrames` (HTMLCanvasElement[]) → `createGif()`로 Blob 변환 |
| 기존 공유 로직 | `handleDownload()` 내부에 Web Share API가 포함됨 (라인 39~102) |
| 버튼 배치 | 하단 바: 드라이브 저장 / 저장 / 꾸미기 / 프린트 / 다시촬영 / 홈 |

---

## 4. 설계

### 4.1 사용자 흐름
```
[공유 버튼 클릭]
   ├─ selectedPhoto 없음 → 무시
   ├─ navigator.share + canShare({files}) 지원
   │     ├─ PNG (+ GIF) File 준비
   │     ├─ navigator.share({ files, title, text })
   │     ├─ 성공 → setSaved(true) 스낵바
   │     └─ 사용자 취소 → 조용히 종료
   └─ 미지원 환경
         └─ alert("이 기기에서는 공유를 지원하지 않습니다. '저장'을 이용해 주세요.")
```

### 4.2 신규 함수 `handleShare`
```ts
const handleShare = useCallback(async () => {
  if (!selectedPhoto) return;
  if (typeof navigator === "undefined" || !navigator.share) {
    alert("이 기기는 공유 기능을 지원하지 않습니다.");
    return;
  }
  setLocalSaving(true); // 또는 신규 sharing 상태
  try {
    const ts = Date.now();
    const pngBlob = await (await fetch(selectedPhoto.imageData)).blob();
    const pngFile = new File([pngBlob], `photo-booth-${ts}.png`, { type: "image/png" });

    const files: File[] = [pngFile];
    if (gifFrames.length > 0) {
      try {
        setGifCreating(true);
        const gifBlob = await createGif(gifFrames, 8, 10);
        files.push(new File([gifBlob], `photo-booth-${ts}.gif`, { type: "image/gif" }));
      } catch (e) {
        console.error("GIF 생성 실패:", e);
      } finally {
        setGifCreating(false);
      }
    }

    const shareData: ShareData = { files, title: "포토부스 결과", text: "나만의 포토북 📸" };
    if (navigator.canShare && !navigator.canShare(shareData)) {
      // 파일 공유 불가 → 텍스트만이라도
      await navigator.share({ title: shareData.title, text: shareData.text });
    } else {
      await navigator.share(shareData);
    }
    setSaved(true);
  } catch (err) {
    if ((err as DOMException)?.name !== "AbortError") {
      console.error("공유 실패:", err);
      alert("공유에 실패했습니다.");
    }
  } finally {
    setLocalSaving(false);
  }
}, [selectedPhoto, gifFrames]);
```

### 4.3 `handleDownload` 리팩토링 (권장, 선택)
- Web Share 시도 로직을 `handleDownload`에서 제거하고 **순수 다운로드 전용**으로 단순화.
- 공유는 `handleShare`로 일원화.
- 변경 범위 최소화를 원할 경우: `handleDownload`는 그대로 두고 공유 버튼만 추가해도 됨(1차 구현 권장).

### 4.4 UI 변경

**버튼 배치(수정 후)**:
```
[구글 드라이브] [저장] [공유] [꾸미기*] [프린트] [다시촬영] [홈]
                         ↑ 신규
```
- 위치: "저장" 버튼 바로 오른쪽.
- 스타일: 기존 보조 버튼과 동일한 클래스, 아이콘은 `📤` 또는 공유 SVG.
- 비활성화 조건: `busy || !selectedPhoto`.

### 4.5 상태/타입
- 기존 `localSaving` 재사용(1안) 또는 신규 `sharing: boolean`(2안).
- 1차 구현은 1안으로 충분.

---

## 5. 테스트 계획

| # | 시나리오 | 기대 결과 |
|---|---------|----------|
| T1 | iOS Safari에서 공유 버튼 클릭 | 시스템 공유 시트 표시, PNG+GIF 첨부 |
| T2 | Android Chrome에서 공유 버튼 클릭 | 시스템 공유 시트 표시 |
| T3 | 데스크톱 Chrome (share 미지원) | 안내 alert |
| T4 | 공유 시트에서 "취소" | 에러 없이 원래 화면 유지 |
| T5 | GIF 프레임 없음 (단일샷) | PNG만 공유 |
| T6 | 공유 중 다른 버튼 | 비활성화 확인 |
| T7 | 키오스크 모드 | 버튼 노출 및 동작 정상 |

---

## 6. 향후 과제 (범위 외)

- Google Drive 업로드 후 `webViewLink`를 활용한 **URL 공유** 및 **QR 코드 모달**.
- 키오스크 설정 `showShare` 플래그로 버튼 숨김 제어.
- `handleDownload`/`handleShare`의 PNG·GIF 생성 로직 **공통 훅(`useResultFiles`)** 으로 추출.

---

## 7. 구현 체크리스트

- [ ] `handleShare` 함수 추가
- [ ] 하단 버튼 바에 "공유" 버튼 추가 (저장 옆)
- [ ] 미지원 환경 fallback alert
- [ ] AbortError(사용자 취소) 무시 처리
- [ ] busy 상태 연동
- [ ] (선택) `handleDownload`에서 중복 공유 로직 제거
- [ ] 실기기 수동 테스트 (iOS/Android)
