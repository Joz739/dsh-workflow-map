/**
 * HotInject.js — the right-hand column that hot-injects a prompt.
 * adds its undo: the "revoke" button on a history row (`POST /dsh-workflow/unsteer`).
 *
 * WHY THIS FILE EXISTS. The panel's other chunks are pure renderers of data the host already
 * folded. This one owns the plugin's TWO writes: a `POST /dsh-workflow/steer` that puts one
 * `user/message` into the running session's next-step inbox, and a `POST /dsh-workflow/unsteer`
 * that takes that same message back out while it is still unclaimed. Everything that can be
 * decided without the DOM — what may be sent, what the four states look like, what the host's
 * answer means — lives here so tools/selftest-panel.mjs can drive it in Node.
 *
 * THE SEND STATE MACHINE (four states, one source of truth):
 *
 * idle ──send──▶ sending ──{ok:true}──▶ sent ──1.5 s──▶ idle
 * │ ▲
 * └──{ok:false}──▶ failed ──1.5 s──▶ idle
 *
 * `sent` and `failed` are ACKNOWLEDGEMENTS, not resting states: they clear themselves after
 * WF_INJECT_ACK_MS so the panel never sits on a stale "injected" state. The textarea is never cleared
 * by the machine — only the user's own cancel does that — so a failed send keeps what was typed.
 *
 * THE REVOKE STATE MACHINE (a second, separate one — one revocation at a time):
 *
 * idle ──click──▶ revoking ──{ok:true}──▶ revoked ──(the folded row stops being pending)──▶ gone
 * │
 * └──{ok:false}──▶ failed (the host's own reason, under that row)
 *
 * `revoked` is deliberately NOT optimistic: the host's 200 means the message left the inbox, and
 * the row turns "revoked" on the next poll, from the host's own durable
 * `agent/inbox/spliced { outcome: 'canceled' }`. Until then the button reads "revoking..." and is disabled,
 * which is what stops a second click from becoming a second post.
 *
 * HONESTY RULES (each one has an assertion):
 * 1. Sending is refused while `state === "sending"` — no double post, ever.
 * 2. Empty text is refused before any request leaves (the host would answer 400 anyway, but a
 * round trip for something the browser already knows is not honest either).
 * 3. A success is claimed ONLY on `{ok:true}` from the host. On anything else the panel shows
 * the host's OWN reason verbatim - never an invented "injection failed".
 * 4. A 409 carries the host's text ("session is not running, hot injection unavailable"), and it is rendered as a
 * failure with that text, not silently swallowed.
 * 5. `sessionId` is required: without one there is no session to address, so the button is
 * disabled rather than posting something the host will reject.
 *
 * Pure: `h` and `say` are injected. Inlined into client.js by tools/build-client.mjs.
 */

/** The text bound, mirroring the host's STEER_TEXT_LIMIT (src/route.js). */
var WF_INJECT_LIMIT = 2000;

/** How long "injected" / a failure line stays on screen (the copy receipt's rhythm). */
var WF_INJECT_ACK_MS = 1500;

/** The four states. Anything else is treated as idle: a corrupted record cannot wedge the UI. */
var WF_INJECT_STATES = ["idle", "sending", "sent", "failed"];

function wfInjectState(value) {
  for (var i = 0; i < WF_INJECT_STATES.length; i += 1) {
    if (value === WF_INJECT_STATES[i]) return value;
  }
  return "idle";
}

/**
 * Whether a send is allowed right now. The ONE gate the button and the submit share, so the
 * disabled attribute and the click handler can never disagree.
 */
function wfInjectCanSend(state, sessionId, text) {
  if (wfInjectState(state) !== "idle") return false;
  if (typeof sessionId !== "string" || sessionId === "") return false;
  if (typeof text !== "string" || text.trim() === "") return false;
  return text.length <= WF_INJECT_LIMIT;
}

/** Trimmed, bounded text — what would actually be sent. "" when nothing may be. */
function wfInjectText(value) {
  if (typeof value !== "string") return "";
  var trimmed = value.replace(/^\s+|\s+$/g, "");
  return trimmed.length > WF_INJECT_LIMIT ? trimmed.slice(0, WF_INJECT_LIMIT) : trimmed;
}

/**
 * Turn the host's answer into the UI's outcome. `{ok:true}` → sent; anything else → failed with
 * the host's own reason. A missing reason is replaced here (the UI must not print "undefined"),
 * but a PRESENT one is passed through verbatim — that is rule 3.
 */
function wfInjectOutcome(response, say) {
  var fire = typeof say === "function" ? say : function (key) {
    return key;
  };
  if (response && response.ok === true) {
    return { kind: "sent", text: fire("panel.inject.sent"), detail: "" };
  }
  var reason =
    response && typeof response.error === "string" && response.error !== ""
      ? response.error
      : fire("panel.inject.unknown");
  return { kind: "failed", text: reason, detail: "" };
}

/**
 * The state after one acknowledged outcome: `sent`/`failed` clear back to idle, everything else
 * is already idle. Pure, so the timer's only job is to call it.
 */
function wfInjectAckDone(state) {
  var current = wfInjectState(state);
  return current === "sent" || current === "failed" ? "idle" : current;
}

/* ------------------------------------------------------------------------- */
/* the revoke state machine */
/* ------------------------------------------------------------------------- */

/**
 * The four states of ONE revocation. `idle` = nothing in flight, `revoking` = the POST is out,
 * `revoked` = the host said 200 and the row is waiting for the next poll to say "revoked",
 * `failed` = the host refused and its own reason is on screen. `revoked` does NOT disappear by
 * itself: it disappears when the folded row stops being `pending`, which is the host's own
 * durable proof that the message really left the inbox.
 */
var WF_REVOKE_STATES = ["idle", "revoking", "revoked", "failed"];

function wfRevokeState(value) {
  for (var i = 0; i < WF_REVOKE_STATES.length; i += 1) {
    if (value === WF_REVOKE_STATES[i]) return value;
  }
  return "idle";
}

/**
 * Turn the host's answer to `/unsteer` into the UI's outcome. The SAME honesty rule as the send:
 * only `{ok:true}` is a revocation, and every failure prints the host's own reason verbatim — the
 * one text this function may supply is the "the host gave no reason" fallback.
 */
function wfRevokeOutcome(response, say) {
  var fire = typeof say === "function" ? say : function (key) {
    return key;
  };
  if (response && response.ok === true) {
    return { kind: "revoked", text: "" };
  }
  var reason =
    response && typeof response.error === "string" && response.error !== ""
      ? response.error
      : fire("panel.inject.revoke.failed");
  return { kind: "failed", text: reason };
}

/** The receipt line: how many characters are left before the host would refuse. */
function wfInjectCounter(text, say) {
  var fire = typeof say === "function" ? say : function (key) {
    return key;
  };
  var used = typeof text === "string" ? text.length : 0;
  var left = WF_INJECT_LIMIT - used;
  if (left < 0) left = 0;
  return fire("panel.inject.counter", { used: used, left: left, max: WF_INJECT_LIMIT });
}

/** how many rows still wait for the turn — the header badge's only input. */
function wfPendingInjectCount(rows) {
  if (!Array.isArray(rows)) return 0;
  var n = 0;
  for (var i = 0; i < rows.length; i += 1) {
    if (rows[i] && rows[i].status === "pending") n += 1;
  }
  return n;
}

/** One mapping for the three status words, shared by the history rows and the persistent dock. */
function wfInjectStatusKey(status) {
  return status === "picked"
    ? "panel.inject.row.picked"
    : status === "canceled"
      ? "panel.inject.row.canceled"
      : "panel.inject.row.pending";
}

/* ------------------------------------------------------------------------- */
/* the request */
/* ------------------------------------------------------------------------- */

/**
 * One `POST /dsh-workflow/steer`. Never throws: every outcome is a value, so the caller's
 * `.then` can always decide what to paint.
 *
 * @param {Function} fetchImpl - `window.fetch` (injected so Node can drive this)
 * @param {string} url
 * @param {string} sessionId
 * @param {string} text
 * @returns {Promise<{status:number, payload:object|null, error:string}>}
 */
function wfPostSteer(fetchImpl, url, sessionId, text, signal) {
  return wfPostJson(fetchImpl, url, { sessionId: sessionId, text: text }, signal);
}

/**
 * One `POST /dsh-workflow/unsteer` — the SAME transport, one different body field.
 *
 * This is the round trip the history row's "revoke" button makes. It answers 200 only when the
 * message was still in the inbox; 409 means the running turn already took it (or it never was
 * there), and that reason is printed verbatim in the row.
 *
 * @param {Function} fetchImpl - `window.fetch`
 * @param {string} url
 * @param {string} sessionId
 * @param {string} messageId - the id the host returned from `/steer`
 * @returns {Promise<{status:number, payload:object|null, error:string}>}
 */
function wfPostUnsteer(fetchImpl, url, sessionId, messageId) {
  return wfPostJson(fetchImpl, url, { sessionId: sessionId, messageId: messageId });
}

/** The one POST implementation both writes share: body in, `{status, payload, error}` out. */
function wfPostJson(fetchImpl, url, payload, signal) {
  var body = JSON.stringify(payload);
  return Promise.resolve()
    .then(function () {
      if (typeof fetchImpl !== "function") throw new Error("fetch unavailable");
  // Cancellable before send: while the request is in flight the user can press cancel and the fetch aborts immediately.
  // This only stops requests that are STILL IN FLIGHT; once the host has returned 200 (the message is in the inbox),
  // pulling it back relies on `POST /dsh-workflow/unsteer` (host inbox revoke) instead of aborting the request.
      return fetchImpl(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: body,
        signal: signal,
      });
    })
    .then(function (response) {
      var status = response && wfFinite(response.status) !== null ? response.status : 0;
      if (!response || response.ok !== true) {
 // The host answers JSON on every failure branch, so read it: its `error` is the reason
 // the panel must print verbatim (rule 3).
        return Promise.resolve()
          .then(function () {
            return response && typeof response.json === "function" ? response.json() : null;
          })
          .catch(function () {
            return null;
          })
          .then(function (payload) {
            var reason =
              payload && typeof payload.error === "string" && payload.error !== ""
                ? payload.error
                : status === 0
                  ? "network error"
                  : "HTTP " + status;
            return { status: status, payload: payload, error: reason };
          });
      }
      return Promise.resolve()
        .then(function () {
          return typeof response.json === "function" ? response.json() : null;
        })
        .catch(function () {
          return null;
        })
        .then(function (payload) {
          if (!payload || payload.ok !== true) {
            return {
              status: status,
              payload: payload,
              error: payload && payload.error ? payload.error : "bad payload",
            };
          }
          return { status: 200, payload: payload, error: "" };
        });
    })
    .catch(function (error) {
      return { status: 0, payload: null, error: (error && error.message) || String(error) };
    });
}

/* ------------------------------------------------------------------------- */
/* the renderer */
/* ------------------------------------------------------------------------- */

/**
 * The right-hand column. `extras` carries
 * {sessionId, state, text, reason, history, revokeId, revokeState, revokeReason}.
 *
 * Nothing here is mounted when the panel is collapsed: the caller decides.
 */
function wfRenderHotInject(h, say, actions, extras) {
  var fire = actions || {};
  var ui = extras || {};
  var sessionId = typeof ui.sessionId === "string" ? ui.sessionId : "";
  var state = wfInjectState(ui.state);
  var text = typeof ui.text === "string" ? ui.text : "";
  var reason = typeof ui.reason === "string" ? ui.reason : "";
 // the ONE revocation currently on screen. `revokeId` names the history row it
 // belongs to, so a failure line lands under ITS row and never under a neighbour's.
  var revokeId = typeof ui.revokeId === "string" ? ui.revokeId : "";
  var revokeState = wfRevokeState(ui.revokeState);
  var revokeReason = typeof ui.revokeReason === "string" ? ui.revokeReason : "";
  var sending = state === "sending";
  var canSend = wfInjectCanSend(state, sessionId, text);

  var note =
    state === "sent"
      ? say("panel.inject.sent")
      : state === "failed"
        ? reason === ""
          ? say("panel.inject.unknown")
          : reason
        : "";

 // the HISTORY rows (newest last in the model, drawn newest first so the latest send is
 // the one the user sees without scrolling). Purely derived from the fold: nothing here talks
 // to the host, and an empty list renders the honest "none yet" line instead of a blank block.
  var history = [];
  if (Array.isArray(ui.history)) history = ui.history.slice().reverse();

  return h(
    "div",
    {
      className: "wf-inject",
      key: "inject",
      "data-dsh-workflow-map": "inject",
      "data-state": state,
    },
    h(
      "div",
      { className: "wf-inject-head", key: "head" },
      h("span", { className: "wf-inject-title", key: "title" }, say("panel.inject.title")),
      h(
        "button",
        {
          type: "button",
          key: "close",
          className: "wf-link wf-inject-close",
          "data-inject": "cancel",
          title: say("panel.inject.cancel"),
          "aria-label": say("panel.inject.cancel"),
          onClick: function () {
            wfFire(fire.onInjectCancel);
          },
        },
        say("panel.inject.cancel")
      )
    ),
    h(
      "p",
      { className: "wf-inject-hint", key: "hint" },
      say("panel.inject.hint")
    ),
    h("textarea", {
      key: "area",
      className: "wf-inject-area",
      "data-dsh-workflow-map": "inject-text",
      rows: 6,
      value: text,
      placeholder: say("panel.inject.placeholder"),
      "aria-label": say("panel.inject.title"),
      disabled: sending,
      onChange: function (event) {
        var value = event && event.target ? event.target.value : "";
        wfFire(fire.onInjectText, value);
      },
    }),
    h(
      "div",
      { className: "wf-inject-foot", key: "foot" },
      h("span", { className: "wf-inject-count", key: "count" }, wfInjectCounter(text, say)),
      h(
        "button",
        {
          type: "button",
          key: "send",
          className: "wf-link wf-inject-send",
          "data-inject": "send",
          "data-ready": canSend ? "true" : "false",
          disabled: canSend ? undefined : true,
          title: say("panel.inject.send"),
          onClick: function () {
            wfFire(fire.onInjectSend, wfInjectText(text));
          },
        },
        sending ? say("panel.inject.sending") : say("panel.inject.send")
      ),
  // While sending, show "cancel": abort the in-flight request (fetch signal).
  // After a 200 (message already in the inbox) this button disappears, because it can no longer be pulled back.
      sending
        ? h(
            "button",
            {
              type: "button",
              key: "abort",
              className: "wf-link wf-inject-abort",
              "data-inject": "abort",
              title: say("panel.inject.abort"),
              onClick: function () {
                wfFire(fire.onInjectAbort);
              },
            },
            say("panel.inject.abort"),
          )
        : null
    ),
 // The acknowledgement: one line, present only while the state is sent/failed. It carries
 // `aria-live` so a screen reader hears the host's own reason, not just a colour change.
    note === ""
      ? null
      : h(
          "div",
          {
            className: "wf-inject-note",
            key: "note",
            "data-kind": state === "sent" ? "sent" : "failed",
            role: "status",
            "aria-live": "polite",
          },
          note
        ),
 // the history block. It sits UNDER the acknowledgement so the composer's shape does
 // not change; the newest row is first, and each row states the one thing the user asked to
 // know: was this one taken by the running turn, or is it still waiting.
    h(
      "div",
      { className: "wf-inject-history", key: "history", "data-dsh-workflow-map": "inject-history", "data-count": history.length },
      h("div", { className: "wf-inject-history-label", key: "label" }, say("panel.inject.history")),
      history.length === 0
        ? h("div", { className: "wf-inject-history-empty", key: "empty" }, say("panel.inject.history.empty"))
        : h(
            "ul",
            { className: "wf-inject-list", key: "list", role: "list" },
            history.map(function (row) {
  // Three states: picked up / awaiting pickup / revoked. The third comes only from the host's own log event
  // (`agent/inbox/spliced` with `outcome: 'canceled'`, the durable record of a successful revoke).
              var status = wfInjectStatusKey(row.status);
  // "revoke" exists for exactly one window: a row the turn has NOT
 // claimed yet. A `picked` row cannot be un-read, and a `canceled` row has nothing
 // left to take back, so neither renders the button (not a disabled one — none).
              var pending = row.status === "pending";
              var mine = pending && revokeId === row.id;
              var inFlight = mine && (revokeState === "revoking" || revokeState === "revoked");
              return h(
                "li",
                {
                  className: "wf-inject-row",
                  key: "row-" + row.id,
                  "data-dsh-workflow-map": "inject-row",
                  "data-status": row.status,
                },
                h(
                  "span",
                  { className: "wf-inject-row-status", key: "status", "data-status": row.status },
                  say(status)
                ),
                h("span", { className: "wf-inject-row-text", key: "text" }, row.text || "—"),
                h(
                  "span",
                  { className: "wf-inject-row-time", key: "time" },
                  row.status === "picked" && row.pickedUpAt !== null ? wfFormatClock(row.pickedUpAt) : wfFormatClock(row.at)
                ),
                pending
                  ? h(
                      "button",
                      {
                        type: "button",
                        key: "revoke",
                        className: "wf-link wf-inject-row-revoke",
                        "data-inject": "revoke",
                        "data-inject-id": row.id,
 // Two clicks must not become two posts: the button is dead from the moment
 // the request leaves until the row stops being `pending`.
                        disabled: inFlight ? true : undefined,
                        title: say("panel.inject.revoke.hint"),
                        "aria-label": say("panel.inject.revoke"),
                        onClick: function () {
                          wfFire(fire.onInjectRevoke, row.id);
                        },
                      },
                      inFlight ? say("panel.inject.revoking") : say("panel.inject.revoke")
                    )
                  : null,
 // The host's own words, verbatim, under the row that failed (rule 3). The stylesheet
 // makes it span the row so it never reads as a fourth column.
                mine && revokeState === "failed"
                  ? h(
                      "span",
                      {
                        className: "wf-inject-row-error",
                        key: "revoke-error",
                        "data-inject": "revoke-error",
                        role: "status",
                        "aria-live": "polite",
                      },
                      revokeReason === "" ? say("panel.inject.revoke.failed") : revokeReason
                    )
                  : null
              );
            })
          ),
    ),
  );
}

/**
 * the PERSISTENT dock: one row at the right page's foot, rendered for
 * every page kind that is NOT the composer, so a prompt can be typed without opening it first.
 *
 * It shares ONE piece of state with the full composer (`inject.text`): both render the same
 * `ui.text` and both fire the same `onInjectText`, so switching between the two forms never drops
 * a draft. The send gate is the same `wfInjectCanSend`, and the acknowledgement is the host's own
 * words or nothing — the dock never invents a success, and never updates optimistically.
 *
 * `extras` = {sessionId, state, text, reason, history} — the same shape the composer takes.
 */
function wfRenderInjectDock(h, say, actions, extras) {
  var fire = actions || {};
  var ui = extras || {};
  var sessionId = typeof ui.sessionId === "string" ? ui.sessionId : "";
  var state = wfInjectState(ui.state);
  var text = typeof ui.text === "string" ? ui.text : "";
  var reason = typeof ui.reason === "string" ? ui.reason : "";
  var sending = state === "sending";
  var canSend = wfInjectCanSend(state, sessionId, text);
  var history = Array.isArray(ui.history) ? ui.history : [];
 // The model keeps the newest LAST (wfInjectRows), so the newest row is the last element.
  var latest = history.length > 0 ? history[history.length - 1] : null;

  var note =
    state === "sent"
      ? say("panel.inject.sent")
      : state === "failed"
        ? reason === ""
          ? say("panel.inject.unknown")
          : reason
        : "";

  function send() {
    wfFire(fire.onInjectSend, wfInjectText(text));
  }

  return h(
    "div",
    {
      className: "wf-inject-dock",
      key: "inject-dock",
      "data-dsh-workflow-map": "inject-dock",
      "data-state": state,
    },
    h(
      "div",
      { className: "wf-inject-dock-row", key: "row" },
      h(
        "button",
        {
          type: "button",
          key: "open",
          className: "wf-inject-dock-label",
          "data-inject": "dock-open",
          title: say("panel.inject.open"),
          "aria-label": say("panel.inject.open"),
          onClick: function () {
            wfFire(fire.onToggleInject);
          },
        },
        say("panel.inject.banner")
      ),
      h("input", {
        type: "text",
        key: "text",
        className: "wf-inject-dock-input",
        "data-dsh-workflow-map": "inject-dock-text",
        value: text,
        placeholder: say("panel.inject.placeholder"),
        "aria-label": say("panel.inject.title"),
        disabled: sending,
        onChange: function (event) {
          var value = event && event.target ? event.target.value : "";
          wfFire(fire.onInjectText, value);
        },
 // Enter is the dock's whole point: one line, no reaching for the button. The gate is the
 // SAME wfInjectCanSend the full composer uses, so an empty / over-long / session-less text
 // simply does nothing instead of posting something the host would reject.
        onKeyDown: function (event) {
          if (!event || event.key !== "Enter") return;
          if (typeof event.preventDefault === "function") event.preventDefault();
          if (canSend) send();
        },
      }),
      h(
        "button",
        {
          type: "button",
          key: "send",
          className: "wf-link wf-inject-dock-send",
          "data-inject": "dock-send",
          "data-ready": canSend ? "true" : "false",
          disabled: canSend ? undefined : true,
          title: say("panel.inject.send"),
          onClick: send,
        },
        sending ? say("panel.inject.sending") : say("panel.inject.send")
      ),
      latest
        ? h(
            "span",
            {
              className: "wf-inject-dock-state",
              key: "state",
              "data-status": latest.status,
              title: say(wfInjectStatusKey(latest.status)),
            },
            say(wfInjectStatusKey(latest.status))
          )
        : null
    ),
 // The acknowledgement, verbatim: the host's own reason on failure, "injected" only on a real
 // {ok:true}. It sits inside the bar, under the row, so a 409 is never silent.
    note === ""
      ? null
      : h(
          "div",
          {
            className: "wf-inject-dock-note",
            key: "note",
            "data-kind": state === "sent" ? "sent" : "failed",
            role: "status",
            "aria-live": "polite",
          },
          note
        )
  );
}
