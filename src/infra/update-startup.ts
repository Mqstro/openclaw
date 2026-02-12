import type { loadConfig } from "../config/config.js";

export async function runGatewayUpdateCheck(_params: {
  cfg: ReturnType<typeof loadConfig>;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
  allowInTests?: boolean;
}): Promise<void> {
  // SECURITY HARDENING: Auto-update check is disabled in this hardened build.
  // No outbound network calls to check for new versions.
  return;
}

export function scheduleGatewayUpdateCheck(params: {
  cfg: ReturnType<typeof loadConfig>;
  log: { info: (msg: string, meta?: Record<string, unknown>) => void };
  isNixMode: boolean;
}): void {
  void runGatewayUpdateCheck(params).catch(() => {});
}
