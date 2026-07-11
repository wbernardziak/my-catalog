<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Edit and Archive Board Games

- **Plan**: context/changes/edit-and-archive-games/plan.md
- **Tryb**: Głęboki
- **Data**: 2026-07-10
- **Werdykt**: DO POPRAWY → SOLIDNY (po poprawkach: F1, F2, F3 naprawione)
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 0 obserwacji

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędne wykonanie | OSTRZEŻENIE |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE |
| Kompletność planu | OSTRZEŻENIE |

## Ugruntowanie

Grounding: 5/5 ścieżek ✓, 8/8 symboli ✓, brief↔plan ✓. Progress↔Faza: 3/3 fazy dopasowane, wszystkie kryteria sukcesu zmapowane na wpisy Progress ✓.

Zweryfikowane bezpośrednio wobec kodu:
- `games` schema bez `deleted_at`; polityki RLS `authenticated` `update`/`delete` z `using (true)` już istnieją (`supabase/migrations/20260710120000_create_games.sql`) → soft-delete (UPDATE `deleted_at`) dozwolony bez migracji polityk.
- `newGameSchema` i `parseAuthors` eksportowane z `src/pages/api/games/index.ts` ✓.
- `listGames` zwraca obecnie wszystkie wiersze (`.select("*").order(created_at desc)`), jedyny konsument: `catalog.astro` ✓.
- Formularz jest KONTROLOWANY (`FormField` z `value`/`onChange`, stan `useState`) → prefill dla trybu edit wykonalny. `loanStatus` to realny `<select>` ✓.
- `AddGameForm` importowany tylko przez `catalog.astro` (promień rażenia zawężony) ✓.
- `PROTECTED_ROUTES = ["/dashboard","/catalog"]` z `startsWith` ✓; `/api/games/...` nie jest gate'owane middleware → endpointy self-check `locals.user`.

## Ustalenia

### F1 — Zduplikowane atrybuty `id` w DOM przy dwóch zamontowanych GameForm

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3 — komponent `GameForm` / `GameCard`
- **Szczegóły**: `AddGameForm.tsx` używa statycznych, zakodowanych na sztywno `id`: `FormField id="title"|"genre"|"authors"|...`, `<select id="loanStatus">` z `<label htmlFor="loanStatus">`, oraz `<datalist id="genre-suggestions">`. Plan renderuje współdzielony `GameForm` JEDNOCZEŚNIE w trybie create w `aside` (zawsze zamontowany) i w trybie edit w karcie (gdy `editing === true`). Wtedy w DOM istnieją dwa `id="title"`, dwa `id="loanStatus"`, dwa `htmlFor="loanStatus"` i dwa `<datalist id="genre-suggestions">`. Kliknięcie `<label>` w formularzu edycji ustawia fokus na polu formularza dodawania (wygrywa pierwsze dopasowanie); powiązanie datalist niejednoznaczne. Kontrakt `GameForm` nie wspomina o unikalności `id`. POST działa (natywne wysłanie używa `name`), więc to defekt UX/a11y — ale przy KAŻDEJ edycji.
- **Poprawka**: Dodaj do `GameForm` prefiks `id` per instancja (np. `idPrefix` z `mode`+`game.id`) i użyj go dla każdego `FormField id`, `select id`/`htmlFor` oraz `datalist id` i odpowiadającego `list=`. Zapisz to jawnie w kontrakcie propsów `GameForm` w Fazie 3.
- **Decyzja**: NAPRAWIONE (Napraw w planie)

### F2 — `getGame` jest specyfikowane, ale nieużywane w tym slice (dead code)

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 1 (pkt 3) ↔ Faza 2 (kontrakty endpointów)
- **Szczegóły**: Faza 1 dodaje `getGame(supabase, id)` z uzasadnieniem „Used by endpoints to detect not-found before mutating". Kontrakty endpointów w Fazie 2 nigdy nie wołają `getGame` — update woła `updateGame(...)` i sprawdza `null`, delete woła `softDeleteGame(...)` i sprawdza `false`. Mechanizm not-found opiera się na `.select().maybeSingle()` z guardem `.is("deleted_at", null)` wewnątrz mutacji, więc `getGame` nie ma konsumenta. To zbędny kod ORAZ wewnętrzna sprzeczność (uzasadnienie przeczy Fazie 2).
- **Poprawka**: Usuń `getGame` z tego slice (YAGNI). Jeśli zachowany dla przyszłego UI — popraw uzasadnienie na „dostępne dla UI w razie potrzeby" i usuń fałszywe „used by endpoints to detect not-found".
- **Decyzja**: NAPRAWIONE (Napraw inaczej — zachowano getGame, poprawiono uzasadnienie na „dla UI w razie potrzeby", jawnie zaznaczono, że endpointy go nie wołają)

### F3 — Kryterium 2.3 zakłada test handlera, dla którego nie ma wzorca w bazie kodu

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2 — kryterium automatyczne 2.3 + Testing Strategy
- **Szczegóły**: 2.3 zakłada unit test ścieżki not-found (`updateGame`→`null` / `softDeleteGame`→`false` → komunikat redirectu). Wymaga to wywołania handlera `POST` z zamockowanym `createClient`, kontekstem Astro (`params`, `cookies`, `locals.user`, `redirect`) i zamockowaną usługą. Istniejący `index.test.ts` celowo testuje tylko czyste funkcje (`parseAuthors`, `newGameSchema`) — komentarz mówi „…the way the POST handler feeds them", tzn. nie testuje handlera. S-01 nie ustanowił wzorca testu endpointu z mockami. Jak napisano, 2.3 albo się rozrośnie, albo zostanie po cichu zdegradowane.
- **Poprawka A ⭐ Zalecana**: Zmień zakres 2.3 na to, co testowalne jako czysta logika — wyodrębnij komunikat not-found do współdzielonej stałej i przetestuj ją, plus test helpera `fromRow(game)`. Not-found nadal weryfikowane manualnie w 2.6/2.8.
  - Siła: Zero nowej maszynerii mockującej; zgodne ze stylem „testuj czyste funkcje" z S-01; not-found pokryte manualnie.
  - Kompromis: Logika rozgałęzienia handlera nie pokryta testem automatycznym.
  - Pewność: WYSOKA — `index.test.ts` jawnie unika testowania handlera.
  - Martwy punkt: Brak znaczących.
- **Poprawka B**: Ustanów wzorzec testu handlera — zamockuj `@/lib/supabase` `createClient` i `@/lib/services/games`, zbuduj minimalny kontekst Astro, asertuj `Location` redirectu.
  - Siła: Realne pokrycie rozgałęzienia null/false → komunikat; wielokrotnego użytku dla przyszłych endpointów.
  - Kompromis: Nowy wzorzec mockowania (kontekst Astro + createClient) — wysiłek nieujęty w szacunku „~1–2 sesje"; ryzyko rozrostu.
  - Pewność: ŚREDNIA — wykonalne, ale nietrywialne przy SSR Cloudflare.
  - Martwy punkt: Kształt mocka `context.redirect`/`cookies` niezweryfikowany.
- **Decyzja**: NAPRAWIONE (Poprawka A)
