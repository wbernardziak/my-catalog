<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Filter the board-game catalog

- **Plan**: context/changes/filter-catalog/plan.md
- **Zakres**: Faza 1–2 z 2 (pełny plan)
- **Data**: 2026-07-11
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

**Kryteria sukcesu** (automatyczne): `npm run build` ✅, `npm run lint` ✅, `npm test` ✅ (35/35), `npx prettier --check` ✅. Ręczne (2.5–2.11) oznaczone jako ukończone w Progress.

**Podsumowanie**: Wierna implementacja. Wszystkie 5 zmian Fazy 1 (typ `GameFilters`, wybaczający parser `parseGameFilters`, semantyka predykatu, filtrowalne `listGames`, `listGenres`) oraz 3 zmiany Fazy 2 (`CatalogFilters.astro`, wpięcie strony, rozdzielone stany pustki) zgodne z kontraktem. Zero plików spoza planu. Bariery zakresu (brak `played`, brak migracji, brak client-side/sortowania) przestrzegane. Zapytania parametryzowane przez PostgREST, `/catalog` chroniony w `PROTECTED_ROUTES`, błędy DB opakowane w try/catch.

## Ustalenia

### F1 — maxMinutes: input formularza bez max="6000"

- **Ważność**: 🔷 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/catalog/CatalogFilters.astro:57-66
- **Szczegóły**: Parser ogranicza maxMinutes do 1–6000; input "Party of" ma symetryczny max="99" zgodny z parserem, ale input "Max minutes" ma tylko min="1". Wartość >6000 przechodzi walidację HTML, parser ją po cichu odrzuca, a pole wraca puste po Apply — drobna niespójność UX między dwoma polami liczbowymi.
- **Poprawka**: Dodaj max="6000" do inputu maxMinutes, aby dopasować granicę parsera i zachować symetrię z polem players.
- **Decyzja**: FIXED — dodano `max="6000"` (CatalogFilters.astro:63).

### F2 — listGames + listGenres jako dwa sekwencyjne awaity

- **Ważność**: 🔷 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Bezpieczeństwo i jakość (wydajność)
- **Lokalizacja**: src/pages/catalog.astro:24-25
- **Szczegóły**: Dwa niezależne zapytania wykonywane po kolei (dwa round-tripy na render). Przy skali "small" to nieistotne — plan wprost uznaje wydajność za non-concern. Odnotowane wyłącznie dla świadomości.
- **Poprawka**: (opcjonalnie) Promise.all([listGames(...), listGenres(...)]).
- **Decyzja**: FIXED — zrównoleglono przez `Promise.all` (catalog.astro:24).

### F3 — class:list={string} zamiast class={string}

- **Ważność**: 🔷 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/catalog/CatalogFilters.astro:29,30,52,65,71
- **Szczegóły**: `class:list` przyjmuje stały string i działa poprawnie, ale jedyne inne użycie w repo (Banner.astro:11) stosuje `class:list` do tablicy — idiomatyczny przypadek. Dla statycznego stringa `class={...}` jest konwencjonalną formą Astro. Czysto kosmetyczne.
- **Poprawka**: Zamień class:list={inputClass} na class={inputClass} (i analogicznie labelClass), by pasowało do idiomu Astro.
- **Decyzja**: REJECTED — ustalenie nietrafne dla tego repo. Reguła ESLint `astro/prefer-class-list-directive` jest włączona i wymusza `class:list`; próbna zmiana na `class={...}` wygenerowała 8 ostrzeżeń lintera. Oryginalny kod był zgodny z konwencją projektu. Zmiana wycofana.
