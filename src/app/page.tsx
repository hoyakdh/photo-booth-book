"use client";

import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { useRef, useState, useEffect } from "react";
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

  const [reorderMode, setReorderMode] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleCardTap = (idx: number) => {
    if (selectedIdx === null) {
      setSelectedIdx(idx);
    } else if (selectedIdx === idx) {
      setSelectedIdx(null);
    } else {
      const arr = [...covers];
      const [moved] = arr.splice(selectedIdx, 1);
      arr.splice(idx, 0, moved);
      reorderCovers(arr);
      setSelectedIdx(null);
    }
  };

  const exitReorderMode = () => {
    setReorderMode(false);
    setSelectedIdx(null);
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
          <>
            {reorderMode && (
              <div className="flex items-center justify-between mb-3 px-1">
                <p className="text-sm text-primary font-bold">
                  {selectedIdx === null ? "이동할 책을 선택하세요" : "이동할 위치를 선택하세요"}
                </p>
                <button
                  onClick={exitReorderMode}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-gray-200 text-gray-700"
                >
                  완료
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 select-none">
            {covers.map((cover, idx) => (
              <button
                key={cover.id}
                onClick={() => {
                  if (reorderMode) {
                    handleCardTap(idx);
                  } else {
                    router.push(`/booth/${cover.id}`);
                  }
                }}
                className={`group bg-white rounded-2xl shadow-lg overflow-hidden border-2 transition-all duration-200 flex flex-col w-[calc(50%-0.375rem)] sm:w-[calc(33.333%-0.5rem)] md:w-[calc(25%-0.5625rem)] ${
                  reorderMode && selectedIdx === idx
                    ? "border-primary scale-95 ring-4 ring-primary/30"
                    : reorderMode && selectedIdx !== null
                    ? "border-dashed border-gray-300 opacity-80 hover:border-primary hover:opacity-100"
                    : reorderMode
                    ? "border-gray-200"
                    : "border-transparent hover:border-primary active:scale-95"
                }`}
              >
                <div className="aspect-[3/4] md:aspect-auto md:h-[35dvh] w-full overflow-hidden bg-gray-50 flex items-center justify-center">
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
          </>
        )}
      </main>

      {/* 하단 */}
      {!kioskMode && (
        <footer className="p-4 text-center flex items-center justify-center gap-4">
          <button
            onClick={() => setReorderMode(!reorderMode)}
            className={`text-sm underline ${reorderMode ? "text-primary font-bold" : "text-gray-400"}`}
          >
            순서 변경
          </button>
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
