/**
 * 포토카드 인쇄 규격 55×85mm = 가로세로비 11:17.
 * 표지 업로드 정규화와 촬영 결과 크롭에 공통 사용.
 */
import { loadImage } from "./utils";

export const PHOTOCARD_W_MM = 55;
export const PHOTOCARD_H_MM = 85;
/** width / height */
export const PHOTOCARD_ASPECT_RATIO = PHOTOCARD_W_MM / PHOTOCARD_H_MM;

export function getPhotocardCropSourceRect(
  sourceWidth: number,
  sourceHeight: number
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = sourceWidth;
  const sh = sourceHeight;
  if (sw <= 0 || sh <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, sw), sh: Math.max(1, sh) };
  }
  const srcAspect = sw / sh;
  if (srcAspect > PHOTOCARD_ASPECT_RATIO) {
    const cropW = Math.round(sh * PHOTOCARD_ASPECT_RATIO);
    const cropH = sh;
    const sx = Math.round((sw - cropW) / 2);
    return { sx, sy: 0, sw: cropW, sh: cropH };
  }
  const cropW = sw;
  const cropH = Math.round(sw / PHOTOCARD_ASPECT_RATIO);
  const sy = Math.round((sh - cropH) / 2);
  return { sx: 0, sy, sw: cropW, sh: cropH };
}

/** 중앙 기준으로 11:17 영역만 잘라 새 캔버스 반환 */
export function cropCanvasToPhotocardAspect(source: HTMLCanvasElement): HTMLCanvasElement {
  const { sx, sy, sw, sh } = getPhotocardCropSourceRect(source.width, source.height);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

export async function cropDataURLToPhotocardAspect(dataURL: string): Promise<string> {
  const img = await loadImage(dataURL);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return cropCanvasToPhotocardAspect(canvas).toDataURL("image/png");
}
