"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { useBookCover } from "@/hooks/useBookCovers";
import { useCamera } from "@/hooks/useCamera";
import { usePhotoStore } from "@/store/usePhotoStore";
import {
  compositeMask, calcMaskBounds, calcMultiMaskBounds,
  extractSingleMaskCanvas, createFeatheredMask,
  CameraTransform, MaskBounds,
} from "@/lib/chromakey";
import { generateId, loadImage } from "@/lib/utils";
import { initAudio, playBeep, playFinalBeep, playShutter } from "@/lib/sounds";
import { loadWatermarkConfig, drawWatermark, WatermarkConfig } from "@/lib/watermark";
import { FrameBuffer } from "@/lib/gifEncoder";
import { useHandDetection } from "@/hooks/useHandDetection";
import { useVoiceDetection } from "@/hooks/useVoiceDetection";

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

  // 멀티컷 관련 refs
  const allBoundsRef = useRef<MaskBounds[]>([]);
  const currentBoundsRef = useRef<MaskBounds | null>(null);
  const currentFeatheredRef = useRef<ImageData | null>(null);
  const currentMaskCanvasRef = useRef<HTMLCanvasElement | null>(null); // 현재 컷 전용 마스크
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null); // 이전 컷 누적

  const [totalCuts, setTotalCuts] = useState(1);
  const totalCutsRef = useRef(1);
  const [currentCut, setCurrentCut] = useState(0);
  const currentCutRef = useRef(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const capturingRef = useRef(false);
  const [capturing, setCapturing] = useState(false); // 멀티컷 촬영 진행 중 (UI용)
  const [flash, setFlash] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);
  const [maskLoaded, setMaskLoaded] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  // 가이드 좌표: 캔버스 내부 비율 (0~1)
  const [guideRect, setGuideRect] = useState<{ rx: number; ry: number; rw: number; rh: number } | null>(null);

  // 줌
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showZoomUI, setShowZoomUI] = useState(false);

  const transformRef = useRef<CameraTransform>({ zoom: 1, offsetX: 0, offsetY: 0 });
  useEffect(() => {
    transformRef.current = { zoom, offsetX, offsetY };
  }, [zoom, offsetX, offsetY]);

  // 책표지에 기본 줌이 설정되어 있으면 촬영 진입 시 자동 적용
  const defaultZoomAppliedRef = useRef(false);
  useEffect(() => {
    if (defaultZoomAppliedRef.current) return;
    if (!cover) return;
    const dz = cover.defaultZoom;
    if (typeof dz === "number" && dz >= MIN_ZOOM && dz <= MAX_ZOOM && dz !== 1) {
      setZoom(dz);
    }
    defaultZoomAppliedRef.current = true;
  }, [cover]);

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
    frameBufferRef.current = new FrameBuffer(15, 480, 360);
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

  // 현재 컷이 변경될 때 해당 영역의 바운딩박스 + 전용 마스크 + 페더링 설정
  const setupCurrentCut = useCallback((cutIndex: number) => {
    if (!maskImageRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const maskImg = maskImageRef.current;
    const bounds = allBoundsRef.current;

    if (bounds.length <= 1) {
      // 1컷 모드: 전체 마스크 사용
      currentBoundsRef.current = calcMaskBounds(maskImg, canvas.width, canvas.height);
      currentFeatheredRef.current = createFeatheredMask(maskImg, canvas.width, canvas.height);
      currentMaskCanvasRef.current = null; // null이면 원본 마스크 사용
    } else {
      // 멀티컷: 현재 컷 영역만 추출한 마스크 캔버스 생성
      const b = bounds[cutIndex];
      if (!b) return;
      currentBoundsRef.current = b;

      // 현재 컷만의 마스크 캔버스
      const singleMaskCanvas = extractSingleMaskCanvas(maskImg, canvas.width, canvas.height, b);
      currentMaskCanvasRef.current = singleMaskCanvas;

      // 페더링
      currentFeatheredRef.current = createFeatheredMask(singleMaskCanvas, canvas.width, canvas.height);
    }
  }, []);

  // 가이드 좌표 업데이트 (캔버스 내부 비율)
  const updateGuideBounds = useCallback(() => {
    if (!canvasRef.current || !currentBoundsRef.current) return;
    const canvas = canvasRef.current;
    const b = currentBoundsRef.current;
    setGuideRect({
      rx: b.x / canvas.width,
      ry: b.y / canvas.height,
      rw: b.w / canvas.width,
      rh: b.h / canvas.height,
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      canvas.style.width = `${Math.round(w)}px`; canvas.style.height = `${Math.round(h)}px`;
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

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvasW = Math.round(w * dpr);
        const canvasH = Math.round(h * dpr);
        const sizeChanged = canvas.width !== canvasW || canvas.height !== canvasH;

        if (sizeChanged || !initialized) {
          canvas.width = canvasW;
          canvas.height = canvasH;
          canvas.style.width = `${Math.round(w)}px`;
          canvas.style.height = `${Math.round(h)}px`;

          // 멀티컷 영역 감지 (초기화 또는 리사이즈 시 재계산)
          const bounds = calcMultiMaskBounds(maskImg, canvas.width, canvas.height);
          allBoundsRef.current = bounds;
          const cuts = Math.max(1, bounds.length);
          setTotalCuts(cuts);
          totalCutsRef.current = cuts;

          // 합성 캔버스 초기화 (최초 1회만 — 이전 컷 사진 보존)
          if (!initialized) {
            compositeCanvasRef.current = document.createElement("canvas");
            compositeCanvasRef.current.width = canvas.width;
            compositeCanvasRef.current.height = canvas.height;
            const compInitCtx = compositeCanvasRef.current.getContext("2d")!;
            compInitCtx.drawImage(coverImg, 0, 0, canvas.width, canvas.height);
          } else if (sizeChanged && compositeCanvasRef.current) {
            // 리사이즈: 기존 합성 내용을 보존하며 크기만 조정
            const oldComp = compositeCanvasRef.current;
            const newComp = document.createElement("canvas");
            newComp.width = canvas.width;
            newComp.height = canvas.height;
            const ctx = newComp.getContext("2d")!;
            ctx.drawImage(oldComp, 0, 0, newComp.width, newComp.height);
            compositeCanvasRef.current = newComp;
          }

          setupCurrentCut(currentCutRef.current);
          updateGuideBounds();
          initialized = true;
        }

        if (!currentBoundsRef.current || !currentFeatheredRef.current) {
          setupCurrentCut(currentCutRef.current);
        }

        // 배경: 멀티컷이면 합성 캔버스(이전 컷 누적), 1컷이면 원본 표지
        const bgImage = (compositeCanvasRef.current && totalCutsRef.current > 1)
          ? compositeCanvasRef.current
          : coverImg;

        // 마스크: 멀티컷이면 현재 컷 전용, 1컷이면 원본
        const maskToUse = currentMaskCanvasRef.current || maskImg;

        compositeMask(
          ctx, bgImage, maskToUse, video, canvas.width, canvas.height,
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
  }, [isReady, videoRef, maskLoaded]);

  // 원본 해상도로 고화질 캡처 렌더링
  const hiResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderHiRes = useCallback(() => {
    const coverImg = coverImageRef.current;
    const maskImg = maskImageRef.current;
    const video = videoRef.current;
    if (!coverImg || !maskImg || !video) return null;

    const w = coverImg.naturalWidth;
    const h = coverImg.naturalHeight;

    if (!hiResCanvasRef.current) {
      hiResCanvasRef.current = document.createElement("canvas");
    }
    const hrc = hiResCanvasRef.current;
    hrc.width = w;
    hrc.height = h;
    const ctx = hrc.getContext("2d", { willReadFrequently: true })!;

    // 현재 컷 전용 마스크를 원본 해상도로 생성
    const maskToUse = currentMaskCanvasRef.current
      ? (() => {
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d")!.drawImage(currentMaskCanvasRef.current!, 0, 0, w, h);
          return c;
        })()
      : maskImg;

    const bounds = calcMaskBounds(maskToUse, w, h);
    const feathered = createFeatheredMask(maskToUse, w, h);

    // 멀티컷: 이전 컷 사진이 누적된 compositeCanvas를 배경으로 사용
    let bgImage: HTMLImageElement | HTMLCanvasElement = coverImg;
    if (totalCutsRef.current > 1 && compositeCanvasRef.current) {
      // compositeCanvas를 원본 해상도로 스케일
      const bgCanvas = document.createElement("canvas");
      bgCanvas.width = w;
      bgCanvas.height = h;
      bgCanvas.getContext("2d")!.drawImage(compositeCanvasRef.current, 0, 0, w, h);
      bgImage = bgCanvas;
    }

    compositeMask(ctx, bgImage, maskToUse, video, w, h, transformRef.current, bounds, feathered);
    return hrc;
  }, [videoRef]);

  // ref 기반 캡처/카운트다운 (stale closure 방지)
  const doCaptureRef = useRef<() => void>(() => {});
  const startCountdownRef = useRef<() => void>(() => {});

  doCaptureRef.current = () => {
    playShutter();
    setFlash(true);
    setTimeout(() => setFlash(false), 400);

    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const cuts = totalCutsRef.current;
    const cut = currentCutRef.current;

    // 고화질 렌더링
    const hiRes = renderHiRes();

    if (cuts > 1) {
      // 멀티컷: 고화질 합성 캔버스에 저장
      if (compositeCanvasRef.current && hiRes) {
        // 합성 캔버스를 원본 해상도로 업그레이드 (최초)
        const coverImg = coverImageRef.current!;
        if (compositeCanvasRef.current.width !== coverImg.naturalWidth) {
          const oldComp = compositeCanvasRef.current;
          compositeCanvasRef.current = document.createElement("canvas");
          compositeCanvasRef.current.width = coverImg.naturalWidth;
          compositeCanvasRef.current.height = coverImg.naturalHeight;
          const ctx = compositeCanvasRef.current.getContext("2d")!;
          ctx.drawImage(oldComp, 0, 0, coverImg.naturalWidth, coverImg.naturalHeight);
        }
        const compCtx = compositeCanvasRef.current.getContext("2d")!;
        compCtx.drawImage(hiRes, 0, 0);
      }

      // 현재 컷 GIF 프레임 확정 저장
      if (frameBufferRef.current) {
        frameBufferRef.current.saveCut();
      }

      const nextCut = cut + 1;
      if (nextCut < cuts) {
        capturingRef.current = true;
        setCapturing(true);
        currentCutRef.current = nextCut;
        setCurrentCut(nextCut);
        setupCurrentCut(nextCut);
        setZoom(1); setOffsetX(0); setOffsetY(0);
        setTimeout(updateGuideBounds, 100);
        setTimeout(() => { capturingRef.current = false; setCapturing(false); startCountdownRef.current(); }, 2000);
      } else {
        // 모든 컷 완료
        if (compositeCanvasRef.current) {
          if (wmConfigRef.current?.enabled) {
            const compCtx = compositeCanvasRef.current.getContext("2d")!;
            drawWatermark(compCtx, compositeCanvasRef.current.width, compositeCanvasRef.current.height, wmConfigRef.current);
          }
          addPhoto({
            id: generateId(),
            bookCoverId: id,
            imageData: compositeCanvasRef.current.toDataURL("image/png"),
            capturedAt: Date.now(),
          });
        }
        if (frameBufferRef.current && frameBufferRef.current.length > 0) {
          usePhotoStore.getState().setGifFrames(frameBufferRef.current.getFramesAsCanvases());
        }
        stopCamera();
        router.push(`/booth/${id}/result`);
      }
    } else {
      // 1컷 모드: 고화질 캡처 → 바로 결과 화면으로 이동
      if (hiRes) {
        if (wmConfigRef.current?.enabled) {
          const ctx = hiRes.getContext("2d")!;
          drawWatermark(ctx, hiRes.width, hiRes.height, wmConfigRef.current);
        }
        addPhoto({
          id: generateId(),
          bookCoverId: id,
          imageData: hiRes.toDataURL("image/png"),
          capturedAt: Date.now(),
        });
      }
      if (frameBufferRef.current && frameBufferRef.current.length > 0) {
        usePhotoStore.getState().setGifFrames(frameBufferRef.current.getFramesAsCanvases());
      }
      stopCamera();
      router.push(`/booth/${id}/result`);
    }
  };

  startCountdownRef.current = () => {
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
        doCaptureRef.current();
      }
    }, 1000);
  };

  const handleCapture = useCallback(() => {
    if (countdown !== null || capturingRef.current) return;
    startCountdownRef.current();
  }, [countdown]);

  // 손바닥 감지 자동 촬영
  const { isSupported: handSupported, isLoading: handLoading, palmDetected } = useHandDetection({
    videoRef,
    enabled: isReady && countdown === null && !capturing && !flash,
    onPalmDetected: handleCapture,
  });

  // 음성("치즈") 감지 자동 촬영
  const { isSupported: voiceSupported, isListening, cheeseDetected } = useVoiceDetection({
    enabled: isReady && countdown === null && !capturing && !flash,
    onCheeseDetected: handleCapture,
  });

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
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 bg-black/80">
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
        className="flex-1 min-h-0 flex items-center justify-center relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="relative flex items-center justify-center w-full h-full">
          <canvas ref={canvasRef} className="block max-w-full max-h-full" />
        </div>

        {/* 촬영 가이드 */}
        {showGuide && guideRect && countdown === null && canvasRef.current && (() => {
          const rect = canvasRef.current!.getBoundingClientRect();
          const parent = canvasRef.current!.parentElement?.getBoundingClientRect();
          if (!parent) return null;
          const offsetLeft = rect.left - parent.left;
          const offsetTop = rect.top - parent.top;
          return (
            <div
              className="absolute z-10 pointer-events-none flex items-center justify-center"
              style={{
                left: offsetLeft + guideRect.rx * rect.width,
                top: offsetTop + guideRect.ry * rect.height,
                width: guideRect.rw * rect.width,
                height: guideRect.rh * rect.height,
              }}
            >
              <div className="absolute inset-0 border-[3px] border-dashed border-white/60 rounded-2xl animate-pulse" />
              <p className="text-white/70 text-sm font-bold bg-black/30 px-3 py-1.5 rounded-full">
                여기에 얼굴을 맞춰주세요
              </p>
            </div>
          );
        })()}

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

        {/* 줌 컨트롤 — 촬영 중에는 숨김 */}
        {countdown === null && !capturing && (
        <div className="absolute right-3 bottom-3 flex flex-col items-center gap-2 z-10">
          <button onClick={() => setShowZoomUI((v) => !v)} className="w-10 h-10 bg-black/50 backdrop-blur rounded-full flex items-center justify-center text-white text-lg font-bold btn-touch">
            {zoom > 1 ? `${zoom.toFixed(1)}x` : "ZM"}
          </button>
          {showZoomUI && (
            <div className="flex flex-col items-center gap-1 bg-black/60 backdrop-blur rounded-2xl p-2">
              <button onClick={() => setZoom((v) => Math.min(MAX_ZOOM, +(v + ZOOM_STEP).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold btn-touch">+</button>
              <div
                className="relative h-40 w-10 flex items-center justify-center select-none"
                style={{ touchAction: "none" }}
                onPointerDown={(e) => {
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  const update = (clientY: number) => {
                    const rect = el.getBoundingClientRect();
                    const ratio = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
                    setZoom(+(MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM)).toFixed(1));
                  };
                  update(e.clientY);
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const ratio = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                  setZoom(+(MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM)).toFixed(1));
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
              >
                <div className="absolute inset-y-2 left-1/2 -translate-x-1/2 w-1.5 bg-white/30 rounded-full" />
                <div
                  className="absolute left-1/2 w-5 h-5 bg-white rounded-full shadow pointer-events-none"
                  style={{
                    bottom: `calc(0.5rem + ${(zoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)} * (100% - 1rem))`,
                    transform: "translate(-50%, 50%)",
                  }}
                />
              </div>
              <button onClick={() => setZoom((v) => Math.max(MIN_ZOOM, +(v - ZOOM_STEP).toFixed(1)))} className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center text-white text-2xl font-bold btn-touch">-</button>
              <button onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }} className="w-10 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white text-xs font-bold btn-touch mt-1">리셋</button>
            </div>
          )}
        </div>
        )}

        {countdown === null && !capturing && zoom > 1 && showZoomUI && (
          <div className="absolute left-3 bottom-3 z-10">
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
      <div className="flex-shrink-0 flex flex-col items-center gap-2 px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-black/80">
        {/* 자동 촬영 안내 */}
        {isReady && countdown === null && !capturing && (
          <div className="flex items-center gap-2">
            {handSupported && (
              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition-colors ${
                palmDetected
                  ? "bg-green-500/80 text-white"
                  : handLoading
                    ? "bg-white/10 text-white/40"
                    : "bg-white/10 text-white/60"
              }`}>
                <span className="text-base">{palmDetected ? "✋" : "🖐"}</span>
                <span>
                  {handLoading
                    ? "준비 중..."
                    : palmDetected
                      ? "손바닥 감지!"
                      : "손바닥"}
                </span>
              </div>
            )}
            {voiceSupported && (
              <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition-colors ${
                cheeseDetected
                  ? "bg-green-500/80 text-white"
                  : !isListening
                    ? "bg-white/10 text-white/40"
                    : "bg-white/10 text-white/60"
              }`}>
                <span className="text-base">{cheeseDetected ? "🧀" : "🎤"}</span>
                <span>
                  {!isListening
                    ? "준비 중..."
                    : cheeseDetected
                      ? "치즈 감지!"
                      : "\"치즈\""}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="w-full flex items-center justify-between">
          <button
            onClick={() => { stopCamera(); router.push(`/booth/${id}`); }}
            disabled={countdown !== null || capturing}
            className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white text-xl btn-touch disabled:opacity-30 disabled:cursor-not-allowed"
          >&larr;</button>

          <button
            onClick={handleCapture}
            disabled={!isReady || countdown !== null || capturing}
            className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 btn-touch ${
              palmDetected || cheeseDetected ? "ring-4 ring-green-400 ring-offset-2 ring-offset-black" : ""
            }`}
          >
            <div className="w-16 h-16 bg-white rounded-full active:bg-gray-200 transition-colors" />
          </button>

          <button
            onClick={handleViewResults}
            disabled={photos.length === 0 || countdown !== null || capturing}
            className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed btn-touch"
          >
            {photos.length > 0 ? photos.length : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
