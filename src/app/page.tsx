"use client";

import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { useRef, useState, useCallback } from "react";
import { BookCover } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const { covers, loading, reorderCovers } = useBookCovers();

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
    <div className="min-h-[100dvh] flex flex-col">
      {/* 헤더 */}
      <header className="text-center py-6 px-4">
        <h1 className="text-3xl sm:text-4xl font-black text-primary">
          Book Photo Booth
        </h1>
        <p className="text-base sm:text-lg text-gray-500 mt-1">
          책 속으로 들어가 보자!
        </p>
      </header>

      {/* 책표지 그리드 */}
      <main className="flex-1 px-4 pb-6">
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
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
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
                className={`group bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all duration-200 ${
                  dragIdx === idx
                    ? "opacity-50 border-primary scale-95"
                    : overIdx === idx && dragIdx !== null
                    ? "border-primary border-dashed"
                    : "border-transparent hover:border-primary active:scale-95"
                }`}
              >
                <div className="aspect-[3/4] overflow-hidden bg-gray-50 flex items-center justify-center">
                  <img
                    src={cover.previewData || cover.imageData}
                    alt={cover.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                  />
                </div>
                <div className="p-2 text-center">
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
      <footer className="p-4 text-center">
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-400 underline"
        >
          관리자 페이지
        </button>
      </footer>
    </div>
  );
}
