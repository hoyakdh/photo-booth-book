"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { loadKioskConfig } from "@/lib/kiosk";

export default function KioskProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const getConfig = useCallback(() => loadKioskConfig(), []);

  // 전체 화면
  useEffect(() => {
    const config = getConfig();
    if (!config.enabled || !config.fullscreen) return;

    const requestFullscreen = () => {
      const el = document.documentElement;
      if (!document.fullscreenElement) {
        el.requestFullscreen?.().catch(() => {});
      }
    };

    // 첫 클릭 시 전체화면 진입 (브라우저 정책상 사용자 제스처 필요)
    const handler = () => {
      requestFullscreen();
      document.removeEventListener("click", handler);
    };
    document.addEventListener("click", handler);

    return () => document.removeEventListener("click", handler);
  }, [getConfig]);

  // Wake Lock (화면 꺼짐 방지)
  useEffect(() => {
    const config = getConfig();
    if (!config.enabled || !config.wakeLock) return;
    if (!("wakeLock" in navigator)) return;

    let active = true;

    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        wakeLockRef.current.addEventListener("release", () => {
          if (active) requestWakeLock();
        });
      } catch {}
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && active) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, [getConfig]);

  // 뒤로가기/새로고침 방지
  useEffect(() => {
    const config = getConfig();
    if (!config.enabled || !config.preventNavigation) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    // history 조작으로 뒤로가기 방지
    const handlePopState = () => {
      history.pushState(null, "", location.href);
    };

    history.pushState(null, "", location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [getConfig, pathname]);

  // 자동 리셋 (무조작 시 메인으로)
  useEffect(() => {
    const config = getConfig();
    if (!config.enabled || !config.autoReset) return;

    const isHome = pathname === "/";
    const isAdmin = pathname.startsWith("/admin");
    if (isHome || isAdmin) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.push("/");
      }, config.autoResetSeconds * 1000);
    };

    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach((ev) => document.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((ev) => document.removeEventListener(ev, resetTimer));
    };
  }, [getConfig, pathname, router]);

  // 결과 화면 자동 복귀
  useEffect(() => {
    const config = getConfig();
    if (!config.enabled || !config.resultAutoReturn) return;
    if (!pathname.endsWith("/result")) return;

    const timer = setTimeout(() => {
      router.push("/");
    }, config.resultReturnSeconds * 1000);

    // 사용자 조작 시 타이머 리셋
    const resetTimer = () => {
      clearTimeout(timer);
    };

    const events = ["pointerdown", "touchstart"];
    events.forEach((ev) => document.addEventListener(ev, resetTimer, { once: true }));

    return () => {
      clearTimeout(timer);
      events.forEach((ev) => document.removeEventListener(ev, resetTimer));
    };
  }, [getConfig, pathname, router]);

  return <>{children}</>;
}
