"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { usePhotoStore } from "@/store/usePhotoStore";
import { useBookCover } from "@/hooks/useBookCovers";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cover } = useBookCover(id);
  const photos = usePhotoStore((s) => s.capturedPhotos);
  const clearPhotos = usePhotoStore((s) => s.clearPhotos);

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [saved, setSaved] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);

  const selectedPhoto = photos[selectedIdx];

  const handleDownload = useCallback(async () => {
    if (!selectedPhoto) return;

    const dataUrl = selectedPhoto.imageData;

    // iOS Safari: Web Share API 시도
    if (navigator.share && navigator.canShare) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], `photo-booth-${Date.now()}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          setSaved(true);
          return;
        }
      } catch {
        // fallback
      }
    }

    // Fallback: a 태그 다운로드
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `photo-booth-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setSaved(true);
  }, [selectedPhoto]);

  const handleRetake = () => {
    router.push(`/booth/${id}/capture`);
  };

  const handleHome = () => {
    clearPhotos();
    router.push("/");
  };

  if (photos.length === 0) {
    return (
      <div className="h-screen-safe flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-xl text-gray-500">촬영한 사진이 없어요</p>
        <button
          onClick={() => router.push(`/booth/${id}/capture`)}
          className="px-6 py-3 bg-primary text-white rounded-2xl font-bold btn-touch"
        >
          촬영하러 가기
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen-safe flex flex-col bg-gray-100">
      <a ref={linkRef} className="hidden" />

      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 py-3 bg-white shadow-sm">
        <button
          onClick={handleRetake}
          className="text-primary font-medium btn-touch"
        >
          &larr; 다시 촬영
        </button>
        <h1 className="font-bold text-lg">
          {cover?.name || "결과"}
        </h1>
        <button
          onClick={handleHome}
          className="text-gray-400 text-sm btn-touch"
        >
          홈으로
        </button>
      </header>

      {/* 선택된 사진 크게 보기 */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {selectedPhoto && (
          <img
            src={selectedPhoto.imageData}
            alt={`촬영 ${selectedIdx + 1}`}
            className="max-w-full max-h-full object-contain rounded-2xl shadow-xl"
          />
        )}
      </div>

      {/* 썸네일 목록 */}
      {photos.length > 1 && (
        <div className="flex gap-2 px-4 py-2 overflow-x-auto">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              onClick={() => {
                setSelectedIdx(idx);
                setSaved(false);
              }}
              className={`flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                idx === selectedIdx ? "border-primary" : "border-transparent"
              }`}
            >
              <img
                src={photo.imageData}
                alt={`촬영 ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="flex gap-3 px-4 py-4 bg-white">
        <button
          onClick={handleDownload}
          className={`flex-1 py-4 rounded-2xl font-bold text-lg btn-touch transition-colors ${
            saved
              ? "bg-success text-white"
              : "bg-primary text-white"
          }`}
        >
          {saved ? "저장 완료!" : "사진 저장하기"}
        </button>
        <button
          onClick={handleRetake}
          className="px-6 py-4 bg-secondary text-white rounded-2xl font-bold text-lg btn-touch"
        >
          다시 촬영
        </button>
        <button
          onClick={handleHome}
          className="px-6 py-4 bg-gray-300 text-gray-700 rounded-2xl font-bold text-lg btn-touch"
        >
          홈
        </button>
      </div>
    </div>
  );
}
