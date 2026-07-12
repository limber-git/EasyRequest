import { useMemo, useState } from "react";
import type { BatchResult, HttpResult } from "../../../src/types";

interface ResponsePanelProps {
  batch?: BatchResult;
}

export function ResponsePanel({ batch }: ResponsePanelProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const effectiveIndex = batch?.results.some((result) => result.index === selectedIndex) ? selectedIndex : 0;
  const selected = batch?.results.find((result) => result.index === effectiveIndex);
  const successCount = batch?.results.filter((result) => result.ok).length ?? 0;

  return (
    <aside className="response-panel">
      <div className="pane-heading">Respuesta</div>
      {!batch ? (
        <div className="response-empty">Envía una petición para inspeccionar la respuesta y las métricas de la ráfaga.</div>
      ) : (
        <>
          <div className="batch-summary">
            <strong>{successCount}/{batch.results.length}</strong> correctas
            <span>{batch.totalDurationMs} ms total</span>
          </div>
          <div className="batch-results" aria-label="Resultados de la ráfaga">
            {batch.results.map((result) => (
              <button key={result.index} className={effectiveIndex === result.index ? "selected" : ""} onClick={() => setSelectedIndex(result.index)}>
                <span>#{result.index + 1}</span>
                <span className={`status ${result.ok ? "success" : "failure"}`}>{result.status ?? "ERR"}</span>
                <span>{result.durationMs} ms</span>
              </button>
            ))}
          </div>
          {selected && <ResponseDetails result={selected} />}
        </>
      )}
    </aside>
  );
}

function ResponseDetails({ result }: { result: HttpResult }): JSX.Element {
  const responseBody = useMemo(() => formatBody(result.body), [result.body]);
  const headers = Object.entries(result.headers).map(([key, value]) => `${key}: ${value}`).join("\n");
  return (
    <div className="response-details">
          <div className="response-meta">
        <span className={`status ${result.ok ? "success" : "failure"}`}>{result.status ?? "Error"} {result.statusText}</span>
        <span>{result.durationMs} ms</span>
          </div>
          {result.truncated && <div className="response-warning">Respuesta truncada por el límite configurado.</div>}
      {result.error ? (
        <pre className="request-error">{result.error}</pre>
      ) : (
        <pre className="response-body" tabIndex={0} aria-label="Body de respuesta JSON">{responseBody}</pre>
      )}
      {!!headers && <details className="response-headers"><summary>Headers de respuesta</summary><pre>{headers}</pre></details>}
    </div>
  );
}

function formatBody(body: string): string {
  if (!body) {
    return "(sin contenido)";
  }
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}
