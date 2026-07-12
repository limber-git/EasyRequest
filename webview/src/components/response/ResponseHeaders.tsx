import type { HttpResult } from "../../../../src/types";

export function ResponseHeaders({ headers }: Pick<HttpResult, "headers">): JSX.Element {
  if (!Object.keys(headers).length) return <p className="empty-copy">Sin headers de respuesta.</p>;
  return <div className="response-headers"><table className="response-headers-table"><thead><tr><th>Header</th><th>Valor</th></tr></thead><tbody>{Object.entries(headers).map(([key, value]) => <tr key={key}><td>{key}</td><td>{value}</td></tr>)}</tbody></table></div>;
}
