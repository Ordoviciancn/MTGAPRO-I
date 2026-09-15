import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { createForgeRooms } from './forgeRooms';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, maxPayload:32768 });
const connectForge = createForgeRooms(process.env.FORGE_WORKSPACE_ROOT || path.resolve(__dirname, '../..'));

app.use(express.static(path.resolve(__dirname, "../../dist")));
app.get("/health", (_req, res) => res.json({ ok: true }));

wss.on("connection", (ws, request) => {
  if (request.url === '/forge') { connectForge(ws); return; }
  ws.close(1008, 'Unknown WebSocket path');
});

const port = Number(process.env.PORT ?? 8787);
server.listen({ port, ...(process.env.HOST ? { host: process.env.HOST } : {}) }, () => {
  console.log(`MTG Simulator server listening on http://127.0.0.1:${port}`);
});
