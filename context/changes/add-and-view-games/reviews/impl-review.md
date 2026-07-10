<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Add and View Board Games

- **Plan**: context/changes/add-and-view-games/plan.md
- **Zakres**: Wszystkie fazy (1–3 z 3)
- **Data**: 2026-07-10
- **Werdykt**: ZAAKCEPTOWANY (z jedną drobną uwagą)
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS (lint ✓ build ✓ 21 testów ✓) |

## Podsumowanie

Implementacja wiernie odwzorowuje plan we wszystkich trzech fazach (migracja + RLS,
typy/DTO/mapper, serwis katalogu, endpoint form-POST, middleware, formularz-wyspa,
strona katalogu, link z dashboardu). Brak nieplanowanych plików źródłowych; wszystkie
bariery "What We're NOT Doing" przestrzegane (brak `deleted_at`, `played`, `preference`,
filtrowania, enuma gatunków). Testy jednostkowe zod + mappera obecne. Wszystkie
zautomatyzowane kryteria sukcesu przechodzą lokalnie. Endpoint API dodał opakowanie
`try/catch` wokół `createGame` ponad plan — sensowne wzmocnienie.

## Ustalenia

### F1 — Ścieżka odczytu katalogu bez obsługi błędów (asymetria z zapisem)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność)
- **Lokalizacja**: src/pages/catalog.astro:14-18
- **Szczegóły**: `listGames(supabase)` jest wywoływane bez `try/catch`, a serwis rzuca
  wyjątek przy każdym błędzie Supabase (games.ts:15-17). Jeśli SELECT zawiedzie (błąd
  przejściowy, zła konfiguracja RLS), renderowanie SSR strony rzuci wyjątek → surowe
  500 bez stanu awaryjnego. Ścieżka ZAPISU (index.ts:71-75) świadomie łapie błąd i
  przekierowuje z przyjaznym komunikatem; ścieżka ODCZYTU tego nie robi. Plan wymagał
  jedynie obsługi null-klienta, więc to nie jest odchylenie od planu — to realna,
  drobna luka niezawodności i niespójność z własnym wzorcem tej zmiany.
- **Poprawka**: Owiń `listGames(supabase)` w `try/catch`; przy błędzie zostaw `games`
  puste i ustaw lokalny komunikat błędu renderowany stylem stanu "Supabase not
  configured" (lub przekazany do `<ServerError>`).
- **Decyzja**: FIXED (napraw teraz — try/catch + banner błędu w catalog.astro)

### F2 — Brak górnych granic dla pól liczbowych

- **Ważność**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (integralność danych)
- **Lokalizacja**: src/pages/api/games/index.ts:33-35, supabase/migrations/20260710120000_create_games.sql:18-20
- **Szczegóły**: `minPlayers`/`maxPlayers`/`avgPlayMinutes` mają tylko dolne
  ograniczenia (zod `.min(1)`/`.positive()`, DB `check (... >= 1)`). Nic nie blokuje
  wartości absurdalnych (np. 999999). W modelu zaufanego gospodarstwa domowego to małe
  ryzyko, ale mogłyby zaśmiecić przyszłe UI rekomendacji (S-05) matchujące po zakresie
  graczy i czasie gry.
- **Poprawka**: Dodaj rozsądne górne granice (np. `.max(99)` graczy, `.max(6000)` minut)
  w schemacie zod, opcjonalnie odzwierciedlone checkiem w DB.
- **Decyzja**: FIXED (napraw teraz — .max(99) graczy / .max(6000) minut w zod)
