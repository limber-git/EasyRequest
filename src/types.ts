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

export interface CollectionFolder {
  id: string;
  type: "folder";
  name: string;
  /** A literal URL or an environment expression such as {{ordersApiUrl}}. */
  baseUrl?: string;
  children: CollectionNode[];
}

export interface CollectionRequest {
  id: string;
  type: "request";
  name: string;
  /** Overrides the base URL inherited from parent folders when supplied. */
  baseUrl?: string;
  request: RequestSpec;
}

export type CollectionNode = CollectionFolder | CollectionRequest;

export interface EasyRequestDocument {
  version: 2;
  selectedEnvironmentId: string;
  environments: Environment[];
  root: CollectionFolder;
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
