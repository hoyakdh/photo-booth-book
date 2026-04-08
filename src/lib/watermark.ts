export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  showDate: boolean;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  fontSize: number;
  color: string;
  opacity: number;
}

const STORAGE_KEY = "photo-booth-watermark";

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: false,
  text: "",
  showDate: true,
  position: "bottom-right",
  fontSize: 18,
  color: "#ffffff",
  opacity: 0.8,
};

export function loadWatermarkConfig(): WatermarkConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveWatermarkConfig(config: WatermarkConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: WatermarkConfig
): void {
  if (!config.enabled) return;

  const lines: string[] = [];
  if (config.showDate) {
    const now = new Date();
    lines.push(
      `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`
    );
  }
  if (config.text.trim()) {
    lines.push(config.text.trim());
  }
  if (lines.length === 0) return;

  const scale = Math.max(1, width / 400);
  const fontSize = Math.round(config.fontSize * scale);
  const padding = Math.round(12 * scale);
  const lineHeight = fontSize * 1.4;

  ctx.save();
  ctx.globalAlpha = config.opacity;
  ctx.font = `bold ${fontSize}px -apple-system, "Noto Sans KR", sans-serif`;
  ctx.fillStyle = config.color;
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = Math.max(1, fontSize / 10);

  const isRight = config.position.includes("right");
  const isBottom = config.position.includes("bottom");

  ctx.textAlign = isRight ? "right" : "left";
  ctx.textBaseline = "top";

  const x = isRight ? width - padding : padding;
  const startY = isBottom
    ? height - padding - lines.length * lineHeight
    : padding;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    ctx.strokeText(lines[i], x, y);
    ctx.fillText(lines[i], x, y);
  }

  ctx.restore();
}
