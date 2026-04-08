/**
 * 마스크 기반 크로마키 합성 엔진
 * - 마스크 바운딩박스에 카메라 매핑
 * - 엣지 페더링으로 부드러운 경계
 * - 컬러 필터로 자연스러운 톤 매칭
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

  if (maxX <= minX || maxY <= minY) {
    return { x: 0, y: 0, w: width, h: height };
  }

  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * 마스크에서 연결된 영역(connected components)을 분리하여
 * 각 영역의 바운딩박스를 반환. 왼쪽위→오른쪽위→왼쪽아래→오른쪽아래 순서로 정렬.
 */
export function calcMultiMaskBounds(
  maskImage: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number
): MaskBounds[] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(maskImage, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;

  // 이진 마스크 생성
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4] > 128 ? 1 : 0;
  }

  // Connected component labeling (flood fill)
  const labels = new Int32Array(width * height);
  let labelCount = 0;

  const flood = (startX: number, startY: number, label: number) => {
    const stack: [number, number][] = [[startX, startY]];
    while (stack.length > 0) {
      const [cx, cy] = stack.pop()!;
      const idx = cy * width + cx;
      if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
      if (mask[idx] !== 1 || labels[idx] !== 0) continue;
      labels[idx] = label;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 1 && labels[idx] === 0) {
        labelCount++;
        flood(x, y, labelCount);
      }
    }
  }

  // 각 라벨의 바운딩박스 계산
  const boundsMap = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label === 0) continue;
      const b = boundsMap.get(label);
      if (!b) {
        boundsMap.set(label, { minX: x, minY: y, maxX: x, maxY: y });
      } else {
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
    }
  }

  // 너무 작은 영역 필터링 (전체 면적의 0.5% 미만)
  const minArea = width * height * 0.005;
  const results: MaskBounds[] = [];
  for (const [, b] of boundsMap) {
    const w = b.maxX - b.minX + 1;
    const h = b.maxY - b.minY + 1;
    if (w * h >= minArea) {
      results.push({ x: b.minX, y: b.minY, w, h });
    }
  }

  // 왼쪽위→오른쪽위→왼쪽아래→오른쪽아래 순서로 정렬
  results.sort((a, b) => {
    const rowA = a.y + a.h / 2;
    const rowB = b.y + b.h / 2;
    const rowThreshold = height * 0.2;
    if (Math.abs(rowA - rowB) > rowThreshold) return rowA - rowB; // 다른 행
    return (a.x + a.w / 2) - (b.x + b.w / 2); // 같은 행 → 왼쪽 우선
  });

  return results;
}

/**
 * 특정 영역만 추출한 마스크 캔버스 생성 (멀티컷 촬영용)
 * compositeMask에 바로 전달 가능한 Canvas 반환
 */
export function extractSingleMaskCanvas(
  maskImage: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number,
  bounds: MaskBounds
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(maskImage, 0, 0, width, height);
  const fullData = ctx.getImageData(0, 0, width, height);
  const pixels = fullData.data;

  const pad = 5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inBounds =
        x >= bounds.x - pad && x <= bounds.x + bounds.w + pad &&
        y >= bounds.y - pad && y <= bounds.y + bounds.h + pad;
      if (!inBounds) {
        pixels[i] = 0;
        pixels[i + 1] = 0;
        pixels[i + 2] = 0;
      }
    }
  }

  ctx.putImageData(fullData, 0, 0);
  return canvas;
}

/**
 * A. 엣지 페더링: 마스크를 블러 처리하여 부드러운 경계 생성
 * 최초 1회 호출 후 캐싱하여 사용
 */
export function createFeatheredMask(
  maskImage: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number,
  featherRadius: number = 6
): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  // 마스크를 블러 처리하여 경계를 부드럽게
  ctx.filter = `blur(${featherRadius}px)`;
  ctx.drawImage(maskImage, 0, 0, width, height);
  ctx.filter = "none";

  return ctx.getImageData(0, 0, width, height);
}

/**
 * B. 카메라 컬러 필터: 밝기/채도 조절로 일러스트 톤 매칭
 */
function applyCameraColorFilter(
  cameraPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  width: number,
  height: number
): void {
  // 밝기 +10%, 채도 약간 낮춤 → 일러스트 톤에 가까워짐
  const brightness = 1.1;
  const saturation = 0.85;

  for (let i = 0; i < cameraPixels.length; i += 4) {
    // 마스크 영역만 필터 적용 (성능 최적화)
    if (maskPixels[i] < 10) continue;

    const r = cameraPixels[i];
    const g = cameraPixels[i + 1];
    const b = cameraPixels[i + 2];

    // 밝기 조절
    let nr = r * brightness;
    let ng = g * brightness;
    let nb = b * brightness;

    // 채도 조절 (luminance 기준)
    const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
    nr = lum + (nr - lum) * saturation;
    ng = lum + (ng - lum) * saturation;
    nb = lum + (nb - lum) * saturation;

    cameraPixels[i] = Math.min(255, Math.max(0, nr));
    cameraPixels[i + 1] = Math.min(255, Math.max(0, ng));
    cameraPixels[i + 2] = Math.min(255, Math.max(0, nb));
  }
}

/**
 * 마스크 기반 합성 (메인 함수)
 */
export function compositeMask(
  outputCtx: CanvasRenderingContext2D,
  coverImage: HTMLImageElement | HTMLCanvasElement,
  maskImage: HTMLImageElement | HTMLCanvasElement,
  cameraFrame: HTMLVideoElement | HTMLCanvasElement,
  width: number,
  height: number,
  transform: CameraTransform = DEFAULT_TRANSFORM,
  bounds?: MaskBounds,
  featheredMask?: ImageData
): void {
  const maskBounds = bounds || calcMaskBounds(maskImage, width, height);

  if (typeof OffscreenCanvas !== "undefined") {
    compositeMaskOffscreen(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform, maskBounds, featheredMask);
  } else {
    compositeMaskFallback(outputCtx, coverImage, maskImage, cameraFrame, width, height, transform, maskBounds, featheredMask);
  }
}

const FEATHER_PADDING = 20; // 페더링 반경보다 넉넉하게

/**
 * 카메라를 마스크 바운딩박스에 맞춰 그리기
 * 페더링 영역까지 카메라가 채워지도록 패딩 추가
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

  // 페더링 영역까지 커버하도록 바운딩박스 확장
  const pad = FEATHER_PADDING;
  const ex = Math.max(0, bounds.x - pad);
  const ey = Math.max(0, bounds.y - pad);
  const ex2 = Math.min(canvasWidth, bounds.x + bounds.w + pad);
  const ey2 = Math.min(canvasHeight, bounds.y + bounds.h + pad);
  const ew = ex2 - ex;
  const eh = ey2 - ey;

  const camW = "videoWidth" in cameraFrame ? cameraFrame.videoWidth : cameraFrame.width;
  const camH = "videoHeight" in cameraFrame ? cameraFrame.videoHeight : cameraFrame.height;

  const boundsAspect = ew / eh;
  const camAspect = camW / camH;

  let srcW: number, srcH: number;
  if (camAspect > boundsAspect) {
    srcH = camH;
    srcW = camH * boundsAspect;
  } else {
    srcW = camW;
    srcH = camW / boundsAspect;
  }

  srcW /= zoom;
  srcH /= zoom;

  const maxOffX = (camW - srcW) / 2;
  const maxOffY = (camH - srcH) / 2;
  const srcX = (camW - srcW) / 2 + offsetX * maxOffX;
  const srcY = (camH - srcH) / 2 + offsetY * maxOffY;

  ctx.clearRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.translate(ex + ew, ey);
  ctx.scale(-1, 1);
  ctx.drawImage(
    cameraFrame,
    srcX, srcY, srcW, srcH,
    0, 0, ew, eh
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
  bounds: MaskBounds,
  featheredMask?: ImageData
): void {
  // 책표지
  const offCover = new OffscreenCanvas(width, height);
  const offCoverCtx = offCover.getContext("2d")!;
  offCoverCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = offCoverCtx.getImageData(0, 0, width, height);

  // 페더링된 마스크 또는 일반 마스크
  let maskData: ImageData;
  if (featheredMask) {
    maskData = featheredMask;
  } else {
    const offMask = new OffscreenCanvas(width, height);
    const offMaskCtx = offMask.getContext("2d")!;
    offMaskCtx.drawImage(maskImage, 0, 0, width, height);
    maskData = offMaskCtx.getImageData(0, 0, width, height);
  }

  // 카메라
  const offCamera = new OffscreenCanvas(width, height);
  const offCameraCtx = offCamera.getContext("2d")!;
  drawCameraToMaskArea(offCameraCtx, cameraFrame, width, height, bounds, transform);
  const cameraData = offCameraCtx.getImageData(0, 0, width, height);

  // B. 카메라 컬러 필터 적용
  applyCameraColorFilter(cameraData.data, maskData.data, width, height);

  // 페더링 마스크로 블렌딩 (부드러운 경계)
  blendWithFeatheredMask(coverData.data, maskData.data, cameraData.data);
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
  bounds: MaskBounds,
  featheredMask?: ImageData
): void {
  // 카메라
  drawCameraToMaskArea(outputCtx, cameraFrame, width, height, bounds, transform);
  const cameraData = outputCtx.getImageData(0, 0, width, height);

  // 마스크
  let maskData: ImageData;
  if (featheredMask) {
    maskData = featheredMask;
  } else {
    outputCtx.drawImage(maskImage, 0, 0, width, height);
    maskData = outputCtx.getImageData(0, 0, width, height);
  }

  // 책표지
  outputCtx.drawImage(coverImage, 0, 0, width, height);
  const coverData = outputCtx.getImageData(0, 0, width, height);

  // B. 카메라 컬러 필터
  applyCameraColorFilter(cameraData.data, maskData.data, width, height);

  blendWithFeatheredMask(coverData.data, maskData.data, cameraData.data);
  outputCtx.putImageData(coverData, 0, 0);
}

/**
 * A. 페더링 마스크 기반 블렌딩
 * 마스크 값 0~255를 알파로 사용하여 부드러운 전환
 */
function blendWithFeatheredMask(
  coverPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  cameraPixels: Uint8ClampedArray
): void {
  for (let i = 0; i < coverPixels.length; i += 4) {
    const alpha = maskPixels[i] / 255; // 0.0 ~ 1.0 그라데이션

    if (alpha > 0.01) {
      // 부드러운 블렌딩: cover * (1-alpha) + camera * alpha
      coverPixels[i] = Math.round(coverPixels[i] * (1 - alpha) + cameraPixels[i] * alpha);
      coverPixels[i + 1] = Math.round(coverPixels[i + 1] * (1 - alpha) + cameraPixels[i + 1] * alpha);
      coverPixels[i + 2] = Math.round(coverPixels[i + 2] * (1 - alpha) + cameraPixels[i + 2] * alpha);
      coverPixels[i + 3] = 255;
    }
  }
}
