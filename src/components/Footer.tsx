/** 연락처 · 저작자 표시 (필요 시 값만 수정하면 됩니다) */
const CONTACT_EMAIL = "hoyakdh@icloud.com";
const COPYRIGHT_HOLDER = "KIM DONGHO";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-orange-100/80 bg-gradient-to-b from-transparent to-orange-50/50 py-4 text-center text-xs text-gray-500">
      <a
        href={`mailto:${CONTACT_EMAIL}`}
        className="underline decoration-gray-400 underline-offset-2 hover:text-gray-700"
      >
        {CONTACT_EMAIL}
      </a>
      <span className="mx-2 text-gray-400">·</span>
      <span className="text-gray-500">
        © {year} {COPYRIGHT_HOLDER}. All rights reserved.
      </span>
    </footer>
  );
}
