// .puz (Across Lite) binary encoder.
//
// Format reference: the community .puz spec (github.com/alexdej/puzpy, and
// the "puz file format" wiki). Produces a v1.3 file with header, solution,
// player grid, strings, and optional GEXT (circles) + GRBS/RTBL (rebus).
//
// Pure: takes a plain puzzle description, returns a Uint8Array.

export interface PuzExportCell {
  row: number;
  col: number;
  isBlock: boolean;
  /** Solution letter (single char). For rebus this is the first/primary letter. */
  letter: string | null;
  /** Full rebus string if this is a rebus cell. */
  rebus: string | null;
  isCircled: boolean;
}

export interface PuzExportInput {
  width: number;
  height: number;
  cells: PuzExportCell[];
  title: string;
  author: string;
  copyright: string;
  /** Clues in Across Lite order (by number, across before down at each number). */
  clues: string[];
  notes?: string;
}

const EMPTY = ".".charCodeAt(0);
const DASH = "-".charCodeAt(0);
const NUL = new Uint8Array([0]);

/** The .puz checksum: a right-rotating 16-bit sum. */
function checksum(data: Uint8Array, seed = 0): number {
  let c = seed;
  for (let i = 0; i < data.length; i++) {
    c = (c & 1 ? 0x8000 | (c >>> 1) : c >>> 1) & 0xffff;
    c = (c + data[i]!) & 0xffff;
  }
  return c;
}

/** Latin-1 bytes (what .puz uses). */
function bytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function encodePuz(input: PuzExportInput): Uint8Array {
  const { width, height } = input;
  const n = width * height;
  const byKey = new Map(input.cells.map((c) => [`${c.row},${c.col}`, c]));

  // Solution + player grids (row-major).
  const solution = new Uint8Array(n);
  const player = new Uint8Array(n);
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      const cell = byKey.get(`${r},${c}`);
      if (cell?.isBlock) {
        solution[i] = EMPTY;
        player[i] = EMPTY;
      } else {
        solution[i] = (cell?.letter ?? "A").toUpperCase().charCodeAt(0) & 0xff;
        player[i] = DASH;
      }
    }
  }

  // CIB (8 bytes): width, height, #clues (LE), unknownBitmask(0x0001), scrambled(0).
  const nClues = input.clues.length;
  const cib = new Uint8Array(8);
  {
    const dv = new DataView(cib.buffer);
    dv.setUint8(0, width);
    dv.setUint8(1, height);
    dv.setUint16(2, nClues, true);
    dv.setUint16(4, 0x0001, true);
    dv.setUint16(6, 0x0000, true);
  }
  const cibChecksum = checksum(cib);

  // Strings in order: title, author, copyright, clues..., notes.
  // For checksums, non-empty title/author/copyright/notes include a trailing NUL;
  // clues never include a trailing NUL. (This is the spec's quirk.)
  const strings = [input.title, input.author, input.copyright];
  const textForChecksum = (seed: number): number => {
    let ck = seed;
    const addZ = (s: string) => {
      if (s.length) ck = checksum(concat(bytes(s), NUL), ck);
    };
    addZ(input.title);
    addZ(input.author);
    addZ(input.copyright);
    for (const clue of input.clues) ck = checksum(bytes(clue), ck); // no NUL
    addZ(input.notes ?? "");
    return ck;
  };

  // Primary checksum: CIB, then solution, player, then text (chained).
  let primary = cibChecksum;
  primary = checksum(solution, primary);
  primary = checksum(player, primary);
  primary = textForChecksum(primary);

  // Partial (text-only) checksum used in the masked block.
  const partialChecksum = textForChecksum(0);
  const solChecksum = checksum(solution);
  const gridChecksum = checksum(player);

  // Masked checksum block: "ICHEATED" xor the low/high bytes of the four sums.
  const magic = "ICHEATED";
  const sums = [cibChecksum, solChecksum, gridChecksum, partialChecksum];
  const masked = new Uint8Array(8);
  for (let i = 0; i < 4; i++) {
    masked[i] = magic.charCodeAt(i) ^ (sums[i]! & 0xff);
    masked[i + 4] = magic.charCodeAt(i + 4) ^ ((sums[i]! >>> 8) & 0xff);
  }

  // 52-byte header.
  const header = new Uint8Array(52);
  const hv = new DataView(header.buffer);
  hv.setUint16(0x00, primary, true);
  header.set(bytes("ACROSS&DOWN\0"), 0x02);
  hv.setUint16(0x0e, cibChecksum, true);
  header.set(masked, 0x10);
  header.set(bytes("1.3\0"), 0x18);
  // 0x1c-0x1d reserved (0); 0x1e-0x1f scrambled checksum (0).
  // CIB copy at 0x2c..0x33:
  header.set(cib, 0x2c);

  // Strings section: each entry NUL-terminated (empty ones are just a NUL).
  const stringBytes: Uint8Array[] = [];
  for (const s of [...strings, ...input.clues, input.notes ?? ""]) {
    stringBytes.push(bytes(s), NUL);
  }

  const extras = buildExtras(input, byKey);
  return concat(header, solution, player, concat(...stringBytes), extras);
}

function buildExtras(input: PuzExportInput, byKey: Map<string, PuzExportCell>): Uint8Array {
  const { width, height } = input;
  const n = width * height;
  const out: Uint8Array[] = [];

  // GEXT: 0x80 = circled.
  if (input.cells.some((c) => c.isCircled)) {
    const gext = new Uint8Array(n);
    for (let r = 0; r < height; r++)
      for (let c = 0; c < width; c++)
        gext[r * width + c] = byKey.get(`${r},${c}`)?.isCircled ? 0x80 : 0;
    out.push(section("GEXT", gext));
  }

  // GRBS + RTBL: rebus.
  const rebus = input.cells.filter((c) => c.rebus && c.rebus.length > 1);
  if (rebus.length) {
    const grbs = new Uint8Array(n);
    const table: string[] = [];
    const idxByStr = new Map<string, number>();
    let next = 0;
    for (const cell of rebus) {
      let idx = idxByStr.get(cell.rebus!);
      if (idx === undefined) {
        idx = next++;
        idxByStr.set(cell.rebus!, idx);
        table.push(`${String(idx).padStart(2, " ")}:${cell.rebus};`);
      }
      grbs[cell.row * width + cell.col] = idx + 1;
    }
    out.push(section("GRBS", grbs));
    out.push(section("RTBL", bytes(table.join(""))));
  }

  return concat(...out);
}

function section(title: string, data: Uint8Array): Uint8Array {
  const head = new Uint8Array(8);
  head.set(bytes(title), 0);
  const dv = new DataView(head.buffer);
  dv.setUint16(4, data.length, true);
  dv.setUint16(6, checksum(data), true);
  return concat(head, data, NUL);
}
