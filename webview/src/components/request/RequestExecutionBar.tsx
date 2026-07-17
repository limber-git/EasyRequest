import type { HttpMethod } from "../../../../src/types";

interface RequestExecutionBarProps {
  method: HttpMethod;
  url: string;
  running: boolean;
  disabled: boolean;
  total: number;
  concurrency: number;
  onChange(update: { method?: HttpMethod; url?: string }): void;
  onBurstChange(update: { total?: number; concurrency?: number }): void;
  onExecute(): void;
  onCancel(): void;
}

const methods: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function RequestExecutionBar(props: RequestExecutionBarProps): JSX.Element {
  return <>
    <div className="request-line">
      <select className={`method-select method-${props.method.toLowerCase()}`} value={props.method} onChange={(event) => props.onChange({ method: event.target.value as HttpMethod })}>{methods.map((method) => <option value={method} key={method}>{method}</option>)}</select>
      <input className="url-input" value={props.url} placeholder="/api/recurso" onChange={(event) => props.onChange({ url: event.target.value })} />
      {props.running ? <button className="vscode-button secondary" onClick={props.onCancel} title="Cancelar petición (Esc)">Cancelar</button> : <button className="vscode-button primary" disabled={props.disabled} onClick={props.onExecute} title="Enviar petición (Ctrl+Enter)">Enviar</button>}
    </div>
    <div className="burst-row">
      <span>Ráfaga</span>
      <label>Solicitudes <input type="number" min="1" max="500" value={props.total} onChange={(event) => props.onBurstChange({ total: bounded(event.target.value, 500) })} /></label>
      <label>En paralelo <input type="number" min="1" max="20" value={props.concurrency} onChange={(event) => props.onBurstChange({ concurrency: bounded(event.target.value, 20) })} /></label>
    </div>
  </>;
}

function bounded(raw: string, maximum: number): number {
  return Math.min(maximum, Math.max(1, Number(raw) || 1));
}
