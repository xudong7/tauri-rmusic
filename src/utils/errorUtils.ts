import { i18n } from "@/i18n";
import { TauriCommandError } from "@/api/client";

/**
 * 解析错误并返回用户友好的错误消息
 */
export function parseErrorMessage(error: unknown): string {
  if (error instanceof TauriCommandError) {
    const message = error.getOriginalMessage();

    // 处理文件已存在的错误
    if (message.includes("file already exists")) {
      // 尝试提取文件名（支持完整路径）
      const match = message.match(/file already exists:\s*(.+)/);
      if (match && match[1]) {
        const fullPath = match[1].trim();
        // 提取文件名（最后一个路径分隔符后的部分）
        const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
        return i18n.global.t("errors.fileAlreadyExistsWithPath", { fileName });
      }
      return i18n.global.t("errors.fileAlreadyExists");
    }

    // 处理网络相关错误
    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      message.includes("fetch")
    ) {
      return i18n.global.t("errors.networkError");
    }

    // 处理 API 错误
    if (message.includes("API return error") || message.includes("code")) {
      return i18n.global.t("errors.apiError");
    }

    // 处理文件系统错误
    if (
      message.includes("file") ||
      message.includes("directory") ||
      message.includes("path") ||
      message.includes("permission")
    ) {
      return i18n.global.t("errors.fileSystemError");
    }

    // 返回原始消息（如果无法识别）
    return message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return i18n.global.t("errors.unknownError");
}
