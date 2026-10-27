# retired browser measures

Scripts here measured UI that no longer exists. They are kept for the record (and for anyone
reading the history of the layout), but they are **not part of the `session7` verification chain**
and are not expected to pass.

| script | what it measured | why it is retired | covered today by |
|---|---|---|---|
| `measure-tri.ps1` | the two-column step column's disclosure triangle (`.wf-tri` inside `.wf-unit`) — a 20 px band that toggled a step's detail in place | 会话4 replaced the two-column layout with ONE page. `wfTri` is defined in `StepColumn.js` and used only by `StepColumn.js` / `FlowColumn.js`, neither of which is mounted any more; the step's record now lives on the right page | `measure-detail.ps1` (the step page + its type rows) and `measure-flow.ps1` (the type page) |

The other `tools/measure-*.ps1` scripts ARE part of the chain — see
`docs/OPEN-SOURCE-GUIDE.md` §「自测与回归」 for the exact list and `evidence/session7-rerun.md`
for the last full run's per-suite numbers.
