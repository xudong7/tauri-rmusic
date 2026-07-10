import { invokeCommand } from "../client";

export async function quitApp(): Promise<void> {
  await invokeCommand("quit_app");
}
