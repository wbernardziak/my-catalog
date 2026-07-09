<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: LLM Recommendation Service Integration (F-01)

- **Plan**: context/changes/llm-recommendation-service/plan.md
- **Tryb**: Głęboki
- **Data**: 2026-07-09
- **Werdykt**: DO POPRAWY → SOLIDNY (po poprawkach)
- **Ustalenia**: 0 krytycznych, 2 ostrzeżenia, 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | OSTRZEŻENIE (F2 naprawione) |
| Oszczędne wykonanie | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE (F1, F4 naprawione) |
| Kompletność planu | OSTRZEŻENIE (F3 naprawione) |

## Ugruntowanie
Grounding: 5/5 ścieżek ✓, 3/3 symboli ✓ (astro:env/server, configStatuses/missingConfigs, envField), brief↔plan ✓. Blast radius: config-status.ts → tylko Layout.astro (banner), edycja addytywna. Progress↔Phase spójne (1.1–1.6, 2.1–2.4, 3.1–3.6).

## Ustalenia

### F1 — Vitest nie rozwiąże `astro:env/server` bez konfiguracji Astro

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 1 (vitest.config.ts) + Faza 3 (testy serwisu)
- **Szczegóły**: Serwis importuje `OPENROUTER_API_KEY` z `astro:env/server` — wirtualnego modułu generowanego przez Astro (CI robi `astro sync`). Zwykły `vitest run` nie przechodzi przez potok Vite Astro, więc import się nie rozwiąże i testy Fazy 3 nie ruszą. Plan pomijał wymaganą konfigurację.
- **Poprawka A ⭐ Zalecana**: vitest.config.ts przez `getViteConfig()` z `astro/config`
  - Siła: Rozwiązuje `astro:*` i alias `@/*` naraz; zachowuje wzorzec env z supabase.ts; udokumentowana ścieżka testów Astro.
  - Kompromis: Testy startują przez pełny potok Vite Astro — wolniejszy start.
  - Pewność: ŚREDNIA — standardowy wzorzec; nie zweryfikowany na Astro 6.
  - Martwy punkt: Kolejność `astro sync` przed `npm test` w CI.
- **Poprawka B**: Wstrzykuj klucz/model jako opcjonalny parametr recommend() z domyślną z env
  - Siła: Serwis czysty i testowalny bez potoku Astro.
  - Kompromis: Odbiega od wzorca env supabase.ts/config-status.ts.
  - Pewność: WYSOKA — iniekcja zależności zawsze działa w Vitest.
  - Martwy punkt: config-status.ts nadal importuje astro:env/server — spójność wzorca.
- **Decyzja**: NAPRAWIONE (Poprawka A) — Faza 1 nakazuje vitest.config.ts przez getViteConfig; Faza 3 używa `vi.mock("astro:env/server", …)`.

### F2 — Kryterium „npm test exits 0” zawiedzie przy zero testach

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Zgodność ze stanem końcowym
- **Lokalizacja**: Faza 1, kryterium 1.4
- **Szczegóły**: `vitest run` bez plików testowych kończy się kodem ≠ 0 („No test files found”), więc kryterium 1.4 w Fazie 1 zawiedzie jak napisane.
- **Poprawka**: Skrypt `"test": "vitest run --passWithNoTests"`.
- **Decyzja**: NAPRAWIONE — skrypt test zawiera `--passWithNoTests`.

### F3 — Niejednoznaczny kontrakt liczby graczy w `CandidateGame`

- **Waga**: 👁 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2, definicja typu CandidateGame
- **Szczegóły**: Kontrakt podawał `minPlayers`/`maxPlayers` „(lub playerCount)” — implementator musiałby zgadnąć; S-01/S-04 muszą pasować do wyboru.
- **Poprawka**: Ustal `minPlayers`+`maxPlayers` (zakres), usuń alternatywę playerCount.
- **Decyzja**: NAPRAWIONE — kontrakt ustala zakres min/max, oznaczony jako prowizoryczny.

### F4 — CI wyzwalane na `master`, a gałąź domyślna to `main`

- **Waga**: 👁 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3, kryterium 3.4
- **Szczegóły**: `ci.yml` wyzwala się na `branches: [master]`, ale repo jest na `main`; Faza 3 dodaje `npm test` i obiecuje „zielone w CI”, lecz na push/PR do `main` workflow się nie uruchamia.
- **Poprawka**: Zaktualizuj wyzwalacze ci.yml na `[main]` (lub `[main, master]`); umieść `npm test` po `astro sync`.
- **Decyzja**: NAPRAWIONE — Faza 3 nakazuje aktualizację wyzwalaczy i kolejność po astro sync.
