"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback } from "react";
import { usePhotoStore } from "@/store/usePhotoStore";
import { useBookCover } from "@/hooks/useBookCovers";
import StickerEditor from "@/components/StickerEditor";
import { createGif } from "@/lib/gifEncoder";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cover } = useBookCover(id);
  const photos = usePhotoStore((s) => s.capturedPhotos);
  const clearPhotos = usePhotoStore((s) => s.clearPhotos);

  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [saved, setSaved] = useState(false);
  const [showSticker, setShowSticker] = useState(false);
  const [gifCreating, setGifCreating] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const gifFrames = usePhotoStore((s) => s.gifFrames);

  const selectedPhoto = photos[selectedIdx];

  const handleDownload = useCallback(async () => {
    if (!selectedPhoto) return;

    const dataUrl = selectedPhoto.imageData;
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], `photo-booth-${Date.now()}.png`, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          setSaved(true);
          return;
        }
      } catch {
        // 사용자가 공유 시트를 취소한 경우 — fallback으로 진행
      }
    }

    // blob URL 사용 (data URL은 iOS Safari에서 download 속성이 작동하지 않음)
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo-booth-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaved(true);
  }, [selectedPhoto]);

  const handleStickerSave = useCallback((editedImage: string) => {
    if (!selectedPhoto) return;
    // 스티커 적용된 이미지로 업데이트
    const store = usePhotoStore.getState();
    const updated = store.capturedPhotos.map((p, idx) =>
      idx === selectedIdx ? { ...p, imageData: editedImage } : p
    );
    usePhotoStore.setState({ capturedPhotos: updated });
    setShowSticker(false);
    setSaved(false);
  }, [selectedPhoto, selectedIdx]);

  const handleGifSave = useCallback(async () => {
    if (gifFrames.length === 0) return;
    setGifCreating(true);
    try {
      const blob = await createGif(gifFrames, 8, 10);

      if (navigator.share && navigator.canShare) {
        try {
          const file = new File([blob], `photo-booth-${Date.now()}.gif`, { type: "image/gif" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        } catch {
          // 사용자가 공유 시트를 취소한 경우 — fallback으로 진행
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `photo-booth-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("GIF 생성 실패:", err);
    } finally {
      setGifCreating(false);
    }
  }, [gifFrames]);

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
      {/* 스티커 에디터 */}
      {showSticker && selectedPhoto && (
        <StickerEditor
          imageData={selectedPhoto.imageData}
          onSave={handleStickerSave}
          onCancel={() => setShowSticker(false)}
        />
      )}

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
      <div ref={printRef} className="flex-1 flex items-center justify-center p-4 overflow-hidden">
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
      <div className="flex gap-2 px-4 py-4 bg-white">
        <button
          onClick={handleDownload}
          className={`flex-1 py-4 rounded-2xl font-bold text-base btn-touch transition-colors ${
            saved ? "bg-success text-white" : "bg-primary text-white"
          }`}
        >
          {saved ? "저장 완료!" : "저장"}
        </button>
        <button
          onClick={() => setShowSticker(true)}
          className="py-3 px-3 bg-pink-400 text-white rounded-2xl font-bold text-sm btn-touch"
        >
          꾸미기
        </button>
        {gifFrames.length > 0 && (
          <button
            onClick={handleGifSave}
            disabled={gifCreating}
            className="py-3 px-3 bg-purple-500 text-white rounded-2xl font-bold text-sm btn-touch disabled:opacity-50"
          >
            {gifCreating ? "생성중..." : "GIF"}
          </button>
        )}
        <button
          onClick={handleRetake}
          className="py-3 px-3 bg-secondary text-white rounded-2xl font-bold text-sm btn-touch"
        >
          다시촬영
        </button>
        <button
          onClick={handleHome}
          className="py-3 px-3 bg-gray-300 text-gray-700 rounded-2xl font-bold text-sm btn-touch"
        >
          홈
        </button>
      </div>
    </div>
  );
}
