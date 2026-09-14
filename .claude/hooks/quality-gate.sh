#!/usr/bin/env bash
# Local edit-loop gate for the agent turn (test-plan §3 Phase 5, §5).
#
# Registered on the Stop event, which takes no matcher and therefore fires on
# every turn — including one that only answered a question. The two guards below
# are what keep that cheap, and their ORDER is load-bearing.
#
# Exit 2 is counter-intuitive: on a Stop hook it does not halt the agent, it
# *prevents the agent from stopping* and hands stderr back as the reason, so the
# agent keeps working with the failure in front of it. Exit 0 lets it stop.
#
# Communicates only through exit codes and stderr. Never stdout: Claude Code
# parses hook stdout as JSON only when it starts with "{", so anything a shell
# profile prints first would silently void the decision.

INPUT=$(cat)

# Guard 1 — the eight-block cap. MUST come first, before the tree check and
# before any command runs. Claude Code overrides a Stop hook that blocks eight
# times in a row; if this check came second, a genuinely broken tree would burn
# eight full agent turns and then be overridden anyway.
#
# node, not jq: node is already a hard prerequisite of this repo and jq is not.
# Exits 0 only when the flag is literally true; malformed input fails safe by
# falling through to the gate rather than silently disabling it.
if printf '%s' "$INPUT" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{process.exit(JSON.parse(d).stop_hook_active===true?0:1)}catch{process.exit(1)}})'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Guard 2 — nothing changed, nothing to gate. This is why a question-answering
# turn costs nothing. It also means a turn ending in a commit runs no gate: the
# commit hook already graded that content.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

if ! OUT=$(npm run typecheck 2>&1); then
  printf 'Quality gate: typecheck failed\n%s\n' "$OUT" >&2
  exit 2
fi

if ! OUT=$(npm test 2>&1); then
  printf 'Quality gate: unit suite failed\n%s\n' "$OUT" >&2
  exit 2
fi

exit 0
