import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { BatchResult, EasyRequestDocument, Environment, RequestSpec } from "../../src/types";
import { EndpointTree } from "./components/EndpointTree";
import { EnvironmentEditor } from "./components/EnvironmentEditor";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { getVsCodeApi } from "./vscode-api";

type HostMessage =
  | { type: "document"; document: EasyRequestDocument; revision: number }
  | { type: "documentError"; message: string }
  | { type: "saveComplete"; requestId: number; revision: number }
  | { type: "documentConflict"; document: EasyRequestDocument; revision: number; requestId?: number }
  | { type: "batchResult"; batch: BatchResult }
  | { type: "requestCancelled" }
  | { type: "copySaved" }
  | { type: "error" | "warning"; message: string }
  | { type: "discoveryComplete"; source: string; count: number; baseUrl?: string; warning?: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isHostMessage = (value: unknown): value is HostMessage => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "document":
      return isRecord(value.document) && typeof value.revision === "number";
    case "documentError":
    case "error":
    case "warning":
      return typeof value.message === "string";
    case "saveComplete":
      return typeof value.requestId === "number" && typeof value.revision === "number";
    case "documentConflict":
      return isRecord(value.document) && typeof value.revision === "number";
    case "batchResult":
      return isRecord(value.batch) && Array.isArray(value.batch.results);
    case "requestCancelled":
    case "copySaved":
      return true;
    case "discoveryComplete":
      return typeof value.source === "string" && typeof value.count === "number";
    default:
      return false;
  }
};

const createInitialDocument = (): EasyRequestDocument => ({
  version: 1,
  selectedEnvironmentId: "default",
  environments: [{ id: "default", name: "Default", variables: { apiUrl: "https://httpbin.org" } }],
  requests: [{ id: "request-1", name: "Nueva petición", method: "GET", url: "{{apiUrl}}/get", headers: [], params: [], body: "", bodyType: "none" }],
  endpoints: []
});

const SPLITTER_WIDTH = 8;
const MIN_COLLECTION_WIDTH = 180;
const MAX_COLLECTION_WIDTH = 360;
const MIN_CONSTRUCTOR_WIDTH = 320;
const MIN_RESPONSE_WIDTH = 280;
const RESIZE_STEP = 20;

type Splitter = "collection" | "response";

interface PaneWidths {
  collection: number;
  response: number;
}

interface ResizeSession {
  splitter: Splitter;
  startX: number;
  widths: PaneWidths;
}

export function App(): JSX.Element {
  const vscode = getVsCodeApi();
  const [document, setDocument] = useState<EasyRequestDocument>(createInitialDocument);
  const documentRef = useRef(document);
  const [activeRequestId, setActiveRequestId] = useState(() => {
    const restoredState = vscode.getState() as { activeRequestId?: unknown } | undefined;
    return typeof restoredState?.activeRequestId === "string" ? restoredState.activeRequestId : document.requests[0].id;
  });
  const [batch, setBatch] = useState<BatchResult>();
  const [notice, setNotice] = useState<string>();
  const [swaggerUrl, setSwaggerUrl] = useState("");
  const [loadError, setLoadError] = useState<string>();
  const [running, setRunning] = useState(false);
  const [conflict, setConflict] = useState<{ document: EasyRequestDocument; revision: number }>();
  const conflictRef = useRef<{ document: EasyRequestDocument; revision: number }>();
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number>();
  const saveInFlight = useRef<number>();
  const sentSnapshot = useRef("");
  const nextSaveId = useRef(1);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const resizeSessionRef = useRef<ResizeSession>();
  const [paneWidths, setPaneWidths] = useState<PaneWidths>({ collection: 260, response: 360 });
  const [isResizing, setIsResizing] = useState(false);

  const getWorkspaceWidth = () => workspaceRef.current?.getBoundingClientRect().width ?? 0;
  const clamp = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
  const resizePane = (splitter: Splitter, delta: number, startWidths?: PaneWidths) => {
    setPaneWidths((current) => {
      const widths = startWidths ?? current;
      const workspaceWidth = getWorkspaceWidth();
      const availableWidth = workspaceWidth - (SPLITTER_WIDTH * 2);

      if (splitter === "collection") {
        const maxCollectionWidth = Math.min(MAX_COLLECTION_WIDTH, availableWidth - widths.response - MIN_CONSTRUCTOR_WIDTH);
        return { ...widths, collection: clamp(widths.collection + delta, MIN_COLLECTION_WIDTH, maxCollectionWidth) };
      }

      const maxResponseWidth = availableWidth - widths.collection - MIN_CONSTRUCTOR_WIDTH;
      return { ...widths, response: clamp(widths.response - delta, MIN_RESPONSE_WIDTH, maxResponseWidth) };
    });
  };

  const startResize = (splitter: Splitter, event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSessionRef.current = { splitter, startX: event.clientX, widths: paneWidths };
    setIsResizing(true);
  };

  const moveResize = (splitter: Splitter, event: PointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.splitter !== splitter) {
      return;
    }
    resizePane(splitter, event.clientX - session.startX, session.widths);
  };

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    resizeSessionRef.current = undefined;
    setIsResizing(false);
  };

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    const keepWidthsInBounds = () => {
      setPaneWidths((current) => {
        const availableWidth = getWorkspaceWidth() - (SPLITTER_WIDTH * 2);
        const collection = clamp(
          current.collection,
          MIN_COLLECTION_WIDTH,
          Math.min(MAX_COLLECTION_WIDTH, availableWidth - current.response - MIN_CONSTRUCTOR_WIDTH)
        );
        const response = clamp(current.response, MIN_RESPONSE_WIDTH, availableWidth - collection - MIN_CONSTRUCTOR_WIDTH);
        return collection === current.collection && response === current.response ? current : { collection, response };
      });
    };
    const observer = new ResizeObserver(keepWidthsInBounds);
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  const applyHostDocument = (next: EasyRequestDocument, revision: number) => {
    const sameAsLocal = JSON.stringify(next) === JSON.stringify(documentRef.current);
    if ((dirtyRef.current || saveInFlight.current) && !sameAsLocal) {
      const pendingConflict = { document: next, revision };
      conflictRef.current = pendingConflict;
      setConflict(pendingConflict);
      setNotice("La colección cambió fuera de EasyRequest. Recarga los cambios externos o conserva tu edición sin sobrescribir el archivo.");
      return;
    }
    revisionRef.current = revision;
    dirtyRef.current = false;
    documentRef.current = next;
    setDocument(next);
    setLoadError(undefined);
    setActiveRequestId((current) => next.requests.some((request) => request.id === current) ? current : next.requests[0]?.id ?? "");
    setSwaggerUrl(next.swaggerUrl ?? "");
  };

  const flushSave = useCallback(() => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    if (!dirtyRef.current || saveInFlight.current || !revisionRef.current || conflictRef.current) {
      return;
    }
    const requestId = nextSaveId.current++;
    saveInFlight.current = requestId;
    sentSnapshot.current = JSON.stringify(documentRef.current);
    vscode.postMessage({
      type: "saveDocument",
      document: documentRef.current,
      baseRevision: revisionRef.current,
      requestId
    });
  }, [vscode]);

  const persist = () => {
    dirtyRef.current = true;
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    if (!saveInFlight.current) {
      saveTimer.current = window.setTimeout(flushSave, 250);
    }
  };

  const updateDocument = (updater: (current: EasyRequestDocument) => EasyRequestDocument) => {
    const next = updater(documentRef.current);
    documentRef.current = next;
    setDocument(next);
    persist();
  };

  useEffect(() => {
    const listener = (event: MessageEvent<unknown>) => {
      // VS Code may dispatch bridge messages without a browser origin/source. The payload is
      // therefore validated strictly instead of relying on ordinary cross-window metadata.
      if ((event.origin && event.origin !== window.location.origin) || !isHostMessage(event.data)) {
        return;
      }
      const message = event.data;
      switch (message.type) {
        case "document":
          applyHostDocument(message.document, message.revision);
          break;
        case "documentError":
          setRunning(false);
          setLoadError(message.message);
          break;
        case "saveComplete":
          if (message.requestId === saveInFlight.current) {
            revisionRef.current = message.revision;
            saveInFlight.current = undefined;
            dirtyRef.current = JSON.stringify(documentRef.current) !== sentSnapshot.current;
            if (dirtyRef.current) {
              window.setTimeout(flushSave, 0);
            }
          }
          break;
        case "documentConflict":
          saveInFlight.current = undefined;
          conflictRef.current = { document: message.document, revision: message.revision };
          setConflict(conflictRef.current);
          setNotice("Se evitó sobrescribir una modificación externa de la colección.");
          break;
        case "batchResult":
          setBatch(message.batch);
          setRunning(false);
          break;
        case "requestCancelled":
          setRunning(false);
          setNotice("Petición cancelada.");
          break;
        case "copySaved":
          setNotice("La edición local se guardó como una nueva colección.");
          if (conflictRef.current) {
            const external = conflictRef.current;
            saveInFlight.current = undefined;
            dirtyRef.current = false;
            conflictRef.current = undefined;
            setConflict(undefined);
            applyHostDocument(external.document, external.revision);
          }
          break;
        case "discoveryComplete": {
          const origin = message.baseUrl ? ` Origen guardado: {{apiUrl}} = ${message.baseUrl}.` : "";
          setNotice(`${message.count} endpoints cargados desde ${message.source}.${origin}${message.warning ? ` ${message.warning}` : ""}`);
          break;
        }
        case "error":
          setRunning(false);
          saveInFlight.current = undefined;
          setNotice(message.message);
          break;
        case "warning":
          setNotice(message.message);
          break;
      }
    };
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") {
        flushSave();
      }
    };
    window.addEventListener("message", listener);
    window.addEventListener("pagehide", flushSave);
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    vscode.postMessage({ type: "ready" });
    return () => {
      window.removeEventListener("message", listener);
      window.removeEventListener("pagehide", flushSave);
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
      flushSave();
    };
  }, [flushSave, vscode]);

  useEffect(() => {
    vscode.setState({ activeRequestId });
  }, [activeRequestId, vscode]);

  const activeRequest = document.requests.find((request) => request.id === activeRequestId) ?? document.requests[0];
  const selectRequest = (request: RequestSpec, source: "collection" | "discovery") => {
    setActiveRequestId(request.id);
    if (source === "discovery") {
      updateDocument((current) => ({
        ...current,
        requests: [...current.requests.filter((item) => item.id !== request.id), { ...request, headers: [...request.headers], params: [...request.params] }]
      }));
    }
  };
  const updateRequest = (request: RequestSpec) => {
    updateDocument((current) => ({ ...current, requests: current.requests.map((item) => item.id === request.id ? request : item) }));
  };
  const newRequest = () => {
    const id = crypto.randomUUID();
    const request: RequestSpec = { id, name: "Nueva petición", method: "GET", url: "", headers: [], params: [], body: "", bodyType: "none" };
    setActiveRequestId(id);
    updateDocument((current) => ({ ...current, requests: [...current.requests, request] }));
  };
  const deleteRequest = (id: string) => {
    updateDocument((current) => ({ ...current, requests: current.requests.filter((request) => request.id !== id) }));
    setActiveRequestId((current) => current === id ? documentRef.current.requests.find((request) => request.id !== id)?.id ?? "" : current);
  };
  const changeEnvironment = (environment: Environment) => {
    updateDocument((current) => ({
      ...current,
      environments: current.environments.map((item) => item.id === environment.id ? environment : item)
    }));
  };
  const addEnvironment = () => {
    updateDocument((current) => {
      const id = crypto.randomUUID();
      return {
        ...current,
        selectedEnvironmentId: id,
        environments: [...current.environments, { id, name: `Entorno ${current.environments.length + 1}`, variables: {} }]
      };
    });
  };
  const deleteEnvironment = (id: string) => {
    updateDocument((current) => {
      const environments = current.environments.filter((environment) => environment.id !== id);
      return { ...current, environments, selectedEnvironmentId: environments[0]?.id ?? "" };
    });
  };
  const execute = (total: number, concurrency: number) => {
    if (!activeRequest) {
      return;
    }
    flushSave();
    setRunning(true);
    vscode.postMessage({
      type: "executeRequest",
      document: documentRef.current,
      requestId: activeRequest.id,
      environmentId: documentRef.current.selectedEnvironmentId,
      total,
      concurrency
    });
  };
  const discover = () => {
    flushSave();
    vscode.postMessage({ type: "discover", swaggerUrl });
  };
  const reloadConflict = () => {
    if (!conflict) {
      return;
    }
    saveInFlight.current = undefined;
    dirtyRef.current = false;
    conflictRef.current = undefined;
    setConflict(undefined);
    applyHostDocument(conflict.document, conflict.revision);
    setNotice("Cambios externos cargados.");
  };

  if (loadError) {
    return <main className="fatal-error"><h1>No se pudo abrir la colección</h1><p>{loadError}</p><p>El archivo no fue modificado. Corrige el JSON en el editor de texto o restaura una copia válida.</p></main>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">↗</span> EasyRequest</div>
        <div className="sync-controls">
          <input value={swaggerUrl} placeholder="URL de swagger/openapi.json" onChange={(event) => setSwaggerUrl(event.target.value)} aria-label="URL de Swagger" />
          <button className="vscode-button secondary" onClick={discover}>Sincronizar</button>
          <button className="vscode-button secondary" onClick={() => { flushSave(); vscode.postMessage({ type: "discoverDotNet" }); }}>Analizar C#</button>
        </div>
        <EnvironmentEditor
          environments={document.environments}
          selectedId={document.selectedEnvironmentId}
          onSelect={(id) => updateDocument((current) => ({ ...current, selectedEnvironmentId: id }))}
          onChange={changeEnvironment}
          onAdd={addEnvironment}
          onDelete={deleteEnvironment}
        />
      </header>
      {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={() => setNotice(undefined)} aria-label="Cerrar mensaje">×</button></div>}
      {conflict && <div className="conflict" role="alert"><span>Hay cambios externos pendientes.</span><button className="vscode-button secondary" onClick={reloadConflict}>Recargar archivo</button><button className="text-button" onClick={() => vscode.postMessage({ type: "saveCopy", document: documentRef.current })}>Guardar edición como copia</button></div>}
      <div
        ref={workspaceRef}
        className={`workspace-grid${isResizing ? " is-resizing" : ""}`}
        style={{
          "--collection-width": `${paneWidths.collection}px`,
          "--response-width": `${paneWidths.response}px`
        } as CSSProperties}
      >
        <EndpointTree requests={document.requests} endpoints={document.endpoints} activeId={activeRequest?.id ?? ""} onSelect={selectRequest} onNew={newRequest} onDelete={deleteRequest} />
        <div
          className="pane-splitter"
          role="separator"
          aria-label="Redimensionar colección"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(event) => startResize("collection", event)}
          onPointerMove={(event) => moveResize("collection", event)}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              resizePane("collection", event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP);
            }
          }}
        />
        {activeRequest
          ? <RequestPanel request={activeRequest} onChange={updateRequest} onExecute={execute} onCancel={() => vscode.postMessage({ type: "cancelRequest" })} running={running} />
          : <main className="request-panel"><div className="response-empty">Crea o selecciona una petición para empezar.</div></main>}
        <div
          className="pane-splitter"
          role="separator"
          aria-label="Redimensionar respuesta"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={(event) => startResize("response", event)}
          onPointerMove={(event) => moveResize("response", event)}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              resizePane("response", event.key === "ArrowLeft" ? -RESIZE_STEP : RESIZE_STEP);
            }
          }}
        />
        <ResponsePanel batch={batch} />
      </div>
    </div>
  );
}
