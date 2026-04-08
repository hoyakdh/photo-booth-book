"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface Sticker {
  id: string;
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

interface StickerEditorProps {
  imageData: string;
  onSave: (editedImageData: string) => void;
  onCancel: () => void;
}

const EMOJI_LIST = [
  "⭐", "❤️", "🌈", "🎉", "🦋", "🌸", "🎀", "👑", "✨", "🔥",
  "😊", "😎", "🥰", "😍", "🤩", "😆", "🥳", "🫶", "💖", "💫",
  "📚", "📖", "✏️", "🎨", "🏆", "🎵", "🌟", "🍀", "🐱", "🐶",
];

export default function StickerEditor({ imageData, onSave, onCancel }: StickerEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0, offsetX: 0, offsetY: 0 });

  // 핀치/회전 제스처 상태
  const gestureRef = useRef<{
    initialDist: number;
    initialAngle: number;
    initialScale: number;
    initialRotation: number;
    stickerId: string;
  } | null>(null);

  // 이미지 크기 계산
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current || !imgRef.current) return;
      const container = containerRef.current;
      const img = imgRef.current;
      if (!img.naturalWidth) return;

      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const aspect = img.naturalWidth / img.naturalHeight;

      let w: number, h: number;
      if (cw / ch < aspect) { w = cw; h = cw / aspect; }
      else { h = ch; w = ch * aspect; }
      setImgSize({ w, h, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2 });
    };

    const img = new Image();
    img.onload = updateSize;
    img.src = imageData;
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [imageData]);

  const addEmoji = (emoji: string) => {
    const id = `s-${Date.now()}-${Math.random()}`;
    setStickers((prev) => [...prev, { id, content: emoji, x: 50, y: 50, scale: 1, rotation: 0 }]);
    setActiveId(id);
  };

  const addText = () => {
    if (!textInput.trim()) return;
    const id = `t-${Date.now()}`;
    setStickers((prev) => [...prev, { id, content: textInput.trim(), x: 50, y: 50, scale: 1, rotation: 0 }]);
    setActiveId(id);
    setTextInput("");
    setShowTextInput(false);
  };

  const removeSticker = (id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const updateSticker = useCallback((id: string, updates: Partial<Sticker>) => {
    setStickers((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s));
  }, []);

  // 한 손가락 드래그
  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(id);
    setActiveId(id);
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId || !imgSize.w) return;

    const containerTop = containerRef.current?.getBoundingClientRect().top || 0;
    const x = ((e.clientX - dragOffset.x - imgSize.offsetX) / imgSize.w) * 100;
    const y = ((e.clientY - dragOffset.y - imgSize.offsetY - containerTop) / imgSize.h) * 100;

    updateSticker(draggingId, {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }, [draggingId, dragOffset, imgSize, updateSticker]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  // 두 손가락 제스처: 핀치 줌 + 회전
  const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const sticker = stickers.find((s) => s.id === id);
      if (!sticker) return;

      gestureRef.current = {
        initialDist: dist,
        initialAngle: angle,
        initialScale: sticker.scale,
        initialRotation: sticker.rotation,
        stickerId: id,
      };
      setActiveId(id);
    }
  }, [stickers]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && gestureRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const g = gestureRef.current;
      const scaleDelta = dist / g.initialDist;
      const rotationDelta = angle - g.initialAngle;

      updateSticker(g.stickerId, {
        scale: Math.max(0.2, Math.min(5, g.initialScale * scaleDelta)),
        rotation: Math.round(g.initialRotation + rotationDelta),
      });
    }
  }, [updateSticker]);

  const handleTouchEnd = useCallback(() => {
    gestureRef.current = null;
  }, []);

  // 버튼으로 크기/회전 조절
  const adjustScale = (id: string, delta: number) => {
    updateSticker(id, {
      scale: Math.max(0.2, Math.min(5, (stickers.find((s) => s.id === id)?.scale || 1) + delta)),
    });
  };

  const adjustRotation = (id: string, delta: number) => {
    updateSticker(id, {
      rotation: ((stickers.find((s) => s.id === id)?.rotation || 0) + delta) % 360,
    });
  };

  // 배경 탭 시 선택 해제
  const handleBgClick = () => {
    setActiveId(null);
  };

  // Canvas 합성 저장
  const handleSave = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.naturalWidth / imgSize.w;

    for (const sticker of stickers) {
      const px = (sticker.x / 100) * img.naturalWidth;
      const py = (sticker.y / 100) * img.naturalHeight;
      const isEmoji = sticker.content.length <= 2 || /\p{Emoji}/u.test(sticker.content.slice(0, 2));
      const baseFontSize = isEmoji ? 48 : 28;
      const fontSize = Math.round(baseFontSize * sticker.scale * scaleX);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.font = isEmoji
        ? `${fontSize}px sans-serif`
        : `bold ${fontSize}px -apple-system, "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (!isEmoji) {
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = Math.max(2, fontSize / 8);
        ctx.strokeText(sticker.content, 0, 0);
        ctx.fillStyle = "#ffffff";
      }
      ctx.fillText(sticker.content, 0, 0);
      ctx.restore();
    }

    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* 편집 영역 */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-gray-900"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleBgClick}
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute"
          style={{
            left: `${imgSize.offsetX}px`,
            top: `${imgSize.offsetY}px`,
            width: `${imgSize.w}px`,
            height: `${imgSize.h}px`,
          }}
        >
          <img
            ref={imgRef}
            src={imageData}
            alt="편집"
            className="w-full h-full object-contain"
            onLoad={() => {
              if (containerRef.current && imgRef.current) {
                const cw = containerRef.current.clientWidth;
                const ch = containerRef.current.clientHeight;
                const img = imgRef.current;
                const aspect = img.naturalWidth / img.naturalHeight;
                let w: number, h: number;
                if (cw / ch < aspect) { w = cw; h = cw / aspect; }
                else { h = ch; w = ch * aspect; }
                setImgSize({ w, h, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2 });
              }
            }}
          />

          {/* 스티커들 */}
          {stickers.map((sticker) => {
            const isActive = activeId === sticker.id;
            return (
              <div
                key={sticker.id}
                className="absolute cursor-move select-none"
                style={{
                  left: `${sticker.x}%`,
                  top: `${sticker.y}%`,
                  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
                  fontSize: sticker.content.length <= 2 ? "2.5rem" : "1.2rem",
                  fontWeight: "bold",
                  color: "white",
                  textShadow: "0 2px 4px rgba(0,0,0,0.5)",
                  zIndex: isActive ? 50 : 10,
                }}
                onPointerDown={(e) => handlePointerDown(e, sticker.id)}
                onTouchStart={(e) => handleTouchStart(e, sticker.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* 선택 표시 테두리 */}
                {isActive && (
                  <div className="absolute -inset-2 border-2 border-dashed border-white/60 rounded-lg pointer-events-none" />
                )}
                {sticker.content}
                {/* 컨트롤 (선택된 스티커만) */}
                {isActive && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustScale(sticker.id, 0.2); }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >+</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustScale(sticker.id, -0.2); }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >-</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustRotation(sticker.id, -15); }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >↺</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); adjustRotation(sticker.id, 15); }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >↻</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
                      className="w-7 h-7 bg-red-500 text-white rounded-full text-xs font-bold shadow"
                    >✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 안내 */}
      <div className="text-center py-1 bg-pink-500/80 text-white text-xs">
        한 손가락: 이동 | 두 손가락: 크기 조절 + 회전
      </div>

      {/* 스티커 팔레트 */}
      <div className="bg-gray-900 px-3 py-2">
        {showTextInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="텍스트 입력"
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-gray-700 text-white focus:outline-none"
              autoFocus
            />
            <button onClick={addText} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">추가</button>
            <button onClick={() => setShowTextInput(false)} className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm">취소</button>
          </div>
        ) : (
          <div className="flex gap-1 items-center overflow-x-auto">
            <button
              onClick={() => setShowTextInput(true)}
              className="flex-shrink-0 px-3 py-2 bg-gray-700 text-white rounded-lg text-xs font-bold"
            >
              Aa 텍스트
            </button>
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                onClick={() => addEmoji(emoji)}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-700 rounded-lg btn-touch"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="flex gap-3 px-4 py-3 bg-gray-900">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-lg bg-gray-700 text-white btn-touch">
          취소
        </button>
        <button onClick={handleSave} className="flex-1 py-3 rounded-xl font-bold text-lg bg-primary text-white btn-touch">
          완료
        </button>
      </div>
    </div>
  );
}
