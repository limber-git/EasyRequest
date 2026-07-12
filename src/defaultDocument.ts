import { EasyRequestDocument } from "./types";

export const createDefaultDocument = (): EasyRequestDocument => ({
  version: 2,
  selectedEnvironmentId: "default",
  environments: [
    {
      id: "default",
      name: "Default",
      variables: {
        apiUrl: "https://httpbin.org"
      }
    }
  ],
  root: {
    id: "root",
    type: "folder",
    name: "Colección",
    baseUrl: "{{apiUrl}}",
    children: [{
      id: "request-1",
      type: "request",
      name: "Nueva petición",
      request: {
        id: "request-1",
        name: "Nueva petición",
        method: "GET",
        url: "/get",
        headers: [],
        params: [],
        body: "",
        bodyType: "none"
      }
    }]
  }
});
