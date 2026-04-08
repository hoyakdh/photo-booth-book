"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface UseCameraOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  isReady: boolean;
  error: string | null;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { facingMode = "user", width = 1280, height = 960 } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsReady(false);
  }, [stream]);

  const startCamera = useCallback(async () => {
    setError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("이 브라우저에서는 카메라를 사용할 수 없어요");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: width },
          height: { ideal: height },
        },
        audio: false,
      });

      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsReady(true);
          });
        };
      }
    } catch (err) {
      if (err instanceof DOMException) {
        switch (err.name) {
          case "NotAllowedError":
            setError("카메라 사용을 허용해주세요!");
            break;
          case "NotFoundError":
            setError("카메라를 찾을 수 없어요");
            break;
          case "NotReadableError":
            setError("카메라가 다른 앱에서 사용 중이에요");
            break;
          default:
            setError("카메라를 켤 수 없어요");
        }
      } else {
        setError("카메라를 켤 수 없어요");
      }
    }
  }, [facingMode, width, height]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videoRef, stream, isReady, error, startCamera, stopCamera };
}
