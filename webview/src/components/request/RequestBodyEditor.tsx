import type { RequestSpec } from "../../../../src/types";

interface RequestBodyEditorProps {
  body: string;
  bodyType: RequestSpec["bodyType"];
  onChange(update: Pick<RequestSpec, "body" | "bodyType">): void;
}

export function validateJson(body: string, bodyType: RequestSpec["bodyType"]): string | undefined {
  if (bodyType !== "json" || !body.trim()) return undefined;
  try { JSON.parse(body); return undefined; } catch (error) { return error instanceof Error ? error.message : "JSON inválido"; }
}

export function RequestBodyEditor({ body, bodyType, onChange }: RequestBodyEditorProps): JSX.Element {
  const error = validateJson(body, bodyType);
  return (
    <div className="editor-shell">
      <div className="body-toolbar">
        <span>{bodyType === "none" ? "Sin body" : bodyType.toUpperCase()}</span>
        <select value={bodyType} onChange={(event) => onChange({ body, bodyType: event.target.value as RequestSpec["bodyType"] })}>
          <option value="none">Ninguno</option><option value="json">JSON</option><option value="text">Texto</option>
        </select>
      </div>
      {bodyType === "none" ? <div className="editor-placeholder">Esta petición no enviará body.</div> : <>
        <textarea className={`body-editor ${error ? "invalid" : ""}`} value={body} onChange={(event) => onChange({ body: event.target.value, bodyType })} spellCheck={false} aria-label="Body de la petición" aria-invalid={Boolean(error)} />
        {error && <div className="validation-error" role="alert">JSON inválido: {error}</div>}
      </>}
    </div>
  );
}
