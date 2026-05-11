"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  Suspense,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { fileToDataURL, resizeImage, dataURLtoBlob } from "@/lib/utils";
import {
  PHOTOCARD_W_MM as CARD_W_MM,
  PHOTOCARD_H_MM as CARD_H_MM,
} from "@/lib/photocardAspect";
import { savePrintJob, getPrintJob } from "@/lib/db";
import type { PrintJob } from "@/types";

const SLOT_COUNT = 9;

const GRID_GAP_MM = 3;

function PhotocardPrintInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = searchParams.get("jobId");

  const [slots, setSlots] = useState<(string | null)[]>(() =>
    Array.from({ length: SLOT_COUNT }, () => null)
  );
  const [printing, setPrinting] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loadingJob, setLoadingJob] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slotIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    setLoadingJob(true);
    (async () => {
      try {
        const job = await getPrintJob(jobId);
        if (cancelled) return;
        if (!job) {
          alert("기록을 찾을 수 없습니다.");
          return;
        }
        const next = Array.from(
          { length: SLOT_COUNT },
          (_, i) => job.slots[i] ?? null
        );
        setSlots(next);
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          alert("기록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoadingJob(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const openFileForSlot = (index: number) => {
    slotIndexRef.current = index;
    fileInputRef.current?.click();
  };

  const processFiles = async (files: File[], startIdx: number) => {
    setLoadingSlots(true);
    try {
      const results = await Promise.all(
        files.map(async (file) => {
          const dataURL = await fileToDataURL(file);
          return resizeImage(dataURL);
        })
      );

      setSlots((prev) => {
        const next = [...prev];
        let ri = 0;
        for (let j = startIdx; j < SLOT_COUNT && ri < results.length; j++) {
          if (next[j] === null) {
            next[j] = results[ri++];
          }
        }
        const skipped = results.length - ri;
        if (skipped > 0) {
          queueMicrotask(() =>
            alert(
              `선택한 이미지 중 ${skipped}장은 클릭한 위치부터 비어 있는 칸이 없어 넣지 못했습니다.`
            )
          );
        }
        return next;
      });
    } catch (err) {
      console.error(err);
      alert("이미지를 불러오지 못했습니다.");
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const idx = slotIndexRef.current;
    e.target.value = "";
    slotIndexRef.current = null;
    if (files.length === 0 || idx === null) return;
    await processFiles(files, idx);
  };

  const clearSlot = useCallback((index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }, []);

  const hasFilledSlot = useMemo(() => slots.some((s) => s != null), [slots]);

  const clearAllSlots = useCallback(() => {
    setSlots(Array.from({ length: SLOT_COUNT }, () => null));
  }, []);

  const fillAllFromFirst = () => {
    const first = slots[0];
    if (!first) {
      alert("1번 슬롯에 이미지를 먼저 넣어주세요.");
      return;
    }
    setSlots(Array.from({ length: SLOT_COUNT }, () => first));
  };

  const handlePrint = useCallback(async () => {
    setPrinting(true);

    const job: PrintJob = {
      id: uuidv4(),
      slots: [...slots],
      printedAt: Date.now(),
    };
    try {
      await savePrintJob(job);
    } catch (e) {
      console.error("인쇄 기록 저장 실패:", e);
      alert(
        "인쇄 기록을 저장하지 못했습니다. 인쇄는 계속 진행합니다."
      );
    }

    const blobUrls: string[] = [];
    const resolvedSlots = slots.map((src) => {
      if (!src) return null;
      const blob = dataURLtoBlob(src);
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      return url;
    });

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const teardown = () => {
      blobUrls.forEach((u) => URL.revokeObjectURL(u));
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
      setPrinting(false);
    };

    const cellsHtml = resolvedSlots
      .map((src) =>
        src
          ? `<div class="card"><img src="${src}" alt="" /></div>`
          : `<div class="card card--empty"></div>`
      )
      .join("");

    const doc = iframe.contentDocument;
    if (!doc) {
      teardown();
      return;
    }

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>포토카드 인쇄</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
    }
  }
  .page {
    width: 21cm;
    height: 29.7cm;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, ${CARD_W_MM}mm);
    grid-template-rows: repeat(3, ${CARD_H_MM}mm);
    gap: ${GRID_GAP_MM}mm;
  }
  .card {
    width: ${CARD_W_MM}mm;
    height: ${CARD_H_MM}mm;
    overflow: hidden;
    background: #fff;
    box-sizing: border-box;
  }
  .card--empty { background: #fff; }
  .card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="grid">${cellsHtml}</div>
  </div>
</body>
</html>`);
    doc.close();

    const run = () => {
      try {
        const win = iframe.contentWindow;
        if (!win) {
          teardown();
          return;
        }
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          teardown();
        };
        win.addEventListener("afterprint", finish, { once: true });
        setTimeout(finish, 60_000);
        win.focus();
        win.print();
      } catch (err) {
        console.error("프린트 실패:", err);
        alert("인쇄를 시작하지 못했습니다.");
        teardown();
      }
    };

    const imgs = doc.querySelectorAll("img");
    let pending = 0;
    imgs.forEach((img) => {
      if (!img.complete) {
        pending++;
        img.onload = img.onerror = check;
      }
    });
    function check() {
      pending--;
      if (pending <= 0) run();
    }
    if (pending === 0) run();
  }, [slots]);

  return (
    <div className="min-h-[100dvh] p-4 max-w-3xl mx-auto pb-24">
      <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="px-3 py-2 bg-gray-200 rounded-xl text-sm font-medium btn-touch"
          >
            ← 관리자
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            포토카드 인쇄
          </h1>
        </div>
        <button
          type="button"
          onClick={() => router.push("/admin/photocard/history")}
          className="px-3 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold btn-touch"
        >
          기록 보기
        </button>
      </header>

      {loadingJob && (
        <p className="text-sm text-gray-600 mb-4">기록 불러오는 중…</p>
      )}

      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 mb-6 text-sm text-amber-900 space-y-2">
        <p className="font-bold">인쇄 안내</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            용지: <strong>A4</strong>, 방향: <strong>세로(Portrait)</strong>
          </li>
          <li>
            브라우저 인쇄 설정에서 <strong>배율 100%</strong>(맞춤/축소 해제)와{" "}
            <strong>여백 없음</strong>(또는 최소)을 선택하면 표기 치수에 가깝게
            출력됩니다.
          </li>
          <li>
            카드 한 장 크기: 가로 5.5cm(55mm) × 세로 8.5cm(85mm), 한 페이지에
            9장(3×3) 배치됩니다.
          </li>
          <li>
            슬롯을 누르면 이미지를 <strong>여러 장 선택</strong>할 수 있습니다.
            선택 순서대로 <strong>빈 칸만</strong> 채워지며, 클릭한 칸{" "}
            <strong>이후</strong> 칸 순서만 사용됩니다 (이미 사진이 있는 칸은
            건너뜀).
          </li>
        </ul>
        <p className="text-amber-800 border-t border-amber-300 pt-2 mt-1">
          ⚠️ <strong>주의:</strong> 인쇄 기록은 이 기기의 브라우저 로컬 저장소에만
          보관됩니다. 브라우저 데이터(캐시·사이트 데이터)를 삭제하거나 다른
          기기·브라우저에서 접속하면 기록이 사라질 수 있습니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={fillAllFromFirst}
          disabled={loadingSlots || loadingJob}
          className="px-4 py-3 bg-gray-700 text-white rounded-xl text-sm font-bold btn-touch disabled:opacity-50"
        >
          전체 같은 이미지로 채우기 (1번 기준)
        </button>
        <button
          type="button"
          onClick={() => void handlePrint()}
          disabled={printing || loadingSlots || loadingJob}
          className="px-4 py-3 bg-purple-600 text-white rounded-xl text-sm font-bold btn-touch disabled:opacity-50"
        >
          {printing ? "인쇄 준비중…" : "인쇄"}
        </button>
        <button
          type="button"
          onClick={clearAllSlots}
          disabled={
            !hasFilledSlot || loadingSlots || loadingJob || printing
          }
          className="px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-bold btn-touch disabled:opacity-50 hover:bg-red-700"
        >
          전체 초기화
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <p className="text-sm text-gray-600 mb-3">
        각 칸을 눌러 한 장 또는 여러 장을 넣습니다. 교체가 필요하면 ×로 빈 칸으로
        만든 뒤 다시 넣어 주세요.
      </p>

      <div className="flex justify-center overflow-x-auto py-2">
        <div
          className="bg-white shadow-xl border border-gray-200 rounded-sm"
          style={{
            transform: "scale(0.55)",
            transformOrigin: "top center",
            marginBottom: "-12rem",
          }}
        >
          <div
            className="flex items-center justify-center bg-white"
            style={{ width: "21cm", height: "29.7cm" }}
          >
            <div
              className="grid"
              style={{
                gridTemplateColumns: `repeat(3, ${CARD_W_MM}mm)`,
                gridTemplateRows: `repeat(3, ${CARD_H_MM}mm)`,
                gap: `${GRID_GAP_MM}mm`,
              }}
            >
              {slots.map((src, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => openFileForSlot(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openFileForSlot(i);
                    }
                  }}
                  className="relative overflow-hidden bg-gray-50 text-left cursor-pointer border border-gray-300 border-dashed focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-1"
                  style={{ width: `${CARD_W_MM}mm`, height: `${CARD_H_MM}mm` }}
                >
                  {src ? (
                    <>
                      <img
                        src={src}
                        alt={`슬롯 ${i + 1}`}
                        className="w-full h-full object-cover block pointer-events-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSlot(i);
                        }}
                        className="absolute top-1.5 right-1.5 z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/70 text-xl font-bold text-white ring-1 ring-white/60 transition-all hover:scale-110 hover:bg-red-600"
                        aria-label={`슬롯 ${i + 1} 비우기`}
                      >
                        ×
                      </button>
                      <span className="absolute bottom-1 left-1 bg-black/55 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
                        {i + 1}
                      </span>
                    </>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1 pointer-events-none">
                      <span className="text-3xl font-light">+</span>
                      <span className="text-xs font-medium">{i + 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PhotocardPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[100dvh] p-4 flex items-center justify-center text-gray-600">
          불러오는 중…
        </div>
      }
    >
      <PhotocardPrintInner />
    </Suspense>
  );
}
