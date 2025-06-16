import type { Logger } from "pino";
import { ClientRepository } from "./ClientRepository";

export type InitialClientMetadata = {
  client_name: string;
};

export type OidcInterceptorOptions = {
  client: InitialClientMetadata;
  clientRepository: ClientRepository;
  logger: Logger;
};

export type ResourceMetadata = {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
};
