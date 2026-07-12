import { useMemo } from "react";
import type { CollectionFolder, Environment } from "../../../src/types";
import { findAncestorBaseUrls, type BaseUrlAncestor } from "../../../src/services/CollectionTree";

interface ContextLensProps {
  root: CollectionFolder;
  requestId: string;
  requestUrl: string;
  environment: Environment | undefined;
  onEditFolderBaseUrl?: (folderId: string) => void;
  onOpenEnvironment?: () => void;
}

interface ResolvedSegment {
  text: string;
  missing: boolean;
}

interface Resolution {
  ancestors: BaseUrlAncestor[];
  effectiveBaseUrl: string | undefined;
  formula: string;
  resolvedSegments: ResolvedSegment[];
  resolvedUrl: string;
  missingVariables: string[];
  status: "green" | "yellow" | "red";
}

const VAR_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

function resolveVariables(
  input: string,
  variables: Record<string, string>
): { segments: ResolvedSegment[]; missing: string[] } {
  const segments: ResolvedSegment[] = [];
  const missing: string[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(VAR_PATTERN)) {
    const varName = match[1];
    const start = match.index!;

    if (start > lastIndex) {
      segments.push({ text: input.slice(lastIndex, start), missing: false });
    }

    if (varName in variables) {
      segments.push({ text: variables[varName], missing: false });
    } else {
      missing.push(varName);
      segments.push({ text: match[0], missing: true });
    }

    lastIndex = start + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), missing: false });
  }

  return { segments, missing };
}

function computeResolution(
  root: CollectionFolder,
  requestId: string,
  requestUrl: string,
  environment: Environment | undefined
): Resolution {
  const ancestors = findAncestorBaseUrls(root, requestId);

  // Find the deepest ancestor with a baseUrl set
  let effectiveBaseUrl: string | undefined;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    if (ancestors[i].baseUrl) {
      effectiveBaseUrl = ancestors[i].baseUrl;
      break;
    }
  }

  // Build the composition formula
  const formula = effectiveBaseUrl
    ? `${effectiveBaseUrl} + ${requestUrl || "/"}`
    : requestUrl || "/";

  // Combine into a single URL string
  const combinedUrl = effectiveBaseUrl
    ? `${effectiveBaseUrl.replace(/\/$/, "")}/${requestUrl.replace(/^\//, "")}`
    : requestUrl;

  // Resolve variables
  const variables = environment?.variables ?? {};
  const { segments: resolvedSegments, missing: missingVariables } = resolveVariables(
    combinedUrl,
    variables
  );
  const resolvedUrl = resolvedSegments.map((s) => s.text).join("");

  // Determine status
  let status: "green" | "yellow" | "red";
  if (!effectiveBaseUrl && !requestUrl.match(/^(?:[a-z][a-z\d+.-]*:\/\/|{{)/i)) {
    status = "red";
  } else if (missingVariables.length > 0) {
    status = "yellow";
  } else {
    status = "green";
  }

  return {
    ancestors,
    effectiveBaseUrl,
    formula,
    resolvedSegments,
    resolvedUrl,
    missingVariables,
    status,
  };
}

export function ContextLens({
  root,
  requestId,
  requestUrl,
  environment,
  onEditFolderBaseUrl,
  onOpenEnvironment,
}: ContextLensProps): JSX.Element {
  const resolution = useMemo(
    () => computeResolution(root, requestId, requestUrl, environment),
    [root, requestId, requestUrl, environment]
  );

  const { ancestors, formula, resolvedSegments, status } = resolution;

  return (
    <div className="context-lens">
      {/* Breadcrumb row */}
      <div className="context-lens-breadcrumb">
        {ancestors.map((ancestor, index) => (
          <span key={ancestor.folderId}>
            {index > 0 && <span aria-hidden="true"> › </span>}
            <button
              className="context-lens-folder-link"
              onClick={() => onEditFolderBaseUrl?.(ancestor.folderId)}
              aria-label={`Editar URL base de ${ancestor.folderName}`}
            >
              {ancestor.folderName}
            </button>
          </span>
        ))}
        {environment && (
          <>
            {ancestors.length > 0 && <span aria-hidden="true"> › </span>}
            <button
              className="context-lens-env-link"
              onClick={() => onOpenEnvironment?.()}
              aria-label={`Abrir variables del entorno ${environment.name}`}
            >
              {environment.name}
            </button>
          </>
        )}
      </div>

      {/* Composition formula */}
      <div className="context-lens-formula">
        <code>{formula}</code>
      </div>

      {/* Resolved URL */}
      <div className="context-lens-resolved">
        <span aria-hidden="true">→ </span>
        {resolvedSegments.map((segment, index) => (
          <span
            key={index}
            className={segment.missing ? "context-lens-missing-var" : undefined}
          >
            {segment.text}
          </span>
        ))}
      </div>

      {/* Status indicator */}
      <span
        className={`context-lens-status ${status}`}
        role="status"
        title={
          status === "green"
            ? "All variables resolved"
            : status === "yellow"
              ? `Missing variables: ${resolution.missingVariables.join(", ")}`
              : "No base URL configured"
        }
        aria-label={
          status === "green"
            ? "All variables resolved"
            : status === "yellow"
              ? "Some variables are missing"
              : "No base URL configured"
        }
      />
    </div>
  );
}
