import { v4 as uuidv4 } from "uuid";

export function generateId(): string {
  return uuidv4();
}

/**
 * 이미지 파일을 Base64 data URL로 변환
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 이미지를 최대 크기로 리사이즈 (가로세로 비율 유지)
 */
export function resizeImage(
  dataURL: string,
  maxWidth: number = 1200,
  maxHeight: number = 1600
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width <= maxWidth && height <= maxHeight) {
        resolve(dataURL);
        return;
      }

      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataURL;
  });
}

/**
 * Canvas를 PNG Blob으로 변환
 */
export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create blob"));
      },
      "image/png",
      1.0
    );
  });
}

/**
 * PNG 다운로드 (크로스 브라우저)
 */
export async function downloadImage(canvas: HTMLCanvasElement, filename: string = "photo-booth.png") {
  const blob = await canvasToBlob(canvas);

  // Web Share API 지원 시 (주로 모바일)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: "image/png" });
    const shareData = { files: [file] };
    if (navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // 공유 취소 시 fallback
      }
    }
  }

  // Fallback: a 태그 다운로드
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * data URL을 Image 엘리먼트로 변환
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
