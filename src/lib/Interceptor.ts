import {
  isAxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
  type AxiosInstance,
} from "axios";
import { OidcInterceptorOptions, ResourceMetadata } from "./types";
import { AuthorizationServer } from "./AuthorizationServer";
import { Logger } from "pino";
import { TokenEndpointResponse } from "oauth4webapi";
import { AxiosRequestConfig } from "axios";
import { ClientRepository } from "./ClientRepository";

export class OidcInterceptor {
  private readonly requestInterceptorId: number;
  private readonly responseInterceptorId: number;
  private readonly authorizationServers = new Map<
    string,
    AuthorizationServer
  >();
  private readonly initialClient: OidcInterceptorOptions["client"];
  private readonly resourceTokens = new Map<string, TokenEndpointResponse>();
  private readonly resourceWaitlists = new Map<
    String,
    Promise<TokenEndpointResponse>
  >();
  private readonly clientRepository: ClientRepository;
  private readonly initialAccessToken?: string;
  private readonly logger: Logger;

  constructor(
    private readonly axiosInstance: AxiosInstance,
    {
      client,
      clientRepository,
      initialAccessToken,
      logger,
    }: OidcInterceptorOptions,
  ) {
    this.initialClient = client;
    this.clientRepository = clientRepository;
    this.initialAccessToken = initialAccessToken;
    this.logger = logger;
    this.requestInterceptorId = this.axiosInstance.interceptors.request.use(
      this.onRequestFulfilled,
    );
    this.responseInterceptorId = this.axiosInstance.interceptors.response.use(
      this.onResponseFulfilled,
      this.onResponseRejected,
    );
  }

  public uninstall(): void {
    this.axiosInstance.interceptors.request.eject(this.requestInterceptorId);
    this.axiosInstance.interceptors.response.eject(this.responseInterceptorId);

    Reflect.set(this, "requestInterceptorId", undefined);
    Reflect.set(this, "responseInterceptorId", undefined);
  }

  private onRequestFulfilled = async (config: InternalAxiosRequestConfig) => {
    if (config) {
      if (config.headers.Authorization != null) {
        return config;
      }

      const resource = this.getResourceFromConfig(config);

      if (await this.hasTokenForResource(resource)) {
        const { access_token } = await this.getAccessTokenForResource(resource);

        config.headers.Authorization = `Bearer ${access_token}`;
      } else {
        const rtResult = await this.waitResourceToken(resource);

        if (rtResult == null) {
          return config;
        }

        const { access_token } = rtResult;

        config.headers.Authorization = `Bearer ${access_token}`;
      }
    }

    return config;
  };

  private onResponseFulfilled = (value: AxiosResponse) => value;

  private onResponseRejected = async (error) => {
    if (!isAxiosError(error)) throw error;

    if (
      error.status !== 401 ||
      error.response.headers["www-authenticate"] == null
    ) {
      throw error;
    }

    try {
      const { type, resource_metadata } = this.parseWWWAuthenticateHeader(
        error.response.headers["www-authenticate"],
      );

      if (type !== "Bearer" || resource_metadata == null) throw error;

      const resource = await this.getResourceFromConfig(error.config);

      let tokenPromise = this.resourceWaitlists.get(resource);

      await tokenPromise;

      if (!(await this.hasTokenForResource(resource))) {
        return this.retryRequest(error.config);
      }

      tokenPromise = new Promise<TokenEndpointResponse>(
        async (resolve, reject) => {
          try {
            const { resource: _resource, authorization_servers } =
              await this.getResourceMetadataInfo(resource_metadata);

            // TODO: Check if returned resource match requested resource

            const as = await this.selectAuthorizationServer(
              await Array.fromAsync(
                this.discoverAuthorizationServers(authorization_servers),
              ),
            );

            const client = await as.ensureClientRegistered(
              this.initialClient,
              this.initialAccessToken,
            );

            const token = await client.getResourceAccessToken(resource);

            if (token == null) {
              reject(error);

              return;
            }

            await this.saveTokenForResource(resource, token);

            resolve(token);
          } catch (err) {
            reject(err);
          }
        },
      );

      this.resourceWaitlists.set(resource, tokenPromise);

      await tokenPromise;

      return this.retryRequest(error.config);
    } catch (err) {
      this.logger.error(err);

      throw error;
    }
  };

  private parseWWWAuthenticateHeader(header: string) {
    if (!header.startsWith("Bearer")) {
      return null;
    }

    const re = /resource_metadata=\"(.*)\"/i;

    if (re.test(header)) {
      const [_g1, g2] = header.match(re);

      return {
        type: "Bearer",
        resource_metadata: g2,
      };
    }

    return null;
  }

  private async getResourceMetadataInfo(resourceMetadataHref: string) {
    try {
    } catch (error) {
      this.logger.error(error);
    }
    const resp = await fetch(resourceMetadataHref);

    return (await resp.json()) as ResourceMetadata;
  }

  private async *discoverAuthorizationServers(
    authorizationServersHrefs: string[],
  ) {
    for (const asHref of authorizationServersHrefs) {
      if (this.authorizationServers.has(asHref)) {
        yield this.authorizationServers.get(asHref);
      } else {
        yield await this.discoverAuthorizationServer(asHref);
      }
    }
  }

  private async discoverAuthorizationServer(href: string) {
    this.authorizationServers.set(
      href,
      new AuthorizationServer(href, this.clientRepository, this.logger),
    );

    return this.authorizationServers.get(href);
  }

  /** Randomly (for now) select an authorization server to register the client */
  private async selectAuthorizationServer(ases: AuthorizationServer[]) {
    if (ases.length === 1) return ases[0];

    return ases[Math.floor(Math.random() * ases.length)];
  }

  private async saveTokenForResource(
    resource: string,
    token: TokenEndpointResponse,
  ) {
    this.resourceTokens.set(resource, token);
  }

  private async hasTokenForResource(resource: string) {
    return this.resourceTokens.has(resource);
  }

  private async getAccessTokenForResource(resource: string) {
    // TOOD: Implement token invalidation and refresh logic

    return this.resourceTokens.get(resource);
  }

  private retryRequest(config: InternalAxiosRequestConfig) {
    return this.axiosInstance(config);
  }

  private getResourceFromConfig(config: AxiosRequestConfig) {
    const { protocol, host, pathname } = new URL(config.url, config.baseURL);

    return `${protocol}//${host}${pathname}`;
  }

  private async waitResourceToken(resource: string) {
    if (this.hasTokenForResource(resource)) {
      return Promise.resolve(this.resourceTokens.get(resource));
    } else {
      return this.resourceWaitlists.get(resource);
    }
  }
}
