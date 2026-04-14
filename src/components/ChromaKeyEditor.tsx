"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface ChromaKeyEditorProps {
  imageData: string;
  existingMask?: string | null;
  onSave: (originalImage: string, maskData: string, previewImage: string) => void;
  onCancel: () => void;
}

type Tool = "brush" | "eraser" | "rect" | "lasso" | "polygon";
type SelectMode = "replace" | "add" | "subtract";

export default function ChromaKeyEditor({ imageData, existingMask, onSave, onCancel }: ChromaKeyEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [tool, setToolState] = useState<Tool>("brush");
  const [selectMode, setSelectMode] = useState<SelectMode>("add");
  const [tolerance, setTolerance] = useState(10); // 0=엄격, 100=느슨

  // 도구 변경 시 selectMode 자동 매핑: 브러시=add, 지우개=subtract
  const setTool = useCallback((next: Tool) => {
    setToolState(next);
    if (next === "brush") setSelectMode("add");
    else if (next === "eraser") setSelectMode("subtract");
  }, []);
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [maskRestored, setMaskRestored] = useState(false);

  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectPreview, setRectPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
  const lassoDrawingRef = useRef(false);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const HISTORY_LIMIT = 20;
  const [, setHistoryVersion] = useState(0);

  const commitOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    const snap = ctx.getImageData(0, 0, overlay.width, overlay.height);
    historyRef.current.push(snap);
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    redoRef.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || historyRef.current.length < 2) return;
    const current = historyRef.current.pop()!;
    redoRef.current.push(current);
    const prev = historyRef.current[historyRef.current.length - 1];
    overlay.getContext("2d")!.putImageData(prev, 0, 0);
    setHistoryVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || redoRef.current.length === 0) return;
    const next = redoRef.current.pop()!;
    historyRef.current.push(next);
    overlay.getContext("2d")!.putImageData(next, 0, 0);
    setHistoryVersion((v) => v + 1);
  }, []);

  // 단계 캔버스를 overlay에 합성 (현재는 추가만, 2단계에서 mode 도입)
  const applyStage = useCallback((stage: HTMLCanvasElement, mode: SelectMode) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    if (mode === "replace") {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      ctx.drawImage(stage, 0, 0);
    } else if (mode === "subtract") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(stage, 0, 0);
      ctx.globalCompositeOperation = "source-over";
    } else {
      ctx.drawImage(stage, 0, 0);
    }
    commitOverlay();
  }, [commitOverlay]);

  const makeStageCanvas = useCallback(() => {
    const overlay = overlayRef.current!;
    const stage = document.createElement("canvas");
    stage.width = overlay.width;
    stage.height = overlay.height;
    return stage;
  }, []);

  // 이미지 로드
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageData;
  }, [imageData]);

  // 캔버스 설정
  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !canvasRef.current || !overlayRef.current || !containerRef.current) return;

    const img = imgRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight, 1);
    const displayW = Math.round(img.naturalWidth * scale);
    const displayH = Math.round(img.naturalHeight * scale);

    scaleRef.current = scale;
    offsetRef.current = {
      x: Math.round((containerW - displayW) / 2),
      y: Math.round((containerH - displayH) / 2),
    };

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = `${displayW}px`;
    canvas.style.height = `${displayH}px`;
    canvas.style.left = `${offsetRef.current.x}px`;
    canvas.style.top = `${offsetRef.current.y}px`;

    overlay.width = img.naturalWidth;
    overlay.height = img.naturalHeight;
    overlay.style.width = `${displayW}px`;
    overlay.style.height = `${displayH}px`;
    overlay.style.left = `${offsetRef.current.x}px`;
    overlay.style.top = `${offsetRef.current.y}px`;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    // 기존 마스크 복원
    if (existingMask) {
      const maskSrc = existingMask;
      const maskImg = new Image();
      maskImg.onload = () => {
        const overlayCtx = overlay.getContext("2d")!;
        // 마스크를 overlay 크기에 맞게 그리기
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = overlay.width;
        tempCanvas.height = overlay.height;
        const tempCtx = tempCanvas.getContext("2d")!;
        tempCtx.drawImage(maskImg, 0, 0, overlay.width, overlay.height);
        const maskData = tempCtx.getImageData(0, 0, overlay.width, overlay.height);
        const pixels = maskData.data;

        // 흰색 → 초록색으로 변환하여 오버레이에 표시
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 128) {
            pixels[i] = 0;
            pixels[i + 1] = 255;
            pixels[i + 2] = 0;
            pixels[i + 3] = 255;
          } else {
            pixels[i + 3] = 0;
          }
        }
        overlayCtx.putImageData(maskData, 0, 0);
        commitOverlay();
        setMaskRestored(true);
      };
      maskImg.src = maskSrc;
    } else {
      commitOverlay();
      setMaskRestored(true);
    }
  }, [imgLoaded]);

  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = overlayRef.current.width / rect.width;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  }, []);

  const drawAt = useCallback((x: number, y: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;

    const actualBrushSize = brushSize / scaleRef.current;

    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, actualBrushSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    } else if (tool === "brush") {
      ctx.fillStyle = "#00ff00";
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(x, y, actualBrushSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [tool, brushSize]);

  const finalizePolygon = useCallback((pts: { x: number; y: number }[]) => {
    if (pts.length < 3) return;
    const stage = makeStageCanvas();
    const sctx = stage.getContext("2d")!;
    sctx.fillStyle = "#00ff00";
    sctx.beginPath();
    sctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y);
    sctx.closePath();
    sctx.fill("evenodd");
    applyStage(stage, selectMode);
  }, [makeStageCanvas, applyStage, selectMode]);

  useEffect(() => {
    if (tool !== "polygon") {
      setPolygonPoints([]);
      setCursorPos(null);
    }
  }, [tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && tool === "polygon" && polygonPoints.length > 0) {
        setPolygonPoints([]);
        setCursorPos(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, polygonPoints.length]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e.clientX, e.clientY);
    if (tool === "rect") {
      setRectStart(pos);
      setRectPreview(null);
    } else if (tool === "lasso") {
      lassoDrawingRef.current = true;
      setLassoPoints([pos]);
    } else if (tool === "polygon") {
      const first = polygonPoints[0];
      const closeThreshold = 12 / scaleRef.current;
      if (first && polygonPoints.length >= 3 && Math.hypot(pos.x - first.x, pos.y - first.y) <= closeThreshold) {
        finalizePolygon(polygonPoints);
        setPolygonPoints([]);
        setCursorPos(null);
      } else {
        setPolygonPoints((pts) => [...pts, pos]);
      }
    } else {
      setIsDrawing(true);
      drawAt(pos.x, pos.y);
    }
  }, [tool, polygonPoints, finalizePolygon, getCanvasPos, drawAt]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e.clientX, e.clientY);
    if (tool === "rect" && rectStart) {
      setRectPreview({
        x: Math.min(rectStart.x, pos.x),
        y: Math.min(rectStart.y, pos.y),
        w: Math.abs(pos.x - rectStart.x),
        h: Math.abs(pos.y - rectStart.y),
      });
    } else if (tool === "polygon") {
      setCursorPos(pos);
    } else if (tool === "lasso" && lassoDrawingRef.current) {
      setLassoPoints((pts) => {
        const last = pts[pts.length - 1];
        // 2px 미만 이동은 무시 (원본 픽셀 기준)
        if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < 2 / scaleRef.current) return pts;
        return [...pts, pos];
      });
    } else if (isDrawing) {
      drawAt(pos.x, pos.y);
    }
  }, [tool, rectStart, isDrawing, getCanvasPos, drawAt]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (tool === "rect" && rectStart) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      const w = Math.abs(pos.x - rectStart.x);
      const h = Math.abs(pos.y - rectStart.y);
      if (w > 0 && h > 0) {
        const stage = makeStageCanvas();
        const sctx = stage.getContext("2d")!;
        sctx.fillStyle = "#00ff00";
        sctx.fillRect(Math.min(rectStart.x, pos.x), Math.min(rectStart.y, pos.y), w, h);
        applyStage(stage, selectMode);
      }
      setRectStart(null);
      setRectPreview(null);
    } else if (tool === "lasso" && lassoDrawingRef.current) {
      lassoDrawingRef.current = false;
      const pts = lassoPoints;
      if (pts.length >= 3) {
        const stage = makeStageCanvas();
        const sctx = stage.getContext("2d")!;
        sctx.fillStyle = "#00ff00";
        sctx.beginPath();
        sctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) sctx.lineTo(pts[i].x, pts[i].y);
        sctx.closePath();
        sctx.fill("evenodd");
        applyStage(stage, selectMode);
      }
      setLassoPoints([]);
    } else {
      if (isDrawing) commitOverlay();
      setIsDrawing(false);
    }
  }, [tool, rectStart, isDrawing, lassoPoints, getCanvasPos, commitOverlay, makeStageCanvas, applyStage, selectMode]);

  const handleInvert = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    const d = ctx.getImageData(0, 0, overlay.width, overlay.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] > 0) {
        p[i + 3] = 0;
      } else {
        p[i] = 0;
        p[i + 1] = 255;
        p[i + 2] = 0;
        p[i + 3] = 255;
      }
    }
    ctx.putImageData(d, 0, 0);
    commitOverlay();
  };

  const handleClear = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    commitOverlay();
  };

  // 흰색 영역 자동 감지
  const handleAutoDetectWhite = () => {
    if (!imgRef.current || !overlayRef.current) return;
    const img = imgRef.current;

    // 원본 이미지에서 픽셀 읽기
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = img.naturalWidth;
    tempCanvas.height = img.naturalHeight;
    const tempCtx = tempCanvas.getContext("2d")!;
    tempCtx.drawImage(img, 0, 0);
    const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const px = imgData.data;

    // 흰색/거의 흰색 픽셀 감지 (허용치에 따라 임계값 조절)
    const threshold = Math.max(0, 255 - tolerance * 2);
    const w = tempCanvas.width;
    const h = tempCanvas.height;
    const whiteMask = new Uint8Array(w * h);
    for (let i = 0; i < whiteMask.length; i++) {
      const r = px[i * 4];
      const g = px[i * 4 + 1];
      const b = px[i * 4 + 2];
      if (r >= threshold && g >= threshold && b >= threshold) {
        whiteMask[i] = 1;
      }
    }

    // Connected component로 영역 분리 → 작은 영역 제거
    const labels = new Int32Array(w * h);
    let labelCount = 0;
    const flood = (sx: number, sy: number, label: number) => {
      const stack: [number, number][] = [[sx, sy]];
      let area = 0;
      while (stack.length > 0) {
        const [cx, cy] = stack.pop()!;
        const idx = cy * w + cx;
        if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
        if (whiteMask[idx] !== 1 || labels[idx] !== 0) continue;
        labels[idx] = label;
        area++;
        stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
      }
      return area;
    };

    const minArea = w * h * 0.02; // 전체의 2% 이상인 영역만
    const validLabels = new Set<number>();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (whiteMask[idx] === 1 && labels[idx] === 0) {
          labelCount++;
          const area = flood(x, y, labelCount);
          if (area >= minArea) {
            validLabels.add(labelCount);
          }
        }
      }
    }

    // 유효한 영역을 stage에 초록색으로 쓰고 selectMode로 합성
    const stage = makeStageCanvas();
    const stageCtx = stage.getContext("2d")!;
    const scaleX = stage.width / w;
    const scaleY = stage.height / h;
    const stageData = stageCtx.createImageData(stage.width, stage.height);
    const op = stageData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (validLabels.has(labels[idx])) {
          const ox = Math.round(x * scaleX);
          const oy = Math.round(y * scaleY);
          if (ox < stage.width && oy < stage.height) {
            const oi = (oy * stage.width + ox) * 4;
            op[oi] = 0;
            op[oi + 1] = 255;
            op[oi + 2] = 0;
            op[oi + 3] = 255;
          }
        }
      }
    }

    stageCtx.putImageData(stageData, 0, 0);
    applyStage(stage, selectMode);
  };

  // 저장: 원본 이미지 + 마스크 별도 생성
  const handleSave = () => {
    if (!overlayRef.current || !imgRef.current) return;

    const img = imgRef.current;
    const overlay = overlayRef.current;

    // 마스크 생성
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = img.naturalWidth;
    maskCanvas.height = img.naturalHeight;
    const maskCtx = maskCanvas.getContext("2d")!;

    const overlayCtx = overlay.getContext("2d")!;
    const overlayData = overlayCtx.getImageData(0, 0, overlay.width, overlay.height);
    const pixels = overlayData.data;

    maskCtx.fillStyle = "#000000";
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    const maskImageData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const maskPixels = maskImageData.data;

    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] > 0) {
        maskPixels[i] = 255;
        maskPixels[i + 1] = 255;
        maskPixels[i + 2] = 255;
        maskPixels[i + 3] = 255;
      }
    }
    maskCtx.putImageData(maskImageData, 0, 0);

    const maskDataURL = maskCanvas.toDataURL("image/png");

    // 미리보기 생성: 원본 + 반투명 초록 오버레이
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = img.naturalWidth;
    previewCanvas.height = img.naturalHeight;
    const previewCtx = previewCanvas.getContext("2d")!;
    previewCtx.drawImage(img, 0, 0);
    previewCtx.globalAlpha = 0.5;
    previewCtx.drawImage(overlay, 0, 0);
    previewCtx.globalAlpha = 1;
    const previewDataURL = previewCanvas.toDataURL("image/png");

    onSave(imageData, maskDataURL, previewDataURL);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* 상단 도구 바 */}
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3 pb-2 bg-gray-900 flex-shrink-0">
        <button
          onClick={() => setTool("brush")}
          className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${
            tool === "brush" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          브러시
        </button>
        <button
          onClick={() => setTool("rect")}
          className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${
            tool === "rect" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          사각형
        </button>
        <button
          onClick={() => setTool("lasso")}
          className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${
            tool === "lasso" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          올가미
        </button>
        <button
          onClick={() => setTool("polygon")}
          className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${
            tool === "polygon" ? "bg-green-500 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          다각형
        </button>
        <button
          onClick={() => setTool("eraser")}
          className={`px-3 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${
            tool === "eraser" ? "bg-red-500 text-white" : "bg-gray-700 text-gray-300"
          }`}
        >
          지우개
        </button>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <label className="text-gray-400 text-xs whitespace-nowrap">크기</label>
        <input
          type="range"
          min={5}
          max={100}
          value={brushSize}
          onChange={(e) => setBrushSize(Number(e.target.value))}
          className="w-24 sm:w-32"
        />
        <span className="text-gray-400 text-xs w-6">{brushSize}</span>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {([
            { key: "replace", label: "교체" },
            { key: "add", label: "추가" },
            { key: "subtract", label: "제외" },
          ] as const).map((m) => {
            const locked = tool === "brush" || tool === "eraser";
            const active = selectMode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => !locked && setSelectMode(m.key)}
                disabled={locked}
                className={`px-2 py-1 rounded text-xs font-bold whitespace-nowrap transition ${
                  active ? "bg-green-500 text-white" : "text-gray-300"
                } ${locked ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <button
          onClick={undo}
          disabled={historyRef.current.length < 2}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-700 text-white whitespace-nowrap disabled:opacity-40"
        >
          ↶ 되돌리기
        </button>
        <button
          onClick={redo}
          disabled={redoRef.current.length === 0}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-700 text-white whitespace-nowrap disabled:opacity-40"
        >
          ↷ 다시
        </button>

        <button
          onClick={handleInvert}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-purple-600 text-white whitespace-nowrap"
        >
          ⇄ 반전
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-700 text-yellow-300 whitespace-nowrap"
        >
          전체 지우기
        </button>

        <div className="w-px h-6 bg-gray-600 mx-1" />

        <button
          onClick={handleAutoDetectWhite}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white whitespace-nowrap"
        >
          흰색 자동감지
        </button>
        <label className="text-gray-400 text-xs whitespace-nowrap">허용치</label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={tolerance}
          onChange={(e) => setTolerance(Number(e.target.value))}
          className="w-20 sm:w-28"
        />
        <span className="text-gray-400 text-xs w-6">{tolerance}</span>
      </div>

      {/* 안내 */}
      <div className="text-center py-1 bg-green-600 text-white text-sm font-medium">
        초록색으로 칠한 부분만 카메라로 보여요!
      </div>

      {/* 편집 영역 */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-800"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ touchAction: "none" }}
      >
        <canvas ref={canvasRef} className="absolute" />
        <canvas ref={overlayRef} className="absolute" style={{ opacity: 0.7 }} />

        {/* 로딩 오버레이 */}
        {!maskRestored && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-800">
            <p className="text-white text-lg">불러오는 중...</p>
          </div>
        )}

        {rectPreview && (
          <div
            className="absolute border-2 border-dashed border-green-400 bg-green-500/30 pointer-events-none"
            style={{
              left: `${offsetRef.current.x + rectPreview.x * scaleRef.current}px`,
              top: `${offsetRef.current.y + rectPreview.y * scaleRef.current}px`,
              width: `${rectPreview.w * scaleRef.current}px`,
              height: `${rectPreview.h * scaleRef.current}px`,
            }}
          />
        )}

        {tool === "polygon" && polygonPoints.length > 0 && (
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            {(() => {
              const screen = polygonPoints.map((p) => ({
                x: offsetRef.current.x + p.x * scaleRef.current,
                y: offsetRef.current.y + p.y * scaleRef.current,
              }));
              const cursor = cursorPos
                ? { x: offsetRef.current.x + cursorPos.x * scaleRef.current, y: offsetRef.current.y + cursorPos.y * scaleRef.current }
                : null;
              const first = screen[0];
              const closingCandidate =
                cursor && polygonPoints.length >= 3 && cursorPos &&
                Math.hypot(cursorPos.x - polygonPoints[0].x, cursorPos.y - polygonPoints[0].y) <= 12 / scaleRef.current;
              const linePoints = [...screen, ...(cursor ? [cursor] : [])]
                .map((p) => `${p.x},${p.y}`)
                .join(" ");
              return (
                <>
                  <polyline
                    points={linePoints}
                    fill="rgba(0,255,0,0.2)"
                    stroke="#00ff00"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                  {screen.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={4} fill="#00ff00" />
                  ))}
                  {closingCandidate && (
                    <circle cx={first.x} cy={first.y} r={10} fill="none" stroke="#ffff00" strokeWidth={3} />
                  )}
                </>
              );
            })()}
          </svg>
        )}

        {tool === "lasso" && lassoPoints.length > 1 && (
          <svg
            className="absolute inset-0 pointer-events-none"
            width="100%"
            height="100%"
          >
            <polyline
              points={lassoPoints
                .map(
                  (p) =>
                    `${offsetRef.current.x + p.x * scaleRef.current},${offsetRef.current.y + p.y * scaleRef.current}`
                )
                .join(" ")}
              fill="rgba(0,255,0,0.2)"
              stroke="#00ff00"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          </svg>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-3 px-4 py-3 bg-gray-900">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-xl font-bold text-lg bg-gray-700 text-white btn-touch"
        >
          취소
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-3 rounded-xl font-bold text-lg bg-primary text-white btn-touch"
        >
          완료
        </button>
      </div>
    </div>
  );
}
