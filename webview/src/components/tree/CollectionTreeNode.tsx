import type { CSSProperties, DragEvent, KeyboardEvent } from "react";
import type { CollectionFolder, CollectionNode } from "../../../../src/types";
import { VSCodeIcon } from "../icons/VSCodeIcon";

interface CollectionTreeNodeProps {
  node: CollectionNode;
  depth: number;
  activeId: string;
  collapsed: ReadonlySet<string>;
  editing: { id: string; text: string } | undefined;
  draggedId: string | null;
  dropTargetId: string | null;
  matchesSearch(node: CollectionNode): boolean;
  onToggle(id: string): void;
  onSelect(id: string): void;
  onStartRename(id: string, name: string): void;
  onRenameTextChange(text: string): void;
  onSaveRename(id: string): void;
  onCancelRename(): void;
  onCreateRequest(parentId: string): void;
  onCreateFolder(parentId: string): void;
  onDelete(id: string): void;
  onDragStart(event: DragEvent, id: string): void;
  onDragOver(event: DragEvent, folderId: string): void;
  onDragLeave(event: DragEvent): void;
  onDrop(event: DragEvent, folderId: string): void;
}

export function CollectionTreeNode(props: CollectionTreeNodeProps): JSX.Element | null {
  const { node, matchesSearch } = props;
  if (!matchesSearch(node)) {
    return null;
  }

  return node.type === "folder"
    ? <FolderNode {...props} folder={node} />
    : <RequestNode {...props} />;
}

function FolderNode(props: CollectionTreeNodeProps & { folder: CollectionFolder }): JSX.Element {
  const { folder, collapsed, depth, editing, dropTargetId, matchesSearch } = props;
  const expanded = !collapsed.has(folder.id);
  const isEditing = editing?.id === folder.id;
  const style = { "--tree-depth": depth } as CSSProperties;

  return (
    <section className={`tree-folder ${dropTargetId === folder.id ? "is-drop-target" : ""}`}>
      <div
        className="tree-row tree-folder-row"
        style={style}
        draggable
        onDragStart={(event) => props.onDragStart(event, folder.id)}
        onDragOver={(event) => props.onDragOver(event, folder.id)}
        onDragLeave={props.onDragLeave}
        onDrop={(event) => props.onDrop(event, folder.id)}
      >
        <button className="tree-disclosure" onClick={() => props.onToggle(folder.id)} aria-label={expanded ? "Contraer carpeta" : "Expandir carpeta"}>
          <VSCodeIcon name="chevron" className={expanded ? "is-expanded" : ""} />
        </button>
        <VSCodeIcon name={expanded ? "folder-open" : "folder"} className="tree-node-icon" />
        {isEditing ? (
          <RenameInput {...props} nodeId={folder.id} />
        ) : (
          <button className="tree-node-label" role="treeitem" aria-level={depth + 1} aria-expanded={expanded} onDoubleClick={() => props.onStartRename(folder.id, folder.name)} onKeyDown={(event) => handleFolderKey(event, expanded, () => props.onToggle(folder.id), () => props.onStartRename(folder.id, folder.name))}>{folder.name || "Sin nombre"}</button>
        )}
        <div className="tree-row-actions" onClick={(event) => event.stopPropagation()}>
          <TreeAction label="Nueva petición" icon="new-file" onClick={() => props.onCreateRequest(folder.id)} />
          <TreeAction label="Nueva subcarpeta" icon="new-folder" onClick={() => props.onCreateFolder(folder.id)} />
          <TreeAction label="Eliminar carpeta" icon="trash" onClick={() => props.onDelete(folder.id)} />
        </div>
      </div>
      {expanded && <div role="group">{folder.children.map((child) => <CollectionTreeNode key={child.id} {...props} node={child} depth={depth + 1} matchesSearch={matchesSearch} />)}</div>}
    </section>
  );
}

function RequestNode(props: CollectionTreeNodeProps): JSX.Element {
  const { node, depth, activeId, editing } = props;
  if (node.type !== "request") {
    return <></>;
  }
  const isEditing = editing?.id === node.id;
  const style = { "--tree-depth": depth } as CSSProperties;

  return (
    <div className={`tree-row tree-request-row ${node.id === activeId ? "is-active" : ""}`} style={style} draggable onDragStart={(event) => props.onDragStart(event, node.id)}>
      {isEditing ? <>
        <span className={`method method-${node.request.method.toLowerCase()}`}>{node.request.method}</span>
        <RenameInput {...props} nodeId={node.id} />
      </> : <button className="tree-request-button" role="treeitem" aria-level={depth + 1} aria-selected={node.id === activeId} onClick={() => props.onSelect(node.id)} onDoubleClick={() => props.onStartRename(node.id, node.name)} onKeyDown={(event) => { if (event.key === "F2") { event.preventDefault(); props.onStartRename(node.id, node.name); } }}>
        <span className={`method method-${node.request.method.toLowerCase()}`}>{node.request.method}</span>
        <span className="endpoint-name">{node.name || "Sin nombre"}</span>
      </button>}
      <div className="tree-row-actions">
        <TreeAction label="Eliminar petición" icon="trash" onClick={() => props.onDelete(node.id)} />
      </div>
    </div>
  );
}

function RenameInput({ editing, onRenameTextChange, onSaveRename, onCancelRename, nodeId }: CollectionTreeNodeProps & { nodeId: string }): JSX.Element {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onSaveRename(nodeId);
    } else if (event.key === "Escape") {
      onCancelRename();
    }
  };
  return <input className="tree-node-editing" value={editing?.text ?? ""} autoFocus onChange={(event) => onRenameTextChange(event.target.value)} onBlur={() => onSaveRename(nodeId)} onKeyDown={handleKeyDown} onClick={(event) => event.stopPropagation()} />;
}

function handleFolderKey(event: KeyboardEvent<HTMLButtonElement>, expanded: boolean, toggle: () => void, rename: () => void): void {
  if ((event.key === "ArrowRight" && !expanded) || (event.key === "ArrowLeft" && expanded)) {
    event.preventDefault();
    toggle();
  }
  if (event.key === "F2") {
    event.preventDefault();
    rename();
  }
}

function TreeAction({ label, icon, onClick }: { label: string; icon: "new-file" | "new-folder" | "trash"; onClick(): void }): JSX.Element {
  return <button className="tree-action" onClick={onClick} title={label} aria-label={label}><VSCodeIcon name={icon} /></button>;
}
