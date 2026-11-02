/**
 * ProgressUnder.js — the rail that hangs UNDER a step card's frame.
 *
 * Contract :
 * - exactly WF_STEP_GAP (8 px) of air between the card's bottom border and the
 * rail: the rail belongs to the card but must not be glued to its frame;
 * - a WF_STEP_RAIL (6 px) track whose fill is coloured by state — running
 * flows, done is solid, failed is red, not started leaves the track empty;
 * - the number on the right says WHICH KIND of number it is:
 * "~62% estimated" a time-baseline extrapolation (percentSource "baseline", and its cold-start
 * sub-variant "baseline:steps", which keeps the same visible flavour)
 * "62% self-reported" the model's own report (percentSource "model")
 * "62% measured" the todo table's measured completion ratio (percentSource "todos")
 * "100%" a closed step's pinned value
 * "waiting for the next turn" NOT a number at all: `turn/end` closed the turn without closing
 * the step, so nothing is advancing. The rail says WHY it is empty instead of inventing a
 * percentage or borrowing the "running, distance unknown" band — see wfAwaitingNextTurn.
 * - a step that has NOT started never shows a percentage, even when the wire
 * payload carries a stale one. No number is better than a fake number.
 *
 * adds a SECOND line under the rail — one secondary fact about the
 * number, never about the work:
 * - `ago`: how long ago that number was estimated (`view.asOf − step.lastEstimateAt`).
 * Data freshness: a 40-minute-old estimate on a still-running step is not a
 * lie, but the user deserves to know it is stale. `lastEstimateAt` is 0 when
 * no estimate ever arrived, and then the segment is NOT rendered at all —
 * "0 seconds ago" would be a fabricated number, which is exactly what this plugin
 * refuses to print.
 *
 * The projected REMAINING half is no longer part of this rail. It used to be shipped
 * by the host as a derived millisecond field (median of the finished steps, hard-bounded) and
 * rendered as "remaining ~N minutes"; the host no longer computes it and this rail no longer renders it.
 * One line, one fact, no consumer-less field — and a payload that still carries that field (an
 * older host) is simply not read.
 *
 * Layout : two right-aligned lines. Line 1 = track + percent (unchanged).
 * Line 2 = ago, one font step and one colour step down, so it reads as
 * secondary. With no age to show the whole line is omitted — never a placeholder.
 * In the narrow container (`data-detail='title'`) only line 1 exists — the host
 * hides line 2 with CSS, and the compact renderer never emits it.
 *
 * Pure: no React import, no DOM, no storage — the same functions run in Node for
 * tools/selftest-panel.mjs and in the browser. `h` (React.createElement) and
 * `say` are injected, so this chunk can be asserted without React.
 *
 * Inlined into client.js by tools/build-client.mjs (single-file browser half).
 */

/**
 * Is this row WAITING FOR THE NEXT TURN?
 *
 * Two DIFFERENT questions live in this file and must never be confused:
 * - "is a turn running right now" — the session flag (`wfSessionRunning`), and
 * - "is THIS STEP holding its place until the user sends the next turn" — `awaitingNextTurn`,
 *   which fold.mjs sets when `turn/end` closed the turn without closing the step.
 * A waiting step is still `running` (the work is not finished), but nothing is advancing, so the
 * rail must not claim a direction: no digits, no 30 % indeterminate band, no flowing gradient.
 *
 * Accepts the ROW or the bare boolean, because the two entry points hold different things:
 * `wfRenderProgressDock` has the row, while `wfProgressLabel` takes scalars and is handed the flag.
 * A missing/absent/undefined field is false — the same honest default the host repairs to.
 */
function wfAwaitingNextTurn(value) {
  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;
  if (typeof value === "object") return value.awaitingNextTurn === true;
  return false;
}

/** The rail's four label flavours, as opposed to "no label at all". */
function wfProgressLabel(percent, source, status, say, awaiting) {
  // A step that has not started has no progress to report. Showing a number here
  // would be the exact lie the acceptance criterion forbids. This gate comes FIRST (before the
  // waiting branch too): a pending row that carries a stale flag must never print
  // 「等待下一回合」either — it is not waiting, it simply has not begun.
  if (status === "pending" || status === "skipped") return null;
  // WAITING FOR THE NEXT TURN. Deliberately placed BEFORE the number check: the host ships no
  // number for a waiting step (`percentFor` returns null), yet the rail still has to SAY why —
  // an empty rail would read as "no information", which is a different claim. A stale number in
  // the payload (an older host, a replayed checkpoint) is ignored: waiting is not "40 % done".
  if (status === "running" && wfAwaitingNextTurn(awaiting)) {
    return { kind: "waiting", percent: null, text: say("panel.percent.waiting") };
  }
  var value = wfFinite(percent);
  if (value === null) return null;
  var rounded = Math.round(wfClamp(value, 0, 100));
  // the cold-start sub-variant of the baseline keeps the SAME visible flavour (~N% estimated):
  // the sub-division is machine-readable (`baseline:steps`), and falling through to the closed
  // flavour would print it as a pinned 100 %-style number, which it is not.
  if (source === "baseline" || source === "baseline:steps") {
    return { kind: "estimate", percent: rounded, text: say("panel.percent.estimate", { percent: rounded }) };
  }
  if (source === "model") {
    return { kind: "self", percent: rounded, text: say("panel.percent.self", { percent: rounded }) };
  }
  // a MEASURED number (the todo table's own completion ratio). It must read differently
  // from both "self-reported" and "estimated", or the user cannot tell a fact from a guess.
  if (source === "todos") {
    return { kind: "real", percent: rounded, text: say("panel.percent.real", { percent: rounded }) };
  }
  return { kind: "closed", percent: rounded, text: rounded + "%" };
}

/**
 * Fill width in percent of the track. A running step with no number yet gets a
 * narrow indeterminate segment (animated, no digits) instead of a fake value.
 *
 * A WAITING step gets an EMPTY track: the 30 % band exists to say "working, distance unknown",
 * and a step waiting for the next turn is not working at all. Drawing the band would keep the
 * rail moving (the fill's gradient animates) while nothing happens — the one thing this whole
 * change is about.
 */
function wfProgressFillWidth(row) {
  var status = row && typeof row.status === "string" ? row.status : "pending";
  if (status === "pending" || status === "skipped") return 0;
  if (wfAwaitingNextTurn(row)) return 0;
  var value = wfFinite(row.percent);
  if (value === null) return status === "running" ? 30 : 0;
  return Math.round(wfClamp(value, 0, 100));
}

/** The 30 % band is for "running with no number". A waiting step has no number for a DIFFERENT
 * reason (there is nothing to measure until the next turn opens), so it must not borrow that
 * look — otherwise the two states are indistinguishable on the rail, which is the defect. */
function wfProgressIndeterminate(row) {
  var status = row && typeof row.status === "string" ? row.status : "pending";
  if (wfAwaitingNextTurn(row)) return false;
  return status === "running" && wfFinite(row.percent) === null;
}

/**
 * 180_000 -> "3 minutes", 5_400 -> "54 seconds", 3_720_000 -> "62 minutes".
 * One decimal below ten seconds, integers above — a clock's precision, not a
 * stopwatch's. 0 or less returns "" (never "0 seconds": see the caller).
 */
function wfProgressDurationText(ms) {
  var value = wfFinite(ms);
  if (value === null || value <= 0) return "";
  if (value < 10000) {
    var seconds = Math.round(value / 100) / 10;
    return (seconds % 1 === 0 ? String(Math.round(seconds)) : seconds.toFixed(1)) + " 秒";
  }
  if (value < 60000) return Math.round(value / 1000) + " 秒";
  if (value < 3600000) {
    var minutes = Math.floor(value / 60000);
    return minutes + " 分钟";
  }
  return Math.floor(value / 3600000) + " 小时";
}

/**
 * the ONE secondary fact left — how stale the number being quoted is — or null. Pure
 * arithmetic on the row the host already shipped; no clock is read here (the caller passes `asOf`).
 *
 * `ago` needs a real `lastEstimateAt` AND an `asOf` after it: a step that has never carried a
 * number gets no segment, and a future stamp (a re-ordered event log) is clamped to nothing
 * rather than shown as a negative duration. A missing field produces NO segment — never a
 * fabricated 0 or "—" (the ETA half went with the host's derived field).
 */
function wfProgressTiming(row, asOf) {
  var status = row && typeof row.status === "string" ? row.status : "pending";
  var now = wfFinite(asOf);
  var estimateAt = wfFinite(row ? row.lastEstimateAt : null);
 // The gate mirrors the percent label's: only a step that HAS a live progress number can read
 // "estimated N minutes ago", because the sentence is about that number. A pending row with a leftover stamp
 // (a re-plan that reset a step, say) would otherwise advertise an estimate it never made — the
 // same "no number beats a fake number" rule the percent label already follows. `ago` is a fact
 // about the PAST, so it only needs a number to have existed at all: percent > 0.
  var livePercent = wfFinite(row ? row.percent : null);
  // A WAITING step has no advance to date, so there is no estimate to age: the host withholds the
  // number (`percentFor` → null) and this rail withholds the sentence that would quote it. Placed
  // with the other gates so the second line never contradicts the first.
  var hasAnyNumber =
    livePercent !== null && livePercent > 0 && status !== "pending" && !wfAwaitingNextTurn(row);
  var ago = null;
  if (hasAnyNumber && now !== null && estimateAt !== null && estimateAt > 0 && now > estimateAt) {
    ago = wfProgressDurationText(now - estimateAt);
    if (ago === "") ago = null;
  }
  return { ago: ago };
}

/** One rail: track + fill + the right-hand number (omitted when there is none). */
function wfRenderProgressDock(h, row, say, asOf) {
  var status = row && typeof row.status === "string" ? row.status : "pending";
  var awaiting = wfAwaitingNextTurn(row);
  var label = wfProgressLabel(row ? row.percent : null, row ? row.percentSource : "none", status, say, awaiting);
  var width = wfProgressFillWidth(row);
  var indeterminate = wfProgressIndeterminate(row);
  var compact = !!(row && row.compact === true);
  var ago = compact ? null : wfProgressTiming(row, asOf).ago;

  var trackProps = {
    className: "wf-prog-track",
    key: "track",
    role: "progressbar",
    "aria-label": say("panel.step.progress", { title: row && row.title ? row.title : "" }),
    // A waiting rail carries NO value at all: `aria-valuenow` is only written when there is a
    // digit to read out (see below), and the text is the waiting phrase, not a percentage.
    "aria-valuemin": 0,
    "aria-valuemax": 100,
  };
  if (label !== null) {
    // `percent: null` is the waiting flavour: it has a sentence but no number, so it writes the
    // text only. Writing `aria-valuenow="null"` would announce a value that does not exist.
    if (label.percent !== null) trackProps["aria-valuenow"] = label.percent;
    trackProps["aria-valuetext"] = label.text;
  }

 // the second line — ONE fact (the age of the number), so there is no bits array and
 // no separator any more. the projected remainder is gone, so `data-timing` converged to
 // none|one; nothing at all renders when there is no age (never a placeholder).
  var subline = ago === null
    ? null
    : h(
        "div",
        { className: "wf-prog-sub", key: "sub" },
        h(
          "span",
          {
            className: "wf-prog-ago",
            key: "ago",
            title: say("panel.percent.ago", { duration: ago }),
          },
          say("panel.percent.ago", { duration: ago })
        )
      );

  return h(
    "div",
    {
      className: "wf-prog-dock",
      key: "dock",
      "data-dsh-workflow-map": "progress",
      "data-step-index": row ? row.index : undefined,
      "data-status": status,
      // The waiting state on the rail itself, so the stylesheet can freeze the fill without a
      // second class and a self-test can tell the two states apart from the DOM alone.
      "data-awaiting": awaiting ? "true" : "false",
      "data-indeterminate": indeterminate ? "true" : "false",
      "data-timing": ago === null ? "none" : "one",
    },
    h(
      "div",
      { className: "wf-prog-row", key: "row" },
      h("div", trackProps, h("div", {
        className: "wf-prog-fill",
        key: "fill",
        "data-indeterminate": indeterminate ? "true" : "false",
        // Exactly one step's rail carries the flowing gradient: decided by the caller's row.live (the host marks only
        // the single running row), not "everything running animates". Without that field it falls back to the old behaviour.
        // A WAITING step is the one exception even when `live` says true: the flow would animate an
        // advance that is not happening, which is exactly the cue this change removes.
        "data-live": !awaiting && ((row && row.live === true) || (row && row.live === undefined && status === "running")) ? "true" : "false",
        style: { width: width + "%" },
      })),
      label === null
        ? null
        : h(
            "span",
            {
              className: "wf-prog-label",
              key: "label",
              "data-kind": label.kind,
              "data-percent": label.percent,
              title: label.text,
            },
            label.text
          )
    ),
    subline
  );
}
