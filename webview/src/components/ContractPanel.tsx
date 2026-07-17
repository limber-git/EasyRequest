import React from "react";
import type {
  ContractValidation,
  RequestContract,
  HttpResult,
} from "../../../src/types";

interface ContractPanelProps {
  contract?: RequestContract;
  result?: HttpResult;
  onSaveContract?: (contract: RequestContract) => void;
  onDeleteContract?: () => void;
  requestId: string;
}

function generateValidations(result: HttpResult): ContractValidation[] {
  const validations: ContractValidation[] = [];

  validations.push({
    field: "status",
    type: "value",
    expected: String(result.status),
  });

  try {
    const parsed = JSON.parse(result.body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const key of Object.keys(parsed)) {
        validations.push({ field: `body.${key}`, type: "exists" });

        const value = parsed[key];
        if (Array.isArray(value)) {
          validations.push({
            field: `body.${key}`,
            type: "type",
            expected: "array",
          });
        } else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          validations.push({
            field: `body.${key}`,
            type: "type",
            expected: typeof value,
          });
        }
      }
    }
  } catch {
    // Body is not JSON — skip body validations
  }

  validations.push({
    field: "duration",
    type: "maxDuration",
    expected: String(Math.ceil(result.durationMs * 1.5)),
  });

  return validations;
}

function navigateBody(body: string, dotPath: string): unknown | undefined {
  try {
    const parsed = JSON.parse(body);
    // dotPath is e.g. "body.foo" — strip the leading "body." segment
    const segments = dotPath.split(".").slice(1);
    let current: unknown = parsed;
    for (const seg of segments) {
      if (current === null || current === undefined || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[seg];
    }
    return current;
  } catch {
    return undefined;
  }
}

function runValidation(
  validation: ContractValidation,
  result: HttpResult
): boolean {
  switch (validation.type) {
    case "value": {
      if (validation.field === "status") {
        return result.status === Number(validation.expected);
      }
      return false;
    }
    case "exists": {
      const value = navigateBody(result.body, validation.field);
      return value !== undefined;
    }
    case "type": {
      const value = navigateBody(result.body, validation.field);
      if (value === undefined) return false;
      if (validation.expected === "array") return Array.isArray(value);
      return typeof value === validation.expected;
    }
    case "maxDuration": {
      return result.durationMs <= Number(validation.expected);
    }
    default:
      return false;
  }
}

function describeValidation(v: ContractValidation): string {
  switch (v.type) {
    case "value":
      return `${v.field} es igual a ${v.expected}`;
    case "exists":
      return `${v.field} existe`;
    case "type":
      return `${v.field} es de tipo ${v.expected}`;
    case "maxDuration":
      return `duración ≤ ${v.expected} ms`;
    default:
      return v.field;
  }
}

const ContractPanel: React.FC<ContractPanelProps> = ({
  contract,
  result,
  onSaveContract,
  onDeleteContract,
  requestId,
}) => {
  const handleSave = () => {
    if (!result || !onSaveContract) return;
    const validations = generateValidations(result);
    onSaveContract({
      requestId,
      validations,
      savedAt: new Date().toISOString(),
    });
  };

  // No contract, but we have a result — offer to create one
  if (!contract && result) {
    return (
      <div className="contract-panel">
        <div className="contract-header">Contract Guardian</div>
        <p style={{ color: "var(--vscode-descriptionForeground)", fontSize: ".85em", lineHeight: 1.5 }}>
          Captura esta respuesta como contrato base. EasyRequest verificará automáticamente que las futuras respuestas cumplan con la estructura y valores esperados.
        </p>
        <div className="contract-actions">
          <button className="vscode-button primary" onClick={handleSave}>Guardar como contrato</button>
        </div>
      </div>
    );
  }

  // No contract and no result — nothing to show
  if (!contract) {
    return (
      <div className="contract-panel">
        <div className="contract-header">Contract Guardian</div>
        <p style={{ color: "var(--vscode-descriptionForeground)", fontSize: ".85em", lineHeight: 1.5 }}>
          Ejecuta la petición primero. Luego podrás capturar la respuesta como contrato base para validar futuras ejecuciones.
        </p>
      </div>
    );
  }

  // Contract exists
  const validationResults = result ? contract.validations.map((v) => runValidation(v, result)) : [];
  const passCount = validationResults.filter(Boolean).length;
  const failCount = validationResults.filter((r) => r === false).length;

  return (
    <div className="contract-panel">
      <div className="contract-header">
        Contract Guardian
        {result && <span style={{ fontWeight: 400, fontSize: ".88em" }}>
          <span className="success">{passCount} ✓</span>{failCount > 0 && <>{" "}<span className="failure">{failCount} ✗</span></>}
        </span>}
      </div>

      {!result && (
        <p style={{ color: "var(--vscode-descriptionForeground)", fontSize: ".85em" }}>
          Ejecuta la petición para validar el contrato.
        </p>
      )}

      {contract.validations.map((v, i) => {
        const pass = result ? runValidation(v, result) : undefined;
        let className = "contract-validation";
        if (pass === true) className += " pass";
        else if (pass === false) className += " fail";

        return (
          <div key={i} className={className}>
            <span className="contract-validation-icon">
              {pass === true ? "✓" : pass === false ? "✗" : "–"}
            </span>
            <span className="contract-validation-field">{v.field}</span>
            <span className="contract-validation-desc">
              {describeValidation(v)}
            </span>
          </div>
        );
      })}

      <div className="contract-actions">
        <button className="vscode-button secondary" onClick={onDeleteContract}>Eliminar contrato</button>
      </div>
    </div>
  );
};

export default ContractPanel;
