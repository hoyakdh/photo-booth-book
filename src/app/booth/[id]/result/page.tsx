"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useRef, useCallback, useEffect } from "react";
import { usePhotoStore } from "@/store/usePhotoStore";
import { useBookCover } from "@/hooks/useBookCovers";
import StickerEditor from "@/components/StickerEditor";
import BindingLoader from "@/components/result/BindingLoader";
import { createGif } from "@/lib/gifEncoder";
import { uploadToDrive } from "@/lib/drive";
import { loadKioskConfig } from "@/lib/kiosk";

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
  const [driveState, setDriveState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [askGoHome, setAskGoHome] = useState(false);
  const [localSaving, setLocalSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showDecorate, setShowDecorate] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const k = loadKioskConfig();
    setShowDecorate(!k.enabled || k.showDecorate);
    if (photos.length === 0) {
      setIsLoading(false);
      return;
    }
    if (k.enabled && k.showResultLoading === false) {
      setIsLoading(false);
      return;
    }
    const t = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(t);
  }, [photos.length]);
  const printRef = useRef<HTMLDivElement>(null);
  const gifFrames = usePhotoStore((s) => s.gifFrames);

  const selectedPhoto = photos[selectedIdx];
  const busy = driveState === "uploading" || localSaving || gifCreating || printing || sharing || isLoading;

  const handleDownload = useCallback(async () => {
    if (!selectedPhoto) return;
    setLocalSaving(true);
    try {
    const ts = Date.now();

    // PNG 준비
    const pngRes = await fetch(selectedPhoto.imageData);
    const pngBlob = await pngRes.blob();
    const pngFile = new File([pngBlob], `photo-booth-${ts}.png`, { type: "image/png" });

    // GIF 프레임이 있으면 같이 준비
    let gifFile: File | null = null;
    if (gifFrames.length > 0) {
      try {
        setGifCreating(true);
        const gifBlob = await createGif(gifFrames, 8, 10);
        gifFile = new File([gifBlob], `photo-booth-${ts}.gif`, { type: "image/gif" });
      } catch (err) {
        console.error("GIF 생성 실패:", err);
      } finally {
        setGifCreating(false);
      }
    }

    const filesForShare = gifFile ? [pngFile, gifFile] : [pngFile];

    // 공유 시트로 두 파일 한 번에 시도
    if (navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: filesForShare })) {
          await navigator.share({ files: filesForShare });
          setSaved(true);
          return;
        }
      } catch {
        // 사용자가 취소한 경우 — fallback으로 진행
      }
    }

    // Fallback: blob URL 다운로드 (PNG → GIF 순차)
    const triggerDownload = (file: File) => {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    triggerDownload(pngFile);
    if (gifFile) {
      // 브라우저가 다중 다운로드를 허용하도록 살짝 지연
      await new Promise((r) => setTimeout(r, 300));
      triggerDownload(gifFile);
    }
    setSaved(true);
    setAskGoHome(true);
    } finally {
      setLocalSaving(false);
    }
  }, [selectedPhoto, gifFrames]);

  const handleShare = useCallback(async () => {
    if (!selectedPhoto) return;
    if (typeof navigator === "undefined" || !navigator.share) {
      alert("이 기기는 공유 기능을 지원하지 않습니다. '저장'을 이용해 주세요.");
      return;
    }
    setSharing(true);
    try {
      const ts = Date.now();
      const pngBlob = await (await fetch(selectedPhoto.imageData)).blob();
      const pngFile = new File([pngBlob], `photo-booth-${ts}.png`, { type: "image/png" });

      const files: File[] = [pngFile];
      if (gifFrames.length > 0) {
        try {
          setGifCreating(true);
          const gifBlob = await createGif(gifFrames, 8, 10);
          files.push(new File([gifBlob], `photo-booth-${ts}.gif`, { type: "image/gif" }));
        } catch (e) {
          console.error("GIF 생성 실패:", e);
        } finally {
          setGifCreating(false);
        }
      }

      const shareData: ShareData = { files, title: "포토부스 결과", text: "나만의 포토북 📸" };
      if (navigator.canShare && !navigator.canShare(shareData)) {
        await navigator.share({ title: shareData.title, text: shareData.text });
      } else {
        await navigator.share(shareData);
      }
      setSaved(true);
    } catch (err) {
      if ((err as DOMException)?.name !== "AbortError") {
        console.error("공유 실패:", err);
        alert("공유에 실패했습니다.");
      }
    } finally {
      setSharing(false);
    }
  }, [selectedPhoto, gifFrames]);

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

  const handleDriveSave = useCallback(async () => {
    if (!selectedPhoto) return;
    setDriveError(null);
    setDriveState("uploading");
    try {
      const ts = Date.now();

      // PNG 준비
      const pngRes = await fetch(selectedPhoto.imageData);
      const pngBlob = await pngRes.blob();
      const files: { blob: Blob; name: string; mime: string }[] = [
        { blob: pngBlob, name: `photo-booth-${ts}.png`, mime: "image/png" },
      ];

      // GIF 프레임이 있으면 GIF도 함께 업로드
      if (gifFrames.length > 0) {
        const gifBlob = await createGif(gifFrames, 8, 10);
        files.push({ blob: gifBlob, name: `photo-booth-${ts}.gif`, mime: "image/gif" });
      }

      await uploadToDrive(files);
      setDriveState("done");
      setAskGoHome(true);
    } catch (err) {
      console.error("드라이브 업로드 실패:", err);
      setDriveError(err instanceof Error ? err.message : "업로드 실패");
      setDriveState("error");
    }
  }, [selectedPhoto, gifFrames]);

  const handlePrint = useCallback(() => {
    if (!selectedPhoto) return;
    setPrinting(true);

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
      setPrinting(false);
    };

    const doc = iframe.contentDocument;
    if (!doc) {
      cleanup();
      return;
    }

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>print</title>
<style>
  @page { margin: 0; }
  html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #fff; }
  .wrap { width: 100%; height: 100vh; display: flex; align-items: center; justify-content: center; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body>
  <div class="wrap"><img id="p" src="${selectedPhoto.imageData}" /></div>
</body>
</html>`);
    doc.close();

    const run = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          cleanup();
          return;
        }
        win.focus();
        win.print();
        setAskGoHome(true);
      } catch (err) {
        console.error("프린트 실패:", err);
      } finally {
        cleanup();
      }
    };

    const img = doc.getElementById("p") as HTMLImageElement | null;
    if (img && !img.complete) {
      img.onload = run;
      img.onerror = () => {
        console.error("프린트 이미지 로드 실패");
        cleanup();
      };
    } else {
      run();
    }
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
      {isLoading && <BindingLoader />}
      {/* 스티커 에디터 */}
      {showSticker && selectedPhoto && (
        <StickerEditor
          imageData={selectedPhoto.imageData}
          onSave={handleStickerSave}
          onCancel={() => setShowSticker(false)}
        />
      )}

      {/* 저장 완료 후 홈 이동 확인 */}
      {askGoHome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-xl font-bold mb-2">저장 완료!</p>
            <p className="text-gray-500 text-sm mb-6">
              홈 화면으로 돌아갈까요?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setAskGoHome(false)}
                className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-2xl font-bold btn-touch"
              >
                계속 보기
              </button>
              <button
                onClick={() => {
                  setAskGoHome(false);
                  handleHome();
                }}
                className="flex-1 py-3 bg-primary text-white rounded-2xl font-bold btn-touch"
              >
                홈으로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className="flex items-center justify-center px-4 py-3 bg-white shadow-sm">
        <h1 className="font-bold text-lg">
          {cover?.name || "결과"}
        </h1>
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
              disabled={busy}
              className={`flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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

      {/* 드라이브 상태 토스트 */}
      {driveState !== "idle" && (
        <div
          className={`mx-4 mb-2 px-3 py-2 rounded-xl text-sm font-medium text-center ${
            driveState === "uploading"
              ? "bg-gray-100 text-gray-700"
              : driveState === "done"
              ? "bg-success text-white"
              : "bg-danger text-white"
          }`}
        >
          {driveState === "uploading" && "구글 드라이브에 업로드 중..."}
          {driveState === "done" && "구글 드라이브에 저장되었습니다"}
          {driveState === "error" && `저장 실패: ${driveError ?? ""}`}
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="flex gap-2 px-4 py-4 bg-white flex-wrap">
        <button
          onClick={handleDriveSave}
          disabled={busy}
          className={`flex-1 py-4 rounded-2xl font-bold text-base btn-touch transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            driveState === "done" ? "bg-success text-white" : "bg-primary text-white"
          }`}
        >
          {driveState === "uploading"
            ? "업로드중..."
            : driveState === "done"
            ? "저장 완료!"
            : "구글 드라이브 저장"}
        </button>
        <button
          onClick={handleDownload}
          disabled={busy}
          className={`py-3 px-3 rounded-2xl font-bold text-sm btn-touch transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            saved ? "bg-success text-white" : "bg-blue-500 text-white"
          }`}
        >
          {localSaving ? "저장중..." : saved ? "저장 완료!" : "저장"}
        </button>
        <button
          onClick={handleShare}
          disabled={busy || !selectedPhoto}
          className="py-3 px-3 bg-teal-500 text-white rounded-2xl font-bold text-sm btn-touch disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sharing ? "공유중..." : "공유"}
        </button>
        {showDecorate && (
          <button
            onClick={() => setShowSticker(true)}
            disabled={busy}
            className="py-3 px-3 bg-pink-400 text-white rounded-2xl font-bold text-sm btn-touch disabled:opacity-50 disabled:cursor-not-allowed"
          >
            꾸미기
          </button>
        )}
        <button
          onClick={handlePrint}
          disabled={busy || !selectedPhoto}
          className="py-3 px-3 bg-purple-500 text-white rounded-2xl font-bold text-sm btn-touch disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {printing ? "프린트중..." : "프린트"}
        </button>
        <button
          onClick={handleRetake}
          disabled={busy}
          className="py-3 px-3 bg-secondary text-white rounded-2xl font-bold text-sm btn-touch disabled:opacity-50 disabled:cursor-not-allowed"
        >
          다시촬영
        </button>
        <button
          onClick={handleHome}
          disabled={busy}
          className="py-3 px-3 bg-gray-300 text-gray-700 rounded-2xl font-bold text-sm btn-touch disabled:opacity-50 disabled:cursor-not-allowed"
        >
          홈
        </button>
      </div>
    </div>
  );
}
