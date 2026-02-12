import type { PairingChannel } from "./pairing-store.js";
import { formatCliCommand } from "../cli/command-format.js";

export function buildPairingReply(params: {
  channel: PairingChannel;
  idLine: string;
  code: string;
}): string {
  // SECURITY HARDENING: Pairing is disabled in this hardened build.
  return "OpenClaw: access denied. Pairing is disabled. Contact the bot owner to be added to the allowlist.";
}
