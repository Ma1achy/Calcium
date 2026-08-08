# S15 — Identity

| Field | Value |
|---|---|
| **Type** | Surface |
| **Tier** | Transcript |
| **Package** | `prism-tui` |
| **Covers** | `/whoami` · `/login` · `/logout` · `/secrets` |
| **Data source** | Each verb's `--json` → `adaptIdentity` (C07) |
| **Source** | `j11`, `j23` · A01 D8 · C22 §7 |
| **Status** | Draft |

---

## 1. Purpose

Four small verbs that share one property: **they are the ones people run when something is already wrong.** A verb failed with an auth error, a secret was not found, a session says `offline` — and the next thing typed is one of these.

That sets the priority. Each answers a diagnostic question directly and states what it does *not* know, because "I could not check" and "it is fine" must never look alike.

`/secrets` sits here rather than with the platform verbs because it is an identity question — what am I permitted to see — not an inventory one.

---

## 2. `/whoami`

```
▌ ── whoami ────────────────────────────────────────────────────────────────────
▌
▌   user       malachy.doherty@fmx.io
▌   teams      vision · ml-platform-readonly
▌   cluster    fmx-prod · https://prism.fmx.io/v1
▌   token      valid · expires in 30d          (2026-08-27 14:02 UTC)
▌   auth       gitlab oauth
▌   config     ~/.calcium/config.toml
▌
▌   ↻ /login   ≡ /config
```

Token state carries **both** a relative and an absolute time. The relative one is what you act on; the absolute one is what you quote when someone asks when it expires, and computing it in your head from "30d" is exactly the error nobody catches.

| Token state | Render |
|---|---|
| Valid, > 7 days | `valid · expires in 30d`, default |
| Valid, ≤ 7 days | `valid · expires in 4d`, **warn** |
| Valid, ≤ 1 day | `valid · expires in 14h`, **error** |
| Expired | `expired 6m ago`, error, with `↻ /login` |
| Absent | `not signed in`, error, with `↻ /login` |
| **Unverifiable** | `present · could not verify (cluster unreachable)`, **warn** |

**The last row is the one that matters.** A token that exists locally but could not be checked against the cluster is neither valid nor expired, and rendering it as either is a lie. A session showing `valid` while the platform is unreachable sends people looking for the wrong fault.

---

## 3. `/login`

```
▌ ── login · gitlab oauth ──────────────────────────────────────────────────────
▌
▌   ✓ opening browser                     gitlab.fmx.io/oauth/authorize
▌   ◐ awaiting callback                   localhost:41telling7 · 42s
▌
▌   Paste the code here if the browser did not open:
▌     /login --token=<code>
▌
▌   ⌃c to cancel
```

Live while waiting, then a transcript record. Two things are stated up front rather than after failure:

**The manual fallback is offered immediately**, not only when the browser fails to open. Headless WSL, SSH sessions and remote containers are common, and a user who already knows the browser will not open should not have to wait for a timeout to be told there is another way.

**The callback port is shown.** When it hangs, the first question is whether something is listening, and the port is the first thing anyone needs.

On success:

```
▌   ✓ signed in as malachy.doherty@fmx.io
▌     teams vision · ml-platform-readonly · token expires 2026-08-27
```

---

## 4. `/logout`

```
▌   ✓ signed out · token removed from keychain
▌     Config and history are untouched. /login to sign back in.
```

**It states what it did not remove.** `logout` and `config reset` are one keystroke apart in intent and very far apart in consequence, and someone expecting a clean slate should learn here that they did not get one.

---

## 5. `/secrets`

```
▌ ── secrets · 4 · names only ──────────────────────────────────────────────────
▌
▌    name                               owner               age  note
▌ ●  gitlab-readonly-token              research-infra      34d
▌ ●  minio-research-creds               research-infra      34d
▌ ●  wandb-api-key                      malachy             12d
▌ ✗  huggingface-token                  malachy              8d  not accessible
▌
▌   Values are never shown by the CLI.
▌
▌   ≡ /secrets <target>
```

**Values are never shown, and the surface says so** rather than leaving it to be inferred from their absence. `j11` makes it a platform guarantee; stating it is how a user stops looking for a flag that reveals them.

A secret that exists but is not accessible to this identity renders `✗ not accessible` — that is the diagnostic this verb is usually run for, and hiding inaccessible secrets would make a missing binding indistinguishable from a permissions problem.

`/secrets <target>` scopes to what one job declares, which is the form used when a run failed with `SECRET_NOT_ACCESSIBLE`.

### Columns

Checked while `align` was being declared across the S-series, and this surface's gap was larger: **the region is a table and it declared no columns at all.** The figure above was the only statement of what they are, which is the same defect as an unstated `align` with nothing left to disagree with it.

| Column | Priority | Min | Align | Flex |
|---|---|---|---|---|
| glyph | 100 | 1 | left | — |
| name | 95 | 22 | left | yes |
| owner | 80 | 15 | left | — |
| age | 60 | 6 | **right** | — |
| note | 40 | 15 | left | — |

No `expand` column: `/secrets` shows names only, so a row has nothing to reveal — and because nothing drops above 60 cells, nothing becomes reachable-but-unmarked either (C11 I15). Below that, S01's fallback replaces the frame.

`age` is right-aligned, which is the convention S03 §3 and S05 §3 follow and **the figure above does not** — it draws `8d` starting where `34d` does. One of the two is wrong and the convention wins: a column of durations read for the outlier is exactly the case right alignment exists for. The figure is corrected above.

`note` carries `not accessible` and is otherwise empty, which is the one column here whose emptiness is information. It drops last rather than first for that reason, despite being the least-populated column in the table.

---

## 6. States

| State | Render |
|---|---|
| **Loading** | C23's pending entry |
| **Signed in** | §2 |
| **Signed out** | `not signed in`, `↻ /login` offered, no teams or token rows |
| **Expired** | §2 with the expired row |
| **Unverifiable** | §2 with the unverifiable row; teams and cluster still shown from config |
| **Login pending** | §3, live |
| **Login failed** | The reason — denied, timed out, port in use — with the manual fallback restated |
| **No secrets** | `no secrets declared` — a fact; many jobs declare none |
| **Secrets unavailable** | The verb failed; C07's error path. **Not** an empty list |
| **Narrow** | §7 |

**An empty secret list and an unreachable secret store must not look alike.** One says "this job needs none", the other says "I could not find out" — and conflating them is how someone concludes a binding is fine when it was never checked.

---

## 7. Narrow widths

These are `keyValue` blocks and one small table.

| Width | Layout |
|---|---|
| ≥ 80 | As shown |
| < 80 | The absolute expiry timestamp moves to its own row beneath the relative one |
| < 60 | S01's fallback replaces the frame |

**The secrets table never drops a column.** It sums to 45 cells with gaps — glyph 1, name 20, owner 14, age 4 — and the shell's minimum is 60 (D30). Priorities are declared because C11 requires them, but no width the shell renders at exercises them. An earlier draft specified a drop order for widths below the minimum, which is a sequence that cannot occur.

The only real narrow-width behaviour here is the expiry row splitting at 80.

Email addresses truncate from the **left**, keeping the domain; a truncated local part is still identifiable in context, a truncated domain is not.

---

## 8. Interactions

| Action | Command | Kind |
|---|---|---|
| `↻ /login` | `/login` | fill |
| `≡ /config` | `/config` | fill |
| `≡ /secrets <target>` | `/secrets <target>` | fill |
| `{ } json` | fill | Always |

**No action signs out.** `/logout` is typed, never offered — it is destructive, trivially typed, and a one-keystroke logout beside a token-expiry warning is a trap.

Nothing here reveals a secret value, and no action can be composed that would.

---

## 9. Commitments

1. Each verb answers a diagnostic question and states what it could not determine.
2. Token expiry carries both a relative and an absolute time.
3. `unverifiable` is a distinct token state from valid and expired.
4. `/login` offers the manual fallback immediately, not after a failure.
5. `/login` shows the callback port, because that is the first thing needed when it hangs.
6. `/logout` states what it did **not** remove.
7. `/secrets` states that values are never shown rather than leaving it inferred.
8. An inaccessible secret is shown as inaccessible, never hidden.
9. An empty secret list and an unreachable store render differently.
10. The secrets table never drops a column at any width the shell renders at.
11. Email addresses truncate from the left, keeping the domain.
12. No action signs out, and none can reveal a secret value.

---

## 10. Tests

### Tier 1 — unit

- **T1.1**: each verb adapts to its documented block sequence — four cases.
- **T1.2**: each of the six token states renders its documented text and tone.
- **T1.3**: expiry shows both relative and absolute forms.
- **T1.4**: the unverifiable state renders `warn`, not `ok` or `error`.
- **T1.5**: `/login` renders the manual fallback in the pending state, before any failure.
- **T1.6**: `/login` renders the callback port.
- **T1.7**: `/logout` names config and history as untouched.
- **T1.8**: `/secrets` renders the never-shown line in every populated state.
- **T1.9**: an inaccessible secret renders `✗ not accessible` and is not filtered out.
- **T1.10**: no secrets → the fact line; verb failure → C07's error path. Two distinct documents.
- **T1.11**: no action in any state emits `/logout`.

### Tier 2 — contract

- **T2.1**: every state's document passes `validateDocument`.
- **T2.2**: measured height equals rendered height at seven widths.
- **T2.3**: every action re-parses through C18 to the intended `ParseResult`.
- **T2.4**: no rendered cell contains a token, code or secret value — a pattern scan across every fixture.
- **T2.5**: no emitted command could reveal a secret value — scanned against the manifest's flags.

### Tier 3 — edge cases

- **T3.1**: a token expiring in exactly 7 days and 1 day → the documented tone at each boundary.
- **T3.2**: a token with no expiry recorded → `valid · expiry unknown`, warn, not an assumed date.
- **T3.3**: forty teams → truncated with a count, never wrapping the row.
- **T3.4**: an email of 120 characters → truncated from the left, domain intact.
- **T3.5**: `/login` cancelled with `⌃c` → partial steps retained, no half-written credential.
- **T3.6**: `/login` with the callback port already in use → the error names the port and offers `--token`.
- **T3.7**: `/login --token=<code>` → the code never appears in the rendered output.
- **T3.8**: `/logout` when already signed out → a fact, not an error.
- **T3.9**: 200 secrets → all render; the block scrolls.
- **T3.10**: a secret name of 150 characters → truncated; the accessibility glyph survives.
- **T3.11**: every secret inaccessible → all rendered, none hidden, and the count in the rule header is unchanged.
- **T3.12**: at 79 columns → the absolute expiry moves to its own row.
- **T3.13**: at 60 columns — the narrowest the shell renders — the secrets table shows every column.

### Tier 4 — integration

- **T4.1** (with C22): the token state shown matches `session.health` at the same instant.
- **T4.2** (with C22): a successful `/login` updates the header within one frame.
- **T4.3** (with C22): `/login` after an auth failure re-runs the retained command (C22 §7).
- **T4.4** (with C20): a `/login --token=` invocation is redacted in history (C20 §3, positional rule).
- **T4.5** (with C23): every action is a fill; none is an `exec`.
- **T4.6** (with C10, C02): token states remain distinguishable at 1-bit by wording, not tone.

### Tier 5 — e2e

- **T5.1**: golden frames at 60 / 80 / 100 / 160 for all four verbs.
- **T5.2**: golden frames for the ten §6 states.
- **T5.3**: a real login flow → browser opens, callback lands, header updates.
- **T5.4**: login on a headless host → the manual fallback was visible from the start and works.
- **T5.5**: `/whoami` with the cluster unreachable → unverifiable, not valid.
- **T5.6**: `/secrets` for a job with one inaccessible binding → the failure is visible at a glance.

### Tier 6 — fail-on-revert

- **T6.1** (C3): collapsing unverifiable into valid → T1.4 and T5.5 fail, and an unreachable cluster reads as a healthy session.
- **T6.2** (C9): rendering an unreachable secret store as an empty list → T1.10 fails, and a missing binding reads as "none needed".
- **T6.3** (C8): hiding inaccessible secrets → T1.9 fails, and the diagnostic this verb exists for disappears.
- **T6.4** (C4): showing the manual fallback only after a browser failure → T1.5 fails, and headless users wait for a timeout to learn there was another way.
- **T6.5** (C6): dropping the untouched-items line from `/logout` → T1.7 fails, and logout is mistaken for a reset.
- **T6.6** (C12): offering a logout action → T1.11 fails, and a destructive command sits one keystroke from an expiry warning.
- **T6.7** (C2): showing only a relative expiry → T1.3 fails, and the absolute date gets computed by hand.
- **T6.8** (C11): truncating emails from the right → T3.4 fails, and every user reads as the same domain-less name.

---

## 11. Out of scope

| Not here | Where |
|---|---|
| Config keys and contexts | S14 |
| The OAuth flow itself | The far side (`j23`) |
| Secret values, ever | Nowhere — `j11` makes it a platform guarantee |
| Secret bindings and Vault paths | The far side |
| Header identity display | S01, from `session` |
| Token storage | The far side |
