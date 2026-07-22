# Zerodha Dual-Account HA Failover — Implementation Plan

**Status:** READY TO IMPLEMENT (off-market only). Not started.
**Author prep date:** 2026-07-15
**Owner ask (operator SANWARIYASETH):**
- Normal: **Account A = NSE + BSE**, **Account B = MCX**.
- If **B** has an issue → **A** streams everything (NSE/BSE **+ MCX**).
- If **A** has an issue → **B** streams everything (NSE/BSE + MCX).
- **Data must NEVER stop.** Always safe, bidirectional failover.
- Build it "ache se", test it, then deploy — **must stay safe forever**.

---

## 0. CRITICAL scope clarification (read first)

Two DIFFERENT problems are easy to conflate. This plan is about **#1 only**:

1. **HA failover (data never stops)** — THIS PLAN. Achievable in the *current single-process* feed with a routing + health + takeover layer. Safe, incremental.
2. **CPU/latency (~1s option-chain lag at peak)** — SEPARATE, bigger track (Phase 2, §11). The exchange split does **NOT** reduce CPU in the current design, because **both accounts already run in ONE process on ONE event loop / one core** (`main.py:644` single `tick_loop`; `zerodha_service.py` A & B run-loops both write the same `ticks_by_token`). Splitting exchanges across A/B only changes *which WS* receives a tick — all tick *processing* still happens in the one `tick_loop` on one core. True multi-core needs multi-PROCESS (Python GIL), which is Phase 2.

**Tell the operator plainly:** this feature guarantees *uptime/failover*, not *speed*. During a failover (one account carrying all tokens) prices may be slightly laggier but **will keep flowing** — that is the correct trade (data > speed).

---

## 1. Current state (verified in code)

| Area | Reality | Ref |
|---|---|---|
| Account model | One `ZerodhaSettings` doc per `account_index` (0=A, 1=B). **No per-exchange field.** `enabledSegments` is global on/off per account, not routing. | `models/zerodha_settings.py:53-79`; `_get_settings` `zerodha_service.py:215-229` |
| Token→account routing | **Least-loaded across pool entries** — NOT exchange-based, NOT "A then B overflow". | `_ws_subscribe` `zerodha_service.py:2218-2260` |
| WS cap | `MAX_TOKENS_PER_WS=3000`, `MAX_WS_CONNECTIONS=1`. Overflow-spawn capped at 1; B added out-of-band via `_account_b_ws_connect`. | `zerodha_service.py:99-100, 533-553, 2360-2368` |
| Shared state | A & B run-loops both write `ticks_by_token`/`ticks_by_symbol`, one process, one loop. | `_handle_parsed_ticks` `zerodha_service.py:2005-2093` |
| Health/self-heal | Reconnects each account with **its own** creds. **No failover.** B self-heal gated behind A being up. | `ws_self_heal_loop` `zerodha_service.py:2900-3000` (B: 2967-2983) |
| Teardown | `_stop_ticker` is **all-or-nothing** — `disconnect(account)` kills BOTH sockets + whole token map. | `zerodha_service.py:2511-2541` |
| Admin API | `/zerodha/*` per-account via `account` query param; WS-control routes are pool-wide (no account). | `api/v1/admin/zerodha.py` |
| Admin UI | Account A/B tabs (`activeAccount`); B is "WS/token only", instruments UI gated to A. | `frontend-admin/app/(admin)/zerodha/page.tsx:78, 461-478` |
| Auto-login | Scheduler iterates BOTH accounts (`for account_index in [0,1]`); WS-verify only for A. Currently FAILING at `totp_submit` (Kite CAPTCHA / bot-detection, not a TOTP-secret bug). | `zerodha_auto_login_scheduler.py:403-425`; `zerodha_auto_login.py` totp flow 792-872 |

**Net:** the dual-WS plumbing exists (B can coexist in the pool), but there is **no exchange routing and no failover**. Those are what we add.

---

## 2. Design overview

Add a **routing + health + failover controller** on top of the existing dual-WS pool. All in the single feed-leader process.

```
                        exchange_routing (config, per exchange -> desired account)
                                   |
   token needs subscribe --> resolve_target_account(token.exchange)
                                   |
                    +--------------+--------------+
                    |                             |
             account A healthy?            (failover) route to the
             route to A's WS entry         OTHER healthy account's WS
```

Core idea: **routing is a function of (a) the token's exchange, (b) each account's live health.** When the desired account is DOWN, its exchanges resolve to the surviving account. When it recovers, they resolve back.

### 2.1 Exchange → account map (new config)
- Default: `{ NSE: A, BSE: A, BFO: A, NFO: A, MCX: B, ... }` — i.e. **A=NSE/BSE (+ their F&O NFO/BFO), B=MCX (+ MCX F&O)**.
- Note: option/future exchanges must map with their cash exchange — NIFTY options are `NFO`, SENSEX options are `BFO`, MCX futures/options are `MCX`. Map by Kite exchange code, not our SegmentType.
- Stored so super-admin can edit in UI (§6).

### 2.2 Health signal (upgrade from today's `connected` flag)
Today self-heal only checks the `connected` boolean. For failover we need a **stronger, tick-based health** per account:
- `account_healthy(idx)` = WS entry for that account's api_key is `connected` **AND** has produced at least one tick within `HEALTH_STALE_SEC` (e.g. 15s during market hours).
- Track `last_tick_at_by_account[idx]` — stamp it in `_handle_parsed_ticks` keyed by which pool entry (api_key) delivered the tick.
- A `connected`-but-silent socket (Kite half-open, token throttle) must count as UNHEALTHY so failover fires.

### 2.3 Failover controller (new loop, ~2-5s cadence, feed-leader only)
Pseudocode:
```
for each account idx in (A, B):
    healthy[idx] = account_healthy(idx)

for each exchange ex in routing map:
    desired = routing[ex]                 # A or B
    if healthy[desired]:
        target = desired                  # normal
    elif healthy[other(desired)]:
        target = other(desired)           # FAILOVER
    else:
        target = desired                  # both down: keep desired, self-heal handles reconnect
    ensure all subscribed tokens of exchange `ex` are on target's WS entry
    (move = unsubscribe from old entry + subscribe on target entry, only if changed)
```
- **Debounce / anti-flap:** require a health state to persist `FAILOVER_CONFIRM_SEC` (e.g. 5s down before failing over, 20-30s healthy before failing back) so a brief blip doesn't thrash re-subscriptions.
- **Idempotent:** only move tokens whose current WS entry != target. A steady healthy state does nothing.

### 2.4 Capacity during failover (real constraint, currently fine)
- Kite hard cap = **3000 tokens per WS**. In a full failover ALL tokens land on ONE account's single WS.
- Current total subscribed ≈ **1350** (well under 3000) → a full failover **fits comfortably today**. ✅
- Safeguard for the future: if `total_subscribed > 3000` at failover time, subscribe in priority order — **open-position tokens + protected/watchlist + MRU first** (reuse `trim_subscriptions_lru`'s protection set). Log the dropped count (never silently truncate).

---

## 3. Data model changes

**File:** `backend/app/models/zerodha_settings.py`
- Add a **global routing config** (NOT per-account). Options:
  - (a) New tiny model `ZerodhaFeedRouting` (singleton doc): `exchange_account_map: dict[str,int]` (e.g. `{"NSE":0,"BSE":0,"NFO":0,"BFO":0,"MCX":1}`), `failover_enabled: bool=True`, `failover_confirm_down_sec:int=5`, `failback_confirm_up_sec:int=25`, `health_stale_sec:int=15`.
  - (b) OR store the map on the account-0 `ZerodhaSettings` doc as `exchange_routing: dict[str,int] | None`.
- **Recommend (a)** — cleaner separation, one document, easy admin CRUD.
- No change to `SubscribedInstrument` (already carries `exchange`, which the router keys on).

---

## 4. Backend changes — `zerodha_service.py`

1. **Per-account tick timestamp:** in `_handle_parsed_ticks` (2005-2093) or `_ws_run_loop` (1918-2003), stamp `self._last_tick_at_by_api_key[entry.api_key] = now`. Add helper `account_healthy(account_index)`.

2. **Account-scoped teardown (fix the all-or-nothing gap):** add `disconnect_account_ws(account_index)` that removes ONLY that account's pool entry (by api_key), cancels its run-loop task, and reassigns/orphans its tokens — WITHOUT calling `_stop_ticker` (2511-2541). Needed so a failed account can be torn down/reconnected without killing the survivor. (`_account_b_ws_connect` already does a partition keep/drop at 542-545 — generalise that.)

3. **Exchange-aware subscribe:** add `resolve_target_account(exchange) -> account_index` (reads the routing map + health). Modify `_ws_subscribe` (2218-2260) so that instead of pure least-loaded, it first picks the **target account's** pool entry for the token's exchange, and only least-loads *within* that account's entries. Token→exchange comes from the `SubscribedInstrument` / instrument cache (already available).
   - Keep a safe fallback: if target account has no healthy entry, use the other account (that IS the failover).

4. **Failover controller loop:** new `feed_failover_loop(interval_sec≈3)` implementing §2.3. Feed-leader only. Moves tokens between account entries when health/routing dictates. Anti-flap debounce.

5. **Upgrade self-heal** (`ws_self_heal_loop` 2900-3000): remove the "B only when A up" gating (2966) so **each account self-heals independently** (both must be able to recover on their own for true HA). Keep per-account credential reconnect.

---

## 5. Feed wiring — `backend/app/main.py`

- In `_feed_leader_main` (422-653): register the new `feed_failover_loop` as a supervised subtask (alongside self-heal / trim), under the `leader:feed` gate. Stop it cleanly on leadership loss.
- Account B boot (490-497) stays; ensure both A and B are spawned at boot when both have valid tokens.

---

## 6. Admin API + UI

**API — `backend/app/api/v1/admin/zerodha.py`** (new routes, super-admin):
- `GET /zerodha/routing` → current exchange→account map + failover config + live health snapshot (`{A:{healthy,last_tick_age}, B:{...}, active_routes:{NSE:A,...,MCX:B}}`).
- `PUT /zerodha/routing` → update map + failover knobs.

**UI — `frontend-admin/app/(admin)/zerodha/page.tsx`:**
- Add a **"Feed Routing & Failover"** card (super-admin):
  - Per-exchange assignment: NSE→[A], BSE→[A], NFO→[A], BFO→[A], MCX→[B] (dropdowns).
  - Live status pills: **Account A: HEALTHY (last tick 0.4s)** / **Account B: HEALTHY** — red when unhealthy.
  - **Active routing indicator:** shows CURRENT effective routing (highlights when a failover is active, e.g. "⚠ MCX failed over → Account A").
  - Failover toggle + debounce seconds (advanced).
- Keep existing A/B tabs; clarify labels from "Secondary (+3000 tokens)" to **"Account B — MCX feed"** and A to **"Account A — NSE/BSE feed"**.
- Responsive, matches existing card styling.

**API client — `frontend-admin/lib/api.ts`:** add `ZerodhaAPI.routing()` / `updateRouting(body)`.

---

## 7. Auto-login for BOTH accounts (+ fix the CAPTCHA failure)

- Scheduler already iterates both accounts (`zerodha_auto_login_scheduler.py:403-425`) — but **WS-verify runs only for A** (335-374). Extend WS-verify (or at least a lightweight "did B's WS come up?" check) to Account B too, so a failed B auto-login is noticed.
- **Operator wants MANUAL login** for now → ensure the admin UI supports connecting **each** account's `request_token` independently (already does via `connect-with-token?account=`). Add a clear "Account A logged in ✓ / Account B logged in ✓" status so the operator can't forget one.
- **CAPTCHA failure** (`totp_submit`, "Invalid CAPTCHA", 16 fails since 13 Jul): this is Kite bot-detecting the headless Playwright login. Mitigation already present is `playwright_stealth` (654-680). Separate remediation task (out of failover scope): verify stealth is actually loading in prod, consider a non-headless/persistent-profile run, or fall back to manual for now. **Manual login is the safe interim — HA failover does not depend on auto-login working.**

---

## 8. Constraints & honest trade-offs (put in front of operator)

1. **Failover = uptime, not speed.** One account carrying all tokens is back to single-core processing → mild lag, but data flows. Recovers when the down account returns.
2. **3000/WS cap** — fine today (~1350 tokens). If subscriptions ever exceed 3000, failover keeps the *critical* tokens (positions/watchlist/MRU) and logs drops.
3. **Both accounts down** = no feed (unavoidable — that is a Zerodha-side outage). Self-heal keeps retrying both. Consider a non-Zerodha fallback only for indices if ever needed (out of scope).
4. **Daily token rotation ×2** — both accounts need a fresh token daily (~08:00 IST expiry). Manual = 2 logins; auto = fix CAPTCHA. UI must show both statuses to prevent "forgot Account B".
5. **This is feed-core** — MUST be built + tested off-market. Never deploy untested to a live market.

---

## 9. Test plan (OFF-MARKET, mandatory before any live deploy)

Run against a non-market window (weekend / after 15:30 IST) with both accounts connected:
1. **Normal routing:** confirm NSE/BSE tokens land on A's WS, MCX tokens on B's WS (`GET /zerodha/ws-pool` + routing endpoint). Prices flow on both.
2. **B failure → A takeover:** kill B's WS (disconnect B / revoke B token). Within `FAILOVER_CONFIRM_SEC`, MCX tokens must re-subscribe onto A's WS and MCX prices must keep updating. Verify NO gap > a few seconds; verify open MCX positions keep live P&L + stop-out works.
3. **A failure → B takeover:** kill A's WS. NSE/BSE + MCX all flow via B. Verify.
4. **Recovery / failback:** bring the killed account back. After `FAILBACK_CONFIRM_UP_SEC`, its exchanges route back to it. Verify no flapping (toggle health rapidly → routing must NOT thrash).
5. **Both down:** verify graceful (no crash, self-heal retries, clear UNHEALTHY status in UI).
6. **Capacity:** artificially push >3000 tokens, force failover, confirm priority-subscribe keeps positions/watchlist and logs the drop count.
7. **Restart safety:** restart marginplant-feed, confirm both accounts reconnect and routing restores.
8. **Regression:** stop-out timing (overruns), option-chain price freshness, order fills — all unchanged in normal mode.

---

## 10. Rollout steps

1. Operator creates a **2nd Kite Connect app** (same Zerodha account) → gets Account B `api_key`/`api_secret`; sets its redirect URL to `.../admin/zerodha/callback`.
2. Deploy backend + admin build to a **staging/off-market** window.
3. Configure routing (A=NSE/BSE, B=MCX) in the new UI; connect both accounts (manual login).
4. Run the full §9 test plan.
5. Only after all tests pass → keep it running; monitor over the next live session (watch `zerodha_account_*` logs, ws-pool, overruns).
6. Rollback: routing config has a `failover_enabled=false` + "single account (A) all exchanges" kill-switch to instantly revert to today's behaviour.

---

## 11. Phase 2 (SEPARATE, optional) — multi-process for CPU/latency

Only if peak CPU (single core) keeps causing ~1s lag after §1 + strike-count tuning + LRU trim:
- Run each account's feed in its **own process** (own core) — true multi-core. Requires: per-account feed-leader election (`leader:feed:A`, `leader:feed:B`), each running its own `tick_loop` for its exchanges, both writing the shared `mdlive:{token}` (token-keyed, reader-agnostic). Cross-process failover coordinated via Redis health keys.
- Bigger, riskier — do AFTER HA failover (§1) is stable. Keep as a documented future track.
- Near-term peak relief WITHOUT this: lower admin "strikes around ATM" (fewer subscribed tokens, no restart) + tighten LRU trim `keep_count` at market close.

---

## 12. File-change checklist (for implementation day)

- [ ] `backend/app/models/zerodha_settings.py` (or new `zerodha_feed_routing.py`) — routing config model + register in Beanie `database.py`.
- [ ] `backend/app/services/zerodha_service.py` — per-account tick timestamp + `account_healthy`; `disconnect_account_ws`; `resolve_target_account`; exchange-aware `_ws_subscribe`; `feed_failover_loop`; independent self-heal.
- [ ] `backend/app/main.py` — register `feed_failover_loop` subtask in `_feed_leader_main`.
- [ ] `backend/app/api/v1/admin/zerodha.py` — `GET/PUT /zerodha/routing` + health snapshot.
- [ ] `frontend-admin/lib/api.ts` — routing API methods.
- [ ] `frontend-admin/app/(admin)/zerodha/page.tsx` — Routing & Failover card + live health pills + relabel A/B tabs.
- [ ] (optional) `zerodha_auto_login_scheduler.py` — B WS-verify.
- [ ] Tests / manual §9 checklist.

**Deploy:** backend `git pull && sudo systemctl restart marginplant-feed` (+ `marginplant-backend` for API routes) ; admin `npm run build && pm2 restart marginplant-admin`. **Off-market only.**
