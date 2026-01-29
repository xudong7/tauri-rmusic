import { invoke } from "@tauri-apps/api/core";
import type { TauriCommand, TauriCommandParams, TauriCommandResult } from "./types.ts";

export class TauriCommandError extends Error {
  command: string;
  cause: unknown;
  message: string;

  constructor(command: string, cause: unknown) {
    const causeMessage =
      cause instanceof Error
        ? cause.message
        : typeof cause === "string"
          ? cause
          : String(cause);
    super(`[tauri] invoke(${command}) failed: ${causeMessage}`);
    this.name = "TauriCommandError";
    this.command = command;
    this.cause = cause;
    this.message = causeMessage;
  }

  /**
   * 获取原始错误消息（不包含 Tauri 包装）
   */
  getOriginalMessage(): string {
    return this.message;
  }
}

/**
 * 类型安全的 invoke 封装：
 * - 统一错误包装（包含 command 与 cause）
 * - 约束 command/params/result 类型，减少各处散落的泛型与字符串
 */
export async function invokeCommand<C extends TauriCommand>(
  command: C,
  params?: TauriCommandParams<C>
): Promise<TauriCommandResult<C>> {
  try {
    return (await invoke(command, params as any)) as TauriCommandResult<C>;
  } catch (e) {
    throw new TauriCommandError(String(command), e);
  }
}
