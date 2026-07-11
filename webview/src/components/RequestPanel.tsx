import { useState } from "react";
import Editor from "@monaco-editor/react";
import type { HttpMethod, RequestSpec } from "../../../src/types";
import { KeyValueEditor } from "./KeyValueEditor";

interface RequestPanelProps {
  request: RequestSpec;
  onChange(request: RequestSpec): void;
  onExecute(total: number, concurrency: number): void;
}

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function RequestPanel({ request, onChange, onExecute }: RequestPanelProps): JSX.Element {
  const [tab, setTab] = useState<"headers" | "params" | "body">("body");
  const [total, setTotal] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const patch = (update: Partial<RequestSpec>) => onChange({ ...request, ...update });

  return (
    <main className="request-panel">
      <div className="pane-heading">Constructor de petición</div>
      <div className="request-title-row">
        <input
          className="request-name"
          value={request.name}
          placeholder="Nombre de la petición"
          onChange={(event) => patch({ name: event.target.value })}
        />
      </div>
      <div className="request-line">
        <select className={`method-select method-${request.method.toLowerCase()}`} value={request.method} onChange={(event) => patch({ method: event.target.value as HttpMethod })}>
          {methods.map((method) => <option value={method} key={method}>{method}</option>)}
        </select>
        <input className="url-input" value={request.url} placeholder="https://api.example.com/users" onChange={(event) => patch({ url: event.target.value })} />
        <vscode-button appearance="primary" onClick={() => onExecute(total, concurrency)}>Enviar</vscode-button>
      </div>
      <div className="burst-row">
        <span>Ráfaga</span>
        <label>Solicitudes <input type="number" min="1" max="100" value={total} onChange={(event) => setTotal(Math.max(1, Number(event.target.value)))} /></label>
        <label>En paralelo <input type="number" min="1" max="100" value={concurrency} onChange={(event) => setConcurrency(Math.max(1, Number(event.target.value)))} /></label>
      </div>
      <div className="request-tabs" role="tablist" aria-label="Datos de la petición">
        {(["headers", "params", "body"] as const).map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item} role="tab">
            {item === "headers" ? `Headers (${request.headers.filter((entry) => entry.enabled).length})` : item === "params" ? `Params (${request.params.filter((entry) => entry.enabled).length})` : "Body"}
          </button>
        ))}
      </div>
      <div className="request-content">
        {tab === "headers" && <KeyValueEditor ariaLabel="Headers" entries={request.headers} onChange={(headers) => patch({ headers })} />}
        {tab === "params" && <KeyValueEditor ariaLabel="Parámetros de consulta" entries={request.params} onChange={(params) => patch({ params })} />}
        {tab === "body" && (
          <div className="editor-shell">
            <div className="body-toolbar">
              <span>{request.bodyType === "none" ? "Sin body" : request.bodyType.toUpperCase()}</span>
              <select value={request.bodyType} onChange={(event) => patch({ bodyType: event.target.value as RequestSpec["bodyType"] })}>
                <option value="none">Ninguno</option>
                <option value="json">JSON</option>
                <option value="text">Texto</option>
              </select>
            </div>
            {request.bodyType === "none" ? (
              <div className="editor-placeholder">Esta petición no enviará body.</div>
            ) : (
              <Editor
                height="100%"
                language={request.bodyType === "json" ? "json" : "plaintext"}
                value={request.body}
                onChange={(body) => patch({ body: body ?? "" })}
                theme="vs-dark"
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: "on", scrollBeyondLastLine: false, automaticLayout: true }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
