"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type PermStatus = "idle" | "requesting" | "granted" | "denied";

interface PermissionGateScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

async function queryPermission(name: PermissionName): Promise<PermissionState | null> {
  try {
    const result = await navigator.permissions.query({ name });
    return result.state;
  } catch {
    return null;
  }
}

async function requestCamera(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

export default function PermissionGateScreen({ onComplete, onBack }: PermissionGateScreenProps) {
  const [cameraStatus, setCameraStatus] = useState<PermStatus>("idle");
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const completeTimeoutRef = useRef<number | null>(null);

  const scheduleComplete = useCallback(() => {
    if (completeTimeoutRef.current != null) {
      window.clearTimeout(completeTimeoutRef.current);
    }
    completeTimeoutRef.current = window.setTimeout(() => {
      completeTimeoutRef.current = null;
      onCompleteRef.current();
    }, 500);
  }, []);

  const runPermissionFlow = useCallback(
    async (cancelled: () => boolean) => {
      const camPre = await queryPermission("camera" as PermissionName);
      if (cancelled()) return;

      if (camPre === "granted") {
        setCameraStatus("granted");
        scheduleComplete();
      } else {
        setCameraStatus("requesting");
        const camOk = await requestCamera();
        if (cancelled()) return;
        if (!camOk) {
          setCameraStatus("denied");
          return;
        }
        setCameraStatus("granted");
        scheduleComplete();
      }
    },
    [scheduleComplete],
  );

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("denied");
      return;
    }

    const startTimer = window.setTimeout(() => runPermissionFlow(isCancelled), 600);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (completeTimeoutRef.current != null) {
        window.clearTimeout(completeTimeoutRef.current);
        completeTimeoutRef.current = null;
      }
    };
  }, [runPermissionFlow]);

  const handleRetryCamera = async () => {
    setCameraStatus("requesting");

    const camPre = await queryPermission("camera" as PermissionName);

    let camOk = camPre === "granted";
    if (!camOk) {
      camOk = await requestCamera();
    }
    if (!camOk) {
      setCameraStatus("denied");
      return;
    }
    setCameraStatus("granted");
    scheduleComplete();
  };

  return (
    <div className="h-screen-safe flex flex-col bg-[#f0f0ee] relative">
      {/* 뒤로 */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 z-20">
        <button
          type="button"
          onClick={onBack}
          className="w-12 h-12 bg-black/10 rounded-full flex items-center justify-center text-gray-800 text-xl btn-touch"
        >
          &larr;
        </button>
      </div>

      <div className="flex-1 flex flex-col items-start justify-center px-8 pb-12">
        <div className="mb-10 mt-8">
          <div className="w-14 h-14 rounded-2xl bg-white shadow flex items-center justify-center text-3xl mb-6">
            📷
          </div>
          <p className="text-xs text-gray-400 font-semibold tracking-widest uppercase mb-1">
            → 기기 권한
          </p>
          <p className="text-xl font-bold text-gray-800 leading-snug">
            먼저 몇 가지 권한이
            <br />
            필요해요...
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <PermissionRow icon="📷" label="카메라" status={cameraStatus} />
        </div>

        {cameraStatus === "denied" && (
          <div className="mt-8 w-full">
            <p className="text-sm text-red-600 mb-4 text-center">
              카메라 권한이 필요해요.
              <br />
              브라우저 설정에서 카메라를 허용해주세요.
            </p>
            <button
              type="button"
              onClick={handleRetryCamera}
              className="w-full py-4 bg-primary text-white rounded-2xl font-bold text-lg btn-touch"
            >
              다시 시도
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface PermissionRowProps {
  icon: string;
  label: string;
  status: PermStatus;
}

function PermissionRow({ icon, label, status }: PermissionRowProps) {
  return (
    <div className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm">
      <span className="text-2xl">{icon}</span>
      <span className="flex-1 text-base font-semibold text-gray-800">{label}</span>
      <StatusIndicator status={status} />
    </div>
  );
}

function StatusIndicator({ status }: { status: PermStatus }) {
  if (status === "idle") {
    return <span className="w-6 h-6 rounded-full border-2 border-gray-200 shrink-0" />;
  }
  if (status === "requesting") {
    return (
      <span className="w-6 h-6 flex items-center justify-center shrink-0">
        <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </span>
    );
  }
  if (status === "granted") {
    return (
      <span className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-black shrink-0">
        ✓
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full bg-red-400 flex items-center justify-center text-white text-xs font-black shrink-0">
      ✕
    </span>
  );
}
