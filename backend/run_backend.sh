#!/usr/bin/env bash
cd /opt/hindenburg/backend
# HTTP / WebSocket service (pm2: hb-backend) — 5 workers on the 8-core VPS
# (KVM 8 since 2026-11-23). RUN_FEED_LOOP=false: none of these workers runs the
# live feed; the Zerodha / Infoway / Binance feeds, tick fan-out and risk
# enforcer live in the separate hb-feed process (run_feed.sh), so request load
# can never stall prices. Every other background loop is `_leader_only` and
# runs once across all processes; workers serve quotes from Redis `mdlive`.
# Leaves ~2 cores for Mongo / Redis / nginx / the two Next.js apps.
export RUN_FEED_LOOP=false
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 5
