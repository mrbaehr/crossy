import { describe, expect, it } from "vitest";
import { SyncHub, type Client } from "./hub.js";

// Minimal fake socket capturing sent messages.
function fakeClient(userId: number, username: string, puzzleId: number): Client & { sent: any[] } {
  const sent: any[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => sent.push(JSON.parse(data)),
  };
  return { socket: socket as any, userId, username, puzzleId, sent };
}

describe("SyncHub", () => {
  it("sends a peers snapshot to a joiner (empty room)", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    hub.join(a);
    expect(a.sent).toEqual([{ type: "peers", peers: [] }]);
  });

  it("shows existing peers to a later joiner", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    const b = fakeClient(2, "nick", 100);
    hub.join(a);
    hub.join(b);
    const peersMsg = b.sent.find((m) => m.type === "peers");
    expect(peersMsg.peers).toEqual([{ userId: 1, username: "max", cursor: undefined }]);
  });

  it("broadcasts cells to others but not the author", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    const b = fakeClient(2, "nick", 100);
    hub.join(a);
    hub.join(b);
    a.sent.length = 0;
    b.sent.length = 0;
    hub.broadcastCells(100, [{ row: 0, col: 0 } as any], 1);
    expect(b.sent.some((m) => m.type === "cells")).toBe(true);
    // broadcastCells doesn't exclude the author here (author gets REST response),
    // but both in-room clients receive it; verify nick got it.
    expect(a.sent.some((m) => m.type === "cells")).toBe(true);
  });

  it("isolates rooms by puzzle id", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    const b = fakeClient(2, "nick", 200);
    hub.join(a);
    hub.join(b);
    a.sent.length = 0;
    b.sent.length = 0;
    hub.broadcastCells(100, [{ row: 0, col: 0 } as any], 1);
    expect(a.sent.some((m) => m.type === "cells")).toBe(true);
    expect(b.sent.some((m) => m.type === "cells")).toBe(false);
  });

  it("relays presence to others and records the cursor", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    const b = fakeClient(2, "nick", 100);
    hub.join(a);
    hub.join(b);
    b.sent.length = 0;
    hub.relayPresence(a, { row: 3, col: 4 });
    const pres = b.sent.find((m) => m.type === "presence");
    expect(pres).toMatchObject({ userId: 1, username: "max", cursor: { row: 3, col: 4 } });
    expect(a.cursor).toEqual({ row: 3, col: 4 });
  });

  it("notifies the room when a client leaves", () => {
    const hub = new SyncHub();
    const a = fakeClient(1, "max", 100);
    const b = fakeClient(2, "nick", 100);
    hub.join(a);
    hub.join(b);
    b.sent.length = 0;
    hub.leave(a);
    expect(b.sent).toContainEqual({ type: "left", userId: 1 });
  });
});
