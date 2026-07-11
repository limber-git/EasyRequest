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
    const resolve = (value: string) => this.resolveString(value, variables, missing);

    return {
      ...request,
      url: resolve(request.url),
      body: resolve(request.body),
      headers: this.resolveEntries(request.headers, resolve),
      params: this.resolveEntries(request.params, resolve),
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

  private resolveEntries(entries: KeyValue[], resolve: (value: string) => string): Record<string, string> {
    return entries.reduce<Record<string, string>>((result, entry) => {
      if (entry.enabled && entry.key.trim()) {
        result[resolve(entry.key).trim()] = resolve(entry.value);
      }
      return result;
    }, {});
  }
}
