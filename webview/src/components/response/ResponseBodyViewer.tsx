import { useMemo, useState, type ReactNode } from "react";
import { VSCodeIcon } from "../icons/VSCodeIcon";

export function ResponseBodyViewer({ body, onCopy }: { body: string; onCopy(text: string): void }): JSX.Element {
  const [search, setSearch] = useState("");
  const formattedBody = useMemo(() => formatBody(body), [body]);
  const { highlighted, matchCount } = useMemo(() => highlight(formattedBody, search), [formattedBody, search]);

  return <>
    <div className="json-search">
      <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en el body" aria-label="Buscar en el body" />
      {search && <span className="json-search-count">{matchCount} coincidencias</span>}
      <button className="copy-button" onClick={() => onCopy(body)} title="Copiar body" aria-label="Copiar body al portapapeles"><VSCodeIcon name="copy" /></button>
    </div>
    <pre className="response-body" tabIndex={0} aria-label="Body de respuesta JSON">{highlighted}</pre>
  </>;
}

function formatBody(body: string): string {
  if (!body) return "(sin contenido)";
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

function highlight(text: string, query: string): { highlighted: ReactNode; matchCount: number } {
  if (!query) return { highlighted: text, matchCount: 0 };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(matcher);
  let matchCount = 0;
  const highlighted = parts.map((part, index) => {
    if (part.toLowerCase() === query.toLowerCase()) {
      matchCount += 1;
      return <mark key={index}>{part}</mark>;
    }
    return part;
  });
  return { highlighted, matchCount };
}
