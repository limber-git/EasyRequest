import type { Endpoint, RequestSpec } from "../../../src/types";

interface EndpointTreeProps {
  requests: RequestSpec[];
  endpoints: Endpoint[];
  activeId: string;
  onSelect(request: RequestSpec): void;
  onNew(): void;
}

const methodClass = (method: string) => `method method-${method.toLowerCase()}`;

export function EndpointTree({ requests, endpoints, activeId, onSelect, onNew }: EndpointTreeProps): JSX.Element {
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
          <button
            key={request.id}
            className={`endpoint-item ${request.id === activeId ? "selected" : ""}`}
            onClick={() => onSelect(request)}
          >
            <span className={methodClass(request.method)}>{request.method}</span>
            <span className="endpoint-name">{request.name || "Sin nombre"}</span>
          </button>
        ))}
        {Object.entries(groups).map(([group, groupEndpoints]) => (
          <section key={group}>
            <div className="tree-group">{group}</div>
            {groupEndpoints.map((endpoint) => (
              <button
                key={endpoint.id}
                className={`endpoint-item ${endpoint.request.id === activeId ? "selected" : ""}`}
                onClick={() => onSelect(endpoint.request)}
                title={endpoint.path}
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
