import { serve } from "@hono/node-server";
import { createApp } from "../src/server.ts";
serve({ fetch: createApp().fetch, port: 0, hostname: "127.0.0.1" }, (info) =>
  console.log("AEGIS_PORT=" + info.port),
);
