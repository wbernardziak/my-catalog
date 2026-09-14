# MyCatalog

MyCatalog is a shared board-game shelf for a household. It keeps track of the games you own, what is currently on loan, what each member has played and liked, and helps answer: **what should we play tonight?**

Built as an Astro SSR application, MyCatalog uses Supabase for authentication and data storage. Its optional AI recommendation flow uses OpenRouter to rank games from the household's own catalog.

## Features

- Shared authenticated catalog: add, edit, filter, and softly delete board games.
- Game details: title, authors, genre, supported player count, and average play time.
- Loan tracking, so the household can see which games are unavailable.
- Per-member play history and like/dislike preferences.
- Preference statistics across household members.
- AI-assisted game-night recommendations based on player count, available time, genre, and recorded preferences. Recommendations are restricted to games already in the catalog.
- Email/password authentication, protected application routes, and selectable themes.

## Technology

- [Astro](https://astro.build/) 6 with server-side rendering
- [React](https://react.dev/) 19 islands for interactive UI
- [TypeScript](https://www.typescriptlang.org/) and [Tailwind CSS](https://tailwindcss.com/) 4
- [Supabase](https://supabase.com/) Auth and PostgreSQL with row-level security
- [OpenRouter](https://openrouter.ai/) for optional AI recommendations
- [Cloudflare Workers](https://workers.cloudflare.com/) deployment target

## Prerequisites

- Node.js 22.14.0 (see `.nvmrc`)
- npm
- Docker and the Supabase CLI for a local database, or an existing Supabase project
- An OpenRouter API key if you want to enable AI recommendations

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment files for Astro and local Cloudflare development:

   ```bash
   cp .env.example .env
   cp .env.example .dev.vars
   ```

3. Configure the required Supabase values in both files:

   ```dotenv
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_KEY=<supabase-anon-key>
   ```

   To enable recommendations, also provide:

   ```dotenv
   OPENROUTER_API_KEY=<openrouter-api-key>
   # Optional; defaults to openai/gpt-4o-mini
   OPENROUTER_MODEL=<model-id>
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open the local URL shown by Astro, create an account, and add games from the **Catalog** page.

## Local Supabase

The repository includes migrations for the shared `games` catalog and per-member `game_played` and `game_preference` state. To use a local Supabase stack:

```bash
npx supabase start
```

Copy the URL and anon key printed by the CLI into `.env` and `.dev.vars`. The migrations in `supabase/migrations/` are applied when a fresh local stack starts. Stop it with:

```bash
npx supabase stop
```

The local project is deliberately named `my-catalog` and uses ports `54330`–`54339`; its Studio is normally available at `http://localhost:54333`.

## Available commands

| Command             | Description                                        |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | Start the development server.                      |
| `npm run build`     | Build the production Cloudflare Worker bundle.     |
| `npm run preview`   | Preview the production build.                      |
| `npm run typecheck` | Run TypeScript checks.                             |
| `npm run lint`      | Run ESLint.                                        |
| `npm test`          | Run the unit and integration test suite.           |
| `npm run test:db`   | Run database and RLS tests against local Supabase. |
| `npm run format`    | Format supported files with Prettier.              |

Before submitting application changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Project structure

```text
src/
├── components/       # Astro and React interface components
├── layouts/          # Shared page layout
├── lib/              # Supabase client, services, and helpers
├── pages/            # Routes and API handlers
│   └── api/          # Authentication, games, theme, and recommendation endpoints
├── middleware.ts     # Session resolution and route protection
└── types.ts          # Shared domain and API types
supabase/migrations/  # Database schema and RLS policies
```

## Security and data model

All catalog, play-history, and preference data requires authentication. The catalog is shared by authenticated household members; play history and preferences are stored per member. Supabase row-level security backs these rules, so client requests cannot bypass them.

`SUPABASE_URL`, `SUPABASE_KEY`, and `OPENROUTER_API_KEY` are server-only secrets. Do not expose them in client-side code or commit `.env` or `.dev.vars`.

## Deployment

MyCatalog is configured for Cloudflare Workers:

```bash
npm run build
npx wrangler deploy
```

Set `SUPABASE_URL`, `SUPABASE_KEY`, and, if recommendations are enabled, `OPENROUTER_API_KEY` as Cloudflare secrets. `OPENROUTER_MODEL` is optional.

## License

MIT
