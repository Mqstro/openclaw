import type { MsgContext } from "../auto-reply/templating.js";
import type { OpenClawConfig } from "../config/config.js";

export type LinkUnderstandingResult = {
  urls: string[];
  outputs: string[];
};

export async function runLinkUnderstanding(_params: {
  cfg: OpenClawConfig;
  ctx: MsgContext;
  message?: string;
}): Promise<LinkUnderstandingResult> {
  // --- HARDENED BUILD: Link understanding disabled ---
  return { urls: [], outputs: [] };
}
