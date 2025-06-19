import { Client } from "oauth4webapi";

export interface ClientRepository {
  getByName(issuer: string | URL, clientName: string): Promise<Client | null>;

  get(clientId: string): Promise<Client | null>;

  create(client: Client): Promise<void>;

  deleteByName(issuer: string | URL, clientName: string): Promise<void>;
}
