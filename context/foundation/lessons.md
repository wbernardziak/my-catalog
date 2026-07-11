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
