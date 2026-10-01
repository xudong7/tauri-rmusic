import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ElMessage } from "element-plus";
import { i18n } from "@/i18n";
import { joinPathSegment } from "@/utils/pathUtils";

/**
 * 在系统文件管理器中定位一个本地曲库文件。
 *
 * 曲库文件的实际路径 = 当前曲库目录 + file_name；目录缺失时退回文件名本身，
 * 让插件报错而不是拼出一个看似合理的错误路径。
 */
export async function revealLocalFile(
  fileName: string,
  directory: string | null | undefined
): Promise<void> {
  const path = directory ? joinPathSegment(directory, fileName) : fileName;
  try {
    await revealItemInDir(path);
  } catch (error) {
    console.error("在文件夹中显示失败:", error);
    ElMessage.error(i18n.global.t("errors.revealFailed"));
  }
}
