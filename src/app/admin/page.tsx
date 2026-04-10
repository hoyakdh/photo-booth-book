"use client";

import { useState, useRef, useEffect } from "react";
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
  const { covers, loading, addCover, removeCover } = useBookCovers();
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

  const handleSubmit = async () => {
    if (!name.trim() || !preview) return;
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
          <a
            href="https://drive.google.com/uc?export=download&id=1G0zJE-mhaK9BiBHdiOjiK4C5CVkwJTEk"
            download
            className="px-4 py-2 bg-gray-600 text-white rounded-xl text-sm font-bold btn-touch text-center"
          >
            샘플 파일 다운로드
          </a>
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
                src={cover.previewData || cover.imageData}
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
