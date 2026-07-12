import { createDefaultDocument } from "../defaultDocument";
import { CollectionFolder, CollectionNode, ContractValidation, EasyRequestDocument, Endpoint, Environment, HttpMethod, METHODS, RequestContract, RequestSpec } from "../types";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const BODY_MAX_LENGTH = 2 * 1024 * 1024;
const MAX_NODES = 10000;
const MAX_DEPTH = 20;

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
    try {
      return this.fromUnknown(JSON.parse(raw));
    } catch (error) {
      if (error instanceof DocumentFormatError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : "JSON inválido";
      throw new DocumentFormatError(`No se pudo leer la colección: ${detail}.`);
    }
  }

  public fromUnknown(value: unknown): EasyRequestDocument {
    const document = this.record(value, "documento");
    if (document.version === 1) {
      return this.fromV1(document);
    }
    if (document.version !== 2) {
      throw new DocumentFormatError("La versión de la colección no es compatible.");
    }
    const environments = this.array(document.environments, "environments", 100).map((item, index) => this.environment(item, index));
    if (!environments.length) {
      throw new DocumentFormatError("La colección debe contener al menos un entorno.");
    }
    this.assertUnique(environments.map((item) => item.id), "environments[].id");
    const selectedEnvironmentId = this.string(document.selectedEnvironmentId, "selectedEnvironmentId", 200);
    if (!environments.some((environment) => environment.id === selectedEnvironmentId)) {
      throw new DocumentFormatError("selectedEnvironmentId no corresponde a un entorno existente.");
    }
    const seenIds = new Set<string>();
    const root = this.folder(document.root, "root", 0, seenIds);
    const swaggerUrl = this.optionalString(document.swaggerUrl, "swaggerUrl", 8192);
    const discoverySource = document.discoverySource === undefined
      ? undefined
      : this.oneOf(document.discoverySource, ["swagger", "dotnet", "cache"] as const, "discoverySource");
    const contracts = document.contracts === undefined
      ? undefined
      : this.array(document.contracts, "contracts", 2000).map((item, index) => this.contract(item, index));
    return {
      version: 2,
      selectedEnvironmentId,
      environments,
      root,
      ...(swaggerUrl === undefined ? {} : { swaggerUrl }),
      ...(discoverySource === undefined ? {} : { discoverySource }),
      ...(contracts === undefined ? {} : { contracts })
    };
  }

  public serialize(document: EasyRequestDocument): string {
    return `${JSON.stringify(this.fromUnknown(document), null, 2)}\n`;
  }

  private fromV1(document: Record<string, unknown>): EasyRequestDocument {
    const requests = this.array(document.requests, "requests", 2000).map((item, index) => this.request(item, `requests[${index}]`));
    const endpoints = this.array(document.endpoints, "endpoints", MAX_NODES).map((item, index) => this.endpoint(item, index));
    const folder = (id: string, name: string, children: CollectionNode[]): CollectionFolder => ({ id, type: "folder", name, children });
    const manual = folder("manual", "Mis peticiones", requests.map((request, index) => ({
      id: `manual-${index}`,
      type: "request" as const,
      name: request.name,
      request: { ...request, id: `manual-${index}`, url: this.relativeUrl(request.url) }
    })));
    const grouped = new Map<string, CollectionNode[]>();
    endpoints.forEach((endpoint, index) => {
      const children = grouped.get(endpoint.group) ?? [];
      children.push({
        id: `discovery-${index}`,
        type: "request",
        name: endpoint.name,
        request: { ...endpoint.request, id: `discovery-${index}`, name: endpoint.name, url: this.relativeUrl(endpoint.request.url) }
      });
      grouped.set(endpoint.group, children);
    });
    const root: CollectionFolder = {
      id: "root",
      type: "folder",
      name: "Colección",
      baseUrl: "{{apiUrl}}",
      children: [manual, ...(endpoints.length ? [folder("discovery", "Endpoints sincronizados", [...grouped.entries()].map(([name, children], index) => folder(`discovery-group-${index}`, name, children)))] : [])]
    };
    return this.fromUnknown({
      version: 2,
      selectedEnvironmentId: document.selectedEnvironmentId,
      environments: document.environments,
      root,
      swaggerUrl: document.swaggerUrl,
      discoverySource: document.discoverySource
    });
  }

  private folder(value: unknown, path: string, depth: number, seenIds: Set<string>): CollectionFolder {
    if (depth > MAX_DEPTH) {
      throw new DocumentFormatError(`${path} supera la profundidad máxima de ${MAX_DEPTH}.`);
    }
    const item = this.record(value, path);
    if (item.type !== "folder") {
      throw new DocumentFormatError(`${path}.type debe ser folder.`);
    }
    const id = this.nodeId(item.id, `${path}.id`, seenIds);
    const children = this.array(item.children, `${path}.children`, MAX_NODES).map((child, index) => {
      if (seenIds.size >= MAX_NODES) {
        throw new DocumentFormatError(`root supera el máximo de ${MAX_NODES} nodos.`);
      }
      const candidate = this.record(child, `${path}.children[${index}]`);
      return candidate.type === "folder"
        ? this.folder(candidate, `${path}.children[${index}]`, depth + 1, seenIds)
        : this.requestNode(candidate, `${path}.children[${index}]`, seenIds);
    });
    const baseUrl = this.optionalString(item.baseUrl, `${path}.baseUrl`, 8192);
    return { id, type: "folder", name: this.string(item.name, `${path}.name`, 500), ...(baseUrl === undefined ? {} : { baseUrl }), children };
  }

  private requestNode(value: Record<string, unknown>, path: string, seenIds: Set<string>): CollectionNode {
    if (value.type !== "request") {
      throw new DocumentFormatError(`${path}.type debe ser folder o request.`);
    }
    const id = this.nodeId(value.id, `${path}.id`, seenIds);
    const baseUrl = this.optionalString(value.baseUrl, `${path}.baseUrl`, 8192);
    return {
      id,
      type: "request",
      name: this.string(value.name, `${path}.name`, 1000),
      ...(baseUrl === undefined ? {} : { baseUrl }),
      request: { ...this.request(value.request, `${path}.request`), id }
    };
  }

  private nodeId(value: unknown, path: string, seenIds: Set<string>): string {
    const id = this.string(value, path, 500);
    if (seenIds.has(id)) {
      throw new DocumentFormatError(`Los nodos contienen identificadores duplicados.`);
    }
    seenIds.add(id);
    return id;
  }

  private environment(value: unknown, index: number): Environment {
    const item = this.record(value, `environments[${index}]`);
    const variablesRecord = this.record(item.variables, `environments[${index}].variables`);
    const variables = Object.fromEntries(Object.entries(variablesRecord).map(([key, variable]) => [this.string(key, "nombre de variable", 200), this.string(variable, `variables.${key}`, 100000)]));
    const secretVariableNames = item.secretVariableNames === undefined ? undefined : [...new Set(this.array(item.secretVariableNames, "secretVariableNames", 200).map((name) => this.string(name, "secretVariableNames[]", 200)))].filter((name) => Object.prototype.hasOwnProperty.call(variables, name));
    return { id: this.string(item.id, `environments[${index}].id`, 200), name: this.string(item.name, `environments[${index}].name`, 500), variables, ...(secretVariableNames?.length ? { secretVariableNames } : {}) };
  }

  private request(value: unknown, path: string): RequestSpec {
    const item = this.record(value, path);
    const group = this.optionalString(item.group, `${path}.group`, 500);
    return { id: this.string(item.id, `${path}.id`, 500), name: this.string(item.name, `${path}.name`, 1000), method: this.oneOf(item.method, METHODS, `${path}.method`) as HttpMethod, url: this.string(item.url, `${path}.url`, 8192), headers: this.array(item.headers, `${path}.headers`, 500).map((entry, index) => this.keyValue(entry, `${path}.headers[${index}]`)), params: this.array(item.params, `${path}.params`, 500).map((entry, index) => this.keyValue(entry, `${path}.params[${index}]`)), body: this.string(item.body, `${path}.body`, BODY_MAX_LENGTH), bodyType: this.oneOf(item.bodyType, ["json", "text", "none"] as const, `${path}.bodyType`), ...(group === undefined ? {} : { group }) };
  }

  private keyValue(value: unknown, path: string): import("../types").KeyValue {
    const item = this.record(value, path);
    if (typeof item.enabled !== "boolean") {
      throw new DocumentFormatError(`${path}.enabled debe ser booleano.`);
    }
    const location = item.location === undefined ? undefined : this.oneOf(item.location, ["path", "query"] as const, `${path}.location`);
    return { key: this.string(item.key, `${path}.key`, 1000), value: this.string(item.value, `${path}.value`, 100000), enabled: item.enabled, ...(location === undefined ? {} : { location }) };
  }

  private endpoint(value: unknown, index: number): Endpoint {
    const path = `endpoints[${index}]`;
    const item = this.record(value, path);
    return { id: this.string(item.id, `${path}.id`, 500), group: this.string(item.group, `${path}.group`, 500), name: this.string(item.name, `${path}.name`, 1000), method: this.oneOf(item.method, METHODS, `${path}.method`) as HttpMethod, path: this.string(item.path, `${path}.path`, 8192), request: this.request(item.request, `${path}.request`) };
  }

  private contract(value: unknown, index: number): RequestContract {
    const path = `contracts[${index}]`;
    const item = this.record(value, path);
    const requestId = this.string(item.requestId, `${path}.requestId`, 500);
    const savedAt = this.string(item.savedAt, `${path}.savedAt`, 100);
    const validations = this.array(item.validations, `${path}.validations`, 200).map((v, vi) => {
      const vPath = `${path}.validations[${vi}]`;
      const entry = this.record(v, vPath);
      return {
        field: this.string(entry.field, `${vPath}.field`, 500),
        type: this.oneOf(entry.type, ["exists", "type", "value", "maxDuration"] as const, `${vPath}.type`),
        ...(entry.expected === undefined ? {} : { expected: this.string(entry.expected, `${vPath}.expected`, 1000) })
      } satisfies ContractValidation;
    });
    return { requestId, validations, savedAt };
  }

  private relativeUrl(url: string): string { return url.replace(/^{{\s*[\w.-]+\s*}}/, "") || "/"; }
  private record(value: unknown, path: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) { throw new DocumentFormatError(`${path} debe ser un objeto.`); } return value as Record<string, unknown>; }
  private array(value: unknown, path: string, maximum: number): unknown[] { if (!Array.isArray(value)) { throw new DocumentFormatError(`${path} debe ser un array.`); } if (value.length > maximum) { throw new DocumentFormatError(`${path} supera el máximo de ${maximum} elementos.`); } return value; }
  private string(value: unknown, path: string, maximum: number): string { if (typeof value !== "string") { throw new DocumentFormatError(`${path} debe ser texto.`); } if (value.length > maximum) { throw new DocumentFormatError(`${path} supera el máximo de ${maximum} caracteres.`); } return value; }
  private optionalString(value: unknown, path: string, maximum: number): string | undefined { return value === undefined ? undefined : this.string(value, path, maximum); }
  private oneOf<T extends readonly string[]>(value: unknown, options: T, path: string): T[number] { if (typeof value !== "string" || !options.includes(value)) { throw new DocumentFormatError(`${path} contiene un valor no permitido.`); } return value as T[number]; }
  private assertUnique(values: string[], path: string): void { if (new Set(values).size !== values.length) { throw new DocumentFormatError(`${path} contiene identificadores duplicados.`); } }
}
