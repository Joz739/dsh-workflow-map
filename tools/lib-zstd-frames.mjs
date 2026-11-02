// tools/lib-zstd-frames.mjs — the ONE decoder for a session log's on-disk format.
//
// WHY THIS FILE EXISTS. A `session.v4.jsonl.zstd` is SEVERAL independent zstd frames concatenated
// (one appended per write), and Node's `zstdDecompressSync` stops after the first frame, so every
// reader of a session log needs the same frame walk. That walk used to be copied into five tools
// (audit-real, check-real-injects, check-real-sessions, check-flow, check-percent-source), which
// meant a fix to one copy silently left the others reading logs differently — and a checker that
// reads a log differently from its neighbour is a checker nobody can compare with.
//
// TWO ENTRY POINTS, because the tools legitimately want two different failure policies:
//   * `decompressFrames(buf)`     — strict: a frame that will not decode is an ERROR and a log that
//                                   throws is reported by session id (audit-real, check-real-*,
//                                   check-todo-align). A half-decoded log must never be folded and
//                                   then graded as if it had been read.
//   * `scanFrames(buf)`           — diagnostic: never throws, reports the frames it could read AND
//                                   the byte offset of each one it could not (check-flow prints that
//                                   count as its own `log.parsed` evidence).
//
// A magic number can occur INSIDE compressed bytes, so a candidate boundary is not trusted until it
// decodes: `decompressFrames` advances by the end of the frame it actually decoded, and when a
// candidate fails it tries the next candidate boundary (up to `LOOKAHEAD`) before giving up.
import { zstdDecompressSync } from "node:zlib";

/** Zstandard frame magic, little endian (`0xFD2FB528`). */
export const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

/** How many candidate boundaries past a frame start are tried before the frame is declared bad. */
const LOOKAHEAD = 4;

/** Byte offsets of every zstd magic in the buffer (a superset: some are inside compressed bytes). */
export function frameOffsets(buf) {
  const offsets = [];
  for (let at = buf.indexOf(ZSTD_MAGIC); at !== -1; at = buf.indexOf(ZSTD_MAGIC, at + 1)) offsets.push(at);
  return offsets;
}

/**
 * Decode every frame and concatenate the text a log write produced.
 * Returns the decoded bytes (callers decide the encoding/line split).
 * Throws when a frame cannot be decoded — a corrupt log must be named, not silently half-read.
 */
export function decompressFrames(buf) {
  // A ZERO-BYTE LOG IS NOT A CORRUPT LOG. This append-only format means a session that was opened
  // and never wrote an event leaves an empty file, and zlib reports empty input as Z_BUF_ERROR
  // ("unexpected end of file") — an ERROR for a fact that is perfectly ordinary. The old copies
  // handled that correctly and one caller (check-real-sessions) still counts it apart as `empty`;
  // the strict shared decoder must not turn that sampling artefact into a loud crash.
  if (buf.length === 0) return Buffer.alloc(0);
  const offsets = frameOffsets(buf);
  if (offsets.length === 0) {
    // No magic at all: one plain zstd stream (or a file that is not a log). Let zlib decide — a
    // nonempty input that will not decode here really is unreadable, and callers name it.
    return zstdDecompressSync(buf);
  }
  const parts = [];
  let index = 0;
  while (index < offsets.length) {
    const start = offsets[index];
    let end = -1;
    let out = null;
    // TRIED AGAINST EVERY REMAINING BOUNDARY, NOT JUST THE NEXT FEW. A magic number can occur
    // inside compressed bytes, and a frame's real end may be several candidates away; the old
    // check-real-sessions copy scanned the rest of the log, which is strictly the safest rule, so
    // the shared decoder keeps it instead of weakening the caller that already had it.
    for (let probe = index; probe < offsets.length; probe += 1) {
      const stop = probe + 1 < offsets.length ? offsets[probe + 1] : buf.length;
      try {
        out = zstdDecompressSync(buf.subarray(start, stop));
        end = probe + 1;
        break;
      } catch {
        /* this candidate boundary is not a boundary: a magic number inside the frame */
      }
    }
    if (out === null) throw new Error(`unreadable zstd frame at byte ${start}`);
    parts.push(out);
    index = end;
  }
  return Buffer.concat(parts);
}

/**
 * Diagnostic variant: decode what can be decoded, count what cannot.
 * `{ buffer, frames, badFrames, firstBadOffset }` — `buffer` is the readable prefix/suffix joined.
 */
export function scanFrames(buf) {
  const offsets = frameOffsets(buf);
  if (offsets.length === 0) {
    try {
      return { buffer: zstdDecompressSync(buf), frames: 1, badFrames: 0, firstBadOffset: null };
    } catch (error) {
      return { buffer: Buffer.alloc(0), frames: 0, badFrames: 1, firstBadOffset: 0 };
    }
  }
  const parts = [];
  let badFrames = 0;
  let firstBadOffset = null;
  for (let index = 0; index < offsets.length; index += 1) {
    const start = offsets[index];
    const stop = index + 1 < offsets.length ? offsets[index + 1] : buf.length;
    try {
      parts.push(zstdDecompressSync(buf.subarray(start, stop)));
    } catch {
      badFrames += 1;
      if (firstBadOffset === null) firstBadOffset = start;
    }
  }
  return { buffer: Buffer.concat(parts), frames: offsets.length, badFrames, firstBadOffset };
}
