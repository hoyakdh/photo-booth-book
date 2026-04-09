const KIOSK_KEY = "photo-booth-kiosk";

export interface KioskConfig {
  enabled: boolean;
  fullscreen: boolean;        // 전체 화면 고정
  autoReset: boolean;         // 무조작 시 자동 리셋
  autoResetSeconds: number;   // 자동 리셋 대기 시간 (초)
  resultAutoReturn: boolean;  // 결과 화면 자동 복귀
  resultReturnSeconds: number;// 결과 화면 복귀 시간 (초)
  preventNavigation: boolean; // 뒤로가기/새로고침 방지
  wakeLock: boolean;          // 화면 꺼짐 방지
}

export const DEFAULT_KIOSK: KioskConfig = {
  enabled: false,
  fullscreen: true,
  autoReset: true,
  autoResetSeconds: 60,
  resultAutoReturn: true,
  resultReturnSeconds: 15,
  preventNavigation: true,
  wakeLock: true,
};

export function loadKioskConfig(): KioskConfig {
  if (typeof window === "undefined") return DEFAULT_KIOSK;
  try {
    const raw = localStorage.getItem(KIOSK_KEY);
    if (!raw) return DEFAULT_KIOSK;
    return { ...DEFAULT_KIOSK, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_KIOSK;
  }
}

export function saveKioskConfig(config: KioskConfig): void {
  localStorage.setItem(KIOSK_KEY, JSON.stringify(config));
}
