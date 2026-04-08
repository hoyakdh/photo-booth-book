/**
 * 크로마키 합성 엔진
 * 책표지의 초록색(#00FF00) 영역을 카메라 영상으로 대체
 */

export interface ChromaKeyConfig {
  tolerance: number; // 0-255, 초록색 허용 범위
  softness: number;  // 0-1, 경계 부드러움
}

export interface CameraTransform {
  zoom: number;    // 1.0 = 기본, 2.0 = 2배 확대
  offsetX: number; // 수평 이동 (-1 ~ 1)
  offsetY: number; // 수직 이동 (-1 ~ 1)
}

const DEFAULT_CONFIG: ChromaKeyConfig = {
  tolerance: 100,
  softness: 0.3,
};

const DEFAULT_TRANSFORM: CameraTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

/**
 * 카메라 프레임을 줌/이동 적용하여 캔버스에 그리기
 */
function drawCameraWithTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform
) {
  const { zoom, offsetX, offsetY } = transform;

  // 줌 적용: 소스 영역을 잘라서 전체 캔버스에 그림
  const srcW = ("videoWidth" in cameraFrame ? cameraFrame.videoWidth : cameraFrame.width) / zoom;
  const srcH = ("videoHeight" in cameraFrame ? cameraFrame.videoHeight : cameraFrame.height) / zoom;
  const fullW = "videoWidth" in cameraFrame ? cameraFrame.videoWidth : cameraFrame.width;
  const fullH = "videoHeight" in cameraFrame ? cameraFrame.videoHeight : cameraFrame.height;

  // 오프셋: 줌인 상태에서 남는 영역 내에서 이동
  const maxOffX = (fullW - srcW) / 2;
  const maxOffY = (fullH - srcH) / 2;
  const srcX = (fullW - srcW) / 2 + offsetX * maxOffX;
  const srcY = (fullH - srcH) / 2 + offsetY * maxOffY;

  // 좌우반전 + 소스 크롭 → 전체 캔버스에 매핑
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraFrame, srcX, srcY, srcW, srcH, 0, 0, width, height);
  ctx.restore();
}

/**
 * 책표지 이미지에서 초록색 영역을 카메라 프레임으로 대체
 */
export function compositeChromaKey(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  config: ChromaKeyConfig = DEFAULT_CONFIG,
  transform: CameraTransform = DEFAULT_TRANSFORM
): void {
  const offCover = new OffscreenCanvas(width, height);
  const offCoverCtx = offCover.getContext("2d")!;
  offCoverCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = offCoverCtx.getImageData(0, 0, width, height);

  const offCamera = new OffscreenCanvas(width, height);
  const offCameraCtx = offCamera.getContext("2d")!;
  drawCameraWithTransform(offCameraCtx, cameraFrame, width, height, transform);
  const cameraData = offCameraCtx.getImageData(0, 0, width, height);

  const coverPixels = coverData.data;
  const cameraPixels = cameraData.data;
  const { tolerance, softness } = config;

  for (let i = 0; i < coverPixels.length; i += 4) {
    const r = coverPixels[i];
    const g = coverPixels[i + 1];
    const b = coverPixels[i + 2];

    const greenDiff = g - Math.max(r, b);

    if (greenDiff > tolerance * (1 - softness)) {
      const alpha = Math.min(1, (greenDiff - tolerance * (1 - softness)) / (tolerance * softness + 1));
      coverPixels[i] = Math.round(cameraPixels[i] * alpha + coverPixels[i] * (1 - alpha));
      coverPixels[i + 1] = Math.round(cameraPixels[i + 1] * alpha + coverPixels[i + 1] * (1 - alpha));
      coverPixels[i + 2] = Math.round(cameraPixels[i + 2] * alpha + coverPixels[i + 2] * (1 - alpha));
      coverPixels[i + 3] = 255;
    }
  }

  outputCtx.putImageData(coverData, 0, 0);
}

/**
 * OffscreenCanvas 미지원 브라우저를 위한 fallback
 */
export function compositeChromaKeyFallback(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  config: ChromaKeyConfig = DEFAULT_CONFIG,
  transform: CameraTransform = DEFAULT_TRANSFORM
): void {
  drawCameraWithTransform(outputCtx, cameraFrame, width, height, transform);
  const cameraData = outputCtx.getImageData(0, 0, width, height);

  outputCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = outputCtx.getImageData(0, 0, width, height);

  const coverPixels = coverData.data;
  const cameraPixels = cameraData.data;
  const { tolerance, softness } = config;

  for (let i = 0; i < coverPixels.length; i += 4) {
    const r = coverPixels[i];
    const g = coverPixels[i + 1];
    const b = coverPixels[i + 2];

    const greenDiff = g - Math.max(r, b);

    if (greenDiff > tolerance * (1 - softness)) {
      const alpha = Math.min(1, (greenDiff - tolerance * (1 - softness)) / (tolerance * softness + 1));
      coverPixels[i] = Math.round(cameraPixels[i] * alpha + coverPixels[i] * (1 - alpha));
      coverPixels[i + 1] = Math.round(cameraPixels[i + 1] * alpha + coverPixels[i + 1] * (1 - alpha));
      coverPixels[i + 2] = Math.round(cameraPixels[i + 2] * alpha + coverPixels[i + 2] * (1 - alpha));
      coverPixels[i + 3] = 255;
    }
  }

  outputCtx.putImageData(coverData, 0, 0);
}

/**
 * 환경에 맞는 합성 함수 반환
 */
export function getCompositeFunction() {
  if (typeof OffscreenCanvas !== "undefined") {
    return compositeChromaKey;
  }
  return compositeChromaKeyFallback;
}
