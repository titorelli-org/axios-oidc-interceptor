import type { ClientAuth, Client } from "oauth4webapi";
import type { AuthorizationServer } from "./AuthorizationServer";

export class RegisteredClient {
  constructor(
    private readonly c: Client & {
      client_secret?: string;
      registration_client_uri?: string;
      registration_access_token?: string;
    },
    private readonly as: AuthorizationServer,
  ) {}

  public async getResourceAccessToken(resource: string) {
    const {
      clientCredentialsGrantRequest,
      processClientCredentialsResponse,
      ClientSecretBasic,
      ClientSecretJwt,
      allowInsecureRequests,
    } = await import("oauth4webapi");

    const makeRequest = (clientAuth: ClientAuth) => {
      return clientCredentialsGrantRequest(
        this.as.unwrap(),
        { client_id: this.c.client_id },
        clientAuth,
        new URLSearchParams({ resource }),
        { [allowInsecureRequests]: true },
      );
    };

    let resp = await makeRequest(ClientSecretBasic(this.c.client_secret));

    if (resp.status === 401) {
      resp = await makeRequest(ClientSecretJwt(this.c.client_secret));
    }

    if (resp.status === 401) {
      return null;
    }

    return processClientCredentialsResponse(this.as.unwrap(), this.c, resp);
  }

  public async getIsRegistered() {
    const resp = await fetch(this.c.registration_client_uri, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.c.registration_access_token}`,
      },
    });

    return resp.ok;
  }
}
