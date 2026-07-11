import { EasyRequestDocument } from "./types";

export const createDefaultDocument = (): EasyRequestDocument => ({
  version: 1,
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
  requests: [
    {
      id: "request-1",
      name: "Nueva petición",
      method: "GET",
      url: "{{apiUrl}}/get",
      headers: [],
      params: [],
      body: "",
      bodyType: "none"
    }
  ],
  endpoints: []
});
