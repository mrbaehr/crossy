import { jsPDF } from "jspdf";
import { encodePuz, type PuzExportCell } from "@crossy/shared";

interface ExportCell {
  row: number;
  col: number;
  isBlock: boolean;
  letter: string | null;
  rebus: string | null;
  isCircled: boolean;
}
interface ExportEntry {
  direction: "across" | "down";
  number: number;
  cells: { row: number; col: number }[];
  clue: string;
}
interface ExportData {
  puzzle: { id: number; title: string; width: number; height: number };
  cells: ExportCell[];
  numbers: Record<string, number>;
  entries: ExportEntry[];
}

export async function fetchExportData(puzzleId: number): Promise<ExportData> {
  const res = await fetch(`/api/puzzles/${puzzleId}/export`, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`export fetch failed (${res.status})`);
  return res.json();
}

function download(name: string, data: Blob | Uint8Array, type: string) {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data.slice().buffer as ArrayBuffer], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Across-Lite clue order: by number ascending, across before down at each number. */
function orderedClues(entries: ExportEntry[]): string[] {
  const sorted = [...entries].sort((a, b) =>
    a.number !== b.number ? a.number - b.number : a.direction === "across" ? -1 : 1,
  );
  return sorted.map((e) => e.clue || "(no clue)");
}

export function exportPuz(data: ExportData) {
  const cells: PuzExportCell[] = data.cells.map((c) => ({
    row: c.row,
    col: c.col,
    isBlock: c.isBlock,
    letter: c.letter,
    rebus: c.rebus,
    isCircled: c.isCircled,
  }));
  const buf = encodePuz({
    width: data.puzzle.width,
    height: data.puzzle.height,
    cells,
    title: data.puzzle.title || `Puzzle ${data.puzzle.id}`,
    author: "",
    copyright: "",
    clues: orderedClues(data.entries),
  });
  download(`${safe(data.puzzle.title || "puzzle")}.puz`, buf, "application/octet-stream");
}

function safe(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "puzzle";
}

/** PDF with grid + clue list. filled=true draws the solution letters. */
export function exportPdf(data: ExportData, filled: boolean) {
  const { width, height } = data.puzzle;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;

  // Title
  doc.setFontSize(16);
  doc.text(data.puzzle.title || `Puzzle ${data.puzzle.id}`, margin, margin);

  // Grid sizing to fit page width (leave room for clue columns below).
  const maxGrid = Math.min(pageW - margin * 2, 360);
  const cell = Math.floor(maxGrid / Math.max(width, height));
  const gx = margin;
  const gy = margin + 16;
  const byKey = new Map(data.cells.map((c) => [`${c.row},${c.col}`, c]));

  doc.setLineWidth(0.5);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const x = gx + c * cell;
      const y = gy + r * cell;
      const cd = byKey.get(`${r},${c}`);
      if (cd?.isBlock) {
        doc.setFillColor(0, 0, 0);
        doc.rect(x, y, cell, cell, "FD");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(x, y, cell, cell, "D");
        const num = data.numbers[`${r},${c}`];
        if (num) {
          doc.setFontSize(cell * 0.28);
          doc.text(String(num), x + 1.5, y + cell * 0.32);
        }
        if (cd?.isCircled) {
          doc.circle(x + cell / 2, y + cell / 2, cell / 2 - 1.5, "S");
        }
        if (filled && (cd?.rebus || cd?.letter)) {
          const txt = cd.rebus ?? cd.letter ?? "";
          doc.setFontSize(cell * (cd.rebus ? 0.3 : 0.5));
          doc.text(txt, x + cell / 2, y + cell * 0.72, { align: "center" });
        }
      }
    }
  }

  // Clue columns below the grid.
  let y = gy + height * cell + 28;
  const colW = (pageW - margin * 2) / 2;
  const cols = [
    { x: margin, dir: "across" as const, title: "ACROSS" },
    { x: margin + colW, dir: "down" as const, title: "DOWN" },
  ];
  doc.setFontSize(9);
  for (const col of cols) {
    let cy = y;
    doc.setFont("helvetica", "bold");
    doc.text(col.title, col.x, cy);
    doc.setFont("helvetica", "normal");
    cy += 14;
    const list = data.entries
      .filter((e) => e.direction === col.dir)
      .sort((a, b) => a.number - b.number);
    for (const e of list) {
      const lines = doc.splitTextToSize(`${e.number}. ${e.clue || "—"}`, colW - 10);
      for (const line of lines) {
        if (cy > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          cy = margin;
        }
        doc.text(line, col.x, cy);
        cy += 11;
      }
    }
  }

  doc.save(`${safe(data.puzzle.title || "puzzle")}_${filled ? "filled" : "blank"}.pdf`);
}
