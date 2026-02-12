import type { Command } from "commander";
import type { NodesRpcOpts } from "./types.js";
import { defaultRuntime } from "../../runtime.js";
import { getNodesTheme, runNodesCommand } from "./cli-utils.js";
import { callGatewayCli, nodesCallOpts, resolveNodeId } from "./rpc.js";

export function registerNodesPairingCommands(nodes: Command) {
  // SECURITY HARDENING: Node pairing commands disabled in this hardened build.
  nodes
    .command("pending")
    .description("List pending pairing requests (disabled)")
    .action(() => {
      defaultRuntime.log("Pairing is disabled in this hardened build.");
    });

  nodes
    .command("approve")
    .description("Approve a pending pairing request (disabled)")
    .argument("<requestId>", "Pending request id")
    .action(() => {
      defaultRuntime.log("Pairing is disabled in this hardened build.");
    });

  nodes
    .command("reject")
    .description("Reject a pending pairing request (disabled)")
    .argument("<requestId>", "Pending request id")
    .action(() => {
      defaultRuntime.log("Pairing is disabled in this hardened build.");
    });

  nodesCallOpts(
    nodes
      .command("rename")
      .description("Rename a paired node (display name override)")
      .requiredOption("--node <idOrNameOrIp>", "Node id, name, or IP")
      .requiredOption("--name <displayName>", "New display name")
      .action(async (opts: NodesRpcOpts) => {
        await runNodesCommand("rename", async () => {
          const nodeId = await resolveNodeId(opts, String(opts.node ?? ""));
          const name = String(opts.name ?? "").trim();
          if (!nodeId || !name) {
            defaultRuntime.error("--node and --name required");
            defaultRuntime.exit(1);
            return;
          }
          const result = await callGatewayCli("node.rename", opts, {
            nodeId,
            displayName: name,
          });
          if (opts.json) {
            defaultRuntime.log(JSON.stringify(result, null, 2));
            return;
          }
          const { ok } = getNodesTheme();
          defaultRuntime.log(ok(`node rename ok: ${nodeId} -> ${name}`));
        });
      }),
  );
}
