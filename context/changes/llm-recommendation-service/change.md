---
change_id: llm-recommendation-service
title: LLM recommendation service integration
status: implemented
created: 2026-07-09
updated: 2026-07-09
roadmap_ref: F-01
---

# LLM recommendation service integration

Foundation F-01 from `context/foundation/roadmap.md`. Wire a thin, well-guarded
server-side OpenRouter recommendation service — env-managed secret, a typed and
Zod-validated prompt/response contract that constrains suggestions to catalog games
supplied by the caller, and the NFR guardrails (minimum household data in the prompt,
5s-bounded latency, an explicit failure state instead of a fabricated recommendation).

Unlocks S-05 (`ai-play-recommendation`). No user-facing UI and no DB coupling in this
change — the service ranks caller-supplied candidate games.

PRD refs: FR-007, FR-008, NFR (5s latency, minimum-data prompts, explicit AI failure state).
