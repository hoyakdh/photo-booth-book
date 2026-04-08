import { BookCover } from "@/types";
import { getAllBookCovers, saveBookCover } from "@/lib/db";
import { generateId } from "@/lib/utils";

interface BackupData {
  version: number;
  exportedAt: string;
  covers: BookCover[];
}

/**
 * 모든 책표지를 JSON 파일로 내보내기
 */
export async function exportBookCovers(): Promise<void> {
  const covers = await getAllBookCovers();

  const data: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    covers,
  };

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `photo-booth-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * JSON 파일에서 책표지 가져오기
 * @returns 가져온 책표지 수
 */
export async function importBookCovers(file: File): Promise<number> {
  const text = await file.text();
  const data: BackupData = JSON.parse(text);

  if (!data.version || !Array.isArray(data.covers)) {
    throw new Error("올바른 백업 파일이 아닙니다");
  }

  let count = 0;
  for (const cover of data.covers) {
    if (!cover.name || !cover.imageData) continue;

    // 새 ID 발급하여 중복 방지
    const newCover: BookCover = {
      ...cover,
      id: generateId(),
      createdAt: cover.createdAt || Date.now(),
    };
    await saveBookCover(newCover);
    count++;
  }

  return count;
}
