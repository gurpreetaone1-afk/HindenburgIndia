#!/usr/bin/env bash
# Fail-safe deploy for the Hindenburg VPS (pm2: hb-backend, hb-user, hb-admin).
#
#   bash scripts/deploy.sh            deploy origin/main
#   bash scripts/deploy.sh rollback   go back to the release before the last deploy
#
# Build phase: frontends build into .next.build, backend gets an import check.
#   Any failure -> .next.build deleted, repo reset to the previous commit, exit 1.
#   The live .next and the running processes are never touched.
# Switch phase: .next -> .next.prev, .next.build -> .next, pm2 restart, then every
#   service is checked; a failed check rolls back automatically.
# Only the parts that changed since the last good deploy are rebuilt / restarted.
set -Eeuo pipefail

REPO=/opt/hindenburg
BRANCH=main
STATE="$REPO/.deploy"
FRONTENDS=(frontend-user frontend-admin)
declare -A PM2=([backend]=hb-backend [frontend-user]=hb-user [frontend-admin]=hb-admin)

mkdir -p "$STATE"
exec 9>"$STATE/lock"
if ! flock -n 9; then
  echo "another deploy is running" >&2
  exit 1
fi
exec > >(tee -a "$STATE/deploy.log") 2>&1
trap 'log "unexpected error at line $LINENO (exit $?)"' ERR

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() {
  log "FAIL: $*"
  exit 1
}

check_url() { # url expected-code — retries for up to 30 s (backend needs ~10 s to boot)
  local url=$1 want=$2 got='' i
  for ((i = 0; i < 30; i++)); do
    got=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url" || true)
    if [[ $got == "$want" ]]; then
      log "  ok  $url -> $got"
      return 0
    fi
    sleep 1
  done
  log "  BAD $url -> $got (want $want)"
  return 1
}

verify() {
  local bad=0
  log "verify"
  check_url http://127.0.0.1:8000/health 200 || bad=1
  check_url http://127.0.0.1:3000/ 200 || bad=1
  check_url http://127.0.0.1:3000/terminal 200 || bad=1
  check_url http://127.0.0.1:3001/ 307 || bad=1
  check_url http://127.0.0.1:3001/login 200 || bad=1
  return "$bad"
}

restart() {
  log "pm2 restart $1"
  pm2 restart "$1" >/dev/null
}

market_open() { # NSE cash session, Mon-Fri 09:15-15:30 IST
  # ponytail: exchange holidays not known — on a holiday set ALLOW_MARKET_RESTART=1
  local dow hm
  dow=$(TZ=Asia/Kolkata date +%u)
  hm=$(TZ=Asia/Kolkata date +%H%M)
  ((dow <= 5 && 10#$hm >= 915 && 10#$hm < 1530))
}

build_frontend() {
  local dir="$REPO/$1"
  rm -rf "$dir/.next.build"
  log "build $1"
  if ! (cd "$dir" && NEXT_DIST_DIR=.next.build nice -n 10 npm run build) >"$STATE/build-$1.log" 2>&1; then
    tail -30 "$STATE/build-$1.log"
    return 1
  fi
  if [[ ! -s $dir/.next.build/BUILD_ID ]]; then
    log "$1: no .next.build/BUILD_ID"
    return 1
  fi
  log "  $1 BUILD_ID $(cat "$dir/.next.build/BUILD_ID")"
}

# Put back the previous release: repo to $1, then restore each part in $2..
restore() {
  local sha=$1 p d
  shift
  git -C "$REPO" reset -q --hard "$sha"
  log "repo reset to $sha"
  for p in "$@"; do
    if [[ $p == backend ]]; then
      restart hb-backend
      continue
    fi
    d="$REPO/$p"
    if [[ ! -d $d/.next.prev ]]; then
      log "WARN: $p has no .next.prev to restore"
      continue
    fi
    rm -rf "$d/.next.failed"
    mv "$d/.next" "$d/.next.failed"
    mv "$d/.next.prev" "$d/.next"
    restart "${PM2[$p]}"
  done
}

deploy() {
  cd "$REPO"
  if [[ -n $(git status --porcelain) ]]; then
    git status --short
    die "uncommitted changes in $REPO — commit them first"
  fi
  local prev_sha live_sha new_sha back_sha files part f
  local changed=() built=()
  prev_sha=$(git rev-parse HEAD)
  live_sha=$(cat "$STATE/live_sha" 2>/dev/null || true)
  if [[ -n $live_sha ]] && ! git cat-file -e "$live_sha^{commit}" 2>/dev/null; then
    live_sha=''
  fi
  git fetch -q origin "$BRANCH"
  new_sha=$(git rev-parse "origin/$BRANCH")
  if ! git merge-base --is-ancestor "$prev_sha" "$new_sha"; then
    die "HEAD has commits that are not on origin/$BRANCH — push them first (deploy would drop them)"
  fi
  back_sha=${live_sha:-$prev_sha} # what a rollback returns to: the code that is live now
  log "deploy $prev_sha -> $new_sha (live: ${live_sha:-unknown})"

  if [[ -n $live_sha ]]; then
    files=$(git diff --name-only "$live_sha" "$new_sha")
    for part in backend "${FRONTENDS[@]}"; do
      if grep -q "^$part/" <<<"$files"; then
        changed+=("$part")
      fi
    done
  else
    changed=(backend "${FRONTENDS[@]}") # first run: what is live is unknown, do everything
  fi
  if ((${#changed[@]} == 0)); then
    git reset -q --hard "$new_sha"
    echo "$new_sha" >"$STATE/live_sha"
    log "nothing to rebuild — live is up to date"
    return 0
  fi
  log "changed: ${changed[*]}"
  if [[ " ${changed[*]} " == *" backend "* ]] && market_open && [[ ${ALLOW_MARKET_RESTART:-0} != 1 ]]; then
    die "backend changed but the market is open — not restarting the trading backend (ALLOW_MARKET_RESTART=1 to override)"
  fi

  # ---- build phase: nothing live is touched ----
  git reset -q --hard "$new_sha"
  # ponytail: no auto npm/pip install — a new dependency fails the build safely;
  # install it by hand, then deploy again.
  local failed=''
  for part in "${changed[@]}"; do
    if [[ $part == backend ]]; then
      log "backend import check"
      if ! (cd "$REPO/backend" && .venv/bin/python -c 'import app.main' >"$STATE/build-backend.log" 2>&1); then
        tail -30 "$STATE/build-backend.log"
        failed=backend
        break
      fi
    elif build_frontend "$part"; then
      built+=("$part")
    else
      failed=$part
      break
    fi
  done
  if [[ -n $failed ]]; then
    for f in "${FRONTENDS[@]}"; do
      rm -rf "${REPO:?}/$f/.next.build"
    done
    git reset -q --hard "$prev_sha"
    die "$failed failed to build — live untouched, repo back at $prev_sha"
  fi

  # ---- switch phase ----
  printf 'ROLLBACK_SHA=%q\nDEPLOYED_SHA=%q\nPARTS=%q\nPREV_LIVE=%q\n' \
    "$back_sha" "$new_sha" "${changed[*]}" "$live_sha" >"$STATE/last"
  for f in "${built[@]}"; do
    rm -rf "${REPO:?}/$f/.next.prev"
    mv "$REPO/$f/.next" "$REPO/$f/.next.prev"
    mv "$REPO/$f/.next.build" "$REPO/$f/.next"
    restart "${PM2[$f]}"
  done
  if [[ " ${changed[*]} " == *" backend "* ]]; then
    restart hb-backend
  fi

  if verify; then
    echo "$new_sha" >"$STATE/live_sha"
    log "DEPLOYED $new_sha"
    return 0
  fi
  log "verify failed — rolling back to $back_sha"
  restore "$back_sha" "${changed[@]}"
  rm -f "$STATE/last"
  if verify; then
    die "deploy of $new_sha rolled back; $back_sha is live again"
  fi
  die "deploy of $new_sha rolled back but services are STILL unhealthy — check pm2 logs"
}

rollback() {
  if [[ ! -f $STATE/last ]]; then
    die "nothing to roll back (no previous deploy recorded)"
  fi
  local ROLLBACK_SHA DEPLOYED_SHA PARTS PREV_LIVE
  # shellcheck source=/dev/null
  source "$STATE/last"
  ROLLBACK_SHA=${PREV_LIVE:-$ROLLBACK_SHA}
  log "rollback $DEPLOYED_SHA -> $ROLLBACK_SHA ($PARTS)"
  if [[ " $PARTS " == *" backend "* ]] && market_open && [[ ${ALLOW_MARKET_RESTART:-0} != 1 ]]; then
    die "rollback restarts the backend but the market is open (ALLOW_MARKET_RESTART=1 to override)"
  fi
  # shellcheck disable=SC2086 # PARTS is a space-separated list
  restore "$ROLLBACK_SHA" $PARTS
  rm -f "$STATE/last"
  # live = whatever was live before that deploy (unknown -> next deploy rebuilds everything)
  if [[ -n $PREV_LIVE ]]; then
    echo "$PREV_LIVE" >"$STATE/live_sha"
  else
    rm -f "$STATE/live_sha"
  fi
  if verify; then
    log "ROLLED BACK — $ROLLBACK_SHA is live (run deploy again to roll forward)"
    return 0
  fi
  die "rolled back but services are unhealthy — check pm2 logs"
}

main() {
  case "${1:-deploy}" in
    deploy) deploy ;;
    rollback) rollback ;;
    *)
      echo "usage: bash scripts/deploy.sh [rollback]" >&2
      exit 2
      ;;
  esac
}

# One line: bash has parsed it before git reset rewrites this file mid-run.
main "$@"; exit $?
