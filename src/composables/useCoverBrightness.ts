import { ref, watch, type Ref } from "vue";

interface CoverBrightnessState {
  brightness: number;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
}

const MAX_ANALYSIS_IMAGE_SIZE = 96;

function getAdjustedBrightness(averageBrightness: number): number {
  if (averageBrightness < 0.3) return 1.12;
  if (averageBrightness < 0.6) return 1.02;
  return 0.92;
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

function calculateAverageBrightness(img: HTMLImageElement): number | null {
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
  let count = 0;

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    count++;
  }

  return count > 0 ? totalBrightness / count / 255 : null;
}

export function useCoverBrightness(imageUrl: Ref<string>) {
  const state = ref<CoverBrightnessState>({
    brightness: 0.7,
    isAnalyzing: false,
    isAnalyzed: false,
  });
  let analysisId = 0;

  async function analyze(url: string, currentAnalysisId: number) {
    if (!url) return;
    state.value.isAnalyzing = true;

    try {
      const img = await loadImage(url);
      const averageBrightness = calculateAverageBrightness(img);
      if (currentAnalysisId !== analysisId) return;
      state.value.brightness =
        averageBrightness === null ? 0.7 : getAdjustedBrightness(averageBrightness);
      state.value.isAnalyzed = true;
    } catch (error) {
      if (currentAnalysisId !== analysisId) return;
      console.error("分析封面图片亮度失败:", error);
      state.value.brightness = 0.7;
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
        void analyze(url, currentAnalysisId);
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
