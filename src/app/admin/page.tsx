"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { generateId, fileToDataURL, resizeImage } from "@/lib/utils";
import { cropDataURLToPhotocardAspect, PHOTOCARD_W_MM, PHOTOCARD_H_MM } from "@/lib/photocardAspect";
import { BookCover } from "@/types";
import ChromaKeyEditor from "@/components/ChromaKeyEditor";
import { WatermarkConfig, loadWatermarkConfig, saveWatermarkConfig } from "@/lib/watermark";
import { exportBookCovers, importBookCovers } from "@/lib/backup";
import { KioskConfig, loadKioskConfig, saveKioskConfig } from "@/lib/kiosk";

const AI_FRAME_PROMPT = `첨부한 책표지 이미지를 분석해서, 그 이미지의 제목, 분위기, 색감, 핵심 상징 요소, 일러스트 느낌을 자동으로 반영한
55×85mm 세로형 아이돌 포토카드 비율의 4칸 인생네컷 프레임을 만들어줘.

조건:
- 2:3 비율, 세로형, 고해상도
- 4칸 사진 프레임, 2×2 배열
- 각 사진 칸은 흰색 빈 공간, 둥근 모서리
- 사진 칸 안에는 그림/글씨/장식 금지
- 첨부 이미지의 메인 제목만 추출해서 하단에 넣기
- 작가명, 출판사명, 수상 문구, 로고는 제외
- 첨부 이미지의 분위기와 핵심 소재를 바탕으로 장식 요소를 자동으로 구성
- 어린이용으로 따뜻하고 귀엽게 재해석
- 원본 책표지를 그대로 복제하지 말고 새로운 프레임 디자인으로 만들기
- 인쇄용 포토카드 프레임처럼 깔끔하게 정리하기`;

export default function AdminPage() {
  const router = useRouter();
  const { covers, loading, addCover, removeCover, updateCover, reorderCovers } = useBookCovers();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<string | null>(null);
  const [chromaPreview, setChromaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showChromaEditor, setShowChromaEditor] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const handleCopyTipPrompt = () => {
    navigator.clipboard.writeText(AI_FRAME_PROMPT).then(() => {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    });
  };
  const importInputRef = useRef<HTMLInputElement>(null);

  // 내보내기/가져오기
  const handleExport = async () => {
    await exportBookCovers();
  };
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const count = await importBookCovers(file);
      alert(`${count}개의 책표지를 가져왔습니다`);
      window.location.reload();
    } catch {
      alert("파일을 읽을 수 없습니다. 올바른 백업 파일인지 확인해주세요.");
    }
    if (importInputRef.current) importInputRef.current.value = "";
  };

  // 키오스크 설정
  const [kiosk, setKiosk] = useState<KioskConfig | null>(null);
  useEffect(() => { setKiosk(loadKioskConfig()); }, []);
  const updateKiosk = (partial: Partial<KioskConfig>) => {
    if (!kiosk) return;
    const updated = { ...kiosk, ...partial };
    setKiosk(updated);
    saveKioskConfig(updated);
  };

  // 워터마크 설정
  const [wm, setWm] = useState<WatermarkConfig | null>(null);
  useEffect(() => { setWm(loadWatermarkConfig()); }, []);
  const updateWm = (partial: Partial<WatermarkConfig>) => {
    if (!wm) return;
    const updated = { ...wm, ...partial };
    setWm(updated);
    saveWatermarkConfig(updated);
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const dataURL = await fileToDataURL(file);
    const resized = await resizeImage(dataURL);
    const normalized = await cropDataURLToPhotocardAspect(resized);
    setPreview(normalized);
    setMaskData(null);
    setChromaPreview(null);
  };

  const handleOpenChromaEditor = () => {
    if (!preview) return;
    setShowChromaEditor(true);
  };

  const handleChromaSave = (originalImage: string, mask: string, previewImg: string) => {
    setPreview(originalImage);
    setMaskData(mask);
    setChromaPreview(previewImg);
    setShowChromaEditor(false);
  };

  const handleChromaCancel = () => {
    setShowChromaEditor(false);
  };

  const [showCopyrightModal, setShowCopyrightModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    ids: string[];
    label: string;
    detail?: string;
    mode: "single" | "bulk";
  } | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);

  const handleSubmitClick = () => {
    if (!name.trim() || !preview) return;
    setShowCopyrightModal(true);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !preview) return;
    setShowCopyrightModal(false);
    setIsUploading(true);

    try {
      const cover: BookCover = {
        id: generateId(),
        name: name.trim(),
        imageData: preview,
        maskData: maskData || undefined,
        previewData: chromaPreview || undefined,
        createdAt: Date.now(),
      };
      await addCover(cover);
      handleReset();
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = (id: string, coverName: string) => {
    setDeleteConfirm({
      ids: [id],
      label: `「${coverName}」 책표지를 삭제할까요?`,
      mode: "single",
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleteInProgress(true);
    try {
      for (const id of deleteConfirm.ids) {
        await removeCover(id);
      }
      if (deleteConfirm.mode === "bulk") {
        setSelectedIds(new Set());
        setSelectMode(false);
      }
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Failed to delete book cover(s):", err);
      alert("삭제에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setDeleteInProgress(false);
    }
  };

  const handleEditStart = (cover: BookCover) => {
    setEditingId(cover.id);
    setEditingName(cover.name);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleEditSave = async (cover: BookCover) => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === cover.name) {
      handleEditCancel();
      return;
    }
    await updateCover({ ...cover, name: trimmed });
    handleEditCancel();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === covers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(covers.map((c) => c.id)));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const selectedNames = covers
      .filter((c) => selectedIds.has(c.id))
      .map((c) => c.name);
    const nameList = selectedNames.length <= 5
      ? selectedNames.map((n) => `  - ${n}`).join("\n")
      : selectedNames.slice(0, 5).map((n) => `  - ${n}`).join("\n") + `\n  ...외 ${selectedNames.length - 5}개`;
    const headline = selectedIds.size === covers.length ? "전체" : `선택한 ${selectedIds.size}개의`;
    setDeleteConfirm({
      ids: [...selectedIds],
      label: `${headline} 책표지를 삭제할까요?`,
      detail: nameList,
      mode: "bulk",
    });
  };

  // 길게 누르기로 선택 모드 진입
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const handleLongPressStart = useCallback((id: string) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setSelectMode(true);
      setSelectedIds(new Set([id]));
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // 드래그 정렬
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const dragStartYRef = useRef(0);
  const dragItemHeightRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.PointerEvent, index: number) => {
    if (selectMode) return;
    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture(e.pointerId);
    dragNodeRef.current = el;
    dragStartYRef.current = e.clientY;
    dragItemHeightRef.current = el.getBoundingClientRect().height + 12; // gap 포함
    setDragIndex(index);
    setDragOverIndex(index);
  }, [selectMode]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const delta = e.clientY - dragStartYRef.current;
    const indexDelta = Math.round(delta / dragItemHeightRef.current);
    const newOver = Math.max(0, Math.min(covers.length - 1, dragIndex + indexDelta));
    setDragOverIndex(newOver);
  }, [dragIndex, covers.length]);

  const handleDragEnd = useCallback(async () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const reordered = [...covers];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dragOverIndex, 0, moved);
      await reorderCovers(reordered);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragNodeRef.current = null;
  }, [dragIndex, dragOverIndex, covers, reorderCovers]);

  const handleReset = () => {
    setName("");
    setPreview(null);
    setMaskData(null);
    setChromaPreview(null);
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

      {/* 저작권 안내 모달 */}
      {showCopyrightModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-3 text-primary">저작권 안내</h3>
            <div className="text-sm text-gray-700 space-y-2 mb-5 leading-relaxed">
              <p>
                업로드하는 책표지 이미지의 저작권은 해당 저작권자에게 있습니다.
              </p>
              <p>
                등록자는 원저작자의 허가를 받았거나, 저작권법상 허용된 범위
                (공정 이용·교육 목적 등) 내에서 사용할 책임이 있으며,
                이로 인해 발생하는 모든 법적 분쟁과 책임은 <b>등록자 본인</b>에게 있습니다.
              </p>
              <p>
                본 서비스는 등록된 이미지의 저작권 침해 여부를 검증하지 않으며,
                관련 분쟁에 대해 어떠한 책임도 지지 않습니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCopyrightModal(false)}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold btn-touch"
              >
                취소
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-bold btn-touch"
              >
                동의하고 등록
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 프레임 만들기 Tip */}
      {showTip && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tip-frame-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTip(false);
          }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h3 id="tip-frame-title" className="font-bold text-base text-foreground">
                AI로 포토카드 프레임 만들기
              </h3>
              <button
                type="button"
                onClick={() => setShowTip(false)}
                className="w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 font-bold btn-touch"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-4 text-sm text-gray-700">
              <p>
                <strong>ChatGPT</strong> 또는 <strong>Gemini</strong>에서 책 표지 이미지를 <strong>첨부</strong>한 뒤 아래
                프롬프트를 붙여넣으세요.
              </p>
              <div className="relative bg-gray-50 rounded-xl p-4 pr-14 pt-10 text-xs text-gray-600 whitespace-pre-wrap leading-relaxed border border-gray-100">
                <button
                  type="button"
                  onClick={handleCopyTipPrompt}
                  className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold btn-touch shrink-0"
                >
                  {promptCopied ? "복사됨" : "복사"}
                </button>
                {AI_FRAME_PROMPT}
              </div>
              <p className="text-gray-400 text-xs">
                생성된 이미지를 저장한 다음, 위 양식에서 책 이름과 함께 책표지로 등록하면 됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 책표지 삭제 확인 모달 (window.confirm은 키오스크/PWA에서 동작하지 않을 수 있음) */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <h3 id="delete-confirm-title" className="text-lg font-bold mb-3 text-foreground">
              삭제 확인
            </h3>
            <div className="text-sm text-gray-700 mb-5 space-y-3 leading-relaxed">
              <p>{deleteConfirm.label}</p>
              {deleteConfirm.detail && (
                <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {deleteConfirm.detail}
                </pre>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={deleteInProgress}
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-bold btn-touch disabled:opacity-50"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleteInProgress}
                onClick={handleConfirmDelete}
                className="flex-1 py-3 bg-danger text-white rounded-xl font-bold btn-touch disabled:opacity-50"
              >
                {deleteInProgress ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-foreground">
          관리자 - 책표지 관리
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => router.push("/admin/photocard")}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium btn-touch"
          >
            포토카드 인쇄
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="px-4 py-2 bg-gray-200 rounded-xl text-sm font-medium btn-touch"
          >
            홈으로
          </button>
        </div>
      </div>

      {/* 안내 문구 */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 text-sm text-amber-800">
        <p className="font-bold mb-1">안내사항</p>
        <ul className="list-disc pl-5 space-y-1 mb-2">
          <li>
            포토카드 인쇄와 동일하게 보이려면 책표지 비율이{" "}
            <strong>
              가로 {PHOTOCARD_W_MM}∶세로 {PHOTOCARD_H_MM} (11∶17)
            </strong>
            과 같으면 좋습니다. 업로드 시 원본 중앙을 기준으로 이 비율로 자동 잘림이
            적용됩니다.
          </li>
        </ul>
        <p>등록한 책표지는 이 브라우저의 로컬 저장소에 저장됩니다. 브라우저 데이터 삭제, 시크릿 모드 사용, 다른 기기/브라우저에서 접속 시 등록한 책표지가 사라질 수 있습니다.</p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleExport}
            disabled={covers.length === 0}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold btn-touch disabled:opacity-40"
          >
            백업 내보내기
          </button>
          <button
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold btn-touch"
          >
            백업 가져오기
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>

      {/* 등록/수정 폼 */}
      <div className="bg-white rounded-2xl shadow-lg p-5 mb-6 border border-orange-100">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-bold text-primary">새 책표지 등록</h2>
          <button
            type="button"
            onClick={() => setShowTip(true)}
            className="w-8 h-8 rounded-full bg-primary/15 text-primary text-sm font-bold flex items-center justify-center hover:bg-primary/25 btn-touch shrink-0"
            title="AI로 프레임 만들기 안내"
            aria-label="프레임 만들기 팁"
          >
            ?
          </button>
        </div>

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
                  src={chromaPreview || preview}
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
              onClick={handleSubmitClick}
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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">
            등록된 책표지 ({covers.length}개)
          </h2>
          {covers.length > 0 && (
            <button
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium btn-touch ${
                selectMode ? "bg-gray-800 text-white" : "bg-gray-200 text-gray-700"
              }`}
            >
              {selectMode ? "취소" : "선택"}
            </button>
          )}
        </div>

        {/* 선택 모드 액션바 */}
        {selectMode && covers.length > 0 && (
          <div className="flex items-center gap-3 bg-gray-100 rounded-xl p-3">
            <button
              onClick={toggleSelectAll}
              className="px-3 py-1.5 bg-white rounded-lg text-sm font-medium border border-gray-300 btn-touch"
            >
              {selectedIds.size === covers.length ? "전체 해제" : "전체 선택"}
            </button>
            <span className="text-sm text-gray-500 flex-1">
              {selectedIds.size}개 선택됨
            </span>
            <button
              onClick={handleDeleteSelected}
              disabled={selectedIds.size === 0}
              className="px-4 py-1.5 bg-danger text-white rounded-lg text-sm font-bold btn-touch disabled:opacity-40"
            >
              삭제
            </button>
          </div>
        )}

        {!selectMode && covers.length > 1 && (
          <p className="text-xs text-gray-400">길게 눌러 선택 / 왼쪽 핸들을 드래그하여 순서 변경</p>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400">불러오는 중...</div>
        ) : covers.length === 0 ? (
          <div className="text-center py-10 text-gray-400 bg-white rounded-2xl">
            아직 등록된 책표지가 없어요
          </div>
        ) : (
          <div ref={listRef} className="space-y-3">
            {covers.map((cover, index) => (
              <div
                key={cover.id}
                onClick={() => {
                  if (longPressTriggeredRef.current) return;
                  if (selectMode) toggleSelect(cover.id);
                }}
                onPointerDown={(e) => {
                  if (!selectMode) handleLongPressStart(cover.id);
                }}
                onPointerUp={handleLongPressEnd}
                onPointerCancel={handleLongPressEnd}
                className={`flex items-center gap-3 bg-white rounded-2xl shadow p-3 border-2 transition-all select-none ${
                  selectMode && selectedIds.has(cover.id)
                    ? "border-primary bg-primary/5"
                    : dragOverIndex !== null && dragIndex !== null && index === dragOverIndex && index !== dragIndex
                      ? "border-blue-400 border-dashed"
                      : "border-gray-100"
                } ${selectMode ? "cursor-pointer" : ""} ${
                  dragIndex === index ? "opacity-50 scale-95" : ""
                } ${cover.isActive === false ? "opacity-60" : ""}`}
              >
                {/* 선택 모드: 체크박스 */}
                {selectMode && (
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedIds.has(cover.id)
                      ? "bg-primary border-primary text-white"
                      : "border-gray-300"
                  }`}>
                    {selectedIds.has(cover.id) && <span className="text-xs font-bold">✓</span>}
                  </div>
                )}
                {/* 일반 모드: 드래그 핸들 */}
                {!selectMode && covers.length > 1 && (
                  <div
                    className="flex-shrink-0 w-8 h-12 flex flex-col items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing text-gray-300 touch-none"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      handleLongPressEnd();
                      handleDragStart(e, index);
                    }}
                    onPointerMove={handleDragMove}
                    onPointerUp={(e) => { e.stopPropagation(); handleDragEnd(); }}
                    onPointerCancel={() => { setDragIndex(null); setDragOverIndex(null); }}
                  >
                    <span className="text-lg leading-none">⠿</span>
                  </div>
                )}
                <img
                  src={cover.previewData || cover.imageData}
                  alt={cover.name}
                  className="w-20 h-28 object-cover rounded-lg flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {editingId === cover.id ? (
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => { e.stopPropagation(); handleLongPressEnd(); }}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditSave(cover);
                          else if (e.key === "Escape") handleEditCancel();
                        }}
                        autoFocus
                        className="flex-1 min-w-0 px-2 py-1 border-2 border-primary rounded-lg text-base font-bold focus:outline-none"
                      />
                    </div>
                  ) : (
                    <p className="font-bold text-lg truncate">{cover.name}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(cover.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                  {cover.maskData && (
                    <span className="text-xs text-green-500 font-medium">크로마키 설정됨</span>
                  )}
                  {!selectMode && (
                    <label
                      className="mt-2 flex items-center justify-between gap-3 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => { e.stopPropagation(); handleLongPressEnd(); }}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-gray-600 font-medium">메인 표시</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={cover.isActive !== false}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateCover({
                            ...cover,
                            isActive: cover.isActive === false,
                          });
                        }}
                        className={`relative inline-flex h-8 w-14 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 btn-touch ${
                          cover.isActive !== false ? "bg-green-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition ${
                            cover.isActive !== false ? "translate-x-6" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </label>
                  )}
                  {!selectMode && (
                    <div
                      className="mt-2 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => { e.stopPropagation(); handleLongPressEnd(); }}
                      onPointerMove={(e) => e.stopPropagation()}
                      onPointerUp={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      <span className="text-xs text-gray-500">기본 줌</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const v = Math.max(1, +(Math.round(((cover.defaultZoom ?? 1) - 0.1) * 10) / 10).toFixed(1));
                          updateCover({ ...cover, defaultZoom: v });
                        }}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-base font-bold btn-touch"
                      >−</button>
                      <div className="flex-1 max-w-[140px] h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${(((cover.defaultZoom ?? 1) - 1) / 4) * 100}%` }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const v = Math.min(5, +(Math.round(((cover.defaultZoom ?? 1) + 0.1) * 10) / 10).toFixed(1));
                          updateCover({ ...cover, defaultZoom: v });
                        }}
                        className="w-7 h-7 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-base font-bold btn-touch"
                      >+</button>
                      <span className="text-xs font-bold w-10 text-right">
                        {(cover.defaultZoom ?? 1).toFixed(1)}x
                      </span>
                    </div>
                  )}
                </div>
                {!selectMode && (
                  <div className="flex flex-col gap-2">
                    {editingId === cover.id ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditSave(cover); }}
                          className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium btn-touch"
                        >
                          저장
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditCancel(); }}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium btn-touch"
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditStart(cover); }}
                          className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium btn-touch"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(cover.id, cover.name); }}
                          className="px-3 py-1.5 bg-danger text-white rounded-lg text-sm font-medium btn-touch"
                        >
                          삭제
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* 워터마크 설정 */}
      {wm && (
        <div className="bg-white rounded-2xl shadow-lg p-5 mt-6 border border-blue-100">
          <h2 className="text-lg font-bold mb-4 text-blue-600">워터마크 설정</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={wm.enabled}
                onChange={(e) => updateWm({ enabled: e.target.checked })}
                className="w-5 h-5 rounded"
              />
              <span className="font-medium">워터마크 사용</span>
            </label>

            {wm.enabled && (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">텍스트 (예: 학교명)</label>
                  <input
                    type="text"
                    value={wm.text}
                    onChange={(e) => updateWm({ text: e.target.value })}
                    placeholder="예: ○○초등학교 도서관"
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl focus:border-blue-400 focus:outline-none"
                  />
                </div>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={wm.showDate}
                    onChange={(e) => updateWm({ showDate: e.target.checked })}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm">촬영 날짜 표시</span>
                </label>

                <div>
                  <label className="block text-sm font-medium mb-1">위치</label>
                  <select
                    value={wm.position}
                    onChange={(e) => updateWm({ position: e.target.value as WatermarkConfig["position"] })}
                    className="w-full px-4 py-2 border-2 border-gray-200 rounded-xl"
                  >
                    <option value="bottom-right">우측 하단</option>
                    <option value="bottom-left">좌측 하단</option>
                    <option value="top-right">우측 상단</option>
                    <option value="top-left">좌측 상단</option>
                  </select>
                </div>

                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">글자 크기</label>
                    <input
                      type="range"
                      min={10}
                      max={32}
                      value={wm.fontSize}
                      onChange={(e) => updateWm({ fontSize: Number(e.target.value) })}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-400">{wm.fontSize}px</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">색상</label>
                    <input
                      type="color"
                      value={wm.color}
                      onChange={(e) => updateWm({ color: e.target.value })}
                      className="w-10 h-10 rounded border-0 cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">투명도</label>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={wm.opacity * 100}
                    onChange={(e) => updateWm({ opacity: Number(e.target.value) / 100 })}
                    className="w-full"
                  />
                  <span className="text-xs text-gray-400">{Math.round(wm.opacity * 100)}%</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* 키오스크 설정 */}
      {kiosk && (
        <div className="bg-white rounded-2xl shadow-lg p-5 mt-6 border border-purple-100">
          <h2 className="text-lg font-bold mb-4 text-purple-600">키오스크 모드</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={kiosk.enabled}
                onChange={(e) => updateKiosk({ enabled: e.target.checked })}
                className="w-5 h-5 rounded accent-purple-600"
              />
              <span className="font-medium">키오스크 모드 사용</span>
            </label>

            {kiosk.enabled && (
              <>
                {/* 전체 화면 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.fullscreen}
                    onChange={(e) => updateKiosk({ fullscreen: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">전체 화면 고정</span>
                    <p className="text-xs text-gray-400">첫 터치 시 전체화면으로 전환</p>
                  </div>
                </label>

                {/* 자동 리셋 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.autoReset}
                    onChange={(e) => updateKiosk({ autoReset: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">무조작 시 자동 리셋</span>
                    <p className="text-xs text-gray-400">일정 시간 조작 없으면 메인화면으로 복귀</p>
                  </div>
                </label>
                {kiosk.autoReset && (
                  <div className="ml-8">
                    <label className="block text-sm font-medium mb-1">대기 시간</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={15}
                        max={180}
                        step={5}
                        value={kiosk.autoResetSeconds}
                        onChange={(e) => updateKiosk({ autoResetSeconds: Number(e.target.value) })}
                        className="flex-1 accent-purple-600"
                      />
                      <span className="text-sm font-bold w-12 text-right">{kiosk.autoResetSeconds}초</span>
                    </div>
                  </div>
                )}

                {/* 결과 화면 자동 복귀 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.resultAutoReturn}
                    onChange={(e) => updateKiosk({ resultAutoReturn: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">결과 화면 자동 복귀</span>
                    <p className="text-xs text-gray-400">저장 후 자동으로 메인화면으로 돌아감</p>
                  </div>
                </label>
                {kiosk.resultAutoReturn && (
                  <div className="ml-8">
                    <label className="block text-sm font-medium mb-1">복귀 시간</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={5}
                        max={60}
                        step={5}
                        value={kiosk.resultReturnSeconds}
                        onChange={(e) => updateKiosk({ resultReturnSeconds: Number(e.target.value) })}
                        className="flex-1 accent-purple-600"
                      />
                      <span className="text-sm font-bold w-12 text-right">{kiosk.resultReturnSeconds}초</span>
                    </div>
                  </div>
                )}

                {/* 뒤로가기 방지 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.preventNavigation}
                    onChange={(e) => updateKiosk({ preventNavigation: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">뒤로가기/새로고침 방지</span>
                    <p className="text-xs text-gray-400">실수로 앱을 벗어나는 것을 방지</p>
                  </div>
                </label>

                {/* 화면 꺼짐 방지 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.wakeLock}
                    onChange={(e) => updateKiosk({ wakeLock: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">화면 꺼짐 방지</span>
                    <p className="text-xs text-gray-400">iPad/기기 화면이 자동으로 꺼지지 않음</p>
                  </div>
                </label>

                {/* 꾸미기 버튼 노출 */}
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={kiosk.showDecorate}
                    onChange={(e) => updateKiosk({ showDecorate: e.target.checked })}
                    className="w-5 h-5 rounded accent-purple-600"
                  />
                  <div>
                    <span className="text-sm font-medium">꾸미기 버튼 표시</span>
                    <p className="text-xs text-gray-400">결과 화면에서 스티커 꾸미기 버튼 노출 여부</p>
                  </div>
                </label>

                <p className="text-xs text-gray-400 bg-purple-50 rounded-lg p-3">
                  키오스크 모드 활성화 시 메인화면에서 관리자 링크가 숨겨집니다.
                  관리자 페이지 접근: 로고를 5번 연속 탭하세요.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
