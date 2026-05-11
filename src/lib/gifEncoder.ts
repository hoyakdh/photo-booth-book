/**
 * 캡처된 프레임들로 애니메이션 GIF 생성
 */

import type { MaskBounds } from "./chromakey";
import { cropCanvasToPhotocardAspect } from "./photocardAspect";

// gif.js는 브라우저 전용이므로 dynamic import
export async function createGif(
  frames: HTMLCanvasElement[],
  fps: number = 10,
  quality: number = 5
): Promise<Blob> {
  const GifModule = await import("gif.js");
  const GIF = GifModule.default;

  return new Promise((resolve, reject) => {
    if (frames.length === 0) {
      reject(new Error("No frames"));
      return;
    }

    const width = frames[0].width;
    const height = frames[0].height;

    const gif = new GIF({
      workers: 2,
      quality,
      width,
      height,
      workerScript: "/gif.worker.js",
    });

    const delay = Math.round(1000 / fps);

    for (const frame of frames) {
      gif.addFrame(frame, { delay, copy: true });
    }

    gif.on("finished", (blob: Blob) => {
      resolve(blob);
    });

    gif.on("error", (err: Error) => {
      reject(err);
    });

    gif.render();
  });
}

/**
 * 프레임 버퍼: 컷별 프레임 저장소
 * - 현재 컷은 링 버퍼로 최근 framesPerCut개 유지
 * - saveCut(boundsGif?) 호출 시 현재 버퍼를 확정 저장(컷별 GIF 좌표 마스크 선택)
 * - getFramesAsCanvases()로 모든 컷의 프레임을 순서대로 반환
 */
export class FrameBuffer {
  private currentFrames: ImageData[] = [];
  private savedCuts: ImageData[][] = [];
  /** 각 확정 컷마다 GIF(포토카드 크롭) 좌표계 마스크 영역 — 멀티컷 최종 합성 오버레이용 */
  private savedCutBoundsGif: (MaskBounds | undefined)[] = [];
  private framesPerCut: number;
  private width: number;
  private height: number;

  constructor(framesPerCut: number, width: number, height: number) {
    this.framesPerCut = framesPerCut;
    this.width = width;
    this.height = height;
  }

  capture(sourceCanvas: HTMLCanvasElement) {
    const ctx = sourceCanvas.getContext("2d");
    if (!ctx) return;

    // 리사이즈 (GIF 파일 크기 최적화)
    const scale = Math.min(1, 480 / sourceCanvas.width);
    const w = Math.round(sourceCanvas.width * scale);
    const h = Math.round(sourceCanvas.height * scale);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(sourceCanvas, 0, 0, w, h);

    const cropped = cropCanvasToPhotocardAspect(tempCanvas);
    const cw = cropped.width;
    const ch = cropped.height;

    if (this.width !== cw || this.height !== ch) {
      this.width = cw;
      this.height = ch;
    }

    this.currentFrames.push(
      cropped.getContext("2d")!.getImageData(0, 0, cw, ch)
    );

    // 링 버퍼: 현재 컷은 최근 framesPerCut개만 유지
    if (this.currentFrames.length > this.framesPerCut) {
      this.currentFrames.shift();
    }
  }

  /** 현재 버퍼를 해당 컷으로 확정 저장하고 버퍼 초기화 */
  saveCut(boundsGif?: MaskBounds) {
    this.savedCuts.push([...this.currentFrames]);
    this.savedCutBoundsGif.push(boundsGif);
    this.currentFrames = [];
  }

  /**
   * 모든 컷의 프레임을 순서대로 Canvas 배열로 반환.
   * `finalCompositeGif`가 있고 컷별 bounds가 있으면: 최종 정지 합성 위에 해당 컷 마스크 영역만 애니메이션 프레임으로 덮어,
   * 루프 재생 시 다른 컷이 사라지지 않도록 한다.
   */
  getFramesAsCanvases(finalCompositeGif?: HTMLCanvasElement): HTMLCanvasElement[] {
    const canUseFinalOverlay =
      finalCompositeGif != null &&
      this.savedCuts.length > 0 &&
      this.savedCutBoundsGif.length === this.savedCuts.length &&
      this.savedCutBoundsGif.every((b) => b != null);

    if (canUseFinalOverlay && finalCompositeGif) {
      const canvases: HTMLCanvasElement[] = [];
      this.savedCuts.forEach((cutFrames, cutIndex) => {
        const bounds = this.savedCutBoundsGif[cutIndex]!;
        for (const data of cutFrames) {
          canvases.push(this.composeFrameWithFinalComposite(data, bounds, finalCompositeGif));
        }
      });
      // 아직 saveCut 안 된 프레임 (조기 이동 등): 기존 방식
      for (const data of this.currentFrames) {
        canvases.push(FrameBuffer.imageDataToCanvas(data));
      }
      return canvases;
    }

    const allFrames = [...this.savedCuts.flat(), ...this.currentFrames];
    return allFrames.map((data) => FrameBuffer.imageDataToCanvas(data));
  }

  /** 최종 합성(정지)을 깔고 마스크 영역에만 해당 컷 움직임 프레임 적용 */
  private composeFrameWithFinalComposite(
    frameData: ImageData,
    bounds: MaskBounds,
    finalCompositeGif: HTMLCanvasElement
  ): HTMLCanvasElement {
    const cw = frameData.width;
    const ch = frameData.height;
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(finalCompositeGif, 0, 0, cw, ch);

    const temp = document.createElement("canvas");
    temp.width = cw;
    temp.height = ch;
    temp.getContext("2d")!.putImageData(frameData, 0, 0);

    let bx = Math.round(bounds.x);
    let by = Math.round(bounds.y);
    let bw = Math.round(bounds.w);
    let bh = Math.round(bounds.h);
    bx = Math.max(0, bx);
    by = Math.max(0, by);
    bw = Math.min(bw, cw - bx);
    bh = Math.min(bh, ch - by);
    if (bw > 0 && bh > 0) {
      ctx.drawImage(temp, bx, by, bw, bh, bx, by, bw, bh);
    }
    return canvas;
  }

  private static imageDataToCanvas(data: ImageData): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = data.width;
    canvas.height = data.height;
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  clear() {
    this.currentFrames = [];
    this.savedCuts = [];
    this.savedCutBoundsGif = [];
  }

  get length() {
    return this.savedCuts.reduce((sum, cut) => sum + cut.length, 0) + this.currentFrames.length;
  }
}
