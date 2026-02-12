import type { Command } from "commander";
import { normalizeChannelId } from "../channels/plugins/index.js";
import { listPairingChannels, notifyPairingApproved } from "../channels/plugins/pairing.js";
import { loadConfig } from "../config/config.js";
import { resolvePairingIdLabel } from "../pairing/pairing-labels.js";
import {
  approveChannelPairingCode,
  listChannelPairingRequests,
  type PairingChannel,
} from "../pairing/pairing-store.js";
import { defaultRuntime } from "../runtime.js";
import { formatDocsLink } from "../terminal/links.js";
import { renderTable } from "../terminal/table.js";
import { theme } from "../terminal/theme.js";
import { formatCliCommand } from "./command-format.js";

/** Parse channel, allowing extension channels not in core registry. */
function parseChannel(raw: unknown, channels: PairingChannel[]): PairingChannel {
  const value = (
    typeof raw === "string"
      ? raw
      : typeof raw === "number" || typeof raw === "boolean"
        ? String(raw)
        : ""
  )
    .trim()
    .toLowerCase();
  if (!value) {
    throw new Error("Channel required");
  }

  const normalized = normalizeChannelId(value);
  if (normalized) {
    if (!channels.includes(normalized)) {
      throw new Error(`Channel ${normalized} does not support pairing`);
    }
    return normalized;
  }

  // Allow extension channels: validate format but don't require registry
  if (/^[a-z][a-z0-9_-]{0,63}$/.test(value)) {
    return value as PairingChannel;
  }
  throw new Error(`Invalid channel: ${value}`);
}

async function notifyApproved(channel: PairingChannel, id: string) {
  const cfg = loadConfig();
  await notifyPairingApproved({ channelId: channel, id, cfg });
}

export function registerPairingCli(program: Command) {
  const pairing = program
    .command("pairing")
    .description("Pairing is disabled in this hardened build");

  pairing
    .command("list")
    .description("List pending pairing requests (disabled)")
    .argument("[channel]")
    .option("--channel <channel>")
    .option("--json", "Print JSON", false)
    .action(() => {
      defaultRuntime.log("Pairing is disabled in this hardened build. Use allowlist mode instead.");
    });

  pairing
    .command("approve")
    .description("Approve a pairing code (disabled)")
    .argument("<codeOrChannel>")
    .argument("[code]")
    .option("--channel <channel>")
    .option("--notify", "", false)
    .action(() => {
      defaultRuntime.log("Pairing is disabled in this hardened build. Use allowlist mode instead.");
    });
}
