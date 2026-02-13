import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

interface HomeAssistantConfig {
  baseUrl: string;
  accessToken: string;
}

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

async function callHomeAssistant(
  config: HomeAssistantConfig,
  endpoint: string,
  method: string = "GET",
  body?: unknown,
): Promise<unknown> {
  const url = `${config.baseUrl}/api/${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.accessToken}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Home Assistant API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function getConfig(api: OpenClawPluginApi): HomeAssistantConfig {
  const config = api.config.plugins?.entries?.homeassistant?.config as
    | HomeAssistantConfig
    | undefined;
  if (!config?.baseUrl || !config?.accessToken) {
    throw new Error(
      "Home Assistant plugin not configured. Missing baseUrl or accessToken in config.",
    );
  }
  return config;
}

const plugin = {
  id: "homeassistant",
  name: "Home Assistant Integration",
  description: "Control Home Assistant devices and automations",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Register Home Assistant tools
    api.registerAgentTool({
      name: "homeassistant_get_states",
      description: "Get all entity states from Home Assistant or a specific entity state",
      input_schema: {
        type: "object" as const,
        properties: {
          entity_id: {
            type: "string" as const,
            description:
              "Optional: Specific entity ID to get state for (e.g., 'light.living_room'). If omitted, returns all states.",
          },
        },
      },
      async handler(params: { entity_id?: string }) {
        const config = getConfig(api);
        const endpoint = params.entity_id ? `states/${params.entity_id}` : "states";
        const result = await callHomeAssistant(config, endpoint);

        return {
          success: true,
          data: result,
        };
      },
    });

    api.registerAgentTool({
      name: "homeassistant_call_service",
      description:
        "Call a Home Assistant service (e.g., turn on/off lights, switches, trigger automations)",
      input_schema: {
        type: "object" as const,
        properties: {
          domain: {
            type: "string" as const,
            description: "Service domain (e.g., 'light', 'switch', 'automation', 'script')",
          },
          service: {
            type: "string" as const,
            description: "Service name (e.g., 'turn_on', 'turn_off', 'toggle', 'trigger')",
          },
          entity_id: {
            type: "string" as const,
            description: "Target entity ID (e.g., 'light.living_room', 'switch.coffee_maker')",
          },
          service_data: {
            type: "object" as const,
            description: "Optional additional service data (e.g., brightness, color)",
          },
        },
        required: ["domain", "service"],
      },
      async handler(params: {
        domain: string;
        service: string;
        entity_id?: string;
        service_data?: Record<string, unknown>;
      }) {
        const config = getConfig(api);

        const body: Record<string, unknown> = {};
        if (params.entity_id) {
          body.entity_id = params.entity_id;
        }
        if (params.service_data) {
          Object.assign(body, params.service_data);
        }

        const endpoint = `services/${params.domain}/${params.service}`;
        const result = await callHomeAssistant(config, endpoint, "POST", body);

        return {
          success: true,
          message: `Called ${params.domain}.${params.service}${params.entity_id ? ` on ${params.entity_id}` : ""}`,
          data: result,
        };
      },
    });

    api.registerAgentTool({
      name: "homeassistant_list_entities",
      description: "List all available entities in Home Assistant, optionally filtered by domain",
      input_schema: {
        type: "object" as const,
        properties: {
          domain: {
            type: "string" as const,
            description:
              "Optional: Filter by domain (e.g., 'light', 'switch', 'sensor', 'automation')",
          },
        },
      },
      async handler(params: { domain?: string }) {
        const config = getConfig(api);
        const states = (await callHomeAssistant(config, "states")) as HAState[];

        let filtered = states;
        if (params.domain) {
          filtered = states.filter((s) => s.entity_id.startsWith(`${params.domain}.`));
        }

        const entities = filtered.map((s) => ({
          entity_id: s.entity_id,
          state: s.state,
          friendly_name: s.attributes.friendly_name || s.entity_id,
        }));

        return {
          success: true,
          count: entities.length,
          entities,
        };
      },
    });
  },
};

export default plugin;
