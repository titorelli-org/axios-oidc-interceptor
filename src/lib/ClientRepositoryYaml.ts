import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Client } from "oauth4webapi";
import { mkdirpSync } from "mkdirp";
import * as YAML from "yaml";
import type { ClientRepository } from "./ClientRepository";

export class ClientRepositoryYaml implements ClientRepository {
  constructor(private readonly filename) {
    mkdirpSync(dirname(filename));
  }

  public async getByName(clientName: string): Promise<Client | null> {
    const clients = await this.read();

    for (const client of clients) {
      if (client.client_name === clientName) {
        return client;
      }
    }

    return null;
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

  public async deleteByName(clientName: string): Promise<void> {
    let clients = await this.read();

    clients = clients.filter((c) => c.client_name !== clientName);

    if (clients.length === 0) {
      await unlink(this.filename);
    } else {
      await this.save(clients);
    }
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
