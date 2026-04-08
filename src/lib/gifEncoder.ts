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
 * 프레임 버퍼: 최근 N개 프레임을 링 버퍼로 유지
 */
export class FrameBuffer {
  private frames: ImageData[] = [];
  private maxFrames: number;
  private width: number;
  private height: number;

  constructor(maxFrames: number, width: number, height: number) {
    this.maxFrames = maxFrames;
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

    this.frames.push(tempCtx.getImageData(0, 0, w, h));

    if (this.frames.length > this.maxFrames) {
      this.frames.shift();
    }
  }

  getFramesAsCanvases(): HTMLCanvasElement[] {
    return this.frames.map((data) => {
      const canvas = document.createElement("canvas");
      canvas.width = data.width;
      canvas.height = data.height;
      const ctx = canvas.getContext("2d")!;
      ctx.putImageData(data, 0, 0);
      return canvas;
    });
  }

  clear() {
    this.frames = [];
  }

  get length() {
    return this.frames.length;
  }
}
