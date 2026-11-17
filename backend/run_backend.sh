#!/usr/bin/env bash
cd /opt/hindenburg/backend
# 3 worker processes on the 4-core VPS (1 core left for Mongo / Redis / nginx /
# Next). One worker wins the `leader:feed` lock and runs the Zerodha/Infoway
# feed, tick fan-out and risk enforcer; every other background loop is
# `_leader_only` too, and non-leader workers serve quotes from Redis `mdlive`.
# A single process pinned one core at ~100% in market hours and queued every
# request behind the feed.
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 3
