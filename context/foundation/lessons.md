# Lessons Learned

> Rejestr tylko do dodawania powtarzających się reguł i wzorców. Odczytywany ponownie na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Push migrations to production as the final step

- **Context**: Any change/phase that adds a Supabase migration under supabase/migrations/ (database schema work).
- **Problem**: Local migrations don't reach production automatically. Skipping the push leaves the prod schema behind (e.g. games.deleted_at + its index were live locally but missing from prod), which breaks deployed app code that depends on the new schema.
- **Rule**: After a local migration is added and tested, always run `npx supabase db push --linked` to apply it to production. Treat it as the required last step of any migration work.
- **Applies**: implement, impl-review

## Create GitHub issues and a dedicated branch after plan-review

- **Context**: The handoff after /10x-plan-review approves a plan and before /10x-implement begins, for any reviewed change under context/changes/<change-id>/.
- **Problem**: Without it, reviewed work starts with no GitHub issues (progress invisible/untracked) and commits land on the default branch instead of an isolated branch.
- **Rule**: After /10x-plan-review approves a plan, create a GitHub tracking issue plus one issue per phase (label enhancement) and create a dedicated feat/<change-id> branch before starting implementation.
- **Applies**: plan-review, implement

## Sync git and GitHub issues around /10x-archive

- **Context**: Running /10x-archive on a change whose work lived on a feat/<change-id> branch with a GitHub tracking issue + per-phase issues.
- **Problem**: Archiving without syncing leaves the tracker and local git out of step — the tracking/phase issues stay open, and you can be left sitting on a stale, already-merged feature branch.
- **Rule**: When /10x-archive is triggered, first fetch the latest from the branch and close/update the change's GitHub tracking issue and per-phase issues (referencing the merged PR). After archiving, switch back to the main branch.
- **Applies**: archive

## Log every non-2xx branch a route returns

- **Context**: Any handler under src/pages/api/ whose failures reach the user through a client island that collapses them into one generic message — the recommendation route and its `RecommendationFlow` panel are the worked example.
- **Problem**: A route can be careful about *what* it returns and still be undiagnosable. `POST /api/recommendations` had four distinct non-2xx branches (503 not-configured, 401 no-session, 400 bad body/criteria, 500 catalog read) that all returned silently, and its 500 branch used a bare `catch {}` that discarded the exception outright. The island renders every one of them as "Something went wrong. Please try again.", so a failure observed in the browser on 2026-09-14 left *nothing* in the server log and could not be attributed afterwards. The service layer below it logged every silent drop; the route wrapping it logged nothing — the discipline stopped at the boundary where it was most needed.
- **Rule**: Every non-2xx return from an API route logs which branch produced it, and any `catch` that turns an exception into a response passes that exception to the log rather than dropping it. Separately, never report an unresolvable dependency as a user error: a session that could not be *resolved* (auth backend erroring) is a retryable 503, not a 401 telling the caller their session expired — a page can redirect to signin on that ambiguity, a JSON route cannot. Carry the distinction explicitly (`locals.sessionUnresolved`) instead of collapsing both into `user: null`.
- **Applies**: plan, implement, impl-review
