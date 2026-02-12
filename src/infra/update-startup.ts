import fs from "node:fs/promises";
import path from "node:path";
import type { loadConfig } from "../config/config.js";
import { formatCliCommand } from "../cli/command-format.js";
import { resolveStateDir } from "../config/paths.js";
import { VERSION } from "../version.js";
import { resolveOpenClawPackageRoot } from "./openclaw-root.js";
import { normalizeUpdateChannel, DEFAULT_PACKAGE_CHANNEL } from "./update-channels.js";
import { compareSemverStrings, resolveNpmChannelTag, checkUpdateStatus } from "./update-check.js";

type UpdateCheckState = {
  lastCheckedAt?: string;
  lastNotifiedVersion?: string;
  lastNotifiedTag?: string;
};

const UPDATE_CHECK_FILENAME = "update-check.json";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

function shouldSkipCheck(allowInTests: boolean): boolean {
  if (allowInTests) {
    return false;
  }
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return true;
  }
  return false;
}

async function readState(statePath: string): Promise<UpdateCheckState> {
  try {
    const raw = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw) as UpdateCheckState;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeState(statePath: string, state: UpdateCheckState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

export async function runGatewayUpdateCheck(params: {
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
