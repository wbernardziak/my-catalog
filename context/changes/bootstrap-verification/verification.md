---
bootstrapped_at: 2026-05-30T19:32:03Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: my-catalog
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
---
starter_id: 10x-astro-starter
package_manager: npm
project_name: my-catalog
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---
```

MyCatalog is a small, after-hours web app MVP with email/password auth, a shared household catalog, and AI-assisted recommendation reasoning. 10x Astro Starter is the recommended JavaScript/TypeScript default for this product shape because it provides Astro, React, TypeScript, Supabase auth/PostgreSQL, and Cloudflare deployment in one opinionated stack. Supabase covers account and catalog data quickly, while the TypeScript-first app surface keeps LLM prompt/response contracts explicit. Cloudflare Pages is the starter default, and GitHub Actions with auto-deploy-on-merge keeps the delivery path simple for a solo MVP.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | skipped because the selected starter is cloned from GitHub, not created through an npm create package |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17T10:33:39Z | fresh | from card.docs_url |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 31408 project files, including installed dependencies
**Conflicts (.scaffold siblings)**: none
**.gitignore handling**: moved silently
**.bootstrap-scaffold cleanup**: deleted

CLI summary:

```text
added 778 packages, and audited 779 packages in 27s
10 vulnerabilities (9 moderate, 1 high)
```

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0

#### CRITICAL findings

None.

#### HIGH findings

- `devalue` `5.6.3 - 5.8.0`: GHSA-77vg-94rm-hx3p, Svelte devalue DoS via sparse array deserialization. Transitive. Fix available according to npm audit.

#### MODERATE findings

- `@astrojs/check` `>=0.9.3`: direct dependency affected through `@astrojs/language-server`. npm reports a semver-major fix path to `@astrojs/check@0.9.2`.
- `@astrojs/language-server` `>=2.14.0`: transitive via `volar-service-yaml`.
- `@cloudflare/vite-plugin` `<=0.0.0-fff677e35 || 0.0.7 - 1.37.2`: transitive via `miniflare`, `wrangler`, and `ws`.
- `miniflare` `<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260518.0`: transitive via `ws`.
- `volar-service-yaml` `<=0.0.70`: transitive via `yaml-language-server`.
- `wrangler` `<=0.0.0-kickoff-demo || 3.108.0 - 4.93.0`: direct dependency affected through `miniflare`.
- `ws` `8.0.0 - 8.20.0`: GHSA-58qx-3vcg-4xpx, uninitialized memory disclosure. Transitive. Fix available according to npm audit.
- `yaml` `2.0.0 - 2.8.2`: GHSA-48c2-rrv3-qjmp, stack overflow via deeply nested YAML collections. Transitive.
- `yaml-language-server` `1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0`: transitive via `yaml`.

#### LOW / INFO findings

None.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | first-class |
| quality_override | false |
| path_taken | standard |
| self_check_answers | null |
| team_size | solo |
| deployment_target | cloudflare-pages |
| ci_provider | github-actions |
| ci_default_flow | auto-deploy-on-merge |
| has_auth | true |
| has_payments | false |
| has_realtime | false |
| has_ai | true |
| has_background_jobs | false |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified.

Useful manual steps in the meantime:

- `git init` if you have not already, to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance; the full breakdown is in this log.
