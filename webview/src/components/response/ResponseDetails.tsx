import type { HttpResult, RequestContract } from "../../../../src/types";
import ContractPanel from "../ContractPanel";
import { ResponseBodyViewer } from "./ResponseBodyViewer";
import { ResponseHeaders } from "./ResponseHeaders";

export type ResponseTab = "body" | "headers" | "contract";

interface ResponseDetailsProps {
  result: HttpResult;
  tab: ResponseTab;
  contract?: RequestContract;
  requestId: string;
  onCopy(text: string): void;
  onSaveContract?(contract: RequestContract): void;
  onDeleteContract?(): void;
}

export function ResponseDetails({ result, tab, contract, requestId, onSaveContract, onDeleteContract, onCopy }: ResponseDetailsProps): JSX.Element {
  return <div className="response-details">
    <div className="response-meta"><span className={`status ${result.ok ? "success" : "failure"}`}>{result.status ?? "Error"} {result.statusText}</span><span>{result.durationMs} ms</span></div>
    {result.truncated && <div className="response-warning">Respuesta truncada por el límite configurado.</div>}
    {result.error && <pre className="request-error">{result.error}</pre>}
    {tab === "body" && !result.error && <ResponseBodyViewer body={result.body} onCopy={onCopy} />}
    {tab === "headers" && <ResponseHeaders headers={result.headers} />}
    {tab === "contract" && <div className="contract-tab"><ContractPanel contract={contract} result={result} requestId={requestId} onSaveContract={onSaveContract} onDeleteContract={onDeleteContract} /></div>}
  </div>;
}
