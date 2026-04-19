"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllPrintJobs, deletePrintJob } from "@/lib/db";
import type { PrintJob } from "@/types";

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function A4Preview({ slots }: { slots: (string | null)[] }) {
  const cells = Array.from({ length: 9 }, (_, i) => slots[i] ?? null);
  return (
    <div
      className="absolute inset-0 bg-white"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "repeat(3, 1fr)",
        gap: "2px",
        padding: "6px",
      }}
    >
      {cells.map((src, i) => (
        <div key={i} className="overflow-hidden bg-gray-100">
          {src ? (
            <img
              src={src}
              alt=""
              className="w-full h-full object-cover block"
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function PhotocardPrintHistoryPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllPrintJobs();
      setJobs(list);
    } catch (e) {
      console.error(e);
      alert("기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("이 기록을 삭제할까요?")) return;
    setDeletingId(id);
    try {
      await deletePrintJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e) {
      console.error(e);
      alert("삭제하지 못했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-[100dvh] p-4 max-w-4xl mx-auto pb-24">
      <header className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => router.push("/admin/photocard")}
            className="px-3 py-2 bg-gray-200 rounded-xl text-sm font-medium btn-touch"
          >
            ← 포토카드 인쇄
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">
            인쇄 기록
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-sm font-medium btn-touch disabled:opacity-50"
        >
          새로고침
        </button>
      </header>

      <p className="text-sm text-gray-600 mb-6">
        인쇄할 때마다 9슬롯 구성이 저장됩니다. &quot;다시 불러오기&quot;로 같은
        구성을 편집·재출력할 수 있습니다.
      </p>

      {loading && (
        <p className="text-gray-600">불러오는 중…</p>
      )}

      {!loading && jobs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center text-gray-600">
          <p className="font-medium mb-1">저장된 인쇄 기록이 없습니다.</p>
          <p className="text-sm mb-4">
            포토카드 인쇄 페이지에서 &quot;인쇄&quot;를 누르면 여기에
            쌓입니다.
          </p>
          <button
            type="button"
            onClick={() => router.push("/admin/photocard")}
            className="px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold btn-touch"
          >
            포토카드 인쇄로 이동
          </button>
        </div>
      )}

      {!loading && jobs.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => {
            return (
              <li
                key={job.id}
                className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col"
              >
                <div className="aspect-[21/29.7] bg-white relative overflow-hidden border-b border-gray-100">
                  <A4Preview slots={job.slots} />
                </div>
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <p className="text-xs text-gray-500">
                    {formatDate(job.printedAt)}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-auto">
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/admin/photocard?jobId=${encodeURIComponent(job.id)}`
                        )
                      }
                      className="flex-1 min-w-[7rem] px-3 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold btn-touch"
                    >
                      다시 불러오기
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(job.id)}
                      disabled={deletingId === job.id}
                      className="px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-bold btn-touch disabled:opacity-50"
                    >
                      {deletingId === job.id ? "삭제 중…" : "삭제"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
