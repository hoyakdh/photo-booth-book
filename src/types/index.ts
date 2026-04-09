export interface BookCover {
  id: string;
  name: string;
  imageData: string;    // Base64 data URL (원본 책표지 - 합성용)
  maskData?: string;    // Base64 data URL (크로마키 마스크 - 흰색=카메라 영역)
  previewData?: string; // Base64 data URL (크로마키 영역 표시된 미리보기)
  createdAt: number;
  order?: number;
}

export interface CapturedPhoto {
  id: string;
  bookCoverId: string;
  imageData: string; // Base64 PNG data URL
  capturedAt: number;
}
