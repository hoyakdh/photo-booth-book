"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { generateId, fileToDataURL, resizeImage } from "@/lib/utils";
import { BookCover } from "@/types";
import ChromaKeyEditor from "@/components/ChromaKeyEditor";

export default function AdminPage() {
  const router = useRouter();
  const { covers, loading, addCover, removeCover } = useBookCovers();
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showChromaEditor, setShowChromaEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dataURL = await fileToDataURL(file);
    const resized = await resizeImage(dataURL);
    setPreview(resized);
    setMaskData(null); // 새 이미지 → 마스크 초기화
  };

  const handleOpenChromaEditor = () => {
    if (!preview) return;
    setShowChromaEditor(true);
  };

  const handleChromaSave = (originalImage: string, mask: string) => {
    setPreview(originalImage);
    setMaskData(mask);
    setShowChromaEditor(false);
  };

  const handleChromaCancel = () => {
    setShowChromaEditor(false);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !preview) return;
    setIsUploading(true);

    try {
      const cover: BookCover = {
        id: generateId(),
        name: name.trim(),
        imageData: preview,
        maskData: maskData || undefined,
        createdAt: Date.now(),
      };
      await addCover(cover);
      handleReset();
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("정말 삭제할까요?")) {
      await removeCover(id);
    }
  };

  const handleReset = () => {
    setName("");
    setPreview(null);
    setMaskData(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-[100dvh] p-4 max-w-2xl mx-auto">
      {/* 크로마키 편집기 */}
      {showChromaEditor && preview && (
        <ChromaKeyEditor
          imageData={preview}
          existingMask={maskData}
          onSave={handleChromaSave}
          onCancel={handleChromaCancel}
        />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">
          관리자 - 책표지 관리
        </h1>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-gray-200 rounded-xl text-sm font-medium btn-touch"
        >
          홈으로
        </button>
      </div>

      {/* 등록/수정 폼 */}
      <div className="bg-white rounded-2xl shadow-lg p-5 mb-6 border border-orange-100">
        <h2 className="text-lg font-bold mb-4 text-primary">
          새 책표지 등록
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">책 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 어린왕자"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-lg focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              책표지 이미지
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-primary file:text-white file:font-medium"
            />
          </div>

          {preview && (
            <>
              <div className="relative">
                <img
                  src={preview}
                  alt="미리보기"
                  className="w-full max-h-80 object-contain rounded-xl border-2 border-dashed border-gray-300"
                />
                {maskData && (
                  <span className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-lg font-bold">
                    크로마키 설정됨
                  </span>
                )}
              </div>

              {/* 크로마키 편집 버튼 */}
              <button
                onClick={handleOpenChromaEditor}
                className="w-full py-3 bg-green-500 text-white rounded-xl font-bold text-lg btn-touch flex items-center justify-center gap-2"
              >
                <span className="w-5 h-5 bg-[#00ff00] rounded border border-green-700 inline-block" />
                {maskData ? "크로마키 영역 다시 편집" : "크로마키 영역 편집하기"}
              </button>
              <p className="text-xs text-gray-400 text-center -mt-2">
                칠한 부분만 촬영 시 카메라로 보여요 (책표지의 녹색은 영향 없음)
              </p>
            </>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !preview || isUploading}
              className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-lg disabled:opacity-50 btn-touch"
            >
              {isUploading ? "저장 중..." : "등록하기"}
            </button>
          </div>
        </div>
      </div>

      {/* 등록된 책표지 목록 */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">
          등록된 책표지 ({covers.length}개)
        </h2>

        {loading ? (
          <div className="text-center py-10 text-gray-400">불러오는 중...</div>
        ) : covers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">
            아직 등록된 책표지가 없어요
          </div>
        ) : (
          covers.map((cover) => (
            <div
              key={cover.id}
              className="flex items-center gap-4 bg-white rounded-2xl shadow p-3 border border-gray-100"
            >
              <img
                src={cover.imageData}
                alt={cover.name}
                className="w-20 h-28 object-cover rounded-lg"
              />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg truncate">{cover.name}</p>
                <p className="text-xs text-gray-400">
                  {new Date(cover.createdAt).toLocaleDateString("ko-KR")}
                </p>
                {cover.maskData && (
                  <span className="text-xs text-green-500 font-medium">크로마키 설정됨</span>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleDelete(cover.id)}
                  className="px-3 py-1.5 bg-danger text-white rounded-lg text-sm font-medium btn-touch"
                >
                  삭제
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
