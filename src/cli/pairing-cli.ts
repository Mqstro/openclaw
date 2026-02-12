import type { Command } from "commander";
import { defaultRuntime } from "../runtime.js";

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
