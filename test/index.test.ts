import assert from "node:assert";
import { test, suite, beforeEach, afterEach } from "node:test";
import path from "node:path";
import axios, { AxiosInstance } from "axios";
import fastify, { FastifyInstance } from "fastify";
import { oidcProvider } from "@titorelli-org/fastify-oidc-provider";
import { protectedRoutes } from "@titorelli-org/fastify-protected-routes";
import { JwksStore } from "@titorelli-org/jwks-store";
import pino, { Logger } from "pino";
import { oidcInterceptor } from "../src/lib/oidcInterceptor";
import { existsSync, unlinkSync } from "node:fs";
import { ClientRepositoryYaml } from "../src/lib/ClientRepositoryYaml";

const setupServer = async (logger: Logger) => {
  const app = fastify({
    loggerInstance: logger,
  });

  await app.register(protectedRoutes, {
    origin: "http://localhost:3000",
    authorizationServers: ["http://localhost:3000/oidc"],
    async checkToken() {
      return true;
    },
    logger,
  });

  await app.register(oidcProvider, {
    origin: "http://localhost:3000",
    jwksStore: new JwksStore(path.join(process.cwd(), "/data/jwks.json")),
    logger,
  });

  app.get("/public", { config: { protected: false } }, () => "Public route");

  app.get(
    "/protected",
    { config: { protected: true } },
    () => "Protected route",
  );

  app.post(
    "/protected",
    { config: { protected: true } },
    () => "Protected route",
  );

  app.get<{ Params: { arg: string } }>(
    "/protected/:arg",
    { config: { protected: true } },
    ({ params }) => `Protected route ${params.arg}`,
  );

  await app.listen({ port: 3000 });

  return app;
};

suite("axios-oidc-interceptor", async () => {
  const logger = pino();

  logger.level = "silent";

  let app: FastifyInstance;
  let ax: AxiosInstance;

  beforeEach(() => {
    if (existsSync(path.join(process.cwd(), "/data/oidc.sqlite3"))) {
      unlinkSync(path.join(process.cwd(), "/data/oidc.sqlite3"));
    }
  });

  await beforeEach(async () => {
    app = await setupServer(logger);
  });

  await beforeEach(async () => {
    ax = axios.create({ baseURL: "http://localhost:3000" });

    oidcInterceptor(ax, {
      client: {
        client_name: "test",
      },
      clientRepository: new ClientRepositoryYaml(
        path.join(process.cwd(), "/data/clients.yaml"),
      ),
      logger,
    });
  });

  await test("access public route", async () => {
    const { data } = await ax.get<string>("/public");

    assert(data === "Public route");
  });

  await test("access protected GET route", async () => {
    const { data } = await ax.get<string>("/protected");

    assert(data === "Protected route");
  });

  await test("access protected POST route", async () => {
    const { data } = await ax.post<string>("/protected", {
      dummy: true,
    });

    assert(data === "Protected route");
  });

  await test("access protected GET route with params", async () => {
    const { data } = await ax.get<string>("/protected/123");

    assert(data === "Protected route 123");
  });

  await test("concurrent access to single protected resource", async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      ax.get("/protected"),
      ax.get("/protected"),
      ax.get("/protected"),
      ax.get("/protected"),
    ]);

    assert(r1.data === "Protected route");
    assert(r2.data === "Protected route");
    assert(r3.data === "Protected route");
    assert(r4.data === "Protected route");
  });

  await afterEach(async () => {
    await app.close();
  });
});
