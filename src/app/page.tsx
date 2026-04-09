"use client";

import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { useRef, useState, useCallback, useEffect } from "react";
import { BookCover } from "@/types";
import { loadKioskConfig } from "@/lib/kiosk";

export default function HomePage() {
  const router = useRouter();
  const { covers, loading, reorderCovers } = useBookCovers();

  const [kioskMode, setKioskMode] = useState(false);
  const tapCountRef = useRef(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setKioskMode(loadKioskConfig().enabled);
  }, []);

  const handleLogoTap = () => {
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      router.push("/admin");
      return;
    }
    tapTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, 1500);
  };

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLElement | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const getReordered = useCallback(
    (from: number, to: number): BookCover[] => {
      const arr = [...covers];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return arr;
    },
    [covers]
  );

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    dragNode.current = e.currentTarget as HTMLElement;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx !== null && idx !== overIdx) {
      setOverIdx(idx);
    }
  };

  const handleDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      reorderCovers(getReordered(dragIdx, idx));
    }
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  // Touch drag-and-drop (iPad)
  const handleTouchStart = (e: React.TouchEvent, idx: number) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;

    const timer = setTimeout(() => {
      isDragging.current = true;
      setDragIdx(idx);
      if (navigator.vibrate) navigator.vibrate(30);
    }, 300);

    const el = e.currentTarget as HTMLElement;
    const cancelLongPress = () => {
      clearTimeout(timer);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", cancelLongPress);
    };
    const onMove = (ev: TouchEvent) => {
      const t = ev.touches[0];
      const dx = Math.abs(t.clientX - touchStartPos.current!.x);
      const dy = Math.abs(t.clientY - touchStartPos.current!.y);
      if (!isDragging.current && (dx > 10 || dy > 10)) {
        cancelLongPress();
      }
    };
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", cancelLongPress, { once: true });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || dragIdx === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (el) {
      const card = el.closest("[data-idx]") as HTMLElement | null;
      if (card) {
        const idx = Number(card.dataset.idx);
        if (!isNaN(idx)) setOverIdx(idx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (isDragging.current && dragIdx !== null && overIdx !== null && dragIdx !== overIdx) {
      reorderCovers(getReordered(dragIdx, overIdx));
    }
    isDragging.current = false;
    setDragIdx(null);
    setOverIdx(null);
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="text-center py-4 md:py-3 px-4 shrink-0">
        <h1
          className="text-3xl sm:text-4xl font-black text-primary select-none"
          onClick={handleLogoTap}
        >
          Book Photo Booth
        </h1>
        <p className="text-base sm:text-lg text-gray-500 mt-1">
          책 속으로 들어가 보자!
        </p>
      </header>

      {/* 책표지 그리드 */}
      <main className="flex-1 min-h-0 px-4 pb-3 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-60">
            <div className="text-xl text-gray-400">불러오는 중...</div>
          </div>
        ) : covers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <p className="text-xl text-gray-400">아직 등록된 책이 없어요</p>
            <button
              onClick={() => router.push("/admin")}
              className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-lg btn-touch"
            >
              책표지 등록하러 가기
            </button>
          </div>
        ) : (
          <div
            className="flex flex-wrap justify-center gap-3"
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {covers.map((cover, idx) => (
              <button
                key={cover.id}
                data-idx={idx}
                draggable
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, idx)}
                onClick={() => {
                  if (!isDragging.current) router.push(`/booth/${cover.id}`);
                }}
                className={`group bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all duration-200 flex flex-col w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] md:w-[calc(25%-0.5625rem)] ${
                  dragIdx === idx
                    ? "opacity-50 border-primary scale-95"
                    : overIdx === idx && dragIdx !== null
                    ? "border-primary border-dashed"
                    : "border-transparent hover:border-primary active:scale-95"
                }`}
              >
                <div className="aspect-[3/4] md:max-h-[35dvh] overflow-hidden bg-gray-50 flex items-center justify-center">
                  <img
                    src={cover.previewData || cover.imageData}
                    alt={cover.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  />
                </div>
                <div className="p-2 text-center shrink-0">
                  <p className="font-bold text-sm sm:text-base truncate">
                    {cover.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* 하단 */}
      {!kioskMode && (
        <footer className="p-4 text-center">
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-gray-400 underline"
          >
            관리자 페이지
          </button>
        </footer>
      )}
    </div>
  );
}
