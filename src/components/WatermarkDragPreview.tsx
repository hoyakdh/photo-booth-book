"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WatermarkConfig } from "@/lib/watermark";
import { PHOTOCARD_W_MM, PHOTOCARD_H_MM } from "@/lib/photocardAspect";
import {
  getWatermarkBlockMetrics,
  getWatermarkDrawParts,
  getWatermarkRowGap,
  getWatermarkSizing,
  normalizedPositionFromCorner,
  resolveWatermarkFontFamily,
} from "@/lib/watermark";

const CORNERS: { label: string; position: WatermarkConfig["position"] }[] = [
  { label: "좌상", position: "top-left" },
  { label: "우상", position: "top-right" },
  { label: "좌하", position: "bottom-left" },
  { label: "우하", position: "bottom-right" },
];

type DragCtx = {
  pointerId: number;
  grabOffsetXPx: number;
  grabOffsetYPx: number;
};

export default function WatermarkDragPreview({
  wm,
  updateWm,
}: {
  wm: WatermarkConfig;
  updateWm: (partial: Partial<WatermarkConfig>) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragCtx | null>(null);
  const updateRef = useRef(updateWm);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    updateRef.current = updateWm;
  }, [updateWm]);

  const parts = getWatermarkDrawParts(wm);
  const hasParts = Boolean(parts && (parts.main || parts.date));

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({
        w: Math.max(0, el.clientWidth),
        h: Math.max(0, el.clientHeight),
      });
    });
    ro.observe(el);
    setDims({
      w: Math.max(0, el.clientWidth),
      h: Math.max(0, el.clientHeight),
    });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!wm.enabled || !hasParts) return;
    if (wm.x !== undefined && wm.y !== undefined) return;
    if (dims.w < 40 || dims.h < 40) return;
    const n = normalizedPositionFromCorner(wm, dims.w, dims.h);
    if (n) updateRef.current({ x: n.x, y: n.y });
  }, [wm.enabled, wm.position, wm.showDate, wm.text, wm.fontSize, wm.fontFamily, dims.w, dims.h, hasParts]); // eslint-disable-line react-hooks/exhaustive-deps -- wm 일부만 감시; x/y는 제외

  const metrics =
    dims.w > 0 && dims.h > 0 ? getWatermarkBlockMetrics(dims.w, dims.h, wm) : null;

  const fontPx = dims.w > 0 ? Math.round(getWatermarkSizing(dims.w, wm).fontSize) : wm.fontSize;
  const rowGapPx = getWatermarkRowGap(fontPx);

  const clampAndSave = useCallback(
    (nx: number, ny: number, wpx: number, hpx: number) => {
      const m = getWatermarkBlockMetrics(wpx, hpx, wm);
      if (!m) return;
      const maxX = Math.max(0, wpx - m.blockW);
      const maxY = Math.max(0, hpx - m.blockH);
      const x = clamp(nx * wpx, 0, maxX) / wpx;
      const y = clamp(ny * hpx, 0, maxY) / hpx;
      updateRef.current({ x, y });
    },
    [wm]
  );

  const applyCorner = (position: WatermarkConfig["position"]) => {
    if (dims.w < 40 || dims.h < 40) return;
    const cfg = { ...wm, position };
    const n = normalizedPositionFromCorner(cfg, dims.w, dims.h);
    if (n) updateRef.current({ position, x: n.x, y: n.y });
    else updateRef.current({ position });
  };

  const resetToDefaultCorner = () => {
    applyCorner("bottom-right");
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!metrics || dims.w <= 0 || dims.h <= 0) return;
    if (wm.x === undefined || wm.y === undefined) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const leftPx = wm.x * rect.width;
    const topPx = wm.y * rect.height;
    dragRef.current = {
      pointerId: e.pointerId,
      grabOffsetXPx: e.clientX - rect.left - leftPx,
      grabOffsetYPx: e.clientY - rect.top - topPx,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left - dragRef.current.grabOffsetXPx;
    const py = e.clientY - rect.top - dragRef.current.grabOffsetYPx;
    clampAndSave(px / rect.width, py / rect.height, rect.width, rect.height);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  };

  const hasWatermarkContent = wm.enabled && hasParts;

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div>
        <h3 className="text-base font-bold text-blue-700">실제 위치 미리보기</h3>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          포토카드 비율(11∶17) 안에서 워터마크를 드래그해 위치를 조정할 수 있어요. 실제 출력과 같은 비율로
          표시합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs font-medium text-gray-600 whitespace-nowrap">빠른 위치:</span>
        <div className="flex flex-wrap gap-2">
          {CORNERS.map(({ label, position }) => (
            <button
              key={position}
              type="button"
              onClick={() => applyCorner(position)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold btn-touch border-2 transition-colors ${
                wm.position === position
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-blue-200 bg-white text-gray-700 hover:border-blue-400"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetToDefaultCorner}
            className="px-3 py-1.5 rounded-lg text-xs font-bold btn-touch border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            초기화(우하)
          </button>
        </div>
      </div>

      <div
        ref={wrapRef}
        className={`relative mx-auto w-full max-w-[220px] rounded-2xl border-2 shadow-inner overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-orange-50 select-none ${
          hasWatermarkContent && wm.x !== undefined && wm.y !== undefined
            ? "touch-none"
            : ""
        }`}
        style={{
          aspectRatio: `${PHOTOCARD_W_MM} / ${PHOTOCARD_H_MM}`,
        }}
      >
        <div className="absolute inset-[8%] rounded-xl border border-dashed border-black/25 pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center opacity-35 pointer-events-none">
          <p className="text-[11px] text-center px-6 text-gray-600 font-medium leading-tight">
            촬영 프레임·인물은 여기 채워집니다 (미리보기 배경입니다)
          </p>
        </div>

        {hasWatermarkContent && metrics && wm.x !== undefined && wm.y !== undefined && (
          <div
            role="presentation"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            className="absolute cursor-grab active:cursor-grabbing z-10"
            style={{
              left: `${wm.x * 100}%`,
              top: `${wm.y * 100}%`,
              fontSize: `${fontPx}px`,
              fontWeight: 700,
              lineHeight: 1.4,
              color: wm.color,
              opacity: wm.opacity,
              fontFamily: resolveWatermarkFontFamily(wm),
              whiteSpace: "nowrap",
            }}
          >
            {parts?.main && parts?.date ? (
              <span
                className="inline-flex items-baseline"
                style={{ gap: rowGapPx }}
              >
                <span>{parts.main}</span>
                <span>{parts.date}</span>
              </span>
            ) : (
              <span>{parts?.main ?? parts?.date}</span>
            )}
          </div>
        )}

        {wm.enabled && !hasParts && (
          <div className="absolute inset-0 flex items-end justify-center p-6 z-10 pointer-events-none">
            <p className="text-[11px] text-center text-amber-800 bg-amber-100/95 rounded-xl px-3 py-2 font-medium leading-snug">
              날짜 표시 또는 텍스트를 켜면 워터마크를 배치할 수 있어요
            </p>
          </div>
        )}
      </div>

      {!hasWatermarkContent && (
        <p className="text-xs text-gray-500">
          미리보기는 워터마크를 켜고 날짜·텍스트 중 하나라도 채워지면 표시됩니다.
        </p>
      )}
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}
