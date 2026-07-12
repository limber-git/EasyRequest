import type { Environment } from "../../../src/types";

interface EnvironmentEditorProps {
  environments: Environment[];
  selectedId: string;
  onSelect(id: string): void;
  onChange(environment: Environment): void;
  onAdd(): void;
  onDelete(id: string): void;
}

export function EnvironmentEditor({ environments, selectedId, onSelect, onChange, onAdd, onDelete }: EnvironmentEditorProps): JSX.Element {
  const selected = environments.find((environment) => environment.id === selectedId) ?? environments[0];
  if (!selected) {
    return <span />;
  }
  const variables = Object.entries(selected.variables);
  const updateVariable = (oldKey: string, key: string, value: string) => {
    const next = { ...selected.variables };
    const secrets = new Set(selected.secretVariableNames ?? []);
    delete next[oldKey];
    if (secrets.delete(oldKey) && key.trim()) {
      secrets.add(key);
    }
    if (key.trim()) {
      next[key] = value;
    }
    onChange({ ...selected, variables: next, secretVariableNames: [...secrets] });
  };
  const toggleSecret = (key: string, enabled: boolean) => {
    const secrets = new Set(selected.secretVariableNames ?? []);
    if (enabled) {
      secrets.add(key);
    } else {
      secrets.delete(key);
    }
    onChange({ ...selected, secretVariableNames: [...secrets] });
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
        <span className="environment-toggle">Variables</span>
      </summary>
      <div className="environment-popover">
        <div className="environment-title">
          <input className="environment-name" value={selected.name} onChange={(event) => onChange({ ...selected, name: event.target.value })} aria-label="Nombre del entorno" />
          <button className="text-button" onClick={onAdd}>+ Entorno</button>
        </div>
        {variables.map(([key, value], index) => (
          <div className="environment-row" key={`${selected.id}-${index}`}>
            <input value={key} onChange={(event) => updateVariable(key, event.target.value, value)} aria-label="Nombre de variable" />
            <input type={(selected.secretVariableNames ?? []).includes(key) ? "password" : "text"} value={value} onChange={(event) => updateVariable(key, key, event.target.value)} aria-label={`Valor de ${key}`} />
            <label className="secret-toggle" title="Guardar en VS Code SecretStorage">
              <input type="checkbox" checked={(selected.secretVariableNames ?? []).includes(key)} onChange={(event) => toggleSecret(key, event.target.checked)} /> secreto
            </label>
          </div>
        ))}
        <div className="environment-actions">
          <button className="text-button" onClick={() => updateVariable("", "nuevaVariable", "")}>+ Variable</button>
          <button className="text-button danger" disabled={environments.length === 1} onClick={() => onDelete(selected.id)}>Eliminar entorno</button>
        </div>
      </div>
    </details>
  );
}
