/**
 * Settings.js — step-12: presentation preferences and the in-panel settings card.
 *
 * Everything here is display-only. A setting never reaches the host half, never
 * changes a snapshot, and never writes anything except the one localStorage record
 * that store.js already owns (`dsh-workflow-map:prefs`).
 *
 * The allow-lists live in theme.js (WF_PALETTES / WF_MOTIONS / WF_DETAIL_MODES /
 * WF_NODE_LIMITS), so the sanitizer, the segmented control and the CSS cannot drift
 * apart. A corrupted / older record degrades field by field to the documented
 * defaults instead of blanking the panel.
 *
 * Pure: `h` and `say` are injected. Inlined into client.js by tools/build-client.mjs.
 */

/** The documented defaults («恢复默认» resets to exactly these values). */
function wfDefaultSettings() {
  return {
    palette: "rainbow",
    motion: "full",
    detail: "summary",
    nodeLimit: 60,
  };
}

function wfAllowed(value, allowed, fallback) {
  if (typeof value === "string") {
    for (var i = 0; i < allowed.length; i += 1) if (value === allowed[i]) return value;
  }
  for (var f = 0; f < allowed.length; f += 1) if (fallback === allowed[f]) return fallback;
  return allowed[0];
}

/**
 * 60 / 30 / 120 / 0 — 0 is 「全部」. The string "all" is accepted on read so a
 * hand-edited record cannot strand the panel, but it is persisted as 0.
 */
function wfSanitizeNodeLimit(value, fallback) {
  var fallbackNumber = wfFinite(fallback) === null ? 60 : Math.round(fallback);
  if (WF_NODE_LIMITS.indexOf(fallbackNumber) === -1) fallbackNumber = 60;
  if (typeof value === "string" && value.toLowerCase() === "all") return 0;
  var number = wfFinite(value);
  if (number === null) return fallbackNumber;
  number = Math.round(number);
  return WF_NODE_LIMITS.indexOf(number) === -1 ? fallbackNumber : number;
}

/**
 * Sanitize the four presentation fields. `fallback` may be the full prefs record
 * (store.js passes it), so a partial or stale record keeps the fields it still has.
 */
function wfSanitizeSettings(input, fallback) {
  var base = fallback && typeof fallback === "object" ? fallback : wfDefaultSettings();
  var defaults = wfDefaultSettings();
  return {
    palette: wfAllowed(input && input.palette, WF_PALETTES, wfAllowed(base.palette, WF_PALETTES, defaults.palette)),
    motion: wfAllowed(input && input.motion, WF_MOTIONS, wfAllowed(base.motion, WF_MOTIONS, defaults.motion)),
    detail: wfAllowed(input && input.detail, WF_DETAIL_MODES, wfAllowed(base.detail, WF_DETAIL_MODES, defaults.detail)),
    nodeLimit: wfSanitizeNodeLimit(input && input.nodeLimit, wfSanitizeNodeLimit(base.nodeLimit, defaults.nodeLimit)),
  };
}

/** The compact copy the model carries to the renderers. */
function wfSettingsOf(prefs) {
  return wfSanitizeSettings(prefs, wfDefaultSettings());
}

/** Localised label for one option; values are code, labels are dictionary entries. */
function wfSettingOptionKey(setting, value) {
  if (setting === "palette") return "panel.settings.palette." + value;
  if (setting === "motion") return "panel.settings.motion." + value;
  if (setting === "detail") return "panel.settings.detail." + value;
  if (setting === "nodeLimit") return value === 0 ? "panel.settings.limit.all" : null;
  return null;
}

function wfSettingOptionLabel(setting, value, say) {
  var key = wfSettingOptionKey(setting, value);
  if (key !== null) return say(key);
  return String(value);
}

/** One segmented row. Buttons are the visible state (`aria-pressed`), not a select. */
function wfRenderSettingSegment(h, setting, labelKey, values, current, say, actions) {
  var fire = actions || {};
  var buttons = values.map(function (value) {
    var active = value === current;
    var label = wfSettingOptionLabel(setting, value, say);
    return h(
      "button",
      {
        type: "button",
        key: setting + "-" + String(value),
        className: "wf-seg-btn",
        "data-setting": setting,
        "data-value": String(value),
        "data-dsh-workflow-map": "setting-option",
        "aria-pressed": active ? "true" : "false",
        title: say(labelKey) + " · " + label,
        onClick: function () {
          if (typeof fire.onSetting === "function") fire.onSetting(setting, value);
        },
      },
      label
    );
  });
  return h(
    "div",
    { className: "wf-set-grid", key: "row-" + setting, "data-setting-row": setting },
    h("span", { className: "wf-set-label", key: "label" }, say(labelKey)),
    h(
      "div",
      { className: "wf-seg", key: "seg", role: "group", "aria-label": say(labelKey) },
      buttons
    )
  );
}

/** A copy button: the 1.5 s acknowledgement is repainted by NodeDetail's helper. */
function wfRenderExportCopy(h, kind, labelKey, say, actions) {
  var fire = actions || {};
  return h(
    "button",
    {
      type: "button",
      key: "copy-" + kind,
      className: "wf-link",
      "data-export": "copy-" + kind,
      "data-wf-copy-label": say(labelKey),
      onClick: function (event) {
        var element = event && event.currentTarget ? event.currentTarget : null;
        if (typeof fire.onExportCopy === "function") fire.onExportCopy(kind, element);
      },
    },
    h("span", { className: "wf-copy-label", key: "label" }, say(labelKey)),
    h("span", { className: "wf-copy-status", key: "status", "aria-live": "polite" }, "")
  );
}

function wfRenderExportDownload(h, kind, labelKey, say, actions) {
  var fire = actions || {};
  return h(
    "button",
    {
      type: "button",
      key: "download-" + kind,
      className: "wf-link",
      "data-export": "download-" + kind,
      title: say(labelKey),
      onClick: function () {
        if (typeof fire.onExportDownload === "function") fire.onExportDownload(kind);
      },
    },
    say(labelKey)
  );
}

/**
 * The whole in-panel settings section. It replaces the step-06 diagnostic strip:
 * the endpoint / counts / rev remain at the bottom, but the top is now the actual
 * four preferences plus the two export pairs.
 */
function wfRenderSettings(h, prefs, say, actions, extras) {
  var fire = actions || {};
  var settings = wfSanitizeSettings(prefs, wfDefaultSettings());
  var ui = extras || {};
  return h(
    "div",
    { className: "wf-settings", key: "settings", "data-dsh-workflow-map": "settings" },
    wfRenderSettingSegment(h, "palette", "panel.settings.palette", WF_PALETTES, settings.palette, say, fire),
    wfRenderSettingSegment(h, "motion", "panel.settings.motion", WF_MOTIONS, settings.motion, say, fire),
    wfRenderSettingSegment(h, "detail", "panel.settings.detail", WF_DETAIL_MODES, settings.detail, say, fire),
    wfRenderSettingSegment(h, "nodeLimit", "panel.settings.limit", WF_NODE_LIMITS, settings.nodeLimit, say, fire),
    h(
      "div",
      { className: "wf-set-actions", key: "actions" },
      h(
        "button",
        {
          type: "button",
          key: "reset",
          className: "wf-link",
          "data-action": "reset-prefs",
          title: say("panel.settings.reset.hint"),
          onClick: function () {
            if (typeof fire.onReset === "function") fire.onReset();
          },
        },
        say("panel.settings.reset")
      ),
      h("span", { className: "wf-kv", key: "counts" }, say("panel.settings.counts", {
        steps: ui.steps === undefined ? 0 : ui.steps,
        nodes: ui.nodes === undefined ? 0 : ui.nodes,
      })),
      wfFinite(ui.rev) === null ? null : h("span", { className: "wf-kv", key: "rev" }, say("panel.settings.rev", { rev: ui.rev }))
    ),
    h(
      "div",
      { className: "wf-export", key: "export" },
      h("span", { className: "wf-export-label", key: "label" }, say("panel.settings.export")),
      wfRenderExportCopy(h, "md", "panel.settings.export.markdown", say, fire),
      wfRenderExportCopy(h, "json", "panel.settings.export.json", say, fire),
      wfRenderExportDownload(h, "md", "panel.settings.export.downloadmarkdown", say, fire),
      wfRenderExportDownload(h, "json", "panel.settings.export.downloadjson", say, fire)
    ),
    h(
      "div",
      { className: "wf-set-actions", key: "diag" },
      h("span", { className: "wf-kv", key: "ep" }, say("panel.settings.endpoint") + " " + String(ui.endpoint || ""))
    )
  );
}
