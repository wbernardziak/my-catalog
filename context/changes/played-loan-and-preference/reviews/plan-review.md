<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: S-04 Played status, loan, and personal preference

- **Plan**: context/changes/played-loan-and-preference/plan.md
- **Tryb**: Głęboki
- **Data**: 2026-07-21
- **Werdykt**: DO POPRAWY → **SOLIDNY** (po sortowaniu: wszystkie 4 ustalenia naprawione)
- **Ustalenia**: 1 krytyczne, 3 ostrzeżenia, 0 obserwacji

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędne wykonanie | OSTRZEŻENIE |
| Dopasowanie architektoniczne | OSTRZEŻENIE |
| Martwe punkty | OSTRZEŻENIE |
| Kompletność planu | NIEZALICZONY |

## Ugruntowanie
8/8 ścieżek ✓, PROTECTED_ROUTES zawiera /catalog ✓ (memberId gwarantowany w catalog.astro), mapRowToCandidateGame ma 1 callera (types.test.ts) ✓, brief↔plan ✓. Potwierdzone: projekt nie ma infry mockowania Supabase (`src/pages/api/games/id-endpoints.test.ts` dokumentuje "no handler mock exists in this project"); house-style faz w `context/archive/*/plan.md` używa `- ` w blokach faz, `- [ ]` tylko w Progress.

## Ustalenia

### F1 — Phase-body Success Criteria używają `- [ ]` (duplikat sekcji Progress)

- **Waga**: ❌ KRYTYCZNE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Kompletność planu (mechaniczny kontrakt Progress)
- **Lokalizacja**: Fazy 1–4, bloki `#### Automated Verification:` / `#### Manual Verification:` (linie 73-79, 138-144, 184-189, 229-237)
- **Szczegóły**: Bloki faz zawierają checkboxy `- [ ]`, a te same pozycje są w `## Progress` (1.1–4.6). Kanoniczny kontrakt: stan checkboxów żyje wyłącznie w `## Progress`; bloki faz mają zwykłe `- `. Potwierdzone na house-style — wszystkie ukończone plany w `context/archive/*/plan.md` używają `- ` w fazach i `- [ ]` tylko w Progress. Podwójne źródło prawdy myli /10x-implement przy zaznaczaniu postępu.
- **Poprawka**: Zamień `- [ ]` na `- ` we wszystkich blokach Success Criteria faz; zostaw `## Progress` bez zmian.
- **Decyzja**: NAPRAWIONE (poprawka zastosowana)

### F2 — Testy jednostkowe serwisów dotykających DB kontra "brak mocków" w projekcie

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — realny wybór strategii testów; zatrzymaj się
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2, kryterium "Unit tests pass" (2.2)
- **Szczegóły**: 2.2 wymaga unit-testów dla `setPlayed` (cascade-clear), `setPreference` (played-guard) i `listCatalogGames` (merge+filter) — wszystkie łańcuchują wywołania Supabase. Projekt nie ma infry mockowania: `src/pages/api/games/id-endpoints.test.ts` dokumentuje "No Astro context or handler mock (none exists in this project)... covered by manual checks". Istniejące testy to funkcje czyste (gameFilters, types, recommendations) i guardrale na stringach. Cascade/guard na Supabase nie są unit-testowalne bez mocka wbrew konwencji.
- **Poprawka A ⭐ Zalecana**: Wydziel czyste jądro merge+filter (games + Set<played> + Map<preference> + filters → CatalogGame[]) do osobnej funkcji i unit-testuj ją; cascade-clear i played-guard weryfikuj krokiem manualnym/Studio.
  - Siła: Zgodne z konwencją "no DB mock"; pokrywa faktyczną logikę decyzyjną (w tym filtr "not played") jak gameFilters.test.ts.
  - Kompromis: cascade-clear/played-guard tylko manualnie w Fazie 2.
  - Pewność: WYSOKA — potwierdzone przez id-endpoints.test.ts i brak service DB-testów.
  - Martwy punkt: Brak — konwencja jasno udokumentowana.
- **Poprawka B**: Dodaj lekki mock klienta Supabase i testuj serwisy wprost.
  - Siła: Realnie testuje cascade/guard w automatyzacji.
  - Kompromis: wprowadza wzorzec mockowania, którego repo świadomie unika — nowa infra; ryzyko proliferacji.
  - Pewność: ŚREDNIA — wykonalne, ale wbrew ustalonej konwencji.
  - Martwy punkt: kształt mocka łańcucha PostgREST niezweryfikowany.
- **Decyzja**: NAPRAWIONE (poprawka A)

### F3 — Composite FK game_preference→game_played wymusiłby FR-005 w DB

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — realny kompromis projektowy; przemyśl
- **Wymiar**: Dopasowanie architektoniczne
- **Lokalizacja**: Faza 1 (schema) + Faza 2 (setPlayed cascade)
- **Szczegóły**: Plan wymusza "preferencja tylko dla zagranych" i kaskadowe czyszczenie w warstwie aplikacji (setPlayed(false) usuwa dwa wiersze). Ponieważ `game_played` ma `unique (game_id, member_id)`, `game_preference` mogłoby mieć FK złożony `(game_id, member_id) references game_played on delete cascade`. Wtedy: (a) odznaczenie played automatycznie kasuje preferencję (zero logiki app-layer); (b) niemożliwe "disliked bez played" (chroni statystyki S-06). Wciąż dwie osobne tabele — zgodne z decyzją użytkownika.
- **Poprawka A ⭐ Zalecana**: Dodaj złożony FK z ON DELETE CASCADE.
  - Siła: Niezmiennik FR-005 wymuszony w DB; kaskada za darmo; mniej kodu w setPlayed.
  - Kompromis: setPreference musi wstawiać dopiero po istnieniu wiersza played (i tak to robi); insert bez played → błąd FK zamiast miękkiego {ok:false}.
  - Pewność: WYSOKA — unique key istnieje, FK trywialny.
  - Martwy punkt: mapowanie błędu FK na przyjazny komunikat "mark as played first".
- **Poprawka B**: Zostaw kaskadę w warstwie aplikacji (jak w planie).
  - Siła: Prostsze tabele bez zależności; pełna kontrola nad komunikatem błędu.
  - Kompromis: niezmiennik trzyma się tylko poprawności kodu; przyszła ścieżka może zostawić sierotę-preferencję i zafałszować S-06.
  - Pewność: WYSOKA — to obecny plan.
  - Martwy punkt: Brak.
- **Decyzja**: NAPRAWIONE (poprawka A)

### F4 — Endpoint loan jest read-modify-write, niespójny z idempotentnym played

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąska
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 2 (`toggleLoan`) + Faza 3 (endpoint loan)
- **Szczegóły**: Endpoint `played` posta stan docelowy (`z.enum(["true","false"])`) — idempotentny. Endpoint `loan` ("no body; toggleLoan czyta bieżący i odwraca") jest read-modify-write: dwie rundy do DB i nieidempotentny — karta w drugiej zakładce po kliknięciu odwróci loan wbrew intencji. Wzorzec desired-state z `played` rozwiązuje oba.
- **Poprawka**: Niech endpoint loan też posta stan docelowy (`loanStatus` available/loaned przez zod); `setLoan(supabase, id, status)` zamiast odczyt-i-odwróć — jedna runda, idempotentny, spójny z `played`.
- **Decyzja**: NAPRAWIONE (poprawka zastosowana)
