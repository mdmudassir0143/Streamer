import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { agentAccount, decodeError } from "./chain.js";
import { ChatError, handleChat } from "./chat.js";
import { llmEnabled } from "./llm.js";
import { getPrices } from "./prices.js";
import { getDecisions, getPrefs, setPrefs } from "./store.js";
import { listSummaries, streamDetail } from "./summary.js";

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

function parseId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) throw new ChatError(400, "bad stream id");
  return BigInt(raw);
}

export function buildApp() {
  const app = new Hono();
  app.use("*", cors());

  app.onError((err, c) => {
    const status = err instanceof ChatError ? err.status : 500;
    if (status === 500) console.warn(`[api] ${c.req.method} ${c.req.path}: ${decodeError(err)}`);
    return c.json({ error: decodeError(err) }, status as 400);
  });

  app.get("/api/health", (c) =>
    c.json({
      ok: !!config.deployment && !!agentAccount,
      chainId: config.chainId,
      agentAddress: agentAccount?.address ?? null,
      vault: config.deployment?.vault ?? null,
      engine: llmEnabled() ? "llm" : "rules",
    }),
  );

  app.get("/api/prices", async (c) => {
    const p = await getPrices();
    return c.json({ ts: p.ts, prices: p.prices, venue: p.venue, source: p.source });
  });

  app.get("/api/streams", async (c) => c.json(json(await listSummaries(c.req.query("owner") || undefined))));

  app.get("/api/streams/:id", async (c) => c.json(json(await streamDetail(parseId(c.req.param("id"))))));

  app.get("/api/streams/:id/decisions", (c) => {
    const id = parseId(c.req.param("id"));
    const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit")) || 100));
    return c.json(getDecisions(id.toString(), limit));
  });

  app.get("/api/streams/:id/prefs", (c) => c.json(getPrefs(parseId(c.req.param("id")).toString())));

  app.put("/api/streams/:id/prefs", async (c) => {
    const id = parseId(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    return c.json(setPrefs(id.toString(), body ?? {}));
  });

  app.post("/api/chat", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return c.json(await handleChat(body));
  });

  return app;
}

export function startApi() {
  const app = buildApp();
  serve({ fetch: app.fetch, port: config.port });
  console.log(`[api] listening on http://localhost:${config.port}`);
  return app;
}
