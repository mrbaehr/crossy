import { useEffect, useRef, useState } from "react";
import type { Cell } from "@crossy/shared";

export interface Peer {
  userId: number;
  username: string;
  cursor?: { row: number; col: number };
}

interface Options {
  puzzleId: number;
  /** Called when the server fans out persisted cell changes from another client. */
  onCells: (cells: Cell[]) => void;
}

/**
 * Connects to /ws for a puzzle, applies remote cell updates, tracks peer presence,
 * and exposes a `sendCursor` to broadcast our selection. Auto-reconnects on drop.
 */
export function useSync({ puzzleId, onCells }: Options) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const onCellsRef = useRef(onCells);
  onCellsRef.current = onCells;

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?puzzle=${puzzleId}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setPeers([]);
        if (!closed) retry = setTimeout(connect, 1000);
      };
      ws.onerror = () => ws.close();
      ws.onmessage = (ev) => {
        let msg: any;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "cells":
            onCellsRef.current(msg.cells as Cell[]);
            break;
          case "peers":
            setPeers(msg.peers as Peer[]);
            break;
          case "presence":
            setPeers((prev) => {
              const rest = prev.filter((p) => p.userId !== msg.userId);
              if (msg.cursor === null) {
                return [...rest, { userId: msg.userId, username: msg.username }];
              }
              return [...rest, { userId: msg.userId, username: msg.username, cursor: msg.cursor }];
            });
            break;
          case "left":
            setPeers((prev) => prev.filter((p) => p.userId !== msg.userId));
            break;
        }
      };
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, [puzzleId]);

  function sendCursor(cursor: { row: number; col: number } | null) {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "presence", cursor }));
    }
  }

  return { peers, connected, sendCursor };
}
