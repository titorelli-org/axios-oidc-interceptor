import assert from "node:assert";
import { afterEach, beforeEach, after, suite, test } from "node:test";
import path from "node:path";
import axios, { AxiosInstance } from "axios";
import fastify, { FastifyInstance } from "fastify";
import { oidcProvider } from "@titorelli-org/fastify-oidc-provider";
import {
  protectedRoutes,
  TokenValidator,
} from "@titorelli-org/fastify-protected-routes";
import { JwksStore } from "@titorelli-org/jwks-store";
import pino, { Logger } from "pino";
import { existsSync, unlinkSync } from "node:fs";
import { ClientRepositoryYaml, oidcInterceptor } from "../src";

const setupServer = async (logger: Logger) => {
  const app = fastify({
    loggerInstance: logger,
  });

  const jwksStore = new JwksStore(path.join(process.cwd(), "/data/jwks.json"));

  const tokenValidator = new TokenValidator({
    jwksStore,
    testSubject: () => true,
    testAudience: () => true,
    logger,
  });

  await app.register(protectedRoutes, {
    origin: "http://localhost:3000",
    authorizationServers: ["http://localhost:3000/oidc"],
    checkToken: (token, url, supportedScopes) =>
      tokenValidator.validate(token, url, supportedScopes),
    logger,
  });

  await app.register(oidcProvider, {
    origin: "http://localhost:3000",
    jwksStore,
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

  beforeEach(async () => {
    app = await setupServer(logger);
  });

  beforeEach(() => {
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

    assert.equal(data, "Public route");
  });

  await test("access protected GET route", async () => {
    const { data } = await ax.get<string>("/protected");

    assert.equal(data, "Protected route");
  });

  await test("access protected POST route", async () => {
    const { data } = await ax.post<string>("/protected", {
      dummy: true,
    });

    assert.equal(data, "Protected route");
  });

  await test("access protected GET route with params", async () => {
    const { data } = await ax.get<string>("/protected/123");

    assert.equal(data, "Protected route 123");
  });

  await test("concurrent access to single protected resource", async () => {
    const [r1, r2, r3, r4] = await Promise.all([
      ax.get("/protected"),
      ax.get("/protected"),
      ax.get("/protected"),
      ax.get("/protected"),
    ]);

    assert.equal(r1.data, "Protected route");
    assert.equal(r2.data, "Protected route");
    assert.equal(r3.data, "Protected route");
    assert.equal(r4.data, "Protected route");
  });

  afterEach(async () => {
    await app.close();
  });

  after(() => process.exit(0));
});
