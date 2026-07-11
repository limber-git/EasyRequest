import * as assert from "node:assert/strict";
import test from "node:test";
import { RequestSpec } from "../types";
import { EnvResolver } from "../services/EnvResolver";

const request = (params: RequestSpec["params"], url = "http://localhost:5025/api/requests/{{id}}") => ({
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
