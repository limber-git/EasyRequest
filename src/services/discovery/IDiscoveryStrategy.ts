import { Endpoint } from "../../types";

export interface DiscoveryResult {
  source: "swagger" | "dotnet" | "cache";
  endpoints: Endpoint[];
  warning?: string;
}

export interface IDiscoveryStrategy {
  discover(): Promise<DiscoveryResult>;
}
