/**
 * 마스크 기반 크로마키 합성 엔진
 * 별도 마스크 이미지의 흰색 영역만 카메라로 대체 (초록색 감지 X)
 */

export interface CameraTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

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

  const fullW = "videoWidth" in cameraFrame ? cameraFrame.videoWidth : cameraFrame.width;
  const fullH = "videoHeight" in cameraFrame ? cameraFrame.videoHeight : cameraFrame.height;
  const srcW = fullW / zoom;
  const srcH = fullH / zoom;

  const maxOffX = (fullW - srcW) / 2;
  const maxOffY = (fullH - srcH) / 2;
  const srcX = (fullW - srcW) / 2 + offsetX * maxOffX;
  const srcY = (fullH - srcH) / 2 + offsetY * maxOffY;

  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(cameraFrame, srcX, srcY, srcW, srcH, 0, 0, width, height);
  ctx.restore();
}

/**
 * 마스크 기반 합성: 마스크의 흰색 영역 → 카메라, 나머지 → 책표지
 */
export function compositeMask(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform = DEFAULT_TRANSFORM
): void {
  if (typeof OffscreenCanvas !== "undefined") {
    compositeMaskOffscreen(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform);
  } else {
    compositeMaskFallback(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform);
  }
}

function compositeMaskOffscreen(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform
): void {
  // 책표지
  const offCover = new OffscreenCanvas(width, height);
  const offCoverCtx = offCover.getContext("2d")!;
  offCoverCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = offCoverCtx.getImageData(0, 0, width, height);

  // 마스크
  const offMask = new OffscreenCanvas(width, height);
  const offMaskCtx = offMask.getContext("2d")!;
  offMaskCtx.drawImage(maskImage, 0, 0, width, height);
  const maskData = offMaskCtx.getImageData(0, 0, width, height);

  // 카메라
  const offCamera = new OffscreenCanvas(width, height);
  const offCameraCtx = offCamera.getContext("2d")!;
  drawCameraWithTransform(offCameraCtx, cameraFrame, width, height, transform);
  const cameraData = offCameraCtx.getImageData(0, 0, width, height);

  blendWithMask(coverData.data, maskData.data, cameraData.data);
  outputCtx.putImageData(coverData, 0, 0);
}

function compositeMaskFallback(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform
): void {
  // 카메라
  drawCameraWithTransform(outputCtx, cameraFrame, width, height, transform);
  const cameraData = outputCtx.getImageData(0, 0, width, height);

  // 마스크
  outputCtx.drawImage(maskImage, 0, 0, width, height);
  const maskData = outputCtx.getImageData(0, 0, width, height);

  // 책표지
  outputCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = outputCtx.getImageData(0, 0, width, height);

  blendWithMask(coverData.data, maskData.data, cameraData.data);
  outputCtx.putImageData(coverData, 0, 0);
}

/**
 * 마스크 픽셀 기반 블렌딩
 * 마스크 흰색(R>128) → 카메라 픽셀, 그 외 → 책표지 유지
 */
function blendWithMask(
  coverPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  cameraPixels: Uint8ClampedArray
): void {
  for (let i = 0; i < coverPixels.length; i += 4) {
    const maskValue = maskPixels[i]; // R 채널로 판단

    if (maskValue > 128) {
      // 마스크 영역 → 카메라로 교체
      coverPixels[i] = cameraPixels[i];
      coverPixels[i + 1] = cameraPixels[i + 1];
      coverPixels[i + 2] = cameraPixels[i + 2];
      coverPixels[i + 3] = 255;
    }
    // 마스크 아닌 영역 → 책표지 그대로 유지
  }
}
