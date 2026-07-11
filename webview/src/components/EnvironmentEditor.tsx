import type { Environment } from "../../../src/types";

interface EnvironmentEditorProps {
  environments: Environment[];
  selectedId: string;
  onSelect(id: string): void;
  onChange(environment: Environment): void;
  onAdd(): void;
}

export function EnvironmentEditor({ environments, selectedId, onSelect, onChange, onAdd }: EnvironmentEditorProps): JSX.Element {
  const selected = environments.find((environment) => environment.id === selectedId) ?? environments[0];
  if (!selected) {
    return <span />;
  }
  const variables = Object.entries(selected.variables);
  const updateVariable = (oldKey: string, key: string, value: string) => {
    const next = { ...selected.variables };
    delete next[oldKey];
    if (key.trim()) {
      next[key] = value;
    }
    onChange({ ...selected, variables: next });
  };

  return (
    <details className="environment-editor">
      <summary>
        <select value={selected.id} onClick={(event) => event.stopPropagation()} onChange={(event) => onSelect(event.target.value)}>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </summary>
      <div className="environment-popover">
        <div className="environment-title">
          <span>Variables de {selected.name}</span>
          <button className="text-button" onClick={onAdd}>+ Entorno</button>
        </div>
        {variables.map(([key, value]) => (
          <div className="environment-row" key={key}>
            <input value={key} onChange={(event) => updateVariable(key, event.target.value, value)} aria-label="Nombre de variable" />
            <input value={value} onChange={(event) => updateVariable(key, key, event.target.value)} aria-label={`Valor de ${key}`} />
          </div>
        ))}
        <button className="text-button" onClick={() => updateVariable("", "nuevaVariable", "")}>+ Variable</button>
      </div>
    </details>
  );
}
