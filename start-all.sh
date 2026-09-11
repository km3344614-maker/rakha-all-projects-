#!/bin/bash
set -e

echo "Starting Rakha Auth"

# Only start Discord bot when configured
if [ -n "${DISCORD_BOT_TOKEN:-}" ] && [ "${DISCORD_BOT_TOKEN}" != "YOUR_TOKEN" ] && [ -f bot/bot.py ]; then
  echo "Starting Discord bot..."
  (cd bot && python bot.py) &
else
  echo "Discord bot skipped (DISCORD_BOT_TOKEN not set)"
fi

exec node server.js
