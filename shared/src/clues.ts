// Pure clue-status derivation + entry answer reading (used by server and client).

export type ClueStatus = "none" | "drafted" | "chosen" | "both-approved";

export interface ClueDraftLike {
  isChosen: boolean;
  bothApproved: boolean;
}

/**
 * none = no drafts; drafted = drafts but none chosen; chosen = one isChosen;
 * both-approved = any draft with bothApproved true (strongest).
 */
export function deriveClueStatus(drafts: readonly ClueDraftLike[]): ClueStatus {
  if (drafts.length === 0) return "none";
  if (drafts.some((d) => d.bothApproved)) return "both-approved";
  if (drafts.some((d) => d.isChosen)) return "chosen";
  return "drafted";
}

/**
 * Letters currently in an entry's slot; "_" is not used — unfilled cells are "".
 * Returns an array so rebus cells keep their multi-letter content.
 */
export function entryAnswer(
  entryCells: readonly { row: number; col: number }[],
  lookup: (row: number, col: number) => { letter: string | null; rebus: string | null } | undefined,
): string[] {
  return entryCells.map((c) => {
    const cell = lookup(c.row, c.col);
    return cell?.rebus ?? cell?.letter ?? "";
  });
}
