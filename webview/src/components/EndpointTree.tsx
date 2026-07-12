import type { Endpoint, RequestSpec } from "../../../src/types";

interface EndpointTreeProps {
  requests: RequestSpec[];
  endpoints: Endpoint[];
  activeId: string;
  onSelect(request: RequestSpec, source: "collection" | "discovery"): void;
  onNew(): void;
  onDelete(id: string): void;
}

const methodClass = (method: string) => `method method-${method.toLowerCase()}`;

export function EndpointTree({ requests, endpoints, activeId, onSelect, onNew, onDelete }: EndpointTreeProps): JSX.Element {
  const groups = endpoints.reduce<Record<string, Endpoint[]>>((result, endpoint) => {
    (result[endpoint.group] ??= []).push(endpoint);
    return result;
  }, {});

  return (
    <aside className="endpoint-tree">
      <div className="pane-heading">
        <span>Colección</span>
        <button className="icon-button" onClick={onNew} title="Nueva petición" aria-label="Nueva petición">
          +
        </button>
      </div>
      <div className="tree-scroll">
        <div className="tree-group">Mis peticiones</div>
        {requests.map((request) => (
          <div className={`endpoint-row ${request.id === activeId ? "selected" : ""}`} key={request.id}>
            <button className="endpoint-item" onClick={() => onSelect(request, "collection")}>
              <span className={methodClass(request.method)}>{request.method}</span>
              <span className="endpoint-name">{request.name || "Sin nombre"}</span>
            </button>
            <button className="delete-request" onClick={() => onDelete(request.id)} title="Eliminar petición" aria-label={`Eliminar ${request.name || "petición"}`}>×</button>
          </div>
        ))}
        {Object.entries(groups).map(([group, groupEndpoints]) => (
          <section key={group}>
            <div className="tree-group">{group}</div>
            {groupEndpoints.map((endpoint) => (
              <button
                key={endpoint.id}
                className={`endpoint-item ${endpoint.request.id === activeId ? "selected" : ""}`}
                onClick={() => onSelect(endpoint.request, "discovery")}
                title={`Usar la definición sincronizada de ${endpoint.path}`}
              >
                <span className={methodClass(endpoint.method)}>{endpoint.method}</span>
                <span className="endpoint-name">{endpoint.name}</span>
              </button>
            ))}
          </section>
        ))}
        {!endpoints.length && <p className="empty-copy">Sin endpoints sincronizados.</p>}
      </div>
    </aside>
  );
}
