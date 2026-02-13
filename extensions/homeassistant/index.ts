import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
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

const GetStatesSchema = Type.Object({
  entity_id: Type.Optional(
    Type.String({
      description:
        "Optional: Specific entity ID to get state for (e.g., 'light.living_room'). If omitted, returns all states.",
    }),
  ),
});

const CallServiceSchema = Type.Object({
  domain: Type.String({
    description: "Service domain (e.g., 'light', 'switch', 'automation', 'script')",
  }),
  service: Type.String({
    description: "Service name (e.g., 'turn_on', 'turn_off', 'toggle', 'trigger')",
  }),
  entity_id: Type.Optional(
    Type.String({
      description: "Target entity ID (e.g., 'light.living_room', 'switch.coffee_maker')",
    }),
  ),
  service_data: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Optional additional service data (e.g., brightness, color)",
    }),
  ),
});

const ListEntitiesSchema = Type.Object({
  domain: Type.Optional(
    Type.String({
      description: "Optional: Filter by domain (e.g., 'light', 'switch', 'sensor', 'automation')",
    }),
  ),
});

const plugin = {
  id: "homeassistant",
  name: "Home Assistant Integration",
  description: "Control Home Assistant devices and automations",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Get states tool
    api.registerTool({
      name: "homeassistant_get_states",
      description: "Get all entity states from Home Assistant or a specific entity state",
      parameters: GetStatesSchema,
      async execute(_toolCallId, params) {
        const config = getConfig(api);
        const endpoint = params.entity_id ? `states/${params.entity_id}` : "states";
        const result = await callHomeAssistant(config, endpoint);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    });

    // Call service tool
    api.registerTool({
      name: "homeassistant_call_service",
      description:
        "Call a Home Assistant service (e.g., turn on/off lights, switches, trigger automations)",
      parameters: CallServiceSchema,
      async execute(_toolCallId, params) {
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
          content: [
            {
              type: "text" as const,
              text: `✅ Called ${params.domain}.${params.service}${params.entity_id ? ` on ${params.entity_id}` : ""}\n\nResult: ${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      },
    });

    // List entities tool
    api.registerTool({
      name: "homeassistant_list_entities",
      description: "List all available entities in Home Assistant, optionally filtered by domain",
      parameters: ListEntitiesSchema,
      async execute(_toolCallId, params) {
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
          content: [
            {
              type: "text" as const,
              text: `Found ${entities.length} entities${params.domain ? ` in domain '${params.domain}'` : ""}:\n\n${JSON.stringify(entities, null, 2)}`,
            },
          ],
        };
      },
    });
  },
};

export default plugin;
