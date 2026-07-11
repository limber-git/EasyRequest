import * as vscode from "vscode";
import { Endpoint } from "../../types";
import { DotNetStaticStrategy } from "./DotNetStaticStrategy";
import { DiscoveryResult } from "./IDiscoveryStrategy";
import { SwaggerStrategy } from "./SwaggerStrategy";

export class DiscoveryContext {
  public async discover(options: {
    swaggerUrl?: string;
    workspaceRoot?: vscode.Uri;
    cachedEndpoints: Endpoint[];
  }): Promise<DiscoveryResult> {
    const warnings: string[] = [];
    if (options.swaggerUrl?.trim()) {
      try {
        return await new SwaggerStrategy(options.swaggerUrl.trim()).discover();
      } catch (error) {
        warnings.push(`No fue posible sincronizar Swagger: ${this.errorMessage(error)}`);
      }
    }

    if (options.workspaceRoot) {
      try {
        const result = await new DotNetStaticStrategy(options.workspaceRoot).discover();
        if (result.endpoints.length) {
          return { ...result, warning: warnings.join(" ") || undefined };
        }
        warnings.push("No se encontraron endpoints ASP.NET Core en el espacio de trabajo.");
      } catch (error) {
        warnings.push(`No fue posible analizar el código C#: ${this.errorMessage(error)}`);
      }
    }

    return {
      source: "cache",
      endpoints: options.cachedEndpoints,
      warning: warnings.join(" ") || "Se está mostrando la última estructura guardada."
    };
  }

  public discoverDotNet(workspaceRoot: vscode.Uri): Promise<DiscoveryResult> {
    return new DotNetStaticStrategy(workspaceRoot).discover();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Error desconocido.";
  }
}
