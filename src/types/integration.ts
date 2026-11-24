export type IntegrationTransport = "stdio";

/** A normalized MCP server definition shared by the builder and compiler. */
export interface IntegrationDefinition {
  name: string;
  description: string;
  transport: IntegrationTransport;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface IntegrationIssue {
  path: string;
  message: string;
  line?: number;
  column?: number;
}

export const EMPTY_INTEGRATION: IntegrationDefinition = {
  name: "",
  description: "",
  transport: "stdio",
  command: "",
  args: [],
  env: {},
};
