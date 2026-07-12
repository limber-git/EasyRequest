import { useState } from "react";
import type { BatchResult, RequestContract } from "../../../src/types";
import { ResponseDetails, type ResponseTab } from "./response/ResponseDetails";

interface ResponsePanelProps {
  batch?: BatchResult;
  contract?: RequestContract;
  requestId: string;
  onSaveContract?(contract: RequestContract): void;
  onDeleteContract?(): void;
}

export function ResponsePanel({ batch, contract, requestId, onSaveContract, onDeleteContract }: ResponsePanelProps): JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<ResponseTab>("body");
  const selected = batch?.results.find((result) => result.index === selectedIndex) ?? batch?.results[0];
  const successCount = batch?.results.filter((result) => result.ok).length ?? 0;
  return <aside className="response-panel">
    <div className="pane-heading">Respuesta</div>
    {!batch ? <div className="response-empty">Envía una petición para inspeccionar la respuesta y las métricas de la ráfaga.</div> : <>
      <div className="batch-summary"><strong>{successCount}/{batch.results.length}</strong> correctas<span>{batch.totalDurationMs} ms total</span></div>
      <div className="batch-results" aria-label="Resultados de la ráfaga">{batch.results.map((result) => <button key={result.index} className={selected?.index === result.index ? "selected" : ""} onClick={() => setSelectedIndex(result.index)}><span>#{result.index + 1}</span><span className={`status ${result.ok ? "success" : "failure"}`}>{result.status ?? "ERR"}</span><span>{result.durationMs} ms</span></button>)}</div>
      <ResponseTabs active={tab} onSelect={setTab} />
      {selected && <ResponseDetails result={selected} tab={tab} contract={contract} requestId={requestId} onSaveContract={onSaveContract} onDeleteContract={onDeleteContract} />}
    </>}
  </aside>;
}

function ResponseTabs({ active, onSelect }: { active: ResponseTab; onSelect(tab: ResponseTab): void }): JSX.Element {
  const labels: Record<ResponseTab, string> = { body: "Body", headers: "Headers", contract: "Contract" };
  return <div className="response-tabs" role="tablist" aria-label="Datos de la respuesta">{(Object.keys(labels) as ResponseTab[]).map((tab) => <button className={active === tab ? "active" : ""} onClick={() => onSelect(tab)} key={tab} role="tab" aria-selected={active === tab}>{labels[tab]}</button>)}</div>;
}
