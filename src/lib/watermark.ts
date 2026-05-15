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

export type WatermarkDrawParts = {
  main: string | null;
  date: string | null;
};

/** 커스텀 텍스트·날짜 표시 여부 (날짜는 now 기준) */
export function getWatermarkDrawParts(
  config: WatermarkConfig,
  now: Date = new Date()
): WatermarkDrawParts | null {
  const main = config.text.trim() || null;
  const date = config.showDate
    ? `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`
    : null;
  if (!main && !date) return null;
  return { main, date };
}

/** 텍스트와 날짜를 한 줄로 쌓을 때 사이 간격 (px, 스케일된 fontSize 기준) */
export function getWatermarkRowGap(fontSize: number): number {
  return Math.max(4, Math.round(fontSize * 0.4));
}

/** 미리보기·레거시: 표시할 문자열 배열 (가로 한 줄일 때도 2요소) */
export function buildWatermarkLines(
  config: WatermarkConfig,
  now: Date = new Date()
): string[] {
  const parts = getWatermarkDrawParts(config, now);
  if (!parts) return [];
  const lines: string[] = [];
  if (parts.main) lines.push(parts.main);
  if (parts.date) lines.push(parts.date);
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

export type WatermarkBlockMetrics = {
  fontSize: number;
  padding: number;
  lineHeight: number;
  maxLineWidth: number;
  blockW: number;
  blockH: number;
};

/**
 * 워터마크 블록 바운딩 박스(좌측 상단 기준). 텍스트+날짜 동시 표시 시 한 줄(날짜는 텍스트 오른쪽).
 */
export function getWatermarkBlockMetrics(
  width: number,
  height: number,
  config: WatermarkConfig,
  now: Date = new Date()
): WatermarkBlockMetrics | null {
  const parts = getWatermarkDrawParts(config, now);
  if (!parts || (!parts.main && !parts.date)) return null;
  const { fontSize, padding, lineHeight } = getWatermarkSizing(width, config);
  const canvas =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const family = resolveWatermarkFontFamily(config);
  const gap = getWatermarkRowGap(fontSize);

  const approxCharW = fontSize * 0.65;
  let contentW: number;
  if (parts.main && parts.date) {
    contentW =
      parts.main.length * approxCharW + gap + parts.date.length * approxCharW;
  } else {
    const s = parts.main ?? parts.date!;
    contentW = s.length * approxCharW;
  }
  const widthSlop = Math.max(2, fontSize / 8);
  const blockW = contentW + widthSlop;
  const blockH = lineHeight;

  if (!canvas) {
    return {
      fontSize,
      padding,
      lineHeight,
      maxLineWidth: contentW,
      blockW,
      blockH,
    };
  }
  const ctx = canvas.getContext("2d")!;
  ctx.font = `bold ${fontSize}px ${family}`;
  if (parts.main && parts.date) {
    contentW =
      ctx.measureText(parts.main).width + gap + ctx.measureText(parts.date).width;
  } else {
    const s = parts.main ?? parts.date!;
    contentW = ctx.measureText(s).width;
  }
  return {
    fontSize,
    padding,
    lineHeight,
    maxLineWidth: contentW,
    blockW: contentW + widthSlop,
    blockH: lineHeight,
  };
}

/** 레거시 모서리(position)와 동일한 좌상단 좌표 (textAlign=left, textBaseline=top) */
export function cornerPositionToTopLeft(
  width: number,
  height: number,
  config: WatermarkConfig,
  m: WatermarkBlockMetrics
): { left: number; top: number } {
  const { padding, blockW, blockH } = m;
  const isRight = config.position.includes("right");
  const isBottom = config.position.includes("bottom");
  const top = isBottom ? height - padding - blockH : padding;
  const left = isRight ? width - padding - blockW : padding;
  return { left, top };
}

/** 레거시 position에 해당하는 정규화 좌표 (미리보기·마이그레이션용) */
export function normalizedPositionFromCorner(
  config: WatermarkConfig,
  width: number,
  height: number
): { x: number; y: number } | null {
  const metrics = getWatermarkBlockMetrics(width, height, config);
  if (!metrics) return null;
  const { left, top } = cornerPositionToTopLeft(width, height, config, metrics);
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

  const parts = getWatermarkDrawParts(config);
  if (!parts || (!parts.main && !parts.date)) return;

  const { fontSize } = getWatermarkSizing(width, config);
  const family = resolveWatermarkFontFamily(config);
  const gap = getWatermarkRowGap(fontSize);

  const m = getWatermarkBlockMetrics(width, height, config);
  if (!m) return;

  const hasCustomXY =
    config.x !== undefined &&
    config.y !== undefined &&
    !Number.isNaN(config.x) &&
    !Number.isNaN(config.y);

  const { left, top } = hasCustomXY
    ? normalizedToTopLeftPx(config, width, height, m)
    : cornerPositionToTopLeft(width, height, config, m);

  ctx.save();
  ctx.globalAlpha = config.opacity;
  ctx.font = `bold ${fontSize}px ${family}`;
  ctx.fillStyle = config.color;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  if (parts.main && parts.date) {
    ctx.fillText(parts.main, left, top);
    ctx.fillText(parts.date, left + ctx.measureText(parts.main).width + gap, top);
  } else {
    ctx.fillText(parts.main ?? parts.date!, left, top);
  }

  ctx.restore();
}
