"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { StickerData } from "@/types";

function isEmojiContent(content: string): boolean {
  return content.length <= 2 || /\p{Emoji}/u.test(content.slice(0, 2));
}

interface StickerEditorProps {
  /** 편집용 클린 베이스 이미지 (스티커 미합성) */
  imageData: string;
  /** 이전 세션 스티커 복원 */
  initialStickers?: StickerData[];
  onSave: (editedImageData: string, stickers: StickerData[], originalImageData: string) => void;
  onCancel: () => void;
}

const EMOJI_LIST = [
  "⭐", "❤️", "🌈", "🎉", "🦋", "🌸", "🎀", "👑", "✨", "🔥",
  "😊", "😎", "🥰", "😍", "🤩", "😆", "🥳", "🫶", "💖", "💫",
  "📚", "📖", "✏️", "🎨", "🏆", "🎵", "🌟", "🍀", "🐱", "🐶",
];

export default function StickerEditor({
  imageData,
  initialStickers,
  onSave,
  onCancel,
}: StickerEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [stickers, setStickers] = useState<StickerData[]>(() =>
    (initialStickers ?? []).map((s) => ({ ...s }))
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0, offsetX: 0, offsetY: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  /** 텍스트 더블 탭 감지 (모바일) */
  const lastTextTapRef = useRef<{ id: string; t: number } | null>(null);

  const gestureRef = useRef<{
    initialDist: number;
    initialAngle: number;
    initialScale: number;
    initialRotation: number;
    stickerId: string;
  } | null>(null);

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

  const removeSticker = useCallback((id: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== id));
    setActiveId((a) => (a === id ? null : a));
    setEditingId((e) => (e === id ? null : e));
  }, []);

  const updateSticker = useCallback((id: string, updates: Partial<StickerData>) => {
    setStickers((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const startTextEdit = useCallback((id: string, content: string) => {
    setEditingId(id);
    setEditDraft(content);
    setActiveId(id);
  }, []);

  const commitTextEdit = useCallback(() => {
    const id = editingId;
    if (!id) return;
    const trimmed = editDraft.trim();
    setEditingId(null);
    setEditDraft("");
    if (trimmed) {
      updateSticker(id, { content: trimmed });
    } else {
      removeSticker(id);
    }
  }, [editDraft, editingId, removeSticker, updateSticker]);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    if (editingId) return;
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
  }, [editingId]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId || !imgSize.w) return;

    const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
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

  const handleTouchStart = useCallback((e: React.TouchEvent, id: string) => {
    if (editingId) return;
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
  }, [editingId, stickers]);

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

  const adjustScale = (id: string, delta: number) => {
    updateSticker(id, {
      scale: Math.max(0.2, Math.min(5, (stickers.find((s) => s.id === id)?.scale ?? 1) + delta)),
    });
  };

  const adjustRotation = (id: string, delta: number) => {
    updateSticker(id, {
      rotation: ((stickers.find((s) => s.id === id)?.rotation ?? 0) + delta) % 360,
    });
  };

  const handleBgClick = () => {
    if (editingId) {
      commitTextEdit();
    }
    setActiveId(null);
  };

  /** 텍스트 스티커: 더블클릭 또는 빠른 이중 탭으로 편집 */
  const handleTextStickerActivate = useCallback((e: React.MouseEvent | React.PointerEvent, sticker: StickerData) => {
    e.stopPropagation();
    if (isEmojiContent(sticker.content)) return;
    const now = Date.now();
    const prev = lastTextTapRef.current;
    if (prev && prev.id === sticker.id && now - prev.t < 380) {
      lastTextTapRef.current = null;
      startTextEdit(sticker.id, sticker.content);
    } else {
      lastTextTapRef.current = { id: sticker.id, t: now };
    }
  }, [startTextEdit]);

  /** 편집 중인 라인 포함해 내보낼 목록 계산 */
  function buildStickerListForExport(): StickerData[] {
    let list = stickers.map((s) => ({ ...s }));
    if (editingId) {
      const trimmed = editDraft.trim();
      if (trimmed) {
        list = list.map((s) => (s.id === editingId ? { ...s, content: trimmed } : s));
      } else {
        list = list.filter((s) => s.id !== editingId);
      }
    }
    return list;
  }

  const handleSave = () => {
    const list = buildStickerListForExport();

    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const scaleX = img.naturalWidth / imgSize.w;

    for (const sticker of list) {
      const px = (sticker.x / 100) * img.naturalWidth;
      const py = (sticker.y / 100) * img.naturalHeight;
      const isEmojiSticker = isEmojiContent(sticker.content);
      const baseFontSize = isEmojiSticker ? 48 : 28;
      const fontSize = Math.round(baseFontSize * sticker.scale * scaleX);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.font = isEmojiSticker
        ? `${fontSize}px sans-serif`
        : `bold ${fontSize}px -apple-system, "Noto Sans KR", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (!isEmojiSticker) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = Math.max(2, fontSize / 8);
        ctx.strokeText(sticker.content, 0, 0);
        ctx.fillStyle = "#000000";
      }
      ctx.fillText(sticker.content, 0, 0);
      ctx.restore();
    }

    if (editingId) setEditingId(null);
    setEditDraft("");
    onSave(canvas.toDataURL("image/png"), list, imageData);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
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
                const imgEl = imgRef.current;
                const aspect = imgEl.naturalWidth / imgEl.naturalHeight;
                let w: number, h: number;
                if (cw / ch < aspect) {
                  w = cw;
                  h = cw / aspect;
                } else {
                  h = ch;
                  w = ch * aspect;
                }
                setImgSize({ w, h, offsetX: (cw - w) / 2, offsetY: (ch - h) / 2 });
              }
            }}
          />

          {stickers.map((sticker) => {
            const isActive = activeId === sticker.id;
            const isStickerEmoji = isEmojiContent(sticker.content);
            const isEditing = editingId === sticker.id;

            return (
              <div
                key={sticker.id}
                className="absolute cursor-move select-none"
                style={{
                  left: `${sticker.x}%`,
                  top: `${sticker.y}%`,
                  transform: `translate(-50%, -50%) scale(${sticker.scale}) rotate(${sticker.rotation}deg)`,
                  fontSize: isStickerEmoji ? "2.5rem" : "1.2rem",
                  fontWeight: "bold",
                  color: isStickerEmoji ? undefined : "#000000",
                  textShadow: isStickerEmoji
                    ? "0 2px 4px rgba(0,0,0,0.5)"
                    : "0 0 2px rgba(255,255,255,0.95), 0 1px 3px rgba(255,255,255,0.85)",
                  zIndex: isActive || isEditing ? 50 : 10,
                  maxWidth: "90vmin",
                }}
                onPointerDown={(e) => handlePointerDown(e, sticker.id)}
                onTouchStart={(e) => handleTouchStart(e, sticker.id)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={(e) => handleTextStickerActivate(e, sticker)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!isStickerEmoji) startTextEdit(sticker.id, sticker.content);
                }}
              >
                {isActive && !isEditing && (
                  <div className="absolute -inset-2 border-2 border-dashed border-white/60 rounded-lg pointer-events-none" />
                )}
                {isEditing ? (
                  <div
                    className="flex flex-col gap-1 items-center min-w-[120px]"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitTextEdit();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingId(null);
                          setEditDraft("");
                        }
                      }}
                      className="px-2 py-1 rounded text-sm bg-white text-black w-full max-w-[min(80vw,280px)] focus:outline-none focus:ring-2 focus:ring-primary/50"
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          commitTextEdit();
                        }}
                        className="px-2 py-1 bg-primary text-white rounded text-xs font-bold"
                      >
                        확인
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                          setEditDraft("");
                        }}
                        className="px-2 py-1 bg-gray-600 text-white rounded text-xs"
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  sticker.content
                )}
                {isActive && !isEditing && (
                  <div className="absolute -top-9 left-1/2 -translate-x-1/2 flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        adjustScale(sticker.id, 0.2);
                      }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        adjustScale(sticker.id, -0.2);
                      }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        adjustRotation(sticker.id, -15);
                      }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >
                      ↺
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        adjustRotation(sticker.id, 15);
                      }}
                      className="w-7 h-7 bg-white text-black rounded-full text-xs font-bold shadow"
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSticker(sticker.id);
                      }}
                      className="w-7 h-7 bg-red-500 text-white rounded-full text-xs font-bold shadow"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center py-1 bg-pink-500/80 text-white text-xs">
        한 손가락: 이동 | 두 손가락: 크기 조절 + 회전 | 텍스트는 더블탭으로 수정
      </div>

      <div className="bg-gray-900 px-3 py-2">
        {showTextInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="텍스트 입력"
              className="flex-1 px-3 py-2 rounded-lg text-sm bg-white text-black placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
            <button type="button" onClick={addText} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold">
              추가
            </button>
            <button type="button" onClick={() => setShowTextInput(false)} className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm">
              취소
            </button>
          </div>
        ) : (
          <div className="flex gap-1 items-center overflow-x-auto">
            <button
              type="button"
              onClick={() => setShowTextInput(true)}
              className="flex-shrink-0 px-3 py-2 bg-gray-700 text-white rounded-lg text-xs font-bold"
            >
              Aa 텍스트
            </button>
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => addEmoji(emoji)}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center text-2xl hover:bg-gray-700 rounded-lg btn-touch"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 px-4 py-3 bg-gray-900">
        <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-lg bg-gray-700 text-white btn-touch">
          취소
        </button>
        <button type="button" onClick={handleSave} className="flex-1 py-3 rounded-xl font-bold text-lg bg-primary text-white btn-touch">
          완료
        </button>
      </div>
    </div>
  );
}
