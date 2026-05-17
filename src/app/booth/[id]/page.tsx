"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { useBookCover } from "@/hooks/useBookCovers";
import { usePhotoStore } from "@/store/usePhotoStore";
import PermissionGateScreen from "@/components/PermissionGateScreen";

export default function BoothStartPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { cover, loading } = useBookCover(id);
  const clearPhotos = usePhotoStore((s) => s.clearPhotos);
  const [showPermissionGate, setShowPermissionGate] = useState(false);

  const goToCapture = useCallback(() => {
    router.push(`/booth/${id}/capture`);
  }, [router, id]);

  const handleStart = useCallback(async () => {
    clearPhotos();

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      goToCapture();
      return;
    }

    let bothGranted = false;
    try {
      const cam = await navigator.permissions.query({ name: "camera" as PermissionName });
      const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
      bothGranted = cam.state === "granted" && mic.state === "granted";
    } catch {
      bothGranted = false;
    }

    if (bothGranted) {
      goToCapture();
      return;
    }

    setShowPermissionGate(true);
  }, [clearPhotos, goToCapture]);

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

  if (showPermissionGate) {
    return (
      <PermissionGateScreen
        onComplete={goToCapture}
        onBack={() => setShowPermissionGate(false)}
      />
    );
  }

  return (
    <div className="h-screen-safe relative flex flex-col">
      {/* 책표지 꽉 찬 화면 */}
      <div className="flex-1 relative overflow-hidden">
        <img
          src={cover.previewData || cover.imageData}
          alt={cover.name}
          className="w-full h-full object-contain"
        />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <button
            type="button"
            onClick={handleStart}
            className="pointer-events-auto px-16 py-7 sm:px-20 sm:py-8 min-w-[min(90vw,280px)] bg-primary/90 text-white rounded-full font-black text-4xl sm:text-5xl shadow-2xl ring-4 ring-white/50 hover:bg-primary-light active:scale-95 transition-all btn-touch"
          >
            START
          </button>
        </div>
      </div>

      {/* 하단 컨트롤 — 뒤로가기만 */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex items-center justify-start z-20">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="w-12 h-12 bg-black/30 backdrop-blur rounded-full flex items-center justify-center text-white text-xl btn-touch"
        >
          &larr;
        </button>
      </div>
    </div>
  );
}
