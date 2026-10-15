import type { WebSocket } from "ws";
import type { Cell } from "@crossy/shared";

/**
 * In-memory pub/sub hub for real-time collaboration. Rooms are keyed by puzzle id.
 * The REST write routes call `broadcastCells` after a successful, persisted edit so
 * the server stays authoritative; the socket only fans out already-applied results.
 * Presence is relayed verbatim and never persisted.
 */

export interface Client {
  socket: WebSocket;
  userId: number;
  username: string;
  puzzleId: number;
  /** Last known cursor, for late-joiner presence snapshots. */
  cursor?: { row: number; col: number };
}

type ServerMessage =
  | { type: "cells"; cells: Cell[]; by: number }
  | { type: "presence"; userId: number; username: string; cursor: { row: number; col: number } | null }
  | { type: "peers"; peers: Array<{ userId: number; username: string; cursor?: { row: number; col: number } }> }
  | { type: "left"; userId: number };

export class SyncHub {
  private rooms = new Map<number, Set<Client>>();

  join(client: Client): void {
    let room = this.rooms.get(client.puzzleId);
    if (!room) {
      room = new Set();
      this.rooms.set(client.puzzleId, room);
    }
    room.add(client);

    // Tell the newcomer who's already here.
    const peers = [...room]
      .filter((c) => c !== client)
      .map((c) => ({ userId: c.userId, username: c.username, cursor: c.cursor }));
    this.sendTo(client, { type: "peers", peers });
  }

  leave(client: Client): void {
    const room = this.rooms.get(client.puzzleId);
    if (!room) return;
    room.delete(client);
    this.broadcast(client.puzzleId, { type: "left", userId: client.userId }, client);
    if (room.size === 0) this.rooms.delete(client.puzzleId);
  }

  /** Fan out persisted cell changes to everyone else in the room. */
  broadcastCells(puzzleId: number, cells: Cell[], byUserId: number): void {
    this.broadcast(puzzleId, { type: "cells", cells, by: byUserId });
  }

  /** Relay a presence update (cursor move / selection) to the rest of the room. */
  relayPresence(client: Client, cursor: { row: number; col: number } | null): void {
    client.cursor = cursor ?? undefined;
    this.broadcast(
      client.puzzleId,
      { type: "presence", userId: client.userId, username: client.username, cursor },
      client,
    );
  }

  private broadcast(puzzleId: number, msg: ServerMessage, except?: Client): void {
    const room = this.rooms.get(puzzleId);
    if (!room) return;
    for (const c of room) {
      if (c === except) continue;
      this.sendTo(c, msg);
    }
  }

  private sendTo(client: Client, msg: ServerMessage): void {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(JSON.stringify(msg));
    }
  }
}
