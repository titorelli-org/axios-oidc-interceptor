import { Client } from "oauth4webapi";

export interface ClientRepository {
  getByName(clientName: string): Promise<Client | null>;

  get(clientId: string): Promise<Client | null>;

  create(client: Client): Promise<void>;

  deleteByName(clientName: string): Promise<void>;
}
