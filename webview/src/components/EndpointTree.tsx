import { useMemo, useState, type DragEvent } from "react";
import type { CollectionFolder, CollectionNode } from "../../../src/types";
import { VSCodeIcon } from "./icons/VSCodeIcon";
import { CollectionTreeNode } from "./tree/CollectionTreeNode";

interface EndpointTreeProps {
  root: CollectionFolder;
  activeId: string;
  onSelect(id: string): void;
  onNew(parentId?: string): void;
  onNewFolder(parentId?: string): void;
  onDelete(id: string): void;
  onRename(id: string, name: string): void;
  onMove(nodeId: string, targetParentId: string, index: number): void;
}

export function EndpointTree(props: EndpointTreeProps): JSX.Element {
  const { root } = props;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string }>();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const normalizedSearch = search.trim().toLowerCase();

  const matchesSearch = useMemo(() => {
    const matches = (node: CollectionNode): boolean => {
      if (!normalizedSearch) return true;
      if (node.name.toLowerCase().includes(normalizedSearch)) return true;
      if (node.type === "request") {
        return node.request.method.toLowerCase().includes(normalizedSearch) || node.request.url.toLowerCase().includes(normalizedSearch);
      }
      return node.children.some(matches);
    };
    return matches;
  }, [normalizedSearch]);

  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const saveRename = (id: string) => {
    const name = editing?.text.trim();
    if (name) props.onRename(id, name);
    setEditing(undefined);
  };
  const handleDragStart = (event: DragEvent, id: string) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggedId(id);
  };
  const handleDragOver = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedId !== folderId) setDropTargetId(folderId);
  };
  const handleDrop = (event: DragEvent, folderId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const nodeId = event.dataTransfer.getData("text/plain") || draggedId;
    if (nodeId && nodeId !== folderId) props.onMove(nodeId, folderId, Number.MAX_SAFE_INTEGER);
    setDraggedId(null);
    setDropTargetId(null);
  };

  return (
    <aside className="endpoint-tree">
      <div className="pane-heading">
        <span>Colección</span>
        <div className="tree-header-actions">
          <button className="tree-action" onClick={() => props.onNewFolder(root.id)} title="Nueva carpeta" aria-label="Nueva carpeta"><VSCodeIcon name="new-folder" /></button>
          <button className="tree-action" onClick={() => props.onNew(root.id)} title="Nueva petición" aria-label="Nueva petición"><VSCodeIcon name="new-file" /></button>
        </div>
      </div>
      <div className="tree-search">
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar en la colección" aria-label="Buscar en la colección" />
      </div>
      <div className="tree-scroll" onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, root.id)}>
        {root.children.map((node) => (
          <CollectionTreeNode
            key={node.id}
            node={node}
            depth={0}
            activeId={props.activeId}
            collapsed={normalizedSearch ? new Set() : collapsed}
            editing={editing}
            draggedId={draggedId}
            dropTargetId={dropTargetId}
            matchesSearch={matchesSearch}
            onToggle={toggle}
            onSelect={props.onSelect}
            onStartRename={(id, name) => setEditing({ id, text: name })}
            onRenameTextChange={(text) => setEditing((current) => current ? { ...current, text } : current)}
            onSaveRename={saveRename}
            onCancelRename={() => setEditing(undefined)}
            onCreateRequest={(parentId) => props.onNew(parentId)}
            onCreateFolder={(parentId) => props.onNewFolder(parentId)}
            onDelete={props.onDelete}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragLeave={() => setDropTargetId(null)}
            onDrop={handleDrop}
          />
        ))}
        {!root.children.length && <p className="empty-copy">La colección está vacía.</p>}
      </div>
    </aside>
  );
}
