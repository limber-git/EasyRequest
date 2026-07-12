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
    .filter((child) => child.id !== id)
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

// ── Tree mutation helpers for the UI ──

export const addFolder = (root: CollectionFolder, parentId: string, folder: CollectionFolder): CollectionFolder => {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, folder] };
  }
  return {
    ...root,
    children: root.children.map((child) =>
      child.type === "folder" ? addFolder(child, parentId, folder) : child
    )
  };
};

export const addRequestToFolder = (
  root: CollectionFolder,
  parentId: string,
  node: CollectionNode
): CollectionFolder => {
  if (root.id === parentId) {
    return { ...root, children: [...root.children, node] };
  }
  return {
    ...root,
    children: root.children.map((child) =>
      child.type === "folder" ? addRequestToFolder(child, parentId, node) : child
    )
  };
};

export const renameNode = (root: CollectionFolder, id: string, name: string): CollectionFolder => {
  if (root.id === id) {
    return { ...root, name };
  }
  return {
    ...root,
    children: root.children.map((child) => {
      if (child.id === id) {
        return child.type === "folder"
          ? { ...child, name }
          : { ...child, name, request: { ...child.request, name } };
      }
      return child.type === "folder" ? renameNode(child, id, name) : child;
    })
  };
};

const extractNode = (root: CollectionFolder, id: string): { tree: CollectionFolder; node?: CollectionNode } => {
  const directIndex = root.children.findIndex((child) => child.id === id);
  if (directIndex >= 0) {
    const node = root.children[directIndex];
    return { tree: { ...root, children: root.children.filter((_, i) => i !== directIndex) }, node };
  }
  let extracted: CollectionNode | undefined;
  const children = root.children.map((child) => {
    if (extracted || child.type !== "folder") { return child; }
    const result = extractNode(child, id);
    if (result.node) { extracted = result.node; return result.tree; }
    return child;
  });
  return { tree: { ...root, children }, node: extracted };
};

const insertNode = (root: CollectionFolder, parentId: string, node: CollectionNode, index: number): CollectionFolder => {
  if (root.id === parentId) {
    const children = [...root.children];
    children.splice(Math.min(index, children.length), 0, node);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map((child) =>
      child.type === "folder" ? insertNode(child, parentId, node, index) : child
    )
  };
};

export const moveNode = (root: CollectionFolder, nodeId: string, targetParentId: string, index: number): CollectionFolder => {
  const { tree, node } = extractNode(root, nodeId);
  if (!node) { return root; }
  if (node.type === "folder" && containsNode(node, targetParentId)) { return root; }
  return insertNode(tree, targetParentId, node, index);
};

export const updateFolderBaseUrl = (root: CollectionFolder, id: string, baseUrl: string | undefined): CollectionFolder => {
  if (root.id === id) {
    const { baseUrl: _previousBaseUrl, ...withoutBaseUrl } = root;
    return baseUrl ? { ...withoutBaseUrl, baseUrl } : withoutBaseUrl;
  }
  return {
    ...root,
    children: root.children.map((child) => child.type === "folder" ? updateFolderBaseUrl(child, id, baseUrl) : child)
  };
};

const containsNode = (folder: CollectionFolder, id: string): boolean => folder.id === id || folder.children.some((child) => child.id === id || (child.type === "folder" && containsNode(child, id)));

export interface BaseUrlAncestor {
  folderId: string;
  folderName: string;
  baseUrl?: string;
}

export const findAncestorBaseUrls = (root: CollectionFolder, nodeId: string): BaseUrlAncestor[] => {
  const visit = (node: CollectionFolder, path: BaseUrlAncestor[]): BaseUrlAncestor[] | undefined => {
    const current: BaseUrlAncestor = { folderId: node.id, folderName: node.name, baseUrl: node.baseUrl };
    const nextPath = [...path, current];
    for (const child of node.children) {
      if (child.id === nodeId) { return nextPath; }
      if (child.type === "folder") {
        const result = visit(child, nextPath);
        if (result) { return result; }
      }
    }
    return undefined;
  };
  return visit(root, []) ?? [];
};
