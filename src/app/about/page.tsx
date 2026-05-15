import type { Metadata } from "next";
import Link from "next/link";
import { AccordionSection } from "@/components/AccordionSection";

export const metadata: Metadata = {
  title: "소개 | Book Photo Booth",
  description:
    "Book Photo Booth는 아이들이 책 표지 프레임을 고르고 책 분위기 속에서 사진을 남기는 독서축제용 포토부스 웹사이트입니다.",
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

        <div className="space-y-4 text-gray-700 leading-relaxed">
          <AccordionSection title="무엇을 하는 웹사이트인가요?">
            <p>
              Book Photo Booth는 아이들이 좋아하는 책 표지 프레임을 고르고, 그
              책의 분위기 속에서 사진을 찍어 특별한 추억을 남길 수 있는 작은
              포토부스 웹사이트입니다.
            </p>
            <p>
              사진을 찍는 순간, 아이들은 단순히 책을 보는 독자가 아니라 책 속
              장면에 들어간 주인공이 됩니다. 수박 수영장에 놀러 간 것처럼,
              긴긴밤의 세계를 함께 걷는 것처럼, 책마다 가진 색깔과 분위기를
              사진 속에 담을 수 있습니다.
            </p>
            <p>
              독서축제 현장에서 아이들이 책을 더 즐겁고 가깝게 느낄 수 있도록
              만들었고, 찍은 사진은 추억으로 간직할 수 있습니다.
            </p>
          </AccordionSection>

          <AccordionSection title="왜 만들었나요?">
            <p>
              이 포토부스 웹사이트는 제주도 한동초등학교에 다니는 딸을 위해
              만들기 시작했습니다.
            </p>
            <p>
              학교에서 열리는 독서축제에서 아이들이 책을 조금 더 재미있게 만나면
              좋겠다는 생각이 들었습니다. 책을 읽는 것뿐만 아니라, 책 속에
              들어가 보고, 책의 분위기를 몸으로 느끼고, 친구들과 웃으며 사진을
              남길 수 있다면 아이들에게 더 오래 기억되는 독서 경험이 될 거라고
              생각했습니다.
            </p>
            <p>처음에는 아주 작은 아이디어였습니다.</p>
            <blockquote className="border-l-4 border-primary/40 pl-4 text-gray-600 italic">
              “우리 아이가 좋아하면 좋겠다.”
              <br />
              “친구들도 함께 즐거워하면 좋겠다.”
            </blockquote>
            <p>그 마음에서 하나씩 만들기 시작했습니다.</p>
            <p>
              아이들이 책을 어렵거나 멀게 느끼지 않고, “나도 책 속 주인공이 될
              수 있구나!” 하고 느끼는 순간을 선물하고 싶었습니다.
            </p>
            <p>
              거창한 이유보다, 그저 아빠의 마음으로 만들었습니다. 딸에게, 그리고
              함께 자라는 아이들에게 책과 가까워지는 따뜻한 경험을 남겨주고
              싶었습니다.
            </p>
          </AccordionSection>

          <AccordionSection title="이 웹사이트에서 기대하는 것">
            <p>
              Book Photo Booth가 아이들에게 책을 더 친근하게 느끼는 계기가
              되었으면 합니다.
            </p>
            <p>
              책 표지를 고르고, 사진을 찍고, 결과물을 보며 웃는 과정 속에서
              아이들이 자연스럽게 책의 제목을 기억하고, 책의 분위기를 느끼고,
              “이 책 한번 읽어보고 싶다”는 마음까지 생긴다면 더없이 좋겠습니다.
            </p>
            <p>
              이 작은 포토부스가 독서축제의 한 장면으로 남고, 아이들의 마음속에는
              책과 함께한 즐거운 추억으로 오래 남기를 바랍니다.
            </p>
          </AccordionSection>

          <aside className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-4">
            <h2 className="mb-2 text-sm font-bold text-primary">한 줄 소개</h2>
            <p className="m-0 text-gray-800 leading-relaxed">
              Book Photo Booth는 아이들이 책 속 주인공이 되어 사진을 남기는,
              따뜻한 독서축제 포토부스입니다.
            </p>
          </aside>
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
