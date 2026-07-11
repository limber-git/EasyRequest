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
    const parameterVariables = this.resolveParameterVariables(request.params, variables, missing);
    const effectiveVariables = { ...variables, ...parameterVariables };
    const resolve = (value: string) => this.resolveString(value, effectiveVariables, missing);

    return {
      ...request,
      url: resolve(request.url),
      body: resolve(request.body),
      headers: this.resolveEntries(request.headers, resolve),
      params: this.resolveEntries(
        request.params,
        resolve,
        (key, entry) => entry.location !== "path" && !this.isRouteToken(request.url, key)
      ),
      missingVariables: [...missing]
    };
  }

  private resolveString(value: string, variables: Record<string, string>, missing: Set<string>): string {
    return value.replace(/{{\s*([\w.-]+)\s*}}/g, (token, name: string) => {
      if (Object.prototype.hasOwnProperty.call(variables, name)) {
        return variables[name];
      }
      missing.add(name);
      return token;
    });
  }

  private resolveParameterVariables(
    entries: KeyValue[],
    variables: Record<string, string>,
    missing: Set<string>
  ): Record<string, string> {
    return entries.reduce<Record<string, string>>((result, entry) => {
      if (entry.enabled && entry.key.trim()) {
        const key = this.resolveString(entry.key, variables, missing).trim();
        result[key] = this.resolveString(entry.value, variables, missing);
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
          result[key] = resolve(entry.value);
        }
      }
      return result;
    }, {});
  }

  private isRouteToken(url: string, key: string): boolean {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`{{\\s*${escapedKey}\\s*}}`).test(url);
  }
}
