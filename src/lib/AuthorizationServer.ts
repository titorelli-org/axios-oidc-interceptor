import { type AuthorizationServer as OauthAuthorzationServer } from "oauth4webapi";
import { InitialClientMetadata } from "./types";
import type { Logger } from "pino";
import { RegisteredClient } from "./RegistredClient";
import type { ClientRepository } from "./ClientRepository";
import { fixProtocol } from "./fixProtocol";

export class AuthorizationServer {
  private readonly as: OauthAuthorzationServer;
  private readonly ready: Promise<void>;

  public readonly issuer: URL;

  constructor(
    propsIssuer: string | URL,
    private readonly clientRepository: ClientRepository,
    private readonly logger: Logger,
  ) {
    this.issuer =
      typeof propsIssuer === "string" ? new URL(propsIssuer) : propsIssuer;
    this.ready = this.initialize();
  }

  public unwrap() {
    return this.as;
  }

  public async ensureClientRegistered(
    clientMetadata: InitialClientMetadata,
    initialAccessToken?: string,
  ) {
    await this.ready;

    const client = await this.getSavedClient(clientMetadata);

    if (client) {
      if (await client.getIsRegistered()) {
        return client;
      } else {
        await this.clientRepository.deleteByName(
          this.issuer,
          clientMetadata.client_name,
        );

        return this.clientRegistration(clientMetadata, initialAccessToken);
      }
    }

    return this.clientRegistration(clientMetadata, initialAccessToken);
  }

  private async getSavedClient(clientMetadata: InitialClientMetadata) {
    const client = await this.clientRepository.getByName(
      this.issuer,
      clientMetadata.client_name,
    );

    if (!client) {
      return null;
    }

    return new RegisteredClient(client, this);
  }

  private async clientRegistration(
    clientMetadata: InitialClientMetadata,
    initialAccessToken?: string,
  ) {
    const client = await this.actuallyClientRegistration(
      clientMetadata,
      initialAccessToken,
    );

    await this.clientRepository.create(client);

    return new RegisteredClient(client, this);
  }

  private async initialize() {
    const {
      discoveryRequest,
      processDiscoveryResponse,
      allowInsecureRequests,
    } = await import("oauth4webapi");

    const resp = await discoveryRequest(this.issuer, {
      algorithm: "oidc",
      [allowInsecureRequests]: true,
    });

    const as = fixProtocol(await processDiscoveryResponse(this.issuer, resp));

    Reflect.set(this, "as", as);
  }

  private async actuallyClientRegistration(
    client: InitialClientMetadata,
    initialAccessToken?: string,
  ) {
    const {
      dynamicClientRegistrationRequest,
      processDynamicClientRegistrationResponse,
      allowInsecureRequests,
    } = await import("oauth4webapi");

    const resp = await dynamicClientRegistrationRequest(
      this.as,
      {
        ...client,
        grant_types: ["authorization_code", "client_credentials"],
        redirect_uris: ["https://example.org/nonexistent"],
      },
      {
        [allowInsecureRequests]: true,
        initialAccessToken,
      },
    );

    return processDynamicClientRegistrationResponse(resp);
  }
}
