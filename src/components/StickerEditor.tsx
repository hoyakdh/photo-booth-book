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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0, offsetX: 0, offsetY: 0 });

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
      if (cw / ch < aspect) {
        w = cw;
        h = cw / aspect;
      } else {
        h = ch;
        w = ch * aspect;
      }
      setImgSize({
        w, h,
        offsetX: (cw - w) / 2,
        offsetY: (ch - h) / 2,
      });
    };

    const img = new Image();
    img.onload = updateSize;
    img.src = imageData;
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [imageData]);

  const addEmoji = (emoji: string) => {
    setStickers((prev) => [
      ...prev,
      {
        id: `s-${Date.now()}-${Math.random()}`,
        content: emoji,
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0,
      },
    ]);
  };

  const addText = () => {
    if (!textInput.trim()) return;
    setStickers((prev) => [
      ...prev,
      {
        id: `t-${Date.now()}`,
        content: textInput.trim(),
        x: 50,
        y: 50,
        scale: 1,
        rotation: 0,
      },
    ]);
    setTextInput("");
    setShowTextInput(false);
  };

  const removeSticker = (id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
  };

  // 드래그
  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingId(id);
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left - rect.width / 2,
      y: e.clientY - rect.top - rect.height / 2,
    });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId || !imgSize.w) return;

    const x = ((e.clientX - dragOffset.x - imgSize.offsetX) / imgSize.w) * 100;
    const y = ((e.clientY - dragOffset.y - imgSize.offsetY - (containerRef.current?.getBoundingClientRect().top || 0)) / imgSize.h) * 100;

    setStickers((prev) =>
      prev.map((s) =>
        s.id === draggingId
          ? { ...s, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
          : s
      )
    );
  }, [draggingId, dragOffset, imgSize]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
  }, []);

  // 크기 조절
  const adjustScale = (id: string, delta: number) => {
    setStickers((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, scale: Math.max(0.3, Math.min(3, s.scale + delta)) } : s
      )
    );
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
    const scaleY = img.naturalHeight / imgSize.h;

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
          {stickers.map((sticker) => (
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
                zIndex: draggingId === sticker.id ? 50 : 10,
              }}
              onPointerDown={(e) => handlePointerDown(e, sticker.id)}
            >
              {sticker.content}
              {/* 컨트롤 */}
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 opacity-70">
                <button
                  onClick={(e) => { e.stopPropagation(); adjustScale(sticker.id, 0.2); }}
                  className="w-6 h-6 bg-white text-black rounded-full text-xs font-bold"
                >+</button>
                <button
                  onClick={(e) => { e.stopPropagation(); adjustScale(sticker.id, -0.2); }}
                  className="w-6 h-6 bg-white text-black rounded-full text-xs font-bold"
                >-</button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeSticker(sticker.id); }}
                  className="w-6 h-6 bg-red-500 text-white rounded-full text-xs font-bold"
                >x</button>
              </div>
            </div>
          ))}
        </div>
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
