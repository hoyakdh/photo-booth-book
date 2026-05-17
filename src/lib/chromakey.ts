/**
 * 마스크 기반 크로마키 합성 엔진
 * - 마스크 바운딩박스에 카메라 매핑
 * - 엣지 페더링으로 부드러운 경계
 * - 컬러 필터로 자연스러운 톤 매칭
 */

// 커버 이미지 픽셀 데이터 캐시 (drawImage + getImageData 반복 방지)
const coverPixelsCache = new WeakMap<
  HTMLImageElement | HTMLCanvasElement,
  { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> }
>();

function getCachedCoverPixels(
  coverImage: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number
): Uint8ClampedArray<ArrayBuffer> {
  const cached = coverPixelsCache.get(coverImage);
  if (cached && cached.w === width && cached.h === height) {
    // blendWithFeatheredMask가 픽셀을 직접 수정하므로 매번 복사
    return new Uint8ClampedArray(cached.data.buffer.slice(0)) as Uint8ClampedArray<ArrayBuffer>;
  }
  const off = new OffscreenCanvas(width, height);
  const offCtx = off.getContext("2d")!;
  offCtx.drawImage(coverImage, 0, 0, width, height);
  const imageData = offCtx.getImageData(0, 0, width, height);
  const pixels = new Uint8ClampedArray(imageData.data.buffer.slice(0)) as Uint8ClampedArray<ArrayBuffer>;
  coverPixelsCache.set(coverImage, { w: width, h: height, data: pixels });
  return new Uint8ClampedArray(pixels.buffer.slice(0)) as Uint8ClampedArray<ArrayBuffer>;
}

// Canvas 2D filter 지원 여부 (Safari < 18 등은 미지원)
let _canvasFilterSupported: boolean | null = null;
function isCanvasFilterSupported(): boolean {
  if (_canvasFilterSupported !== null) return _canvasFilterSupported;
  try {
    const c = document.createElement("canvas");
    c.width = 1; c.height = 1;
    const testCtx = c.getContext("2d");
    if (!testCtx) { _canvasFilterSupported = false; return false; }
    testCtx.filter = "blur(1px)";
    _canvasFilterSupported = testCtx.filter === "blur(1px)";
  } catch {
    _canvasFilterSupported = false;
  }
  return _canvasFilterSupported;
}

/**
 * Canvas filter 미지원 환경용 단순 박스 블러 (2-pass 수평+수직)
 * 성능 우선으로 radius를 낮게 유지
 */
function applyBoxBlur(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  const data = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(data.data);
  const dst = data.data;
  const r = Math.max(1, Math.round(radius));

  // 수평 패스
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r_ = 0, g = 0, b = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(w - 1, Math.max(0, x + dx));
        const i = (y * w + nx) * 4;
        r_ += src[i]; g += src[i + 1]; b += src[i + 2]; count++;
      }
      const i = (y * w + x) * 4;
      dst[i] = r_ / count; dst[i + 1] = g / count; dst[i + 2] = b / count; dst[i + 3] = src[i + 3];
    }
  }
  const mid = new Uint8ClampedArray(dst);

  // 수직 패스
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r_ = 0, g = 0, b = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        const i = (ny * w + x) * 4;
        r_ += mid[i]; g += mid[i + 1]; b += mid[i + 2]; count++;
      }
      const i = (y * w + x) * 4;
      dst[i] = r_ / count; dst[i + 1] = g / count; dst[i + 2] = b / count; dst[i + 3] = mid[i + 3];
    }
  }
  ctx.putImageData(data, 0, 0);
}

// 카메라 프레임용 OffscreenCanvas 재사용 (매 프레임 생성 방지)
let sharedCameraCanvas: OffscreenCanvas | null = null;
let sharedCameraCtx: OffscreenCanvasRenderingContext2D | null = null;

function getSharedCameraCanvas(
  width: number,
  height: number
): OffscreenCanvasRenderingContext2D {
  if (
    !sharedCameraCanvas ||
    sharedCameraCanvas.width !== width ||
    sharedCameraCanvas.height !== height
  ) {
    sharedCameraCanvas = new OffscreenCanvas(width, height);
    sharedCameraCtx = sharedCameraCanvas.getContext("2d")!;
  }
  return sharedCameraCtx!;
}

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
  // 책표지: 캐시된 픽셀 재사용 (매 프레임 drawImage+getImageData 방지)
  const coverPixels = getCachedCoverPixels(coverImage, width, height);
  const coverData = new ImageData(coverPixels, width, height);

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

  // 카메라: 공유 OffscreenCanvas 재사용 (매 프레임 생성 방지)
  const offCameraCtx = getSharedCameraCanvas(width, height);
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
 * 촬영 미리보기용: 마스크 영역 비율로 카메라를 전체 화면에 렌더링
 * - zoom >= 1 (cover): 마스크 bounds 비율로 소스 크롭 → 전체 화면에 꽉 채움
 * - zoom < 1 (group/줌아웃): 전체 카메라 프레임 contain + 블러 배경
 * mirror(scaleX -1)는 호출 쪽 CSS로 처리
 */
export function drawCameraFullScreen(
  ctx: CanvasRenderingContext2D,
  cameraFrame: HTMLVideoElement,
  width: number,
  height: number,
  maskBounds: MaskBounds,
  transform: CameraTransform
): void {
  const { zoom, offsetX, offsetY } = transform;
  const camW = cameraFrame.videoWidth;
  const camH = cameraFrame.videoHeight;
  if (!camW || !camH) return;

  ctx.clearRect(0, 0, width, height);

  if (zoom < 1) {
    // 줌아웃(단체): 블러 배경 + contain
    const coverScale = Math.max(width / camW, height / camH);
    const bgX = -(camW * coverScale - width) / 2;
    const bgY = -(camH * coverScale - height) / 2;
    const bgW = camW * coverScale;
    const bgH = camH * coverScale;

    if (isCanvasFilterSupported()) {
      ctx.save();
      ctx.filter = "blur(14px)";
      ctx.drawImage(cameraFrame, bgX, bgY, bgW, bgH);
      ctx.filter = "none";
      ctx.restore();
    } else {
      // Canvas filter 미지원(Safari < 18): 저해상도 임시 캔버스에 그린 뒤 박스 블러 적용
      const scale = 0.25;
      const bw = Math.max(1, Math.round(width * scale));
      const bh = Math.max(1, Math.round(height * scale));
      const tmp = document.createElement("canvas");
      tmp.width = bw; tmp.height = bh;
      const tmpCtx = tmp.getContext("2d")!;
      tmpCtx.drawImage(cameraFrame, bgX * scale, bgY * scale, bgW * scale, bgH * scale);
      applyBoxBlur(tmpCtx, bw, bh, 4);
      ctx.drawImage(tmp, 0, 0, width, height);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const scaleFit = Math.min(width / camW, height / camH);
    const dw = Math.max(1e-6, camW * scaleFit * zoom);
    const dh = Math.max(1e-6, camH * scaleFit * zoom);
    const maxPanX = Math.max(0, (dw - width) / 2);
    const maxPanY = Math.max(0, (dh - height) / 2);
    ctx.drawImage(
      cameraFrame,
      0, 0, camW, camH,
      (width - dw) / 2 + offsetX * maxPanX,
      (height - dh) / 2 + offsetY * maxPanY,
      dw, dh
    );
    ctx.restore();
  } else {
    // 일반: 화면 비율로 카메라를 크롭 → 전체 화면에 꽉 채움 (왜곡 없음)
    const screenAspect = width / height;
    const camAspect = camW / camH;
    let srcW: number, srcH: number;
    if (camAspect > screenAspect) {
      srcH = camH;
      srcW = camH * screenAspect;
    } else {
      srcW = camW;
      srcH = camW / screenAspect;
    }
    srcW /= zoom;
    srcH /= zoom;
    const maxOffX = (camW - srcW) / 2;
    const maxOffY = (camH - srcH) / 2;
    const srcX = (camW - srcW) / 2 + offsetX * maxOffX;
    const srcY = (camH - srcH) / 2 + offsetY * maxOffY;
    ctx.drawImage(cameraFrame, srcX, srcY, srcW, srcH, 0, 0, width, height);
  }
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
