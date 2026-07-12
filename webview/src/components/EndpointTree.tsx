import { useState } from "react";
import type { CollectionFolder, CollectionNode } from "../../../src/types";

interface EndpointTreeProps {
  root: CollectionFolder;
  activeId: string;
  onSelect(id: string): void;
  onNew(): void;
  onDelete(id: string): void;
}

const methodClass = (method: string) => `method method-${method.toLowerCase()}`;

export function EndpointTree({ root, activeId, onSelect, onNew, onDelete }: EndpointTreeProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  });
  const renderNode = (node: CollectionNode, depth: number): JSX.Element => {
    if (node.type === "folder") {
      const closed = collapsed.has(node.id);
      return (
        <section className="tree-folder" key={node.id}>
          <button className="tree-group" style={{ paddingLeft: `${12 + depth * 14}px` }} onClick={() => toggle(node.id)} aria-expanded={!closed}>
            <span className={`tree-chevron${closed ? " collapsed" : ""}`}>⌄</span>{node.name || "Sin nombre"}
          </button>
          {!closed && node.children.map((child) => renderNode(child, depth + 1))}
        </section>
      );
    }
    return (
      <div className={`endpoint-row ${node.id === activeId ? "selected" : ""}`} key={node.id} style={{ paddingLeft: `${depth * 14}px` }}>
        <button className="endpoint-item" onClick={() => onSelect(node.id)}>
          <span className={methodClass(node.request.method)}>{node.request.method}</span>
          <span className="endpoint-name">{node.name || "Sin nombre"}</span>
        </button>
        <button className="delete-request" onClick={() => onDelete(node.id)} title="Eliminar petición" aria-label={`Eliminar ${node.name || "petición"}`}>×</button>
      </div>
    );
  };

  return (
    <aside className="endpoint-tree">
      <div className="pane-heading">
        <span>Colección</span>
        <button className="icon-button" onClick={onNew} title="Nueva petición" aria-label="Nueva petición">+</button>
      </div>
      <div className="tree-scroll">
        {root.children.map((node) => renderNode(node, 0))}
        {!root.children.length && <p className="empty-copy">La colección está vacía.</p>}
      </div>
    </aside>
  );
}
