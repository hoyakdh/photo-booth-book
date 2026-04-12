"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";
import { generateId, fileToDataURL, resizeImage } from "@/lib/utils";
import { BookCover } from "@/types";
import ChromaKeyEditor from "@/components/ChromaKeyEditor";
import { WatermarkConfig, loadWatermarkConfig, saveWatermarkConfig } from "@/lib/watermark";
import { exportBookCovers, importBookCovers } from "@/lib/backup";
import { KioskConfig, loadKioskConfig, saveKioskConfig } from "@/lib/kiosk";

export default function AdminPage() {
  const router = useRouter();
  const { covers, loading, addCover, removeCover, updateCover, reorderCovers } = useBookCovers();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [maskData, setMaskData] = useState<string | null>(null);
  const [chromaPreview, setChromaPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showChromaEditor, setShowChromaEditor] = useState(false);
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
    setPreview(resized);
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

  const handleDelete = async (id: string) => {
    if (confirm("정말 삭제할까요?")) {
      await removeCover(id);
    }
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

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const selectedNames = covers
      .filter((c) => selectedIds.has(c.id))
      .map((c) => c.name);
    const nameList = selectedNames.length <= 5
      ? selectedNames.map((n) => `  - ${n}`).join("\n")
      : selectedNames.slice(0, 5).map((n) => `  - ${n}`).join("\n") + `\n  ...외 ${selectedNames.length - 5}개`;
    const label = selectedIds.size === covers.length ? "전체" : `선택한 ${selectedIds.size}개의`;
    if (!confirm(`${label} 책표지를 삭제할까요?\n\n${nameList}`)) return;
    for (const sid of selectedIds) {
      await removeCover(sid);
    }
    setSelectedIds(new Set());
    setSelectMode(false);
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

      {/* 안내 문구 */}
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 text-sm text-amber-800">
        <p className="font-bold mb-1">안내사항</p>
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
          <button
            onClick={() => {
              if (confirm("샘플 파일 다운로드후 백업 가져오기에 불러오면 됩니다.")) {
                window.open("https://drive.google.com/uc?export=download&id=13hRpwNVP0BnQJyKJANuxCF6hVUMXl8eJ", "_blank");
              }
            }}
            className="px-4 py-2 bg-gray-600 text-white rounded-xl text-sm font-bold btn-touch text-center"
          >
            샘플 파일 다운로드
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
                }`}
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
                  <p className="font-bold text-lg truncate">{cover.name}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(cover.createdAt).toLocaleDateString("ko-KR")}
                  </p>
                  {cover.maskData && (
                    <span className="text-xs text-green-500 font-medium">크로마키 설정됨</span>
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
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(cover.id); }}
                      className="px-3 py-1.5 bg-danger text-white rounded-lg text-sm font-medium btn-touch"
                    >
                      삭제
                    </button>
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
