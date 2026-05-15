import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개 | Book Photo Booth",
  description:
    "Book Photo Booth는 한동초등학교 독서축제를 위해 아이들이 책과 함께 즐길 수 있도록 만든 포토부스 웹사이트입니다.",
};

export default function AboutPage() {
  return (
    <div className="min-h-0 flex-1 px-4 py-8">
      <article className="mx-auto max-w-2xl rounded-3xl border border-orange-100 bg-white p-6 shadow-lg sm:p-8">
        <header className="mb-8 text-center">
          <p className="mb-2 text-sm font-semibold text-primary">
            책 속으로 들어가는 포토부스
          </p>
          <h1 className="text-3xl font-black text-foreground">
            Book Photo Booth 소개
          </h1>
        </header>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section>
            <h2 className="mb-3 text-lg font-bold text-primary">
              무엇을 하는 웹사이트인가요?
            </h2>
            <p>
              책표지 프레임을 고른 뒤, 그 책 분위기 안에서 사진을 찍고 결과를
              남길 수 있는 간단한 포토부스 웹사이트예요. 독서 행사에서 아이들이
              책과 함께 추억을 만들 수 있도록 만들었습니다.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-primary">
              왜 만들었나요?
            </h2>
            <p className="mb-3">
              이 포토부스 웹사이트는 제주도 한동초등학교에 다니는 딸을 위해
              만들었습니다. 학교에서 하는 독서축제에서 아이들에게 책으로
              즐거움을 주고 싶다는 마음에서 기획하게 되었고, 차근차근 만들었어요.
            </p>
            <p>
              아이들이 책을 더 가깝게 느끼고, 마치 책 속 장면의 주인공이 된 듯한
              경험을 선물하면 좋겠다는 생각이었습니다. 그게 제게는 그저 아빠의
              마음이었습니다.
            </p>
          </section>
        </div>

        <footer className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex justify-center rounded-xl bg-gray-200 px-5 py-3 text-center text-sm font-bold text-gray-800 btn-touch"
          >
            홈으로 가기
          </Link>
          <Link
            href="/admin"
            className="inline-flex justify-center rounded-xl bg-primary px-5 py-3 text-center text-sm font-bold text-white btn-touch"
          >
            관리자 페이지
          </Link>
        </footer>
      </article>
    </div>
  );
}
