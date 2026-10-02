import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ElMessage } from "element-plus";
import { importMusic as importMusicCommand } from "@/api/commands/file";
import { AUDIO_FILE_EXTENSIONS } from "@/constants";
import { parseErrorMessage } from "@/utils/errorUtils";

/**
 * 从系统拖入音频文件直接导入曲库。
 *
 * 走 Tauri 的原生 drag-drop 事件而不是 HTML5 拖放：webview 里的 HTML5
 * 事件拿不到真实文件路径，只能读到 File 对象；原生事件给的就是路径数组，
 * 直接喂给 import_music 即可，也复用「复制进曲库」的既有语义。
 */
export function useFileDropImport(args: {
  getDefaultDirectory: () => string | null;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const isDraggingAudioFiles = ref(false);
  const dragAudioCount = ref(0);
  let unlisten: (() => void) | null = null;
  let isImporting = false;

  function isAudioFile(path: string): boolean {
    const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    const dot = name.lastIndexOf(".");
    return dot !== -1 && AUDIO_FILE_EXTENSIONS.includes(name.slice(dot + 1));
  }

  async function importDroppedFiles(paths: string[]) {
    if (isImporting || paths.length === 0) return;
    isImporting = true;
    const loadingMessage = ElMessage({
      message: t("import.importing", { count: paths.length }),
      type: "info",
      duration: 0,
      showClose: true,
    });

    try {
      const result = await importMusicCommand({
        files: paths,
        defaultDirectory: args.getDefaultDirectory(),
      });
      loadingMessage.close();
      ElMessage({
        message: result as string,
        type: "success",
        duration: 5000,
        showClose: true,
      });
      args.onImported();
    } catch (error) {
      loadingMessage.close();
      ElMessage({
        message: `${t("import.failed")}: ${parseErrorMessage(error)}`,
        type: "error",
        duration: 5000,
        showClose: true,
      });
    } finally {
      isImporting = false;
    }
  }

  onMounted(async () => {
    try {
      unlisten = await getCurrentWindow().onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter") {
          const audioFiles = payload.paths.filter(isAudioFile);
          dragAudioCount.value = audioFiles.length;
          isDraggingAudioFiles.value = audioFiles.length > 0;
        } else if (payload.type === "drop") {
          isDraggingAudioFiles.value = false;
          void importDroppedFiles(payload.paths.filter(isAudioFile));
        } else if (payload.type === "leave") {
          isDraggingAudioFiles.value = false;
        }
      });
    } catch (error) {
      console.error("监听文件拖放失败:", error);
    }
  });

  onBeforeUnmount(() => {
    unlisten?.();
    unlisten = null;
  });

  return { isDraggingAudioFiles, dragAudioCount };
}
