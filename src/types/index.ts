export interface BookCover {
  id: string;
  name: string;
  imageData: string; // Base64 data URL
  createdAt: number;
}

export interface CapturedPhoto {
  id: string;
  bookCoverId: string;
  imageData: string; // Base64 PNG data URL
  capturedAt: number;
}
