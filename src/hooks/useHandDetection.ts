"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const DETECTION_INTERVAL_MS = 200;   // 5fps 감지
const REQUIRED_CONSECUTIVE = 3;       // 연속 3회(~600ms) 감지 시 트리거
const COOLDOWN_MS = 5000;            // 트리거 후 5초 쿨다운
const MIN_CONFIDENCE = 0.75;

interface UseHandDetectionOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  onPalmDetected: () => void;
}

interface UseHandDetectionReturn {
  isSupported: boolean;
  isLoading: boolean;
  palmDetected: boolean;
}

export function useHandDetection({
  videoRef,
  enabled,
  onPalmDetected,
}: UseHandDetectionOptions): UseHandDetectionReturn {
  const [isSupported, setIsSupported] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [palmDetected, setPalmDetected] = useState(false);

  const recognizerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const onPalmDetectedRef = useRef(onPalmDetected);
  const enabledRef = useRef(enabled);

  // 콜백을 ref로 유지하여 불필요한 재생성 방지
  onPalmDetectedRef.current = onPalmDetected;
  enabledRef.current = enabled;

  // 기능 지원 여부 확인
  useEffect(() => {
    if (typeof WebAssembly === "undefined" || !("mediaDevices" in navigator)) {
      setIsSupported(false);
    }
  }, []);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    consecutiveRef.current = 0;
    setPalmDetected(false);
  }, []);

  const destroyRecognizer = useCallback(() => {
    stopDetection();
    if (recognizerRef.current) {
      recognizerRef.current.close();
      recognizerRef.current = null;
    }
  }, [stopDetection]);

  // GestureRecognizer 초기화 및 감지 루프
  useEffect(() => {
    if (!enabled || !isSupported) {
      stopDetection();
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      // 비디오가 아직 준비되지 않았으면 준비될 때까지 대기
      const onReady = () => {
        if (enabledRef.current) startDetection();
      };
      video?.addEventListener("loadeddata", onReady, { once: true });
      return () => {
        video?.removeEventListener("loadeddata", onReady);
      };
    }

    startDetection();

    async function startDetection() {
      // 이미 초기화된 경우 감지 루프만 시작
      if (recognizerRef.current) {
        startLoop();
        return;
      }

      setIsLoading(true);
      try {
        const { GestureRecognizer, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });

        recognizerRef.current = recognizer;
        setIsLoading(false);

        if (enabledRef.current) {
          startLoop();
        }
      } catch {
        setIsLoading(false);
        setIsSupported(false);
      }
    }

    function startLoop() {
      if (intervalRef.current) return;

      intervalRef.current = setInterval(() => {
        if (!enabledRef.current || !recognizerRef.current || !videoRef.current) return;
        if (videoRef.current.readyState < 2) return;

        const now = Date.now();
        if (now < cooldownUntilRef.current) return;

        try {
          const result = recognizerRef.current.recognizeForVideo(
            videoRef.current,
            now
          );

          const gesture = result.gestures?.[0]?.[0];
          const isPalm =
            gesture &&
            gesture.categoryName === "Open_Palm" &&
            gesture.score >= MIN_CONFIDENCE;

          if (isPalm) {
            consecutiveRef.current++;
            setPalmDetected(true);

            if (consecutiveRef.current >= REQUIRED_CONSECUTIVE) {
              consecutiveRef.current = 0;
              cooldownUntilRef.current = now + COOLDOWN_MS;
              setPalmDetected(false);
              onPalmDetectedRef.current();
            }
          } else {
            consecutiveRef.current = 0;
            setPalmDetected(false);
          }
        } catch {
          // 인식 실패 시 조용히 무시
        }
      }, DETECTION_INTERVAL_MS);
    }

    return () => {
      stopDetection();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isSupported]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      destroyRecognizer();
    };
  }, [destroyRecognizer]);

  return { isSupported, isLoading, palmDetected };
}
