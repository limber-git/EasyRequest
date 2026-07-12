import type { ReactNode } from "react";
import type { RequestSpec } from "../../../../src/types";

type AuthType = "none" | "bearer" | "basic" | "apikey";
type AuthLocation = "header" | "query";

interface AuthState {
  type: AuthType;
  token: string;
  user: string;
  pass: string;
  key: string;
  value: string;
  location: AuthLocation;
}

interface AuthEditorProps {
  request: RequestSpec;
  onChange(request: RequestSpec): void;
}

export function AuthEditor({ request, onChange }: AuthEditorProps): JSX.Element {
  const auth = readAuth(request);
  const update = (patch: Partial<AuthState>) => onChange(writeAuth(request, { ...auth, ...patch }));

  return (
    <div className="auth-section">
      <Field label="Tipo de autenticación">
        <select className="auth-type-select" value={auth.type} onChange={(event) => update({ type: event.target.value as AuthType })}>
          <option value="none">Ninguno</option>
          <option value="bearer">Bearer token</option>
          <option value="basic">Basic auth</option>
          <option value="apikey">API key</option>
        </select>
      </Field>
      {auth.type === "bearer" && <Field label="Token"><input value={auth.token} placeholder="{{accessToken}}" onChange={(event) => update({ token: event.target.value })} /></Field>}
      {auth.type === "basic" && <><Field label="Usuario"><input value={auth.user} onChange={(event) => update({ user: event.target.value })} /></Field><Field label="Contraseña"><input type="password" value={auth.pass} onChange={(event) => update({ pass: event.target.value })} /></Field></>}
      {auth.type === "apikey" && <>
        <Field label="Nombre"><input value={auth.key} placeholder="X-API-Key" onChange={(event) => update({ key: event.target.value })} /></Field>
        <Field label="Valor"><input value={auth.value} placeholder="{{apiKey}}" onChange={(event) => update({ value: event.target.value })} /></Field>
        <Field label="Ubicación"><select value={auth.location} onChange={(event) => update({ location: event.target.value as AuthLocation })}><option value="header">Header</option><option value="query">Query parameter</option></select></Field>
      </>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return <label className="auth-field"><span>{label}</span>{children}</label>;
}

function readAuth(request: RequestSpec): AuthState {
  const authorization = request.headers.find((item) => item.enabled && item.key.toLowerCase() === "authorization");
  if (authorization?.value.toLowerCase().startsWith("bearer ")) return { type: "bearer", token: authorization.value.slice(7), user: "", pass: "", key: "", value: "", location: "header" };
  if (authorization?.value.toLowerCase().startsWith("basic ")) {
    try {
      const [user = "", pass = ""] = atob(authorization.value.slice(6)).split(":");
      return { type: "basic", token: "", user, pass, key: "", value: "", location: "header" };
    } catch { /* Preserve an unparseable header as a regular header. */ }
  }
  const headerKey = request.headers.find((item) => item.enabled && isApiKeyName(item.key));
  if (headerKey) return { type: "apikey", token: "", user: "", pass: "", key: headerKey.key, value: headerKey.value, location: "header" };
  const queryKey = request.params.find((item) => item.enabled && isApiKeyName(item.key));
  if (queryKey) return { type: "apikey", token: "", user: "", pass: "", key: queryKey.key, value: queryKey.value, location: "query" };
  return { type: "none", token: "", user: "", pass: "", key: "", value: "", location: "header" };
}

function writeAuth(request: RequestSpec, auth: AuthState): RequestSpec {
  const headers = request.headers.filter((item) => item.key.toLowerCase() !== "authorization" && !isApiKeyName(item.key));
  const params = request.params.filter((item) => !isApiKeyName(item.key));
  if (auth.type === "bearer" && auth.token.trim()) headers.push({ key: "Authorization", value: `Bearer ${auth.token.trim()}`, enabled: true });
  if (auth.type === "basic" && (auth.user || auth.pass)) headers.push({ key: "Authorization", value: `Basic ${btoa(`${auth.user}:${auth.pass}`)}`, enabled: true });
  if (auth.type === "apikey" && auth.key.trim() && auth.value.trim()) {
    const target = auth.location === "header" ? headers : params;
    target.push({ key: auth.key.trim(), value: auth.value.trim(), enabled: true, ...(auth.location === "query" ? { location: "query" as const } : {}) });
  }
  return { ...request, headers, params };
}

function isApiKeyName(key: string): boolean {
  return ["x-api-key", "apikey", "api_key"].includes(key.toLowerCase());
}
