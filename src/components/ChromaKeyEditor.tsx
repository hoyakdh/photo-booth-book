"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface ChromaKeyEditorProps {
  imageData: string;
  onSave: (editedImageData: string) => void;
  onCancel: () => void;
}

type Tool = "brush" | "eraser" | "rect";

export default function ChromaKeyEditor({ imageData, onSave, onCancel }: ChromaKeyEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null); // 초록색 오버레이 레이어
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(30);
  const [isDrawing, setIsDrawing] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // 사각형 도구 상태
  const [rectStart, setRectStart] = useState<{ x: number; y: number } | null>(null);
  const [rectPreview, setRectPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 캔버스 크기 & 스케일
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });

  // 이미지 로드 & 캔버스 설정
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgLoaded(true);
    };
    img.src = imageData;
  }, [imageData]);

  useEffect(() => {
    if (!imgLoaded || !imgRef.current || !canvasRef.current || !overlayRef.current || !containerRef.current) return;

    const img = imgRef.current;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // 이미지를 컨테이너에 맞게 스케일
    const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight, 1);
    const displayW = Math.round(img.naturalWidth * scale);
    const displayH = Math.round(img.naturalHeight * scale);

    scaleRef.current = scale;
    offsetRef.current = {
      x: Math.round((containerW - displayW) / 2),
      y: Math.round((containerH - displayH) / 2),
    };

    // 원본 해상도 캔버스 (표시 크기만 CSS로 조절)
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

    // 배경 이미지 그리기
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
  }, [imgLoaded]);

  // 터치/마우스 좌표 → 캔버스 좌표 변환
  const getCanvasPos = useCallback((clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = overlayRef.current.width / rect.width;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  }, []);

  // 브러시/지우개 그리기
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

  // 포인터 이벤트
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const pos = getCanvasPos(e.clientX, e.clientY);

    if (tool === "rect") {
      setRectStart(pos);
      setRectPreview(null);
    } else {
      setIsDrawing(true);
      drawAt(pos.x, pos.y);
    }
  }, [tool, getCanvasPos, drawAt]);

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
    } else if (isDrawing) {
      drawAt(pos.x, pos.y);
    }
  }, [tool, rectStart, isDrawing, getCanvasPos, drawAt]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.preventDefault();

    if (tool === "rect" && rectStart) {
      const pos = getCanvasPos(e.clientX, e.clientY);
      const overlay = overlayRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d")!;
        ctx.fillStyle = "#00ff00";
        ctx.fillRect(
          Math.min(rectStart.x, pos.x),
          Math.min(rectStart.y, pos.y),
          Math.abs(pos.x - rectStart.x),
          Math.abs(pos.y - rectStart.y)
        );
      }
      setRectStart(null);
      setRectPreview(null);
    } else {
      setIsDrawing(false);
    }
  }, [tool, rectStart, getCanvasPos]);

  // 전체 초기화
  const handleClear = () => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  };

  // 저장 (원본 이미지 + 초록 오버레이 합성)
  const handleSave = () => {
    if (!canvasRef.current || !overlayRef.current || !imgRef.current) return;

    const img = imgRef.current;
    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = img.naturalWidth;
    mergeCanvas.height = img.naturalHeight;
    const ctx = mergeCanvas.getContext("2d")!;

    // 원본 이미지
    ctx.drawImage(img, 0, 0);
    // 초록색 오버레이 합성
    ctx.drawImage(overlayRef.current, 0, 0);

    onSave(mergeCanvas.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 상단 도구 바 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
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

        <button
          onClick={handleClear}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-gray-700 text-yellow-300 whitespace-nowrap"
        >
          전체 지우기
        </button>
      </div>

      {/* 안내 */}
      <div className="text-center py-1 bg-green-600 text-white text-sm font-medium">
        초록색으로 칠한 부분이 카메라로 보이는 영역이에요!
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
        {/* 배경 이미지 캔버스 */}
        <canvas
          ref={canvasRef}
          className="absolute"
        />
        {/* 초록색 오버레이 캔버스 */}
        <canvas
          ref={overlayRef}
          className="absolute"
          style={{ opacity: 0.7 }}
        />

        {/* 사각형 미리보기 */}
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
