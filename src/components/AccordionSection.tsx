"use client";

import { type ReactNode, useId, useState } from "react";

type AccordionSectionProps = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

export function AccordionSection({
  title,
  children,
  defaultOpen = false,
}: AccordionSectionProps) {
  const headerId = useId();
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-2xl border border-orange-100 bg-orange-50/40">
      <h2 className="m-0 text-lg font-bold text-primary">
        <button
          id={headerId}
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-orange-50/80 btn-touch"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{title}</span>
          <span
            className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            <ChevronDownIcon />
          </span>
        </button>
      </h2>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 px-4 pb-4 pt-0 text-gray-700 leading-relaxed">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

function ChevronDownIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
