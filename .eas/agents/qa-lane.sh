#!/usr/bin/env bash
# One QA Swarm lane. From the Expo QA Swarm guide, with two changes:
# - The evidence site stays private: no --deploy-alias, so nothing goes to
#   Expo Hosting. The built site is in agent-output/evidence/site and is
#   uploaded with the job artifacts.
# - eas-cli is pinned to the version in eas.json (cli.version), because a
#   newer eas-cli refuses to run in this project.
set -euo pipefail

: "${BUILD_ID:?No build. Check the build or repack job of this run.}"
: "${PLATFORM:?No platform. Set PLATFORM to ios in the lane job.}"
: "${FLOW:?No flow. Set FLOW to the name of a file in .eas/qa-flows.}"

FLOW_FILE=".eas/qa-flows/$FLOW.$PLATFORM.md"
[ -f "$FLOW_FILE" ] || FLOW_FILE=".eas/qa-flows/$FLOW.md"
[ -f "$FLOW_FILE" ] || { echo "No flow file for $FLOW. Add .eas/qa-flows/$FLOW.md." >&2; exit 1; }

source .eas/agents/start-session.sh "$PLATFORM" "$BUILD_ID" "QA Swarm: $PLATFORM $FLOW" qa-swarm

{
  cat .eas/agents/qa-lane.md
  printf '\n## Flow\n\n'
  cat "$FLOW_FILE"
  printf '\n'
  cat agent-output/device.md
} > agent-output/prompt.md

env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN \
  timeout 15m bash .eas/agents/run-agent.sh agent-output/prompt.md device || true

[ -s agent-output/evidence/verdict.md ] || echo 'FAIL: The agent did not write a verdict.' > agent-output/evidence/verdict.md
VERDICT=$(head -n 1 agent-output/evidence/verdict.md)

# Stops the session and builds the evidence site locally. No deploy.
env -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN -u CLAUDE_CODE_OAUTH_TOKEN -u ANTHROPIC_API_KEY \
  -u CODEX_API_KEY -u CURSOR_API_KEY -u XAI_API_KEY \
  npx --yes eas-simulator-evidence@0.2.4 run agent-output/evidence --stop \
  --subject "QA Swarm: $PLATFORM $FLOW" --verdict-file agent-output/evidence/verdict.md \
  --build-id "$BUILD_ID" --eas-cli-version 25.3.0 || echo "The evidence site was not built. The screenshots and the agent log are still in the artifacts." >&2

set-output verdict "$VERDICT"

case "$VERDICT" in
  PASS:*) exit 0 ;;
  *) exit 1 ;;
esac
