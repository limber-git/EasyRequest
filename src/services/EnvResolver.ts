import { KeyValue, RequestSpec } from "../types";

export interface ResolvedRequest extends Omit<RequestSpec, "headers" | "params"> {
  headers: Record<string, string>;
  params: Record<string, string>;
  missingVariables: string[];
}

/** Replaces {{variable}} tokens without evaluating arbitrary expressions. */
export class EnvResolver {
  public resolveRequest(request: RequestSpec, variables: Record<string, string>): ResolvedRequest {
    const missing = new Set<string>();
    const resolveEnvironment = (value: string) => this.resolveString(value, variables, missing);
    const pathVariables = this.resolvePathVariables(request, variables, missing);
    const resolveUrl = (value: string) => this.resolveString(value, variables, missing, (name) => {
      if (Object.prototype.hasOwnProperty.call(pathVariables, name)) {
        return encodeURIComponent(pathVariables[name]);
      }
      return undefined;
    });

    return {
      ...request,
      url: resolveUrl(request.url),
      body: resolveEnvironment(request.body),
      headers: this.resolveEntries(request.headers, resolveEnvironment),
      params: this.resolveEntries(
        request.params,
        resolveEnvironment,
        (key, entry) => entry.location !== "path" && (entry.location === "query" || !this.isRouteToken(request.url, key))
      ),
      missingVariables: [...missing]
    };
  }

  private resolveString(
    value: string,
    variables: Record<string, string>,
    missing: Set<string>,
    override: (name: string) => string | undefined = () => undefined
  ): string {
    return value.replace(/{{\s*([\w.-]+)\s*}}/g, (token, name: string) => {
      const overridden = override(name);
      if (overridden !== undefined) {
        return overridden;
      }
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        return variables[name];
      }
      missing.add(name);
      return token;
    });
  }

  private resolvePathVariables(
    request: RequestSpec,
    variables: Record<string, string>,
    missing: Set<string>
  ): Record<string, string> {
    return request.params.reduce<Record<string, string>>((result, entry) => {
      if (entry.enabled && entry.key.trim()) {
        const key = this.resolveString(entry.key, variables, missing).trim();
        if (entry.location === "path" || (entry.location === undefined && this.isRouteToken(request.url, key))) {
          this.setEntry(result, key, this.resolveString(entry.value, variables, missing));
        }
      }
      return result;
    }, {});
  }

  private resolveEntries(
    entries: KeyValue[],
    resolve: (value: string) => string,
    include: (key: string, entry: KeyValue) => boolean = () => true
  ): Record<string, string> {
    return entries.reduce<Record<string, string>>((result, entry) => {
      if (entry.enabled && entry.key.trim()) {
        const key = resolve(entry.key).trim();
        if (include(key, entry)) {
          this.setEntry(result, key, resolve(entry.value));
        }
      }
      return result;
    }, {});
  }

  private setEntry(result: Record<string, string>, key: string, value: string): void {
    Object.defineProperty(result, key, { value, enumerable: true, configurable: true, writable: true });
  }

  private isRouteToken(url: string, key: string): boolean {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`{{\\s*${escapedKey}\\s*}}`).test(url);
  }
}
