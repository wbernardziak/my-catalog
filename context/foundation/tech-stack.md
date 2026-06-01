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

## Why this stack

MyCatalog is a small, after-hours web app MVP with email/password auth, a shared household catalog, and AI-assisted recommendation reasoning. 10x Astro Starter is the recommended JavaScript/TypeScript default for this product shape because it provides Astro, React, TypeScript, Supabase auth/PostgreSQL, and Cloudflare deployment in one opinionated stack. Supabase covers account and catalog data quickly, while the TypeScript-first app surface keeps LLM prompt/response contracts explicit. Cloudflare Pages is the starter default, and GitHub Actions with auto-deploy-on-merge keeps the delivery path simple for a solo MVP.
