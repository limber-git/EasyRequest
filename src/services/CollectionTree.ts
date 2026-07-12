import { CollectionFolder, CollectionNode, CollectionRequest, Endpoint, RequestSpec } from "../types";

export interface DiscoveredService {
  id: string;
  name: string;
  baseUrl?: string;
  endpoints: Endpoint[];
}

export const findRequestNode = (node: CollectionNode, id: string): CollectionRequest | undefined => {
  if (node.type === "request") {
    return node.id === id ? node : undefined;
  }
  for (const child of node.children) {
    const match = findRequestNode(child, id);
    if (match) {
      return match;
    }
  }
  return undefined;
};

export const requestIds = (node: CollectionNode): string[] => node.type === "request"
  ? [node.id]
  : node.children.flatMap(requestIds);

export const updateRequestNode = (
  node: CollectionNode,
  id: string,
  update: (request: RequestSpec) => RequestSpec
): CollectionNode => {
  if (node.type === "request") {
    if (node.id !== id) {
      return node;
    }
    const request = { ...update(node.request), id: node.id };
    return { ...node, name: request.name, request };
  }
  return { ...node, children: node.children.map((child) => updateRequestNode(child, id, update)) };
};

export const removeRequestNode = (node: CollectionFolder, id: string): CollectionFolder => ({
  ...node,
  children: node.children
    .filter((child) => child.type !== "request" || child.id !== id)
    .map((child) => child.type === "folder" ? removeRequestNode(child, id) : child)
});

export const requestWithContext = (root: CollectionFolder, id: string): RequestSpec | undefined => {
  const visit = (node: CollectionNode, inheritedBaseUrl?: string): RequestSpec | undefined => {
    const baseUrl = node.baseUrl ?? inheritedBaseUrl;
    if (node.type === "request") {
      return node.id === id ? { ...node.request, url: combineUrl(baseUrl, node.request.url) } : undefined;
    }
    for (const child of node.children) {
      const match = visit(child, baseUrl);
      if (match) {
        return match;
      }
    }
    return undefined;
  };
  return visit(root);
};

export const replaceDiscoveryFolder = (
  root: CollectionFolder,
  source: "swagger" | "dotnet" | "cache",
  services: DiscoveredService[]
): CollectionFolder => {
  if (source === "cache") {
    return root;
  }
  const multipleServices = services.length > 1;
  const discovery: CollectionFolder = {
    id: "discovery",
    type: "folder",
    name: source === "swagger" ? "Swagger" : "Servicios detectados",
    children: services.map((service, serviceIndex) => {
      const variable = multipleServices ? `${toVariableName(service.name)}ApiUrl` : "apiUrl";
      const groupNodes = new Map<string, CollectionRequest[]>();
      service.endpoints.forEach((endpoint, endpointIndex) => {
        const group = endpoint.group || "Sin grupo";
        const id = `discovery-${serviceIndex}-${endpointIndex}`;
        const request: CollectionRequest = {
          id,
          type: "request",
          name: endpoint.name,
          request: { ...endpoint.request, id, name: endpoint.name, url: relativeUrl(endpoint.request.url) }
        };
        groupNodes.set(group, [...(groupNodes.get(group) ?? []), request]);
      });
      return {
        id: `service-${serviceIndex}`,
        type: "folder" as const,
        name: service.name,
        ...(service.baseUrl ? { baseUrl: `{{${variable}}}` } : {}),
        children: [...groupNodes.entries()].map(([name, children], groupIndex) => ({
          id: `service-${serviceIndex}-group-${groupIndex}`,
          type: "folder" as const,
          name,
          children
        }))
      };
    })
  };
  const withoutPrevious = root.children.filter((child) => child.id !== "discovery");
  return { ...root, children: [...withoutPrevious, discovery] };
};

export const discoveredVariables = (services: DiscoveredService[]): Record<string, string> => {
  const multipleServices = services.length > 1;
  return Object.fromEntries(services.flatMap((service) => service.baseUrl
    ? [[multipleServices ? `${toVariableName(service.name)}ApiUrl` : "apiUrl", service.baseUrl]]
    : []));
};

const combineUrl = (baseUrl: string | undefined, url: string): string => {
  if (!baseUrl || /^(?:[a-z][a-z\d+.-]*:\/\/|{{)/i.test(url)) {
    return url;
  }
  return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
};

const relativeUrl = (url: string): string => url.replace(/^{{\s*[\w.-]+\s*}}/, "") || "/";

const toVariableName = (name: string): string => {
  const compact = name.replace(/[^\w]+(.)?/g, (_, character: string | undefined) => character?.toUpperCase() ?? "");
  const normalized = compact ? `${compact[0].toLowerCase()}${compact.slice(1)}` : "service";
  return /^[\d]/.test(normalized) ? `service${normalized}` : normalized;
};
