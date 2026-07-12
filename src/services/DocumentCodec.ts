import { createDefaultDocument } from "../defaultDocument";
import { EasyRequestDocument, Endpoint, Environment, HttpMethod, KeyValue, METHODS, RequestSpec } from "../types";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const BODY_MAX_LENGTH = 2 * 1024 * 1024;

export class DocumentFormatError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DocumentFormatError";
  }
}

export class DocumentCodec {
  public parse(raw: string): EasyRequestDocument {
    if (!raw.trim()) {
      return createDefaultDocument();
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_DOCUMENT_BYTES) {
      throw new DocumentFormatError("La colección supera el límite de 5 MiB.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "JSON inválido";
      throw new DocumentFormatError(`No se pudo leer la colección: ${detail}.`);
    }
    return this.fromUnknown(parsed);
  }

  public fromUnknown(value: unknown): EasyRequestDocument {
    const document = this.record(value, "documento");
    if (document.version !== 1) {
      throw new DocumentFormatError("La versión de la colección no es compatible.");
    }
    const environments = this.array(document.environments, "environments", 100).map((item, index) => this.environment(item, index));
    const requests = this.array(document.requests, "requests", 2000).map((item, index) => this.request(item, `requests[${index}]`));
    const endpoints = this.array(document.endpoints, "endpoints", 10000).map((item, index) => this.endpoint(item, index));
    if (!environments.length) {
      throw new DocumentFormatError("La colección debe contener al menos un entorno.");
    }
    this.assertUnique(environments.map((item) => item.id), "environments[].id");
    this.assertUnique(requests.map((item) => item.id), "requests[].id");
    this.assertUnique(endpoints.map((item) => item.id), "endpoints[].id");
    const selectedEnvironmentId = this.string(document.selectedEnvironmentId, "selectedEnvironmentId", 200);
    if (environments.length && !environments.some((environment) => environment.id === selectedEnvironmentId)) {
      throw new DocumentFormatError("selectedEnvironmentId no corresponde a un entorno existente.");
    }
    const swaggerUrl = this.optionalString(document.swaggerUrl, "swaggerUrl", 8192);
    const discoverySource = document.discoverySource === undefined
      ? undefined
      : this.oneOf(document.discoverySource, ["swagger", "dotnet", "cache"] as const, "discoverySource");
    return {
      version: 1,
      selectedEnvironmentId,
      environments,
      requests,
      endpoints,
      ...(swaggerUrl === undefined ? {} : { swaggerUrl }),
      ...(discoverySource === undefined ? {} : { discoverySource })
    };
  }

  public serialize(document: EasyRequestDocument): string {
    return `${JSON.stringify(this.fromUnknown(document), null, 2)}\n`;
  }

  private environment(value: unknown, index: number): Environment {
    const item = this.record(value, `environments[${index}]`);
    const variablesRecord = this.record(item.variables, `environments[${index}].variables`);
    const variables = Object.fromEntries(Object.entries(variablesRecord).map(([key, variable]) => [
      this.string(key, "nombre de variable", 200),
      this.string(variable, `variables.${key}`, 100000)
    ]));
    const secretVariableNames = item.secretVariableNames === undefined
      ? undefined
      : [...new Set(this.array(item.secretVariableNames, "secretVariableNames", 200).map((name) => this.string(name, "secretVariableNames[]", 200)))]
        .filter((name) => Object.prototype.hasOwnProperty.call(variables, name));
    return {
      id: this.string(item.id, `environments[${index}].id`, 200),
      name: this.string(item.name, `environments[${index}].name`, 500),
      variables,
      ...(secretVariableNames?.length ? { secretVariableNames } : {})
    };
  }

  private request(value: unknown, path: string): RequestSpec {
    const item = this.record(value, path);
    const group = this.optionalString(item.group, `${path}.group`, 500);
    return {
      id: this.string(item.id, `${path}.id`, 500),
      name: this.string(item.name, `${path}.name`, 1000),
      method: this.oneOf(item.method, METHODS, `${path}.method`) as HttpMethod,
      url: this.string(item.url, `${path}.url`, 8192),
      headers: this.array(item.headers, `${path}.headers`, 500).map((entry, index) => this.keyValue(entry, `${path}.headers[${index}]`)),
      params: this.array(item.params, `${path}.params`, 500).map((entry, index) => this.keyValue(entry, `${path}.params[${index}]`)),
      body: this.string(item.body, `${path}.body`, BODY_MAX_LENGTH),
      bodyType: this.oneOf(item.bodyType, ["json", "text", "none"] as const, `${path}.bodyType`),
      ...(group === undefined ? {} : { group })
    };
  }

  private keyValue(value: unknown, path: string): KeyValue {
    const item = this.record(value, path);
    if (typeof item.enabled !== "boolean") {
      throw new DocumentFormatError(`${path}.enabled debe ser booleano.`);
    }
    const location = item.location === undefined ? undefined : this.oneOf(item.location, ["path", "query"] as const, `${path}.location`);
    return {
      key: this.string(item.key, `${path}.key`, 1000),
      value: this.string(item.value, `${path}.value`, 100000),
      enabled: item.enabled,
      ...(location === undefined ? {} : { location })
    };
  }

  private endpoint(value: unknown, index: number): Endpoint {
    const path = `endpoints[${index}]`;
    const item = this.record(value, path);
    return {
      id: this.string(item.id, `${path}.id`, 500),
      group: this.string(item.group, `${path}.group`, 500),
      name: this.string(item.name, `${path}.name`, 1000),
      method: this.oneOf(item.method, METHODS, `${path}.method`) as HttpMethod,
      path: this.string(item.path, `${path}.path`, 8192),
      request: this.request(item.request, `${path}.request`)
    };
  }

  private record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new DocumentFormatError(`${path} debe ser un objeto.`);
    }
    return value as Record<string, unknown>;
  }

  private array(value: unknown, path: string, maximum: number): unknown[] {
    if (!Array.isArray(value)) {
      throw new DocumentFormatError(`${path} debe ser un array.`);
    }
    if (value.length > maximum) {
      throw new DocumentFormatError(`${path} supera el máximo de ${maximum} elementos.`);
    }
    return value;
  }

  private string(value: unknown, path: string, maximum: number): string {
    if (typeof value !== "string") {
      throw new DocumentFormatError(`${path} debe ser texto.`);
    }
    if (value.length > maximum) {
      throw new DocumentFormatError(`${path} supera el máximo de ${maximum} caracteres.`);
    }
    return value;
  }

  private optionalString(value: unknown, path: string, maximum: number): string | undefined {
    return value === undefined ? undefined : this.string(value, path, maximum);
  }

  private oneOf<T extends readonly string[]>(value: unknown, options: T, path: string): T[number] {
    if (typeof value !== "string" || !options.includes(value)) {
      throw new DocumentFormatError(`${path} contiene un valor no permitido.`);
    }
    return value as T[number];
  }

  private assertUnique(values: string[], path: string): void {
    if (new Set(values).size !== values.length) {
      throw new DocumentFormatError(`${path} contiene identificadores duplicados.`);
    }
  }
}
