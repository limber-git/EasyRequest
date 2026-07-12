import * as vscode from "vscode";
import { Endpoint, HttpMethod, METHODS, RequestSpec } from "../../types";
import { DiscoveredService } from "../CollectionTree";
import { DiscoveryResult, IDiscoveryStrategy } from "./IDiscoveryStrategy";

/**
 * A deliberately conservative, offline mapper for the most common ASP.NET Core
 * controller and minimal-API declarations. It never executes or compiles user code.
 */
export class DotNetStaticStrategy implements IDiscoveryStrategy {
  private static readonly maximumFileBytes = 2 * 1024 * 1024;
  private static readonly maximumConcurrency = 8;

  public constructor(private readonly workspaceRoot: vscode.Uri) {}

  public async discover(): Promise<DiscoveryResult> {
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceRoot, "**/*.cs"),
      "**/{bin,obj}/**",
      500
    );
    const projectFiles = await vscode.workspace.findFiles(
      new vscode.RelativePattern(this.workspaceRoot, "**/*.csproj"),
      "**/{bin,obj}/**",
      100
    );
    const projects = projectFiles.map((uri) => ({
      name: uri.path.slice(uri.path.lastIndexOf("/") + 1).replace(/\.csproj$/i, ""),
      directory: uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf("/")) })
    }));
    const endpointSets = new Array<{ project: string; endpoints: Endpoint[] }>(files.length);
    let nextIndex = 0;
    let skippedLargeFiles = 0;
    const worker = async () => {
      while (nextIndex < files.length) {
        const index = nextIndex++;
        const stat = await vscode.workspace.fs.stat(files[index]);
        if (stat.size > DotNetStaticStrategy.maximumFileBytes) {
          endpointSets[index] = { project: this.projectFor(files[index], projects), endpoints: [] };
          skippedLargeFiles += 1;
        } else {
          endpointSets[index] = { project: this.projectFor(files[index], projects), endpoints: await this.parseFile(files[index]) };
        }
      }
    };
    await Promise.all(Array.from(
      { length: Math.min(files.length, DotNetStaticStrategy.maximumConcurrency) },
      () => worker()
    ));
    const byProject = new Map<string, Endpoint[]>();
    endpointSets.forEach((entry) => byProject.set(entry.project, [...(byProject.get(entry.project) ?? []), ...entry.endpoints]));
    const services: DiscoveredService[] = await Promise.all([...byProject.entries()].map(async ([name, candidates]) => {
      const known = new Set<string>();
      const endpoints = candidates.filter((endpoint) => {
        const key = `${endpoint.method}:${endpoint.path}`;
        if (known.has(key)) {
          return false;
        }
        known.add(key);
        return true;
      }).sort((left, right) => left.group.localeCompare(right.group) || left.path.localeCompare(right.path));
      const project = projects.find((item) => item.name === name);
      return { id: name, name, endpoints, ...(project ? await this.projectBaseUrl(project.directory) : {}) };
    }));
    const endpoints = services.flatMap((service) => service.endpoints);

    return {
      source: "dotnet",
      endpoints,
      services,
      warning: skippedLargeFiles ? `${skippedLargeFiles} archivos C# mayores de 2 MiB fueron omitidos.` : undefined
    };
  }

  private projectFor(file: vscode.Uri, projects: Array<{ name: string; directory: vscode.Uri }>): string {
    const match = projects
      .filter((project) => file.path.startsWith(`${project.directory.path}/`))
      .sort((left, right) => right.directory.path.length - left.directory.path.length)[0];
    return match?.name ?? "API local";
  }

  private async projectBaseUrl(directory: vscode.Uri): Promise<{ baseUrl?: string }> {
    try {
      const raw = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(directory, "Properties", "launchSettings.json"))).toString("utf8");
      const parsed = JSON.parse(raw) as { profiles?: Record<string, { applicationUrl?: string }> };
      const applicationUrl = Object.values(parsed.profiles ?? {})
        .flatMap((profile) => profile.applicationUrl?.split(";") ?? [])
        .map((url) => url.trim())
        .find((url) => /^https?:\/\//i.test(url));
      return applicationUrl ? { baseUrl: applicationUrl.replace(/\/$/, "") } : {};
    } catch {
      return {};
    }
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
      // Escapes keep the nested C# attribute/return-type character classes readable.
      // eslint-disable-next-line no-useless-escape
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
    const params = [...normalizedPath.matchAll(/\{([^}:]+)(?::[^}]+)?\}/g)].map((match) => ({
      key: match[1],
      value: "",
      enabled: true,
      location: "path" as const
    }));
    const id = `${method}:${normalizedPath}`;
    const request: RequestSpec = {
      id,
      name,
      method,
      url: templated,
      headers: [],
      params,
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
