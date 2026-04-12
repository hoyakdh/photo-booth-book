"use client";

import { useParams, useRouter } from "next/navigation";
import { useBookCover } from "@/hooks/useBookCovers";
import { usePhotoStore } from "@/store/usePhotoStore";

export default function BoothStartPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cover, loading } = useBookCover(id);
  const clearPhotos = usePhotoStore((s) => s.clearPhotos);

  const handleStart = () => {
    clearPhotos();
    router.push(`/booth/${id}/capture`);
  };

  if (loading) {
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
        <button
          onClick={() => router.push("/")}
          className="px-6 py-3 bg-primary text-white rounded-2xl font-bold btn-touch"
        >
          돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen-safe relative flex flex-col">
      {/* 뒤로가기 */}
      <button
        onClick={() => router.push("/")}
        className="absolute top-4 left-4 z-10 w-10 h-10 bg-black/30 backdrop-blur rounded-full flex items-center justify-center text-white text-xl btn-touch"
      >
        &larr;
      </button>

      {/* 책표지 꽉 찬 화면 */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={cover.previewData || cover.imageData}
          alt={cover.name}
          className="w-full h-full object-contain"
        />
      </div>

      {/* START 버튼 */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex justify-center">
        <button
          onClick={handleStart}
          className="px-12 py-5 bg-primary/70 text-white rounded-full font-black text-2xl shadow-2xl hover:bg-primary-light active:scale-95 transition-all btn-touch"
        >
          START
        </button>
      </div>
    </div>
  );
}
