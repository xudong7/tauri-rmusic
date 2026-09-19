import { i18n } from "@/i18n";
import { TauriCommandError } from "@/api/client";

/**
 * 解析错误并返回用户友好的错误消息。
 *
 * 无法识别时不再回落到原始 message：那里通常是 Rust 侧的英文串
 * （`Empty song URL`、`Data array is empty`）或带类名前缀的技术描述
 * （`TauriCommandError: API request error: HTTP 502`）。这些对用户没有
 * 意义，中文界面下还会混进一段英文。原文改写进 console 供排查。
 */
export function parseErrorMessage(error: unknown): string {
  if (error instanceof TauriCommandError) {
    const message = error.getOriginalMessage();

    if (message.includes("file already exists")) {
      const match = message.match(/file already exists:\s*(.+)/);
      if (match && match[1]) {
        const fullPath = match[1].trim();
        const fileName = fullPath.split(/[/\\]/).pop() || fullPath;
        return i18n.global.t("errors.fileAlreadyExistsWithPath", { fileName });
      }
      return i18n.global.t("errors.fileAlreadyExists");
    }

    if (
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection") ||
      message.includes("fetch")
    ) {
      return i18n.global.t("errors.networkError");
    }

    if (message.includes("API return error") || message.includes("code")) {
      return i18n.global.t("errors.apiError");
    }

    if (
      message.includes("file") ||
      message.includes("directory") ||
      message.includes("path") ||
      message.includes("permission")
    ) {
      return i18n.global.t("errors.fileSystemError");
    }

    console.warn("[error] 未识别的命令错误，已折叠为通用文案:", error);
    return i18n.global.t("errors.unknownError");
  }

  console.warn("[error] 非命令错误，已折叠为通用文案:", error);
  return i18n.global.t("errors.unknownError");
}
