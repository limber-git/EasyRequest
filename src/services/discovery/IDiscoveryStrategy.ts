import { Endpoint } from "../../types";

export interface DiscoveryResult {
  source: "swagger" | "dotnet" | "cache";
  endpoints: Endpoint[];
  /** Base URL detected from the API definition, when the strategy can provide one. */
  baseUrl?: string;
  warning?: string;
}

export interface IDiscoveryStrategy {
  discover(): Promise<DiscoveryResult>;
}
