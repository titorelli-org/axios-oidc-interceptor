import assert from "node:assert";
import { afterEach, beforeEach, suite, test } from "node:test";
import path from "node:path";
import { existsSync, unlinkSync } from "node:fs";
import { readFile } from "node:fs/promises";
import * as YAML from "yaml";
import type { Client } from "oauth4webapi";
import { ClientRepositoryYaml } from "../src";

suite("ClientRepositoryYaml concurrency", async () => {
  const filePath = path.join(process.cwd(), "/data/clients-race.yaml");
  const issuer = "http://localhost:3000/oidc";
  const clientName = "race";

  let repo: ClientRepositoryYaml;

  beforeEach(() => {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }

    repo = new ClientRepositoryYaml(filePath);
  });

  afterEach(() => {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  });

  await test("in-memory lock prevents data races in concurrent operations", async () => {
    const clientId: string = await (repo as any).getClientId(issuer, clientName);

    const makeClient = (secret: string): Client => ({
      client_id: clientId,
      client_name: clientName,
      client_secret: secret,
      token_endpoint_auth_method: "client_secret_basic",
    } as Client);

    const createOps: Array<Promise<void>> = Array.from({ length: 50 }).map(
      (_, i) => repo.create(makeClient(`secret-${i}`)),
    );

    const readOpsById: Array<Promise<Client | null>> = Array.from({
      length: 50,
    }).map(() => repo.get(clientId));

    const readOpsByName: Array<Promise<Client | null>> = Array.from({
      length: 50,
    }).map(() => repo.getByName(issuer, clientName));

    await Promise.all([...createOps, ...readOpsById, ...readOpsByName]);

    if (existsSync(filePath)) {
      const text = await readFile(filePath, "utf8");
      const arr = YAML.parse(text) as Client[];

      assert.ok(Array.isArray(arr));
      const matches = arr.filter((c) => c.client_id === clientId);
      assert.equal(matches.length, 1, "should have exactly one client entry");
    }

    const deleteOps: Array<Promise<void>> = Array.from({ length: 20 }).map(
      () => repo.deleteByName(issuer, clientName),
    );

    const moreCreateOps: Array<Promise<void>> = Array.from({ length: 20 }).map(
      (_, i) => repo.create(makeClient(`final-${i}`)),
    );

    await Promise.all([...deleteOps, ...moreCreateOps]);

    if (existsSync(filePath)) {
      const text = await readFile(filePath, "utf8");
      const arr = YAML.parse(text) as Client[];
      assert.ok(Array.isArray(arr));
      const matches = arr.filter((c) => c.client_id === clientId);
      assert.ok(
        matches.length === 0 || matches.length === 1,
        "file should be empty or contain a single client entry",
      );
    }

    // Final write to ensure repository remains usable after stress
    await repo.create(makeClient("known-final"));

    const [byId, byName] = await Promise.all([
      repo.get(clientId),
      repo.getByName(issuer, clientName),
    ]);

    assert.ok(byId);
    assert.ok(byName);
    assert.equal(byId!.client_id, clientId);
    assert.equal(byName!.client_id, clientId);
  });
});


