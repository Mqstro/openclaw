import {
  disableTailscaleServe,
  enableTailscaleServe,
  getTailnetHostname,
} from "../infra/tailscale.js";

export async function startGatewayTailscaleExposure(params: {
  tailscaleMode: "off" | "serve";
  resetOnExit?: boolean;
  port: number;
  controlUiBasePath?: string;
  logTailscale: { info: (msg: string) => void; warn: (msg: string) => void };
}): Promise<(() => Promise<void>) | null> {
  if (params.tailscaleMode === "off") {
    return null;
  }

  if (params.tailscaleMode !== "serve") {
    throw new Error(`Unsupported tailscale mode: ${params.tailscaleMode as string}`);
  }

  try {
    await enableTailscaleServe(params.port);
    const host = await getTailnetHostname().catch(() => null);
    if (host) {
      const uiPath = params.controlUiBasePath ? `${params.controlUiBasePath}/` : "/";
      params.logTailscale.info(`serve enabled: https://${host}${uiPath} (WS via wss://${host})`);
    } else {
      params.logTailscale.info(`serve enabled`);
    }
  } catch (err) {
    params.logTailscale.warn(`serve failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!params.resetOnExit) {
    return null;
  }

  return async () => {
    try {
      await disableTailscaleServe();
    } catch (err) {
      params.logTailscale.warn(
        `serve cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
}
