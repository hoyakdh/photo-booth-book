export interface BookCover {
  id: string;
  name: string;
  imageData: string;   // Base64 data URL (원본 책표지)
  maskData?: string;    // Base64 data URL (크로마키 마스크 - 흰색=카메라 영역)
  createdAt: number;
}

export interface CapturedPhoto {
  id: string;
  bookCoverId: string;
  imageData: string; // Base64 PNG data URL
  capturedAt: number;
}
