import { useEffect, useMemo, useState } from "react";
import type { CollectionFolder, Environment, RequestSpec } from "../../../src/types";
import { KeyValueEditor } from "./KeyValueEditor";
import { ContextLens } from "./ContextLens";
import { AuthEditor } from "./request/AuthEditor";
import { RequestBodyEditor, validateJson } from "./request/RequestBodyEditor";
import { RequestExecutionBar } from "./request/RequestExecutionBar";

interface RequestPanelProps {
  request: RequestSpec;
  root: CollectionFolder;
  environment: Environment | undefined;
  onChange(request: RequestSpec): void;
  onExecute(total: number, concurrency: number): void;
  onCancel(): void;
  running: boolean;
  onEditFolderBaseUrl?(folderId: string): void;
  onOpenEnvironment?(): void;
}

type RequestTab = "headers" | "params" | "body" | "auth";

export function RequestPanel(props: RequestPanelProps): JSX.Element {
  const [tab, setTab] = useState<RequestTab>("body");
  const [total, setTotal] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const jsonError = useMemo(() => validateJson(props.request.body, props.request.bodyType), [props.request.body, props.request.bodyType]);
  const patch = (update: Partial<RequestSpec>) => props.onChange({ ...props.request, ...update });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !jsonError && !props.running) {
        event.preventDefault();
        props.onExecute(total, concurrency);
      }
      if (event.key === "Escape" && props.running) {
        event.preventDefault();
        props.onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [concurrency, jsonError, props, total]);

  return <main className="request-panel">
    <div className="pane-heading">Constructor de petición</div>
    <div className="request-title-row"><input className="request-name" value={props.request.name} placeholder="Nombre de la petición" onChange={(event) => patch({ name: event.target.value })} /></div>
    <ContextLens root={props.root} requestId={props.request.id} requestUrl={props.request.url} environment={props.environment} onEditFolderBaseUrl={props.onEditFolderBaseUrl} onOpenEnvironment={props.onOpenEnvironment} />
    <RequestExecutionBar method={props.request.method} url={props.request.url} running={props.running} disabled={Boolean(jsonError)} total={total} concurrency={concurrency} onChange={patch} onBurstChange={(update) => { if (update.total !== undefined) setTotal(update.total); if (update.concurrency !== undefined) setConcurrency(update.concurrency); }} onExecute={() => props.onExecute(total, concurrency)} onCancel={props.onCancel} />
    <RequestTabs active={tab} request={props.request} onSelect={setTab} />
    <div className="request-content">
      {tab === "headers" && <KeyValueEditor ariaLabel="Headers" entries={props.request.headers} onChange={(headers) => patch({ headers })} />}
      {tab === "params" && <KeyValueEditor ariaLabel="Parámetros de consulta" entries={props.request.params} onChange={(params) => patch({ params })} />}
      {tab === "auth" && <AuthEditor request={props.request} onChange={props.onChange} />}
      {tab === "body" && <RequestBodyEditor body={props.request.body} bodyType={props.request.bodyType} onChange={patch} />}
    </div>
  </main>;
}

function RequestTabs({ active, request, onSelect }: { active: RequestTab; request: RequestSpec; onSelect(tab: RequestTab): void }): JSX.Element {
  const labels: Record<RequestTab, string> = {
    headers: `Headers (${request.headers.filter((entry) => entry.enabled).length})`,
    params: `Params (${request.params.filter((entry) => entry.enabled).length})`,
    body: "Body",
    auth: "Auth"
  };
  return <div className="request-tabs" role="tablist" aria-label="Datos de la petición">{(Object.keys(labels) as RequestTab[]).map((tab) => <button className={active === tab ? "active" : ""} onClick={() => onSelect(tab)} key={tab} role="tab" aria-selected={active === tab}>{labels[tab]}</button>)}</div>;
}
