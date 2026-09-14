// Tool registry scaffold. Tools registered here can later be exposed to the
// model as OpenAI-compatible function tools.

export interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  /** JSON Schema describing the tool input. */
  parameters: Record<string, unknown>;
  execute: (input: TInput) => Promise<TOutput>;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition) {
  tools.set(tool.name, tool);
}

export function getTool(name: string) {
  return tools.get(name);
}

export function listTools(): ToolDefinition[] {
  return [...tools.values()];
}

/** Shape expected by OpenAI-compatible `tools` request field. */
export function toolsForRequest() {
  return listTools().map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}
