import type { KeyValue } from "../../../src/types";

interface KeyValueEditorProps {
  ariaLabel: string;
  entries: KeyValue[];
  onChange(entries: KeyValue[]): void;
}

export function KeyValueEditor({ ariaLabel, entries, onChange }: KeyValueEditorProps): JSX.Element {
  const change = (index: number, patch: Partial<KeyValue>) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };
  const remove = (index: number) => onChange(entries.filter((_, entryIndex) => entryIndex !== index));

  return (
    <div className="key-value-editor" aria-label={ariaLabel}>
      <div className="key-value-header">
        <span />
        <span>Clave</span>
        <span>Valor</span>
        <span />
      </div>
      {entries.map((entry, index) => (
        <div className="key-value-row" key={`${index}-${entry.key}`}>
          <input
            aria-label={`Activar ${entry.key || "fila"}`}
            type="checkbox"
            checked={entry.enabled}
            onChange={(event) => change(index, { enabled: event.target.checked })}
          />
          <input value={entry.key} placeholder="Clave" onChange={(event) => change(index, { key: event.target.value })} />
          <input value={entry.value} placeholder="Valor" onChange={(event) => change(index, { value: event.target.value })} />
          <button className="icon-button" onClick={() => remove(index)} title="Eliminar fila" aria-label="Eliminar fila">
            ×
          </button>
        </div>
      ))}
      <button className="text-button" onClick={() => onChange([...entries, { key: "", value: "", enabled: true }])}>
        + Añadir fila
      </button>
    </div>
  );
}
