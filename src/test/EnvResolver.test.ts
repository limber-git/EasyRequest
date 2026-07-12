import * as assert from "node:assert/strict";
import test from "node:test";
import { RequestSpec } from "../types";
import { EnvResolver } from "../services/EnvResolver";

const request = (params: RequestSpec["params"], url = "http://localhost:5025/api/requests/{{id}}"): RequestSpec => ({
  id: "get-request",
  name: "Get request",
  method: "GET" as const,
  url,
  headers: [],
  params,
  body: "",
  bodyType: "none" as const
});

test("resolves OpenAPI path parameters without appending a query string", () => {
  const result = new EnvResolver().resolveRequest(request([
    { key: "id", value: "1", enabled: true, location: "path" }
  ]), {});

  assert.equal(result.url, "http://localhost:5025/api/requests/1");
  assert.deepEqual(result.params, {});
  assert.deepEqual(result.missingVariables, []);
});

test("treats a parameter referenced by a route token as a path parameter for existing collections", () => {
  const result = new EnvResolver().resolveRequest(request([
    { key: "id", value: "1", enabled: true }
  ]), {});

  assert.equal(result.url, "http://localhost:5025/api/requests/1");
  assert.deepEqual(result.params, {});
  assert.deepEqual(result.missingVariables, []);
});

test("keeps ordinary parameters as query parameters", () => {
  const result = new EnvResolver().resolveRequest(request([
    { key: "page", value: "2", enabled: true, location: "query" }
  ], "http://localhost:5025/api/requests"), {});

  assert.equal(result.url, "http://localhost:5025/api/requests");
  assert.deepEqual(result.params, { page: "2" });
});

test("does not let an explicit query parameter override environment variables", () => {
  const result = new EnvResolver().resolveRequest(request([
    { key: "apiUrl", value: "https://query.invalid", enabled: true, location: "query" }
  ], "{{apiUrl}}/requests"), { apiUrl: "https://safe.example" });

  assert.equal(result.url, "https://safe.example/requests");
  assert.deepEqual(result.params, { apiUrl: "https://query.invalid" });
});

test("encodes path parameter values as URL segments", () => {
  const result = new EnvResolver().resolveRequest(request([
    { key: "id", value: "folder/name?#", enabled: true, location: "path" }
  ]), {});

  assert.equal(result.url, "http://localhost:5025/api/requests/folder%2Fname%3F%23");
});

test("treats special object property names as data", () => {
  const spec = request([], "https://safe.example");
  spec.headers = [{ key: "__proto__", value: "value", enabled: true }];

  const result = new EnvResolver().resolveRequest(spec, {});
  assert.equal(Object.prototype.hasOwnProperty.call(result.headers, "__proto__"), true);
  assert.equal(result.headers.__proto__, "value");
});
