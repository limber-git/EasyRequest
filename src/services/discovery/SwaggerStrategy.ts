import { Endpoint, HttpMethod, METHODS, RequestSpec } from "../../types";
import { DiscoveryResult, IDiscoveryStrategy } from "./IDiscoveryStrategy";

type OpenApiDocument = {
  openapi?: string;
  swagger?: string;
  servers?: Array<{ url?: string }>;
  host?: string;
  basePath?: string;
  schemes?: string[];
  paths?: Record<string, OpenApiPathItem>;
  components?: { schemas?: Record<string, OpenApiSchema> };
  definitions?: Record<string, OpenApiSchema>;
};

type OpenApiPathItem = {
  parameters?: OpenApiParameter[];
  [key: string]: OpenApiOperation | OpenApiParameter[] | undefined;
};

type OpenApiParameter = {
  name?: string;
  in?: string;
  example?: unknown;
  schema?: OpenApiSchema;
};

type OpenApiSchema = {
  $ref?: string;
  type?: string;
  format?: string;
  properties?: Record<string, OpenApiSchema>;
  items?: OpenApiSchema;
  example?: unknown;
  default?: unknown;
  enum?: unknown[];
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
};

type OpenApiMedia = {
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
  schema?: OpenApiSchema;
};

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, OpenApiMedia>;
  };
};

export class SwaggerStrategy implements IDiscoveryStrategy {
  public constructor(private readonly swaggerUrl: string) {}

  public async discover(): Promise<DiscoveryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(this.swaggerUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Swagger devolvió ${response.status} ${response.statusText}.`);
      }
      const spec = (await response.json()) as OpenApiDocument;
      if (!spec.paths || typeof spec.paths !== "object") {
        throw new Error("El documento no contiene un objeto 'paths'.");
      }

      return { source: "swagger", baseUrl: this.baseUrl(spec), endpoints: this.toEndpoints(spec) };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toEndpoints(spec: OpenApiDocument): Endpoint[] {
    const endpoints: Endpoint[] = [];

    Object.entries(spec.paths ?? {}).forEach(([path, operations]) => {
      Object.entries(operations).forEach(([verb, operation]) => {
        const method = verb.toUpperCase() as HttpMethod;
        if (!METHODS.includes(method) || !this.isOperation(operation)) {
          return;
        }
        const group = operation.tags?.[0] ?? "Sin etiqueta";
        const route = path.replace(/\{([^}]+)\}/g, "{{$1}}");
        const id = `${method}:${path}`;
        const request = this.makeRequest(
          id,
          operation.summary ?? operation.operationId ?? `${method} ${path}`,
          method,
          `{{apiUrl}}${route}`,
          operation,
          operations.parameters ?? [],
          spec
        );
        endpoints.push({ id, group, name: request.name, method, path, request });
      });
    });

    return endpoints.sort((left, right) => left.group.localeCompare(right.group) || left.path.localeCompare(right.path));
  }

  private makeRequest(
    id: string,
    name: string,
    method: HttpMethod,
    url: string,
    operation: OpenApiOperation,
    pathParameters: OpenApiParameter[],
    spec: OpenApiDocument
  ): RequestSpec {
    const mergedParameters = new Map<string, OpenApiParameter>();
    [...pathParameters, ...(operation.parameters ?? [])].forEach((parameter) => {
      if (parameter.name && (parameter.in === "path" || parameter.in === "query")) {
        mergedParameters.set(`${parameter.in}:${parameter.name}`, parameter);
      }
    });
    const params = [...mergedParameters.values()]
      .filter((parameter) => parameter.in === "path" || parameter.in === "query")
      .map((parameter) => ({
        key: parameter.name ?? "",
        value: String(parameter.example ?? parameter.schema?.example ?? parameter.schema?.default ?? ""),
        enabled: parameter.in === "path",
        location: parameter.in === "path" ? "path" as const : "query" as const
      }));
    const example = this.requestBodyExample(operation, spec);

    return {
      id,
      name,
      method,
      url,
      headers: [],
      params,
      body: example === undefined ? "" : JSON.stringify(example, null, 2),
      bodyType: example === undefined ? "none" : "json"
    };
  }

  private baseUrl(spec: OpenApiDocument): string {
    const configured = spec.servers?.[0]?.url;
    if (configured) {
      try {
        return new URL(configured, this.swaggerUrl).toString().replace(/\/$/, "");
      } catch {
        // Fall through to the swagger document's origin.
      }
    }
    if (spec.host) {
      const protocol = spec.schemes?.[0] ?? new URL(this.swaggerUrl).protocol.replace(":", "");
      return `${protocol}://${spec.host}${spec.basePath ?? ""}`.replace(/\/$/, "");
    }
    const source = new URL(this.swaggerUrl);
    return source.origin;
  }

  private isOperation(value: OpenApiOperation | OpenApiParameter[] | undefined): value is OpenApiOperation {
    return Boolean(value) && !Array.isArray(value);
  }

  private requestBodyExample(operation: OpenApiOperation, spec: OpenApiDocument): unknown {
    const content = operation.requestBody?.content;
    const media = content?.["application/json"] ?? Object.entries(content ?? {}).find(([type]) => type.includes("json"))?.[1];
    if (media) {
      if (media.example !== undefined) {
        return media.example;
      }
      const namedExample = Object.values(media.examples ?? {}).find((example) => example.value !== undefined)?.value;
      if (namedExample !== undefined) {
        return namedExample;
      }
      if (media.schema) {
        return this.schemaExample(media.schema, spec, new Set<string>());
      }
    }

    const swaggerBodyParameter = operation.parameters?.find((parameter) => parameter.in === "body");
    return swaggerBodyParameter?.schema
      ? this.schemaExample(swaggerBodyParameter.schema, spec, new Set<string>())
      : undefined;
  }

  private schemaExample(schema: OpenApiSchema, spec: OpenApiDocument, seenReferences: Set<string>): unknown {
    if (schema.example !== undefined) {
      return schema.example;
    }
    if (schema.default !== undefined) {
      return schema.default;
    }
    if (schema.enum?.length) {
      return schema.enum[0];
    }
    if (schema.$ref) {
      if (seenReferences.has(schema.$ref)) {
        return {};
      }
      const resolved = this.resolveReference(schema.$ref, spec);
      if (!resolved) {
        return {};
      }
      seenReferences.add(schema.$ref);
      const example = this.schemaExample(resolved, spec, seenReferences);
      seenReferences.delete(schema.$ref);
      return example;
    }
    if (schema.allOf?.length) {
      return schema.allOf.reduce<Record<string, unknown>>((result, item) => {
        const example = this.schemaExample(item, spec, seenReferences);
        return example && typeof example === "object" && !Array.isArray(example)
          ? { ...result, ...(example as Record<string, unknown>) }
          : result;
      }, {});
    }
    if (schema.oneOf?.length || schema.anyOf?.length) {
      return this.schemaExample((schema.oneOf ?? schema.anyOf)![0], spec, seenReferences);
    }
    if (schema.type === "array") {
      return [this.schemaExample(schema.items ?? {}, spec, seenReferences)];
    }
    if (schema.type === "object" || schema.properties) {
      return Object.fromEntries(
        Object.entries(schema.properties ?? {}).map(([name, property]) => [name, this.schemaExample(property, spec, seenReferences)])
      );
    }
    if (schema.type === "integer" || schema.type === "number") {
      return 0;
    }
    if (schema.type === "boolean") {
      return true;
    }
    switch (schema.format) {
      case "date": return "2026-01-01";
      case "date-time": return "2026-01-01T00:00:00.000Z";
      case "uuid": return "00000000-0000-0000-0000-000000000000";
      case "email": return "user@example.com";
      case "uri": return "https://example.com";
      default: return "string";
    }
  }

  private resolveReference(reference: string, spec: OpenApiDocument): OpenApiSchema | undefined {
    const componentPrefix = "#/components/schemas/";
    const definitionPrefix = "#/definitions/";
    if (reference.startsWith(componentPrefix)) {
      return spec.components?.schemas?.[reference.slice(componentPrefix.length)];
    }
    if (reference.startsWith(definitionPrefix)) {
      return spec.definitions?.[reference.slice(definitionPrefix.length)];
    }
    return undefined;
  }
}
