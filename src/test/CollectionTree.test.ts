import * as assert from "node:assert/strict";
import test from "node:test";
import { requestWithContext } from "../services/CollectionTree";
import { CollectionFolder } from "../types";

test("uses the closest inherited base URL for a nested request", () => {
  const root: CollectionFolder = {
    id: "root",
    type: "folder",
    name: "Collection",
    baseUrl: "{{apiUrl}}",
    children: [{
      id: "orders",
      type: "folder",
      name: "Orders",
      baseUrl: "{{ordersApiUrl}}",
      children: [{
        id: "list",
        type: "request",
        name: "List",
        request: { id: "list", name: "List", method: "GET", url: "/orders", headers: [], params: [], body: "", bodyType: "none" }
      }]
    }]
  };

  assert.equal(requestWithContext(root, "list")?.url, "{{ordersApiUrl}}/orders");
});

test("does not prepend a folder base URL to an explicit request URL", () => {
  const root: CollectionFolder = {
    id: "root",
    type: "folder",
    name: "Collection",
    baseUrl: "{{apiUrl}}",
    children: [{
      id: "external",
      type: "request",
      name: "External",
      request: { id: "external", name: "External", method: "GET", url: "https://example.test/health", headers: [], params: [], body: "", bodyType: "none" }
    }]
  };

  assert.equal(requestWithContext(root, "external")?.url, "https://example.test/health");
});
