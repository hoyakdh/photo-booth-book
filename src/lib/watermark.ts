export interface WatermarkConfig {
  enabled: boolean;
  text: string;
  showDate: boolean;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  fontSize: number;
  color: string;
  opacity: number;
  /** 폰트(저장값). next/layout에서 주입한 `--wm-font-*` 와 매칭 */
  fontFamily?: string;
  /** 워터마크 블록 좌상단 X (캔버스 너비 대비 0~1). 없으면 position 모서리 기준 */
  x?: number;
  /** 워터마크 첫 줄 베이스라인 위 Y (캔버스 높이 대비 0~1, textBaseline=top) */
  y?: number;
}

/** Google Fonts(레이아웃에서 로드)와 동일한 논리 이름 — `layout`의 `--wm-font-gothic` / `--wm-font-serif` 와 대응 */
export const WATERMARK_GOTHIC_FONT = '"Noto Sans KR", sans-serif';
export const WATERMARK_SERIF_FONT = '"Noto Serif KR", serif';
export const WATERMARK_SYSTEM_FONT = "sans-serif";

export const WATERMARK_FONT_OPTIONS = [
  { label: "고딕 (기본)", value: WATERMARK_GOTHIC_FONT },
  { label: "명조", value: WATERMARK_SERIF_FONT },
  { label: "시스템 기본", value: WATERMARK_SYSTEM_FONT },
] as const;

export const DEFAULT_WATERMARK_FONT_FAMILY = WATERMARK_GOTHIC_FONT;

const STORAGE_KEY = "photo-booth-watermark";

const DEFAULT_CONFIG: WatermarkConfig = {
  enabled: false,
  text: "",
  showDate: true,
  position: "bottom-right",
  fontSize: 18,
  color: "#ffffff",
  opacity: 0.8,
  fontFamily: DEFAULT_WATERMARK_FONT_FAMILY,
};

/** 캔버스·미리보기에서 실제로 그릴 font-family (next/font 최적화 이름 반영) */
export function resolveWatermarkFontFamily(config: WatermarkConfig): string {
  const choice =
    (config.fontFamily?.trim() || DEFAULT_WATERMARK_FONT_FAMILY) as string;
  if (typeof document === "undefined") return choice;

  const root = document.documentElement;
  if (choice === WATERMARK_GOTHIC_FONT) {
    const injected = root.style.getPropertyValue("--wm-font-gothic").trim();
    return injected || choice;
  }
  if (choice === WATERMARK_SERIF_FONT) {
    const injected = root.style.getPropertyValue("--wm-font-serif").trim();
    return injected || choice;
  }
  return choice;
}

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

/** 촬영 시점 또는 미리보기용 줄 구성 (날짜는 now 기준) — 커스텀 텍스트가 위, 날짜는 그 아래 */
export function buildWatermarkLines(
  config: WatermarkConfig,
  now: Date = new Date()
): string[] {
  const lines: string[] = [];
  if (config.text.trim()) {
    lines.push(config.text.trim());
  }
  if (config.showDate) {
    lines.push(
      `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`
    );
  }
  return lines;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/** drawWatermark와 미리보기에서 동일하게 사용 */
export function getWatermarkSizing(width: number, config: WatermarkConfig) {
  const scale = Math.max(1, width / 400);
  const fontSize = Math.round(config.fontSize * scale);
  const padding = Math.round(12 * scale);
  const lineHeight = fontSize * 1.4;
  return { scale, fontSize, padding, lineHeight };
}

function measureMaxLineWidth(
  ctx: CanvasRenderingContext2D,
  lines: string[]
): number {
  let w = 0;
  for (const line of lines) {
    w = Math.max(w, ctx.measureText(line).width);
  }
  return w;
}

export type WatermarkBlockMetrics = {
  fontSize: number;
  padding: number;
  lineHeight: number;
  maxLineWidth: number;
  blockW: number;
  blockH: number;
};

/**
 * 줄 텍스트의 바운딩 박스(좌측 상단 기준, 측정·레이아웃용 여유 포함)
 */
export function getWatermarkBlockMetrics(
  width: number,
  height: number,
  config: WatermarkConfig,
  lines: string[]
): WatermarkBlockMetrics | null {
  if (lines.length === 0) return null;
  const { fontSize, padding, lineHeight } = getWatermarkSizing(width, config);
  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const family = resolveWatermarkFontFamily(config);
  if (!canvas) {
    const approxW =
      Math.max(...lines.map((l) => l.length), 1) * fontSize * 0.65 +
      fontSize * 0.2;
    return {
      fontSize,
      padding,
      lineHeight,
      maxLineWidth: approxW,
      blockW: approxW,
      blockH: lines.length * lineHeight,
    };
  }
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px ${family}`;
  const maxLineWidth = measureMaxLineWidth(ctx, lines);
  const widthSlop = Math.max(2, fontSize / 8);
  const blockW = maxLineWidth + widthSlop;
  const blockH = lines.length * lineHeight;
  return { fontSize, padding, lineHeight, maxLineWidth, blockW, blockH };
}

/** 레거시 모서리(position)와 동일한 좌상단 좌표 (textAlign=left, textBaseline=top) */
export function cornerPositionToTopLeft(
  width: number,
  height: number,
  config: WatermarkConfig,
  lines: string[],
  m: WatermarkBlockMetrics
): { left: number; top: number } {
  const { padding, lineHeight, maxLineWidth } = m;
  const isRight = config.position.includes("right");
  const isBottom = config.position.includes("bottom");
  const top = isBottom
    ? height - padding - lines.length * lineHeight
    : padding;
  const left = isRight ? width - padding - maxLineWidth : padding;
  return { left, top };
}

/** 레거시 position에 해당하는 정규화 좌표 (미리보기·마이그레이션용) */
export function normalizedPositionFromCorner(
  config: WatermarkConfig,
  width: number,
  height: number
): { x: number; y: number } | null {
  const lines = buildWatermarkLines(config);
  const metrics = getWatermarkBlockMetrics(width, height, config, lines);
  if (!metrics) return null;
  const { left, top } = cornerPositionToTopLeft(width, height, config, lines, metrics);
  const maxLeft = Math.max(0, width - metrics.blockW);
  const maxTop = Math.max(0, height - metrics.blockH);
  return {
    x: clamp(
      width > 0 ? left / width : 0,
      0,
      width > 0 ? maxLeft / width : 1
    ),
    y: clamp(
      height > 0 ? top / height : 0,
      0,
      height > 0 ? maxTop / height : 1
    ),
  };
}

function normalizedToTopLeftPx(
  config: WatermarkConfig,
  width: number,
  height: number,
  m: WatermarkBlockMetrics
): { left: number; top: number } {
  let left = config.x! * width;
  let top = config.y! * height;
  const maxLeft = Math.max(0, width - m.blockW);
  const maxTop = Math.max(0, height - m.blockH);
  left = clamp(left, 0, maxLeft);
  top = clamp(top, 0, maxTop);
  return { left, top };
}

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: WatermarkConfig
): void {
  if (!config.enabled) return;

  const lines = buildWatermarkLines(config);
  if (lines.length === 0) return;

  const { fontSize, padding, lineHeight } = getWatermarkSizing(width, config);
  const family = resolveWatermarkFontFamily(config);

  ctx.save();
  ctx.globalAlpha = config.opacity;
  ctx.font = `bold ${fontSize}px ${family}`;
  ctx.fillStyle = config.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const maxLineWidth = measureMaxLineWidth(ctx, lines);
  const widthSlop = Math.max(2, fontSize / 8);
  const blockW = maxLineWidth + widthSlop;
  const blockH = lines.length * lineHeight;

  const m: WatermarkBlockMetrics = {
    fontSize,
    padding,
    lineHeight,
    maxLineWidth,
    blockW,
    blockH,
  };

  const hasCustomXY =
    config.x !== undefined &&
    config.y !== undefined &&
    !Number.isNaN(config.x) &&
    !Number.isNaN(config.y);

  const { left, top } = hasCustomXY
    ? normalizedToTopLeftPx(config, width, height, m)
    : cornerPositionToTopLeft(width, height, config, lines, m);

  for (let i = 0; i < lines.length; i++) {
    const y = top + i * lineHeight;
    ctx.fillText(lines[i], left, y);
  }

  ctx.restore();
}
