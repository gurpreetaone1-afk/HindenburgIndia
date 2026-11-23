#!/usr/bin/env bash
cd /opt/hindenburg/backend
# Dedicated feed process (pm2: hb-feed). It alone competes for `leader:feed`
# and runs the Zerodha / Infoway / Binance feeds, tick_loop (mdlive + pub/sub)
# and the risk enforcer on its own core, never sharing an event loop with HTTP
# requests. Not behind nginx: port 8001 only answers the deploy health check.
export RUN_FEED_LOOP=true
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8001 --workers 1
