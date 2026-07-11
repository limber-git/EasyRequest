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
};

type OpenApiPathItem = {
  parameters?: OpenApiParameter[];
  [key: string]: OpenApiOperation | OpenApiParameter[] | undefined;
};

type OpenApiParameter = {
  name?: string;
  in?: string;
  example?: unknown;
  schema?: { example?: unknown };
};

type OpenApiOperation = {
  tags?: string[];
  summary?: string;
  operationId?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content?: Record<string, { example?: unknown; schema?: { example?: unknown; default?: unknown } }>;
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

      return { source: "swagger", endpoints: this.toEndpoints(spec) };
    } finally {
      clearTimeout(timeout);
    }
  }

  private toEndpoints(spec: OpenApiDocument): Endpoint[] {
    const baseUrl = this.baseUrl(spec);
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
          `${baseUrl}${route}`,
          operation,
          operations.parameters ?? []
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
    pathParameters: OpenApiParameter[]
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
        value: String(parameter.example ?? parameter.schema?.example ?? ""),
        enabled: parameter.in === "path",
        location: parameter.in === "path" ? "path" as const : "query" as const
      }));
    const media = operation.requestBody?.content?.["application/json"];
    const example = media?.example ?? media?.schema?.example ?? media?.schema?.default;

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
}
