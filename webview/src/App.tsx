import { useEffect, useRef, useState } from "react";
import type { BatchResult, EasyRequestDocument, Environment, RequestSpec } from "../../src/types";
import { EndpointTree } from "./components/EndpointTree";
import { EnvironmentEditor } from "./components/EnvironmentEditor";
import { RequestPanel } from "./components/RequestPanel";
import { ResponsePanel } from "./components/ResponsePanel";
import { getVsCodeApi } from "./vscode-api";

type HostMessage =
  | { type: "document"; document: EasyRequestDocument }
  | { type: "batchResult"; batch: BatchResult }
  | { type: "error" | "warning"; message: string }
  | { type: "discoveryComplete"; source: string; count: number; warning?: string };

const createInitialDocument = (): EasyRequestDocument => ({
  version: 1,
  selectedEnvironmentId: "default",
  environments: [{ id: "default", name: "Default", variables: { apiUrl: "https://httpbin.org" } }],
  requests: [{ id: "request-1", name: "Nueva petición", method: "GET", url: "{{apiUrl}}/get", headers: [], params: [], body: "", bodyType: "none" }],
  endpoints: []
});

export function App(): JSX.Element {
  const vscode = useRef(getVsCodeApi()).current;
  const [document, setDocument] = useState<EasyRequestDocument>(createInitialDocument);
  const documentRef = useRef(document);
  const [activeRequestId, setActiveRequestId] = useState(document.requests[0].id);
  const [batch, setBatch] = useState<BatchResult>();
  const [notice, setNotice] = useState<string>();
  const [swaggerUrl, setSwaggerUrl] = useState("");
  const saveTimer = useRef<number>();

  const applyHostDocument = (next: EasyRequestDocument) => {
    if (saveTimer.current) {
      return;
    }
    documentRef.current = next;
    setDocument(next);
    setActiveRequestId((current) => next.requests.some((request) => request.id === current) ? current : next.requests[0]?.id ?? "");
    setSwaggerUrl(next.swaggerUrl ?? "");
  };

  const persist = (next: EasyRequestDocument) => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
    }
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      vscode.postMessage({ type: "saveDocument", document: next });
    }, 350);
  };

  const updateDocument = (updater: (current: EasyRequestDocument) => EasyRequestDocument) => {
    const next = updater(documentRef.current);
    documentRef.current = next;
    setDocument(next);
    persist(next);
  };

  useEffect(() => {
    const listener = (event: MessageEvent<HostMessage>) => {
      const message = event.data;
      if (!message?.type) {
        return;
      }
      if (message.type === "document") {
        applyHostDocument(message.document);
      } else if (message.type === "batchResult") {
        setBatch(message.batch);
      } else if (message.type === "discoveryComplete") {
        setNotice(`${message.count} endpoints cargados desde ${message.source}.${message.warning ? ` ${message.warning}` : ""}`);
      } else if (message.type === "error" || message.type === "warning") {
        setNotice(message.message);
      }
    };
    window.addEventListener("message", listener);
    vscode.postMessage({ type: "ready" });
    return () => {
      window.removeEventListener("message", listener);
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
    };
  }, [vscode]);

  const activeRequest = document.requests.find((request) => request.id === activeRequestId) ?? document.requests[0];
  const selectRequest = (request: RequestSpec) => {
    setActiveRequestId(request.id);
    updateDocument((current) => ({
      ...current,
      requests: current.requests.some((item) => item.id === request.id)
        ? current.requests
        : [...current.requests, { ...request, headers: [...request.headers], params: [...request.params] }]
    }));
  };
  const updateRequest = (request: RequestSpec) => {
    updateDocument((current) => ({ ...current, requests: current.requests.map((item) => item.id === request.id ? request : item) }));
  };
  const newRequest = () => {
    const id = `request-${Date.now()}`;
    const request: RequestSpec = { id, name: "Nueva petición", method: "GET", url: "", headers: [], params: [], body: "", bodyType: "none" };
    setActiveRequestId(id);
    updateDocument((current) => ({ ...current, requests: [...current.requests, request] }));
  };
  const changeEnvironment = (environment: Environment) => {
    updateDocument((current) => ({
      ...current,
      environments: current.environments.map((item) => item.id === environment.id ? environment : item)
    }));
  };
  const addEnvironment = () => {
    updateDocument((current) => {
      const id = `environment-${Date.now()}`;
      return {
        ...current,
        selectedEnvironmentId: id,
        environments: [...current.environments, { id, name: `Entorno ${current.environments.length + 1}`, variables: {} }]
      };
    });
  };
  const execute = (total: number, concurrency: number) => {
    if (!activeRequest) {
      return;
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
      vscode.postMessage({ type: "saveDocument", document: documentRef.current });
    }
    vscode.postMessage({
      type: "executeRequest",
      document: documentRef.current,
      request: activeRequest,
      environmentId: document.selectedEnvironmentId,
      total,
      concurrency
    });
  };
  const discover = () => {
    vscode.postMessage({ type: "discover", document: documentRef.current, swaggerUrl });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">↗</span> EasyRequest</div>
        <div className="sync-controls">
          <input value={swaggerUrl} placeholder="URL de swagger/openapi.json" onChange={(event) => setSwaggerUrl(event.target.value)} aria-label="URL de Swagger" />
          <vscode-button appearance="secondary" onClick={discover}>Sincronizar</vscode-button>
          <vscode-button appearance="secondary" onClick={() => vscode.postMessage({ type: "discoverDotNet", document: documentRef.current })}>Analizar C#</vscode-button>
        </div>
        <EnvironmentEditor
          environments={document.environments}
          selectedId={document.selectedEnvironmentId}
          onSelect={(id) => updateDocument((current) => ({ ...current, selectedEnvironmentId: id }))}
          onChange={changeEnvironment}
          onAdd={addEnvironment}
        />
      </header>
      {notice && <div className="notice" role="status"><span>{notice}</span><button className="icon-button" onClick={() => setNotice(undefined)} aria-label="Cerrar mensaje">×</button></div>}
      <div className="workspace-grid">
        <EndpointTree requests={document.requests} endpoints={document.endpoints} activeId={activeRequest?.id ?? ""} onSelect={selectRequest} onNew={newRequest} />
        {activeRequest && <RequestPanel request={activeRequest} onChange={updateRequest} onExecute={execute} />}
        <ResponsePanel batch={batch} />
      </div>
    </div>
  );
}
