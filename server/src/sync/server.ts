import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "node:http";
import { verifySessionToken, SESSION_COOKIE } from "../auth/session.js";
import { getPuzzle, getUserById } from "../db/queries.js";
import type { Db } from "../db/index.js";
import type { AuthConfig } from "../auth/index.js";
import { SyncHub, type Client } from "./hub.js";

/**
 * Attach a WebSocket server at /ws to the existing HTTP server. Clients connect
 * with ?puzzle=<id>; the session cookie is validated on upgrade. Messages:
 *   { type: "presence", cursor: {row,col} | null }
 * are relayed to the room. Cell edits continue to flow over REST; the hub fans
 * out the persisted results.
 */
export function attachSyncServer(
  httpServer: Server,
  db: Db,
  config: AuthConfig,
  hub: SyncHub,
): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/ws") return; // let other upgrade handlers (if any) deal with it

    // Authenticate via session cookie.
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const uid = token ? verifySessionToken(token, config.sessionSecret) : null;
    const user = uid != null ? getUserById(db, uid) : undefined;

    const puzzleId = Number(url.searchParams.get("puzzle"));
    const puzzle = Number.isInteger(puzzleId) ? getPuzzle(db, puzzleId) : undefined;

    if (!user || !puzzle) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      registerClient(ws, hub, {
        userId: user.id,
        username: user.username,
        puzzleId,
      });
    });
  });
}

/** Minimal single-cookie reader (avoids a dependency). */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

function registerClient(
  ws: WebSocket,
  hub: SyncHub,
  info: { userId: number; username: string; puzzleId: number },
): void {
  const client: Client = { socket: ws, ...info };
  hub.join(client);

  ws.on("message", (raw) => {
    let msg: unknown;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const m = msg as { type?: string; cursor?: { row: number; col: number } | null };
    if (m.type === "presence") {
      const cursor =
        m.cursor && Number.isInteger(m.cursor.row) && Number.isInteger(m.cursor.col)
          ? m.cursor
          : null;
      hub.relayPresence(client, cursor);
    }
  });

  ws.on("close", () => hub.leave(client));
  ws.on("error", () => hub.leave(client));
}
