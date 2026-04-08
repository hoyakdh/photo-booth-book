"use client";

import { useRouter } from "next/navigation";
import { useBookCovers } from "@/hooks/useBookCovers";

export default function HomePage() {
  const router = useRouter();
  const { covers, loading } = useBookCovers();

  return (
    <div className="min-h-[100dvh] flex flex-col">
      {/* 헤더 */}
      <header className="text-center py-6 px-4">
        <h1 className="text-3xl sm:text-4xl font-black text-primary">
          Book Photo Booth
        </h1>
        <p className="text-base sm:text-lg text-gray-500 mt-1">
          책 속으로 들어가 보자!
        </p>
      </header>

      {/* 책표지 그리드 */}
      <main className="flex-1 px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-60">
            <div className="text-xl text-gray-400">불러오는 중...</div>
          </div>
        ) : covers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <p className="text-xl text-gray-400">아직 등록된 책이 없어요</p>
            <button
              onClick={() => router.push("/admin")}
              className="px-6 py-3 bg-primary text-white rounded-2xl font-bold text-lg btn-touch"
            >
              책표지 등록하러 가기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {covers.map((cover) => (
              <button
                key={cover.id}
                onClick={() => router.push(`/booth/${cover.id}`)}
                className="group bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-transparent hover:border-primary active:scale-95 transition-all duration-200"
              >
                <div className="aspect-[3/4] overflow-hidden">
                  <img
                    src={cover.previewData || cover.imageData}
                    alt={cover.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="p-2 text-center">
                  <p className="font-bold text-sm sm:text-base truncate">
                    {cover.name}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* 하단 */}
      <footer className="p-4 text-center">
        <button
          onClick={() => router.push("/admin")}
          className="text-sm text-gray-400 underline"
        >
          관리자 페이지
        </button>
      </footer>
    </div>
  );
}
