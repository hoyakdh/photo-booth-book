import { getAllBookCovers, saveBookCover } from "@/lib/db";
import { generateId } from "@/lib/utils";
import type { BookCover } from "@/types";

const SEED_FLAG = "pb_seeded";
const SEED_BACKUP_PATH = "/backup.json";

interface BackupData {
  version: number;
  covers: BookCover[];
}

let seedInFlight: Promise<void> | null = null;

async function runSeed(): Promise<void> {
  if (localStorage.getItem(SEED_FLAG) === "1") return;

  const existing = await getAllBookCovers();
  if (existing.length > 0) {
    localStorage.setItem(SEED_FLAG, "1");
    return;
  }

  const res = await fetch(SEED_BACKUP_PATH);
  if (!res.ok) {
    console.warn("[seedDefaultCovers] backup.json 로드 실패:", res.status);
    return;
  }

  const data: BackupData = await res.json();
  if (!data.version || !Array.isArray(data.covers)) {
    console.warn("[seedDefaultCovers] 올바르지 않은 backup.json 형식");
    return;
  }

  let saved = 0;
  for (let i = 0; i < data.covers.length; i++) {
    const cover = data.covers[i];
    if (!cover.name || !cover.imageData) continue;
    try {
      await saveBookCover({
        ...cover,
        id: generateId(),
        createdAt: cover.createdAt || Date.now() + i,
        order: cover.order ?? i,
      });
      saved++;
    } catch (err) {
      console.warn("[seedDefaultCovers] 저장 실패:", cover.name, err);
    }
  }

  if (saved > 0) {
    localStorage.setItem(SEED_FLAG, "1");
  }
}

/**
 * 처음 접속한 브라우저에 public/backup.json의 표지를 씨딩합니다.
 * IndexedDB에 표지가 이미 있으면 건너뜁니다.
 */
export function seedDefaultCovers(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (seedInFlight) return seedInFlight;
  seedInFlight = runSeed().finally(() => {
    seedInFlight = null;
  });
  return seedInFlight;
}
