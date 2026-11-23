#!/usr/bin/env bash
# Runs Claude Code without a person. From the Expo agentic-workflows setup guide,
# with eas-cli pinned to the version in eas.json (cli.version) and only the
# agent-device controller allowed (this repo does not use Argent).
set -euo pipefail

case "$2" in
  device) tools='Read,Glob,Grep,Write,Bash(npx --yes eas-cli@25.3.0 simulator:exec npx --yes agent-device@latest *)' ;;
  change) tools='Read,Glob,Grep,Edit,Write,Bash(npx tsc --noEmit)' ;;
  *)
    echo "Unknown mode \"$2\". Use device or change." >&2
    exit 1
    ;;
esac

mkdir -p agent-output/evidence
npx --yes @anthropic-ai/claude-code@latest -p "Do the task that standard input describes." \
  --allowedTools "$tools" --permission-mode dontAsk --max-turns 80 \
  --output-format stream-json --verbose < "$1" > agent-output/evidence/agent-log.jsonl || {
  tail -n 1 agent-output/evidence/agent-log.jsonl >&2
  exit 1
}
