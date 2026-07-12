export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
  /** Path parameters substitute a {{token}} in the URL instead of becoming a query string. */
  location?: "path" | "query";
}

export interface RequestSpec {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  params: KeyValue[];
  body: string;
  bodyType: "json" | "text" | "none";
  group?: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: Record<string, string>;
  /** Names whose values live in VS Code SecretStorage instead of the collection file. */
  secretVariableNames?: string[];
}

export interface Endpoint {
  id: string;
  group: string;
  name: string;
  method: HttpMethod;
  path: string;
  request: RequestSpec;
}

export interface EasyRequestDocument {
  version: 1;
  selectedEnvironmentId: string;
  environments: Environment[];
  requests: RequestSpec[];
  endpoints: Endpoint[];
  swaggerUrl?: string;
  discoverySource?: "swagger" | "dotnet" | "cache";
}

export interface HttpResult {
  index: number;
  ok: boolean;
  status?: number;
  statusText?: string;
  durationMs: number;
  headers: Record<string, string>;
  body: string;
  truncated?: boolean;
  error?: string;
}

export interface BatchResult {
  results: HttpResult[];
  totalDurationMs: number;
}

export const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
