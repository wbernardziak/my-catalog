<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: S-04 Played status, loan, and personal preference

- **Plan**: context/changes/played-loan-and-preference/plan.md
- **Zakres**: Fazy 1–4 z 4 (pełny plan)
- **Data**: 2026-07-22
- **Werdykt**: WYMAGA UWAGI → wszystkie 10 ustaleń rozwiązanych podczas sortowania (2026-07-22)
- **Ustalenia**: 0 krytycznych, 5 ostrzeżeń, 5 obserwacji

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Kryteria automatyczne (uruchomione 2026-07-22)

| Polecenie | Wynik |
|---|---|
| `npm run lint` | PASS |
| `npx vitest run` | PASS — 7 plików / 47 testów |
| `npm run build` | PASS — server built 11.31s |
| `npx tsc --noEmit` | FAIL (pre-existing, nie było kryterium planu) — patrz F9 |

Wszystkie 4 fazy: każdy zaplanowany kontrakt = MATCH, nic MISSING, żadna bariera
"What We Are NOT Doing" nie naruszona.

## Ustalenia

### F1 — Twarde usunięcie gry kasuje stan wszystkich członków bezpowrotnie

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: supabase/migrations/20260722092117_create_member_game_state.sql:22
- **Szczegóły**: `game_id ... references public.games (id) on delete cascade` w połączeniu z istniejącą polityką `authenticated can delete games ... using (true)` (20260710120000_create_games.sql:47) oznacza, że dowolna sesja authenticated może wykonać twarde DELETE na `games`, co kaskadowo usuwa `game_played`, a przez composite FK także `game_preference` — dla WSZYSTKICH członków. Aplikacja robi tylko soft-delete, więc to ścieżka poza kontraktem, ale RLS jej nie blokuje. Plan przewidywał kaskadę świadomie ("Migration Notes"), nie rozważając jednak, że polityka DELETE na `games` jest otwarta.
- **Poprawka A ⭐ Zalecana**: Udokumentuj kaskadę jako świadomą decyzję w komentarzu migracji + Migration Notes planu (soft delete jako jedyna sankcjonowana ścieżka).
  - Siła: Zero zmian schematu; plan już zakłada tę semantykę, a hard delete nie występuje w żadnej ścieżce kodu (`softDeleteGame` jest jedyną).
  - Kompromis: Ryzyko pozostaje realne, jeśli ktoś użyje Studio/PostgREST.
  - Pewność: WYSOKA — zweryfikowano brak wywołań hard delete w src/.
  - Martwy punkt: Nie sprawdzono, kto ma dostęp do Studio na prod.
- **Poprawka B**: Zmień na `on delete restrict` dla `game_played.game_id`.
  - Siła: Twardo blokuje przypadkową utratę danych na poziomie DB.
  - Kompromis: Nowa migracja + push na prod; hard delete gry staje się niemożliwy bez ręcznego czyszczenia stanu członków.
  - Pewność: ŚREDNIA — zmienia semantykę, którą plan jawnie zaprojektował.
  - Martwy punkt: Nie sprawdzono, czy S-06 planuje hard delete.
- **Decyzja**: FIXED via Fix A — komentarz DELIBERATE w migracji 20260722092117 + "Accepted risk" w Migration Notes planu

### F2 — Brak indeksu na member_id; listMemberState skanuje sekwencyjnie

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/memberGameState.ts:95-104
- **Szczegóły**: Obie kwerendy to `.eq("member_id", memberId)` bez limitu, wykonywane przy każdym renderze /catalog. Jedyny indeks na obu tabelach to `unique (game_id, member_id)` — kolumna wiodąca `game_id`, więc filtr po samym `member_id` go nie użyje i degraduje się do seq scan. Przy skali gospodarstwa domowego (PRD: data_volume small) nieszkodliwe, ale poprawka jest jednolinijkowa.
- **Poprawka**: Nowa migracja z `create index on public.game_played (member_id);` i analogicznie dla `game_preference` (+ push na prod).
- **Decyzja**: FIXED — indeksy member_id w migracji 20260722143000 (zastosowana lokalnie + push na prod)

### F3 — Kolumna updated_at jest martwa na obu nowych tabelach

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: migracja :25, :36 · src/lib/services/memberGameState.ts:39-41, :76-78
- **Szczegóły**: `updated_at timestamptz not null default now()` istnieje, ale nie ma triggera ani stempla w payloadzie upsertu — zmiana liked→disliked zostawia updated_at z chwili wstawienia. Niespójne z siostrzanym kodem z tej samej gałęzi: `setLoan` jawnie stempluje `updated_at: new Date().toISOString()` (src/lib/services/games.ts:145).
- **Poprawka**: Dodaj `updated_at: new Date().toISOString()` do payloadu upsertu w `setPreference` (i `setPlayed`), tak jak robi to `setLoan`.
- **Decyzja**: FIXED — `updated_at: new Date().toISOString()` w upsertach setPlayed/setPreference

### F4 — Brak klucza głównego na obu nowych tabelach

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: supabase/migrations/20260722092117_create_member_game_state.sql:20-38
- **Szczegóły**: Zdefiniowano tylko `unique (game_id, member_id)`; `games` używa `id uuid primary key`. Tabela bez PK ma REPLICA IDENTITY NOTHING, co psuje Supabase Realtime i payloady UPDATE/DELETE logicznej replikacji. Upserty działają, bo PostgREST akceptuje unique jako on_conflict. Plan literalnie określił `unique (...)`, więc to wierność planowi — ale plan był tu ubogi.
- **Poprawka**: W nowej migracji podnieś unique do `primary key (game_id, member_id)` na obu tabelach.
- **Decyzja**: FIXED — unique podniesione do primary key w migracji 20260722143000 (FK przepięty, push na prod)

### F5 — Guardrail-test GAME_NOT_FOUND_MESSAGE nie objął 3 nowych endpointów

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/pages/api/games/id-endpoints.test.ts:23-27
- **Szczegóły**: Test czyta `[id].ts` i `[id]/delete.ts` z dysku i sprawdza, że oba odwołują się do `GAME_NOT_FOUND_MESSAGE` — jawnie po to, "żeby przyszła edycja nie pozwoliła komunikatom się rozjechać". `played.ts` / `preference.ts` / `loan.ts` importują tę samą stałą, ale nie zostały dopisane do listy, więc guardrail pokrywa 2 z 5 endpointów.
- **Poprawka**: Dopisz trzy nowe ścieżki do tablicy endpointów w tym teście.
- **Decyzja**: FIXED — guardrail rozszerzony na played.ts / preference.ts / loan.ts (it.each, 5 endpointów)

### F6 — Przekierowania po toggle gubią aktywne filtry

- **Ważność**: 📝 OBSERWACJA
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/games/[id]/played.ts:49 · preference.ts:57 · loan.ts:52
- **Szczegóły**: Wszystkie trzy robią `context.redirect("/catalog")` bez query stringu. Toggle "played" przy aktywnym `?played=false&genre=Strategy` resetuje cały zestaw filtrów — i to boli właśnie teraz, bo przełączany wiersz jest dokładnie tym, którego filtr dotyczył. `delete.ts` zachowuje się tak samo (pre-existing), więc to kontynuacja wzorca, nie regresja. Plan literalnie mówił "PRG to /catalog".
- **Poprawka A ⭐ Zalecana**: Przekaż bieżący query string ukrytym polem formularza w GameCard i doklej go do celu redirectu.
  - Siła: Jawne, nie polega na nagłówku Referer; GameCard i tak renderuje się serwerowo ze znanymi filtrami.
  - Kompromis: Trzeba przekazać filtry do GameCard jako nowy prop.
  - Pewność: ŚREDNIA — wymaga zmiany w 4 plikach naraz.
  - Martwy punkt: Nie sprawdzono, czy `delete.ts` też powinien to dostać (spójność).
- **Poprawka B**: Odczytaj `request.headers.get("referer")` i przekieruj tam.
  - Siła: Zmiana tylko w 3 plikach routingu, zero zmian w UI.
  - Kompromis: Referer bywa pusty/ucięty; trzeba walidować własną domenę (open-redirect).
  - Pewność: ŚREDNIA — działa, ale wymaga ostrożnej walidacji.
  - Martwy punkt: Nie zweryfikowano Referrer-Policy tej aplikacji.
- **Decyzja**: FIXED via Fix A — ukryte pole `filters` w GameCard + `catalogRedirectTarget()` w gameFilters.ts, użyte we wszystkich redirectach 3 endpointów (+ 4 testy jednostkowe)

### F7 — Preferencje członka są czytelne dla każdego użytkownika authenticated

- **Ważność**: 📝 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: supabase/migrations/20260722092117_create_member_game_state.sql — polityki SELECT na obu tabelach
- **Szczegóły**: `using (true)` na SELECT to dokładnie to, co plan zamówił (read-all dla S-06), a zapis-własny jest poprawnie wymuszony — zweryfikowano, że członek NIE może zapisać cudzego wiersza (`member_id = auth.uid()` w `using` ORAZ `with check` na wszystkich INSERT/UPDATE/DELETE). Ale "read-all" znaczy tu "każdy authenticated użytkownik projektu Supabase", nie "domownik". `games` ma ten sam kształt, tyle że trzyma dane wspólne, a te tabele — osobistą historię lubię/nie lubię.
- **Poprawka**: Dopisz komentarz w migracji utrwalający założenie "gospodarstwo domowe == tenant"; predykat członkostwa dopiero przy wielotenantowości.
- **Decyzja**: FIXED — komentarz ASSUMPTION "gospodarstwo domowe == tenant" przy politykach SELECT

### F8 — Łapanie kodu 23503 jest kruche wobec przyszłych FK

- **Ważność**: 📝 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/memberGameState.ts:16, :80-85
- **Szczegóły**: Dziś bezpieczne: `game_preference` ma dokładnie jeden FK, więc 23503 jednoznacznie znaczy "jeszcze nie zagrane", a odmowa RLS (42501) i zły uuid (22P02) są poprawnie re-throwowane — nic realnego nie jest połykane. Ryzyko rezydualne: jeśli przyszła migracja doda drugi FK, prawdziwy błąd zostanie pokazany użytkownikowi jako "Mark the game as played first.".
- **Poprawka**: Nazwij constraint w migracji i dopasuj też po jego nazwie (`error.details` / `message`), nie tylko po kodzie SQLSTATE.
- **Decyzja**: FIXED — dopasowanie po nazwie constraintu `game_preference_game_id_member_id_fkey` obok SQLSTATE 23503

### F9 — tsc --noEmit nie przechodzi (types.test.ts brak deleted_at)

- **Ważność**: 📝 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: src/types.test.ts:10
- **Szczegóły**: `error TS2741: Property 'deleted_at' is missing ... required in type 'GameRow'`. Błąd jest pre-existing (sprzed tej zmiany, commit 719ba39), a plan nie wymieniał `tsc --noEmit` wśród kryteriów — lint, vitest i build przechodzą, więc Kryteria sukcesu = PASS. Ale faza 2 edytowała ten plik i przeszła obok.
- **Poprawka**: Dodaj `deleted_at: null` do literału `GameRow` w tym teście.
- **Decyzja**: FIXED — `deleted_at: null` w literale GameRow; `npx tsc --noEmit` przechodzi

### F10 — catalog.astro po cichu renderuje pusty katalog gdy user === null

- **Ważność**: 📝 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/pages/catalog.astro:26, :32
- **Szczegóły**: `if (supabase && user)` … `else if (!supabase)`. Gdy Supabase jest skonfigurowane, a `locals.user` jest null, żadna gałąź nie łapie: `configured` zostaje true, `loadError` null, strona pokazuje "No games yet. Add your first board game.". Nieosiągalne za middleware (PROTECTED_ROUTES), ale defensywna gałąź degraduje się do mylącego pustego stanu — endpointy w tej samej gałęzi robią to lepiej (redirect na /auth/signin).
- **Poprawka**: `return Astro.redirect("/auth/signin")` w gałęzi bez usera.
- **Decyzja**: FIXED (inaczej) — `return Astro.redirect()` we frontmatterze wywraca ESLint (@typescript-eslint/no-misused-promises, crash parsera .astro), więc zamiast redirectu gałąź bez usera ustawia loadError "Your session has expired. Please sign in again." — pusty katalog nie jest już mylący

## Uwagi końcowe

Implementacja jest wyjątkowo wierna planowi — wszystkie 4 fazy to MATCH we wszystkich
kontraktach, zero MISSING, zero naruszeń barier zakresu, wzorce endpointów/serwisów/
migracji odtworzone co do joty. Ustalenia dotyczą głównie rzeczy, których **plan nie
zamówił** (indeks na member_id, PK, trigger updated_at, rozszerzenie guardrail-testu)
— czyli luk w planie, nie w wykonaniu. Jedyne z realną stawką: F1 (kaskada przy hard
delete) i F6 (gubione filtry).

## Sortowanie (2026-07-22)

Wszystkie 10 ustaleń: NAPRAWIONE (F1 i F6 poprawką A; F10 wariantem — patrz jego decyzja).

Weryfikacja po naprawach:

| Polecenie | Wynik |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS (F9 usunęło pre-existing błąd) |
| `npx vitest run` | PASS — 7 plików / 55 testów (było 47) |
| `npm run build` | PASS |
| `npx supabase db reset` | PASS — 4 migracje aplikują się czysto |
| `npx supabase db push --linked` | 20260722143000 zastosowana na prod |
