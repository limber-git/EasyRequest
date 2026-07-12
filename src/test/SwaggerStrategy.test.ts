import * as assert from "node:assert/strict";
import test from "node:test";
import { SwaggerStrategy } from "../services/discovery/SwaggerStrategy";

test("imports OpenAPI bodies from referenced schemas and uses apiUrl variables", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({
    openapi: "3.0.1",
    servers: [{ url: "http://localhost:5025" }],
    components: {
      schemas: {
        CreateRequest: {
          type: "object",
          properties: {
            title: { type: "string" },
            requestedBy: { type: "string", format: "email" },
            priority: { type: "integer" }
          }
        }
      }
    },
    paths: {
      "/api/requests": {
        post: {
          requestBody: {
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateRequest" } }
            }
          }
        }
      }
    }
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const result = await new SwaggerStrategy("http://localhost:5025/swagger/v1/swagger.json").discover();
    const request = result.endpoints[0].request;

    assert.equal(result.baseUrl, "http://localhost:5025");
    assert.equal(request.url, "/api/requests");
    assert.equal(request.bodyType, "json");
    assert.deepEqual(JSON.parse(request.body), {
      title: "string",
      requestedBy: "user@example.com",
      priority: 0
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test("imports Swagger 2 body schemas from definitions", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({
    swagger: "2.0",
    host: "localhost:5025",
    schemes: ["http"],
    definitions: {
      StatusChange: {
        type: "object",
        properties: { status: { type: "string", enum: ["InProgress", "Completed"] } }
      }
    },
    paths: {
      "/api/requests/{id}/status": {
        patch: {
          parameters: [{ name: "body", in: "body", schema: { $ref: "#/definitions/StatusChange" } }]
        }
      }
    }
  }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

  try {
    const result = await new SwaggerStrategy("http://localhost:5025/swagger/v1/swagger.json").discover();
    const request = result.endpoints[0].request;

    assert.equal(result.baseUrl, "http://localhost:5025");
    assert.equal(request.bodyType, "json");
    assert.deepEqual(JSON.parse(request.body), { status: "InProgress" });
  } finally {
    global.fetch = originalFetch;
  }
});
