"use client";

import { useEffect, useRef, useCallback, useState } from "react";

const COOLDOWN_MS = 5000; // 트리거 후 5초 쿨다운

type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : any;
type SpeechRecognitionInstance = InstanceType<SpeechRecognitionType>;

interface UseVoiceDetectionOptions {
  enabled: boolean;
  onCheeseDetected: () => void;
}

interface UseVoiceDetectionReturn {
  isSupported: boolean;
  isListening: boolean;
  cheeseDetected: boolean;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

export function useVoiceDetection({
  enabled,
  onCheeseDetected,
}: UseVoiceDetectionOptions): UseVoiceDetectionReturn {
  const [isSupported, setIsSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [cheeseDetected, setCheeseDetected] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const cooldownUntilRef = useRef(0);
  const onCheeseDetectedRef = useRef(onCheeseDetected);
  const enabledRef = useRef(enabled);
  const restartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onCheeseDetectedRef.current = onCheeseDetected;
  enabledRef.current = enabled;

  // 기능 지원 여부 확인
  useEffect(() => {
    if (!getSpeechRecognition()) {
      setIsSupported(false);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // 이미 중지된 경우 무시
      }
    }
    setIsListening(false);
    setCheeseDetected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !isSupported) {
      stopListening();
      return;
    }

    const SpeechRecognitionClass = getSpeechRecognition();
    if (!SpeechRecognitionClass) return;

    // 이미 실행 중이면 스킵
    if (recognitionRef.current) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      if (!enabledRef.current) return;

      const now = Date.now();
      if (now < cooldownUntilRef.current) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (transcript.includes("치즈")) {
          cooldownUntilRef.current = now + COOLDOWN_MS;
          setCheeseDetected(true);
          setTimeout(() => setCheeseDetected(false), 500);
          onCheeseDetectedRef.current();
          return;
        }
      }
    };

    recognition.onend = () => {
      // enabled 상태이면 자동 재시작
      if (enabledRef.current) {
        restartTimeoutRef.current = setTimeout(() => {
          if (enabledRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch {
              // 이미 시작된 경우 무시
            }
          }
        }, 300);
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      // not-allowed = 마이크 권한 거부
      if (event.error === "not-allowed") {
        setIsSupported(false);
        return;
      }
      // 그 외 에러는 onend에서 자동 재시작
    };

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsSupported(false);
    }

    return () => {
      recognitionRef.current = null;
      stopListening();
      try {
        recognition.abort();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, isSupported]);

  return { isSupported, isListening, cheeseDetected };
}
