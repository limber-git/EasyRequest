import { Endpoint } from "../../types";
import { DiscoveredService } from "../CollectionTree";

export interface DiscoveryResult {
  source: "swagger" | "dotnet" | "cache";
  endpoints: Endpoint[];
  /** Services preserve independent network contexts when a workspace has multiple APIs. */
  services?: DiscoveredService[];
  /** Base URL detected from the API definition, when the strategy can provide one. */
  baseUrl?: string;
  warning?: string;
}

export interface IDiscoveryStrategy {
  discover(): Promise<DiscoveryResult>;
}
