import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Client } from "oauth4webapi";
import { mkdirpSync } from "mkdirp";
import * as YAML from "yaml";
import * as uuid from "uuid";
import type { ClientRepository } from "./ClientRepository";

export class ClientRepositoryYaml implements ClientRepository {
  constructor(private readonly filename: string) {
    mkdirpSync(dirname(filename));
  }

  public async getByName(
    issuer: string | URL,
    clientName: string,
  ): Promise<Client | null> {
    const clients = await this.read();
    const clientId = this.getClientId(issuer, clientName);

    return clients.find((c) => c.client_id === clientId) ?? null;
  }

  public async get(clientId: string): Promise<Client | null> {
    const clients = await this.read();

    for (const client of clients) {
      if (client.client_id === clientId) {
        return client;
      }
    }

    return null;
  }

  public async create(client: Client) {
    const clients = await this.read();

    clients.push(client);

    await this.save(clients);
  }

  public async deleteByName(
    issuer: string | URL,
    clientName: string,
  ): Promise<void> {
    const clientId = this.getClientId(issuer, clientName);

    let clients = await this.read();

    clients = clients.filter((c) => c.client_id !== clientId);

    if (clients.length === 0) {
      await unlink(this.filename);
    } else {
      await this.save(clients);
    }
  }

  private getClientId(issuer: string | URL, clientName: string) {
    const issuerNamespace = uuid.v5(
      issuer.toString(),
      "5ec17d33-2d73-4a1c-9bac-88a4e527f273",
    );

    return `${clientName}-${uuid.v5(clientName, issuerNamespace)}`;
  }

  private async read() {
    if (existsSync(this.filename)) {
      const text = await readFile(this.filename, "utf8");

      return YAML.parse(text) as Client[];
    }

    return [];
  }

  private async save(clients: Client[]) {
    const text = YAML.stringify(clients);

    await writeFile(this.filename, text, "utf-8");
  }
}
