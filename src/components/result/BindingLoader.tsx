"use client";

import { useEffect, useState } from "react";

const STEPS = [
  "사진을 정리하고 있어요",
  "표지를 입히는 중이에요",
  "제본 마무리 중...",
];

export default function BindingLoader() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1000);
    const t2 = setTimeout(() => setStep(2), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background:
          "linear-gradient(160deg, #FFF8EF 0%, #F7E8CC 55%, #F2E4C9 100%)",
      }}
    >
      <div className="relative mb-10">
        <span className="text-[7rem] leading-none animate-page-flip">📖</span>
        <span className="absolute -top-2 -right-4 text-3xl animate-sparkle">✨</span>
        <span
          className="absolute -bottom-2 -left-5 text-2xl animate-sparkle"
          style={{ animationDelay: "0.4s" }}
        >
          ✨
        </span>
        <span
          className="absolute top-6 -left-8 text-xl animate-sparkle"
          style={{ animationDelay: "0.8s" }}
        >
          ✨
        </span>
      </div>

      <p
        key={step}
        className="text-xl font-bold text-gray-800 animate-fade-in mb-4"
      >
        {STEPS[step]}
      </p>

      <div className="flex gap-2 mb-8" aria-hidden>
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i <= step ? "bg-primary" : "bg-gray-300"
            }`}
          />
        ))}
      </div>

      <div className="w-56 h-1 rounded-full bg-white/60 overflow-hidden">
        <div className="h-full bg-primary animate-progress" />
      </div>
    </div>
  );
}
