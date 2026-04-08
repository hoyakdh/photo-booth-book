"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useBookCover } from "@/hooks/useBookCovers";
import { useCamera } from "@/hooks/useCamera";
import { usePhotoStore } from "@/store/usePhotoStore";
import {
  compositeMask, calcMaskBounds, calcMultiMaskBounds,
  extractSingleMask, createFeatheredMask,
  CameraTransform, MaskBounds,
} from "@/lib/chromakey";
import { generateId, loadImage } from "@/lib/utils";
import { initAudio, playBeep, playFinalBeep, playShutter } from "@/lib/sounds";
import { loadWatermarkConfig, drawWatermark, WatermarkConfig } from "@/lib/watermark";
import { FrameBuffer } from "@/lib/gifEncoder";

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.1;

export default function CapturePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cover, loading: coverLoading } = useBookCover(id);
  const { videoRef, isReady, error, startCamera, stopCamera } = useCamera();
  const addPhoto = usePhotoStore((s) => s.addPhoto);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const coverImageRef = useRef<HTMLImageElement | null>(null);
  const maskImageRef = useRef<HTMLImageElement | null>(null);
  const wmConfigRef = useRef<WatermarkConfig | null>(null);
  const frameBufferRef = useRef<FrameBuffer | null>(null);
  const frameCountRef = useRef(0);

  // 멀티컷: 각 영역별 바운딩박스, 페더링 마스크, 캡처 이미지
  const allBoundsRef = useRef<MaskBounds[]>([]);
  const currentBoundsRef = useRef<MaskBounds | null>(null);
  const currentFeatheredRef = useRef<ImageData | null>(null);
  // 멀티컷에서 이전 컷 촬영 결과를 누적하는 합성 캔버스
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [totalCuts, setTotalCuts] = useState(1);
  const [currentCut, setCurrentCut] = useState(0); // 0-based, 현재 촬영할 컷
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [maskLoaded, setMaskLoaded] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [guideBounds, setGuideBounds] = useState<{ left: string; top: string; width: string; height: string } | null>(null);

  // 줌
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showZoomUI, setShowZoomUI] = useState(false);

  const transformRef = useRef<CameraTransform>({ zoom: 1, offsetX: 0, offsetY: 0 });
  useEffect(() => {
    transformRef.current = { zoom, offsetX, offsetY };
  }, [zoom, offsetX, offsetY]);

  // 핀치 줌
  const lastPinchDistRef = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.hypot(dx, dy);
    }
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      setZoom((prev) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + (dist - lastPinchDistRef.current!) * 0.01)));
      lastPinchDistRef.current = dist;
    }
  }, []);
  const handleTouchEnd = useCallback(() => { lastPinchDistRef.current = null; }, []);

  // 초기화
  useEffect(() => {
    initAudio();
    wmConfigRef.current = loadWatermarkConfig();
    frameBufferRef.current = new FrameBuffer(30, 320, 240);
  }, []);

  // 카메라 시작
  useEffect(() => {
    if (cover && !cameraStarted) {
      startCamera().then(() => setCameraStarted(true));
    }
    return () => { stopCamera(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover]);

  // 책표지 + 마스크 로드 → 멀티컷 감지
  useEffect(() => {
    if (!cover) return;
    setMaskLoaded(false);

    loadImage(cover.imageData).then((img) => {
      coverImageRef.current = img;

      if (cover.maskData) {
        loadImage(cover.maskData).then((maskImg) => {
          maskImageRef.current = maskImg;
          setMaskLoaded(true);
        });
      } else {
        maskImageRef.current = null;
      }
    });
  }, [cover]);

  // 현재 컷이 변경될 때 해당 영역의 바운딩박스 + 페더링 마스크 설정
  const setupCurrentCut = useCallback((cutIndex: number) => {
    if (!maskImageRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const maskImg = maskImageRef.current;
    const bounds = allBoundsRef.current;

    if (bounds.length <= 1) {
      // 1컷 모드
      currentBoundsRef.current = calcMaskBounds(maskImg, canvas.width, canvas.height);
      currentFeatheredRef.current = createFeatheredMask(maskImg, canvas.width, canvas.height);
    } else {
      // 멀티컷: 현재 컷 영역만 추출
      const b = bounds[cutIndex];
      if (!b) return;
      currentBoundsRef.current = b;
      const singleMaskData = extractSingleMask(maskImg, canvas.width, canvas.height, b);
      // 페더링을 위해 ImageData → Canvas → blur → ImageData
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d")!;
      tempCtx.putImageData(singleMaskData, 0, 0);
      // 블러 적용
      const blurCanvas = document.createElement("canvas");
      blurCanvas.width = canvas.width;
      blurCanvas.height = canvas.height;
      const blurCtx = blurCanvas.getContext("2d")!;
      blurCtx.filter = "blur(6px)";
      blurCtx.drawImage(tempCanvas, 0, 0);
      blurCtx.filter = "none";
      currentFeatheredRef.current = blurCtx.getImageData(0, 0, canvas.width, canvas.height);
    }
  }, []);

  // 가이드 좌표 업데이트
  const updateGuideBounds = useCallback(() => {
    if (!canvasRef.current || !currentBoundsRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    const b = currentBoundsRef.current;
    setGuideBounds({
      left: `${rect.left + b.x * scaleX}px`,
      top: `${rect.top + b.y * scaleY}px`,
      width: `${b.w * scaleX}px`,
      height: `${b.h * scaleY}px`,
    });
  }, []);

  // 크로마키 실시간 렌더링
  useEffect(() => {
    if (!isReady || !coverImageRef.current || !canvasRef.current || !videoRef.current) return;
    if (!maskImageRef.current) {
      // 마스크 없으면 책표지만 표시
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d")!;
      const coverImg = coverImageRef.current;
      const aspect = coverImg.naturalWidth / coverImg.naturalHeight;
      const cW = canvas.parentElement?.clientWidth || 360;
      const cH = canvas.parentElement?.clientHeight || 640;
      let w: number, h: number;
      if (cW / cH < aspect) { w = cW; h = cW / aspect; } else { h = cH; w = cH * aspect; }
      canvas.width = Math.round(w); canvas.height = Math.round(h);
      ctx.drawImage(coverImg, 0, 0, canvas.width, canvas.height);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const video = videoRef.current;
    const coverImg = coverImageRef.current;
    const maskImg = maskImageRef.current;
    let initialized = false;

    const render = () => {
      if (video.readyState >= 2 && coverImg.complete) {
        const aspect = coverImg.naturalWidth / coverImg.naturalHeight;
        const cW = canvas.parentElement?.clientWidth || 360;
        const cH = canvas.parentElement?.clientHeight || 640;
        let w: number, h: number;
        if (cW / cH < aspect) { w = cW; h = cW / aspect; } else { h = cH; w = cH * aspect; }

        if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h) || !initialized) {
          canvas.width = Math.round(w);
          canvas.height = Math.round(h);

          // 멀티컷 영역 감지
          const bounds = calcMultiMaskBounds(maskImg, canvas.width, canvas.height);
          allBoundsRef.current = bounds;
          setTotalCuts(Math.max(1, bounds.length));

          // 합성 캔버스 초기화 (책표지로 시작)
          compositeCanvasRef.current = document.createElement("canvas");
          compositeCanvasRef.current.width = canvas.width;
          compositeCanvasRef.current.height = canvas.height;
          const compInitCtx = compositeCanvasRef.current.getContext("2d")!;
          compInitCtx.drawImage(coverImg, 0, 0, canvas.width, canvas.height);

          setupCurrentCut(currentCut);
          updateGuideBounds();
          initialized = true;
        }

        if (!currentBoundsRef.current || !currentFeatheredRef.current) {
          setupCurrentCut(currentCut);
        }

        // 배경 이미지 결정: 멀티컷이면 합성 캔버스(이전 컷 누적), 1컷이면 원본 표지
        const bgImage = (compositeCanvasRef.current && totalCuts > 1)
          ? compositeCanvasRef.current
          : coverImg;

        compositeMask(
          ctx, bgImage, maskImg, video, canvas.width, canvas.height,
          transformRef.current,
          currentBoundsRef.current!,
          currentFeatheredRef.current!
        );

        // GIF용 프레임 캡처
        frameCountRef.current++;
        if (frameCountRef.current % 3 === 0 && frameBufferRef.current) {
          frameBufferRef.current.capture(canvas);
        }

      }
      animFrameRef.current = requestAnimationFrame(render);
    };

    render();
    return () => { cancelAnimationFrame(animFrameRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, videoRef, maskLoaded, currentCut]);

  // 캡처 실행 (카운트다운 없이 즉시)
  const doCapture = useCallback(() => {
    playShutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 400);

    if (!canvasRef.current) return;
    const canvas = canvasRef.current;

    if (totalCuts > 1) {
      // 멀티컷: 현재 캔버스 상태를 합성 캔버스에 저장
      if (compositeCanvasRef.current) {
        const compCtx = compositeCanvasRef.current.getContext("2d")!;
        compCtx.drawImage(canvas, 0, 0);
      }

      const nextCut = currentCut + 1;
      if (nextCut < totalCuts) {
        // 다음 컷 설정
        setCurrentCut(nextCut);
        setupCurrentCut(nextCut);
        setZoom(1); setOffsetX(0); setOffsetY(0);
        setTimeout(updateGuideBounds, 100);

        // 2초 대기 후 자동으로 다음 카운트다운 시작
        setTimeout(() => {
          startCountdown();
        }, 2000);
      } else {
        // 모든 컷 완료
        if (wmConfigRef.current?.enabled) {
          const ctx = canvas.getContext("2d")!;
          drawWatermark(ctx, canvas.width, canvas.height, wmConfigRef.current);
        }
        addPhoto({
          id: generateId(),
          bookCoverId: id,
          imageData: canvas.toDataURL("image/png"),
          capturedAt: Date.now(),
        });
        // 리셋
        setCurrentCut(0);
        setupCurrentCut(0);
        if (compositeCanvasRef.current && coverImageRef.current) {
          const compCtx = compositeCanvasRef.current.getContext("2d")!;
          compCtx.drawImage(coverImageRef.current, 0, 0, canvas.width, canvas.height);
        }
        setZoom(1); setOffsetX(0); setOffsetY(0);
        setShowGuide(true);
      }
    } else {
      // 1컷 모드
      if (wmConfigRef.current?.enabled) {
        const ctx = canvas.getContext("2d")!;
        drawWatermark(ctx, canvas.width, canvas.height, wmConfigRef.current);
      }
      addPhoto({
        id: generateId(),
        bookCoverId: id,
        imageData: canvas.toDataURL("image/png"),
        capturedAt: Date.now(),
      });
      setShowGuide(true);
    }
  }, [totalCuts, currentCut, setupCurrentCut, updateGuideBounds, addPhoto, id]);

  // 카운트다운 시작
  const startCountdown = useCallback(() => {
    setShowGuide(false);
    let count = 3;
    setCountdown(count);
    playBeep();

    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
        count === 1 ? playFinalBeep() : playBeep();
      } else {
        clearInterval(timer);
        setCountdown(null);
        doCapture();
      }
    }, 1000);
  }, [doCapture]);

  // 셔터 버튼 (첫 촬영 시작)
  const handleCapture = useCallback(() => {
    if (countdown !== null) return;
    startCountdown();
  }, [countdown, startCountdown]);

  // 결과 보기
  const setGifFrames = usePhotoStore((s) => s.setGifFrames);
  const handleViewResults = () => {
    if (frameBufferRef.current && frameBufferRef.current.length > 0) {
      setGifFrames(frameBufferRef.current.getFramesAsCanvases());
    }
    stopCamera();
    router.push(`/booth/${id}/result`);
  };

  const photos = usePhotoStore((s) => s.capturedPhotos);

  if (coverLoading) {
    return (
      <div className="h-screen-safe flex items-center justify-center">
        <div className="text-xl text-gray-400">불러오는 중...</div>
      </div>
    );
  }

  if (!cover) {
    return (
      <div className="h-screen-safe flex flex-col items-center justify-center gap-4">
        <p className="text-xl text-gray-500">책을 찾을 수 없어요</p>
        <button onClick={() => router.push("/")} className="px-6 py-3 bg-primary text-white rounded-2xl font-bold btn-touch">
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen-safe flex flex-col bg-black relative overflow-hidden">
      {/* 숨김 비디오 */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute opacity-0 pointer-events-none" style={{ width: 1, height: 1 }} />

      {/* 멀티컷 진행 표시 */}
      {totalCuts > 1 && (
        <div className="flex items-center justify-center gap-2 py-2 bg-black/80">
          {Array.from({ length: totalCuts }, (_, i) => (
            <div
              key={i}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i < currentCut ? "bg-success text-white" :
                i === currentCut ? "bg-primary text-white animate-pulse" :
                "bg-white/20 text-white/50"
              }`}
            >
              {i < currentCut ? "✓" : i + 1}
            </div>
          ))}
          <span className="text-white/70 text-sm ml-2">
            {currentCut + 1} / {totalCuts}컷
          </span>
        </div>
      )}

      {/* 크로마키 합성 캔버스 */}
      <div
        className="flex-1 flex items-center justify-center relative"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <canvas ref={canvasRef} className="max-w-full max-h-full" />

        {/* 촬영 가이드 */}
        {showGuide && guideBounds && countdown === null && (
          <div
            className="fixed z-10 pointer-events-none flex items-center justify-center"
            style={{ left: guideBounds.left, top: guideBounds.top, width: guideBounds.width, height: guideBounds.height }}
          >
            <div className="absolute inset-0 border-[3px] border-dashed border-white/60 rounded-2xl animate-pulse" />
            <p className="text-white/70 text-sm font-bold bg-black/30 px-3 py-1.5 rounded-full">
              여기에 얼굴을 맞춰주세요
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80">
            <div className="text-center text-white p-6">
              <p className="text-2xl mb-4">{error}</p>
              <button onClick={() => startCamera()} className="px-6 py-3 bg-primary text-white rounded-2xl font-bold btn-touch">다시 시도</button>
            </div>
          </div>
        )}

        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
            <span key={countdown} className="text-[12rem] font-black text-white drop-shadow-2xl animate-countdown">{countdown}</span>
          </div>
        )}

        {flash && <div className="absolute inset-0 bg-white z-30 animate-flash" />}

        {/* 줌 컨트롤 */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2 z-10">
          <button onClick={() => setShowZoomUI((v) => !v)} className="w-10 h-10 bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-white text-lg font-bold btn-touch">
            {zoom > 1 ? `${zoom.toFixed(1)}x` : "ZM"}
          </button>
          {showZoomUI && (
            <div className="flex flex-col items-center gap-1 bg-black/60 backdrop-blur rounded-2xl p-2">
              <button onClick={() => setZoom((v) => Math.min(MAX_ZOOM, +(v + ZOOM_STEP).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold btn-touch">+</button>
              <div className="relative h-40 w-10 flex items-center justify-center">
                <input type="range" min={MIN_ZOOM * 10} max={MAX_ZOOM * 10} value={zoom * 10} onChange={(e) => setZoom(Number(e.target.value) / 10)} className="absolute w-40 origin-center -rotate-90" style={{ appearance: "auto" }} />
              </div>
              <button onClick={() => setZoom((v) => Math.max(MIN_ZOOM, +(v - ZOOM_STEP).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold btn-touch">-</button>
              <button onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }} className="w-10 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white text-xs font-bold btn-touch mt-1">리셋</button>
            </div>
          )}
        </div>

        {zoom > 1 && showZoomUI && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
            <div className="bg-black/60 backdrop-blur rounded-2xl p-2 flex flex-col items-center gap-1">
              <p className="text-white text-[10px] mb-1">위치</p>
              <button onClick={() => setOffsetY((v) => Math.max(-1, +(v - 0.1).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white text-lg btn-touch">▲</button>
              <div className="flex gap-1">
                <button onClick={() => setOffsetX((v) => Math.max(-1, +(v - 0.1).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white text-lg btn-touch">◀</button>
                <button onClick={() => { setOffsetX(0); setOffsetY(0); }} className="w-10 h-10 bg-white/30 rounded-lg flex items-center justify-center text-white text-xs font-bold btn-touch">중앙</button>
                <button onClick={() => setOffsetX((v) => Math.min(1, +(v + 0.1).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white text-lg btn-touch">▶</button>
              </div>
              <button onClick={() => setOffsetY((v) => Math.min(1, +(v + 0.1).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white text-lg btn-touch">▼</button>
            </div>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div className="flex items-center justify-between px-6 py-4 bg-black/80">
        <button
          onClick={() => { stopCamera(); router.push(`/booth/${id}`); }}
          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white text-xl btn-touch"
        >&larr;</button>

        <button
          onClick={handleCapture}
          disabled={!isReady || countdown !== null}
          className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 btn-touch"
        >
          <div className="w-16 h-16 bg-white rounded-full active:bg-gray-200 transition-colors" />
        </button>

        <button
          onClick={handleViewResults}
          disabled={photos.length === 0}
          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white text-sm font-bold disabled:opacity-30 btn-touch"
        >
          {photos.length > 0 ? photos.length : ""}
        </button>
      </div>
    </div>
  );
}
