/**
 * 마스크 기반 크로마키 합성 엔진
 * 마스크 바운딩박스에 카메라를 매핑 → 얼굴이 자연스럽게 들어감
 */

export interface CameraTransform {
  zoom: number;
  offsetX: number;
  offsetY: number;
}

export interface MaskBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_TRANSFORM: CameraTransform = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
};

/**
 * 마스크 이미지에서 흰색 영역의 바운딩박스 계산
 * (최초 1회만 호출, 결과 캐싱)
 */
export function calcMaskBounds(
  maskImage: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number
): MaskBounds {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(maskImage, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 마스크 영역이 없는 경우 전체
  if (maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w: width, h: height };
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 마스크 기반 합성: 카메라를 마스크 바운딩박스 영역에 매핑
 */
export function compositeMask(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform = DEFAULT_TRANSFORM,
  bounds?: MaskBounds
): void {
  const maskBounds = bounds || calcMaskBounds(maskImage, width, height);

  if (typeof OffscreenCanvas !== "undefined") {
    compositeMaskOffscreen(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform, maskBounds);
  } else {
    compositeMaskFallback(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform, maskBounds);
  }
}

/**
 * 카메라를 마스크 바운딩박스에 맞춰 그리기
 * - 카메라 비율을 바운딩박스에 맞춤 (cover fit)
 * - 좌우반전 + 줌/오프셋 적용
 */
function drawCameraToMaskArea(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number,
  bounds: MaskBounds,
  transform: CameraTransform
) {
  const { zoom, offsetX, offsetY } = transform;

  const camW = "videoWidth" in cameraFrame ? cameraFrame.videoWidth : cameraFrame.width;
  const camH = "videoHeight" in cameraFrame ? cameraFrame.videoHeight : cameraFrame.height;

  // 바운딩박스 비율에 맞게 카메라 소스 영역 계산 (cover fit)
  const boundsAspect = bounds.w / bounds.h;
  const camAspect = camW / camH;

  let srcW: number, srcH: number;
  if (camAspect > boundsAspect) {
    // 카메라가 더 넓음 → 높이 맞추고 좌우 잘라냄
    srcH = camH;
    srcW = camH * boundsAspect;
  } else {
    // 카메라가 더 좁음 → 너비 맞추고 상하 잘라냄
    srcW = camW;
    srcH = camW / boundsAspect;
  }

  // 줌 적용
  srcW /= zoom;
  srcH /= zoom;

  // 오프셋 적용
  const maxOffX = (camW - srcW) / 2;
  const maxOffY = (camH - srcH) / 2;
  const srcX = (camW - srcW) / 2 + offsetX * maxOffX;
  const srcY = (camH - srcH) / 2 + offsetY * maxOffY;

  // 전체 캔버스를 투명으로 초기화
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  // 바운딩박스 영역에만 카메라 그리기 (좌우반전)
  ctx.save();
  ctx.translate(bounds.x + bounds.w, bounds.y);
  ctx.scale(-1, 1);
  ctx.drawImage(
    cameraFrame,
    srcX, srcY, srcW, srcH,
    0, 0, bounds.w, bounds.h
  );
  ctx.restore();
}

function compositeMaskOffscreen(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform,
  bounds: MaskBounds
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

  // 카메라 (바운딩박스에만 매핑)
  const offCamera = new OffscreenCanvas(width, height);
  const offCameraCtx = offCamera.getContext("2d")!;
  drawCameraToMaskArea(offCameraCtx, cameraFrame, width, height, bounds, transform);
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
  transform: CameraTransform,
  bounds: MaskBounds
): void {
  // 카메라
  drawCameraToMaskArea(outputCtx, cameraFrame, width, height, bounds, transform);
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
 */
function blendWithMask(
  coverPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  cameraPixels: Uint8ClampedArray
): void {
  for (let i = 0; i < coverPixels.length; i += 4) {
    if (maskPixels[i] > 128) {
      coverPixels[i] = cameraPixels[i];
      coverPixels[i + 1] = cameraPixels[i + 1];
      coverPixels[i + 2] = cameraPixels[i + 2];
      coverPixels[i + 3] = 255;
    }
  }
}
