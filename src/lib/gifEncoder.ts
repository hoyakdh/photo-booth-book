/**
 * 캡처된 프레임들로 애니메이션 GIF 생성
 */

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
 * - saveCut() 호출 시 현재 버퍼를 확정 저장
 * - getFramesAsCanvases()로 모든 컷의 프레임을 순서대로 반환
 */
export class FrameBuffer {
  private currentFrames: ImageData[] = [];
  private savedCuts: ImageData[][] = [];
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

    if (this.width !== w || this.height !== h) {
      this.width = w;
      this.height = h;
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(sourceCanvas, 0, 0, w, h);

    this.currentFrames.push(tempCtx.getImageData(0, 0, w, h));

    // 링 버퍼: 현재 컷은 최근 framesPerCut개만 유지
    if (this.currentFrames.length > this.framesPerCut) {
      this.currentFrames.shift();
    }
  }

  /** 현재 버퍼를 해당 컷으로 확정 저장하고 버퍼 초기화 */
  saveCut() {
    this.savedCuts.push([...this.currentFrames]);
    this.currentFrames = [];
  }

  /** 모든 컷의 프레임을 순서대로 합쳐서 Canvas 배열로 반환 */
  getFramesAsCanvases(): HTMLCanvasElement[] {
    // 저장된 컷 + 현재 버퍼(아직 saveCut 안 된 마지막 컷)
    const allFrames = [...this.savedCuts.flat(), ...this.currentFrames];
    return allFrames.map((data) => {
      const canvas = document.createElement("canvas");
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(data, 0, 0);
      return canvas;
    });
  }

  clear() {
    this.currentFrames = [];
    this.savedCuts = [];
  }

  get length() {
    return this.savedCuts.reduce((sum, cut) => sum + cut.length, 0) + this.currentFrames.length;
  }
}
