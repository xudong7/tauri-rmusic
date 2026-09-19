import { ref, watch, type Ref } from "vue";

interface CoverPaletteState {
  brightness: number;
  /** 从封面提取的强调色（hsl 字符串），未分析完成时为空 */
  accent: string;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
}

interface CoverPalette {
  brightness: number;
  accent: string;
}

const MAX_ANALYSIS_IMAGE_SIZE = 96;
const MAX_PALETTE_CACHE_ENTRIES = 100;
const paletteCache = new Map<string, CoverPalette>();

function cachePalette(url: string, palette: CoverPalette) {
  paletteCache.delete(url);
  paletteCache.set(url, palette);
  while (paletteCache.size > MAX_PALETTE_CACHE_ENTRIES) {
    const oldest = paletteCache.keys().next().value;
    if (!oldest) break;
    paletteCache.delete(oldest);
  }
}

function getAdjustedBrightness(averageBrightness: number): number {
  if (averageBrightness < 0.3) return 1.28;
  if (averageBrightness < 0.6) return 1.1;
  return 0.96;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** r/g/b（0-255）→ 色相（0-360）与饱和度（0-1） */
function rgbToHueSaturation(r: number, g: number, b: number): [number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return [hue, max === 0 ? 0 : delta / max];
}

function calculateCoverPalette(img: HTMLImageElement): CoverPalette | null {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const scale = Math.min(1, MAX_ANALYSIS_IMAGE_SIZE / Math.max(img.width, img.height));
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const sampleStep = Math.max(1, Math.floor(data.length / 4 / 1000));
  let totalBrightness = 0;
  // 色相是环形的，按饱和度加权取「圆均值」，高饱和像素才决定主色调
  let hueCos = 0;
  let hueSin = 0;
  let saturationSum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;

    const [hue, saturation] = rgbToHueSaturation(r, g, b);
    const radians = (hue * Math.PI) / 180;
    hueCos += Math.cos(radians) * saturation;
    hueSin += Math.sin(radians) * saturation;
    saturationSum += saturation;
    count++;
  }

  if (count === 0) return null;

  const averageBrightness = totalBrightness / count / 255;
  const brightness = getAdjustedBrightness(averageBrightness);
  // 与 uses-dark-foreground 同一判断：亮封面配深色前景
  const lightBackground = brightness <= 0.98;
  const averageSaturation = saturationSum / count;

  let accent: string;
  if (averageSaturation < 0.08) {
    // 近乎灰阶的封面：不硬造色调，用中性色
    accent = lightBackground ? "rgba(16, 27, 35, 0.92)" : "rgba(255, 255, 255, 0.92)";
  } else {
    const hue = ((Math.atan2(hueSin, hueCos) * 180) / Math.PI + 360) % 360;
    const saturation = Math.min(0.68, Math.max(0.3, averageSaturation * 1.5));
    // 亮背景用深色强调色，暗背景用中亮强调色（保证白图标/文字有对比）
    const lightness = lightBackground ? 34 : 56;
    accent = `hsl(${Math.round(hue)}, ${Math.round(saturation * 100)}%, ${lightness}%)`;
  }

  return { brightness, accent };
}

export function useCoverPalette(imageUrl: Ref<string>) {
  const state = ref<CoverPaletteState>({
    brightness: 0.7,
    accent: "",
    isAnalyzing: false,
    isAnalyzed: false,
  });
  let analysisId = 0;

  async function analyze(url: string, currentAnalysisId: number) {
    if (!url) return;
    state.value.isAnalyzing = true;

    try {
      const img = await loadImage(url);
      const palette = calculateCoverPalette(img);
      if (currentAnalysisId !== analysisId) return;
      state.value.brightness = palette?.brightness ?? 0.7;
      state.value.accent = palette?.accent ?? "";
      state.value.isAnalyzed = palette !== null;
      if (palette) cachePalette(url, palette);
    } catch (error) {
      if (currentAnalysisId !== analysisId) return;
      console.error("分析封面图片配色失败:", error);
      state.value.brightness = 0.7;
      state.value.accent = "";
    } finally {
      if (currentAnalysisId === analysisId) {
        state.value.isAnalyzing = false;
      }
    }
  }

  watch(
    imageUrl,
    (url) => {
      const currentAnalysisId = ++analysisId;
      state.value.isAnalyzed = false;
      if (url) {
        const cached = paletteCache.get(url);
        if (cached !== undefined) {
          state.value = {
            brightness: cached.brightness,
            accent: cached.accent,
            isAnalyzing: false,
            isAnalyzed: true,
          };
        } else {
          void analyze(url, currentAnalysisId);
        }
      } else {
        state.value.isAnalyzing = false;
      }
    },
    { immediate: true }
  );

  return {
    brightness: state,
  };
}
