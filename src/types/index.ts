export interface BookCover {
  id: string;
  name: string;
  imageData: string;    // Base64 data URL (원본 책표지 - 합성용)
  maskData?: string;    // Base64 data URL (크로마키 마스크 - 흰색=카메라 영역)
  previewData?: string; // Base64 data URL (크로마키 영역 표시된 미리보기)
  createdAt: number;
  order?: number;
  defaultZoom?: number; // 촬영 진입 시 자동 적용할 기본 줌 (없거나 1 = 기본)
  /** false면 메인에서 숨김. 없거나 true면 표시 */
  isActive?: boolean;
}

/** 꾸미기(스티커/텍스트) 레이어 — 편집 시 복원용 */
export interface StickerData {
  id: string;
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CapturedPhoto {
  id: string;
  bookCoverId: string;
  /** 표시·인쇄·공유용 flat PNG (스티커 합성 후) */
  imageData: string;
  capturedAt: number;
  /** 스티커 없는 원본 베이스 (재편집 시 캔버스 배경) */
  originalImageData?: string;
  /** 편집 가능한 데코레이션 목록 */
  decorations?: StickerData[];
}

/** 포토카드 인쇄 한 번에 대한 기록 (9슬롯 data URL) */
export interface PrintJob {
  id: string;
  slots: (string | null)[];
  printedAt: number;
}
