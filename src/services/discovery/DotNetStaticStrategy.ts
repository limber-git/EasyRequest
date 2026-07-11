import * as vscode from "vscode";
import { Endpoint, HttpMethod, METHODS, RequestSpec } from "../../types";
import { DiscoveryResult, IDiscoveryStrategy } from "./IDiscoveryStrategy";

/**
 * A deliberately conservative, offline mapper for the most common ASP.NET Core
 * controller and minimal-API declarations. It never executes or compiles user code.
 */
export class DotNetStaticStrategy implements IDiscoveryStrategy {
  public constructor(private readonly workspaceRoot: vscode.Uri) {}

  public async discover(): Promise<DiscoveryResult> {
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceRoot, "**/*.cs"),
      "**/{bin,obj}/**",
      500
    );
    const endpointSets = await Promise.all(files.map((file) => this.parseFile(file)));
    const known = new Set<string>();
    const endpoints = endpointSets.flat().filter((endpoint) => {
      const key = `${endpoint.method}:${endpoint.path}`;
      if (known.has(key)) {
        return false;
      }
      known.add(key);
      return true;
    });

    return {
      source: "dotnet",
      endpoints: endpoints.sort((left, right) => left.group.localeCompare(right.group) || left.path.localeCompare(right.path))
    };
  }

  private async parseFile(uri: vscode.Uri): Promise<Endpoint[]> {
    const source = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    return [...this.parseControllers(source), ...this.parseMinimalApis(source)];
  }

  private parseControllers(source: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const classes = /((?:\s*\[[^\]]+\]\s*)*)\s*(?:public\s+|internal\s+)?(?:sealed\s+|abstract\s+)?class\s+(\w+Controller)\b/g;
    for (const match of source.matchAll(classes)) {
      const attributes = match[1] ?? "";
      const className = match[2];
      const openBrace = source.indexOf("{", (match.index ?? 0) + match[0].length);
      if (openBrace < 0) {
        continue;
      }
      const body = source.slice(openBrace + 1, this.matchingBrace(source, openBrace));
      const controller = className.replace(/Controller$/, "");
      const classRoute = this.routeFromAttributes(attributes) ?? `api/${controller}`;
      const actionPattern = /((?:\s*\[[^\]]+\]\s*)+)\s*(?:public|internal|protected)\s+(?:async\s+)?[\w<>,?.\[\]\s]+?\s+(\w+)\s*\(/g;

      for (const action of body.matchAll(actionPattern)) {
        const actionAttributes = action[1] ?? "";
        const verb = this.verbFromAttributes(actionAttributes);
        if (!verb) {
          continue;
        }
        const methodRoute = this.routeFromAttributes(actionAttributes) ?? this.httpRoute(actionAttributes) ?? "";
        const path = this.joinRoute(classRoute.replace(/\[controller\]/gi, controller), methodRoute);
        endpoints.push(this.endpoint(verb, path, controller, action[2]));
      }
    }
    return endpoints;
  }

  private parseMinimalApis(source: string): Endpoint[] {
    const endpoints: Endpoint[] = [];
    const maps = /\b(?:app|routes|endpoints)\s*\.\s*Map(Get|Post|Put|Patch|Delete|Methods)\s*\(\s*"([^"]+)"/gi;
    for (const match of source.matchAll(maps)) {
      const declared = match[1].toUpperCase();
      if (!METHODS.includes(declared as HttpMethod)) {
        continue;
      }
      const path = match[2];
      endpoints.push(this.endpoint(declared as HttpMethod, path, "Minimal APIs", `${declared} ${path}`));
    }
    return endpoints;
  }

  private endpoint(method: HttpMethod, path: string, group: string, name: string): Endpoint {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const templated = normalizedPath.replace(/\{([^}:]+)(?::[^}]+)?\}/g, "{{$1}}");
    const id = `${method}:${normalizedPath}`;
    const request: RequestSpec = {
      id,
      name,
      method,
      url: templated,
      headers: [],
      params: [],
      body: "",
      bodyType: "none",
      group
    };
    return { id, group, name, method, path: normalizedPath, request };
  }

  private routeFromAttributes(attributes: string): string | undefined {
    const route = /\[Route\s*\(\s*"([^"]*)"\s*\)\s*\]/i.exec(attributes);
    return route?.[1];
  }

  private httpRoute(attributes: string): string | undefined {
    const route = /\[Http(?:Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*"([^"]*)"\s*\)\s*\]/i.exec(attributes);
    return route?.[1];
  }

  private verbFromAttributes(attributes: string): HttpMethod | undefined {
    const match = /\[Http(Get|Post|Put|Patch|Delete|Head|Options)\b/i.exec(attributes);
    return match?.[1].toUpperCase() as HttpMethod | undefined;
  }

  private joinRoute(left: string, right: string): string {
    return `/${left}/${right}`.replace(/\/+/g, "/").replace(/\/$/, "");
  }

  private matchingBrace(source: string, openingIndex: number): number {
    let depth = 0;
    for (let index = openingIndex; index < source.length; index += 1) {
      if (source[index] === "{") {
        depth += 1;
      } else if (source[index] === "}" && --depth === 0) {
        return index;
      }
    }
    return source.length;
  }
}
