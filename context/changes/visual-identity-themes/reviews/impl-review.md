<!-- IMPL-REVIEW-REPORT -->

# Przegląd implementacji: Board-game visual identity with theme selection

- **Plan**: `context/changes/visual-identity-themes/plan.md`
- **Zakres**: Fazy 1–5 z 5 (pełny plan)
- **Data**: 2026-08-01
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 2 obserwacje

## Werdykty

| Wymiar                  | Werdykt     |
| ----------------------- | ----------- |
| Zgodność z planem       | OSTRZEŻENIE |
| Dyscyplina zakresu      | OBSERWACJA  |
| Bezpieczeństwo i jakość | PASS        |
| Architektura            | OSTRZEŻENIE |
| Spójność wzorców        | OSTRZEŻENIE |
| Kryteria sukcesu        | PASS        |

## Weryfikacja

Wszystkie 25 wierszy `#### Automated` uruchomione ponownie w trakcie przeglądu: starter strings (brak), LibBadge/template.png (brak), blok `.dark` (brak), `npm run lint:colors` (0 literałów w 65 plikach), krok CI obecny, `npm run lint` PASS, `npm test` 12 plików / 103 testy PASS, `npm run build` PASS. Zero wierszy `#### Manual` odhaczonych — brak podpisywania na ślepo.

Zakres git: 7 commitów, 44 pliki zmienione względem `main`. Weryfikacja wykonana bezpośrednio, bez pod-agentów.

## Ustalenia

### F1 — Przełącznik używa JS wbrew kontraktowi fazy 4

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: `src/components/ThemeSwitcher.astro:52` vs `plan.md:288`
- **Szczegóły**: Kontrakt fazy 4 mówi „one submit button per theme, **no JavaScript**, matching the JS-free PRG toggles in GameCard". Wysłany kod ma `<script is:inline>` z `addEventListener("change")`. Zmiana na wyraźne życzenie użytkownika (dropdown), sensowna i z `<noscript>` fallbackiem — ale plan i `change.md: implemented` opisują kontrakt, którego kod nie spełnia. Endpoint i cookie nietknięte.
- **Poprawka A ⭐ Zalecana**: Zaktualizuj kontrakt fazy 4 w planie jako aneks.
  - Siła: Plan wraca do roli źródła prawdy; zachowuje zamówioną pracę. Commit 4802b28 zawiera już uzasadnienie.
  - Kompromis: Plan staje się dokumentem żywym po zamknięciu implementacji.
  - Pewność: WYSOKA — decyzja świeża i jednoznaczna.
  - Martwy punkt: Brak znaczących.
- **Poprawka B**: Wróć do trzech przycisków (revert 4802b28).
  - Siła: Ścisła zgodność z zatwierdzonym planem.
  - Kompromis: Cofa zmianę zamówioną przez użytkownika.
  - Pewność: WYSOKA — czysty revert.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F2 — Punchboard nadpisuje utility po nazwie klasy

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔬 WYSOKI — stawka architektoniczna; pomyśl dokładnie przed decyzją
- **Wymiar**: Architektura
- **Lokalizacja**: `src/styles/global.css` — blok `.theme-punchboard :is(...)` oraz `[class*="shadow"]`
- **Szczegóły**: Motyw sięga do wewnętrznych nazw klas Tailwinda zamiast do tokenów. Skutki uboczne: (1) `animate-spin rounded-full` w `SubmitButton.tsx:22` i `RecommendationFlow.tsx:175` staje się wirującym kwadratem — czyta się jak usterka; (2) `[class*="shadow"]` złapie także `shadow-none`, wymuszając cień tam, gdzie autor prosił o jego brak; (3) każdy nowy komponent z `rounded-*` zostanie po cichu przestylowany. Przegląd planu przewidział ryzyko nadpisań radius/shadow przy fazie 5 — zmaterializowało się od strony „zbyt szeroko", nie „zbyt wąsko".
- **Poprawka A ⭐ Zalecana**: Zawęź selektory — `:not(.animate-spin)` przy regule promienia, `[class*="shadow-"]:not([class*="shadow-none"])` przy cieniu.
  - Siła: Usuwa wirujący kwadrat i przypadek `shadow-none` bez ruszania 20 komponentów; kilka linii w jednym pliku.
  - Kompromis: Selektory nadal oparte na nazwach klas — kruchość mniejsza, ale obecna.
  - Pewność: WYSOKA — oba przypadki potwierdzone w kodzie.
  - Martwy punkt: Nie przejrzano wizualnie wszystkich 21 kombinacji motyw×ekran.
- **Poprawka B**: Przenieś cień i promień do ról tokenowych (`--shadow`, `--radius`), komponenty czytają tokeny.
  - Siła: Motyw przestaje wiedzieć cokolwiek o Tailwindzie; spójne z resztą architektury zmiany.
  - Kompromis: Dotyka każdego komponentu z `shadow-*`/`rounded-*` — kolejny przelot po ~20 plikach.
  - Pewność: ŚREDNIA — czyste docelowo, zakres zbliżony do fazy 3.
  - Martwy punkt: Czy shadcn-owe `shadow-xs` da się wyrazić tokenem bez forka `button.tsx`.
- **Decyzja**: PENDING

### F3 — Dwie nazwy na jedną rolę: `--ink-muted` i `--muted-foreground`

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: `src/styles/global.css:36-37`, `:97-98`, `:155-156`
- **Szczegóły**: Obie role mają identyczne wartości we wszystkich trzech motywach, definiowane niezależnie. Użycie: `text-ink-muted` 39×, `text-muted-foreground` 0×. Przy następnej korekcie kontrastu ktoś zmieni jedną z nich i motyw rozjedzie się po cichu.
- **Poprawka**: Zostaw `--ink-muted` jako źródło, zdefiniuj `--muted-foreground: var(--ink-muted)` w każdym bloku motywu.
- **Decyzja**: PENDING

### F4 — Dwa pliki zmienione poza listą planu

- **Ważność**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: `src/components/Banner.astro`, `eslint.config.js` (0 wzmianek w `plan.md`)
- **Szczegóły**: Oba uzasadnione i opisane w commicie 20f9a6d — guard wykrył sześć hexów w bloku `<style>` bannera (poza inwentaryzacją 233 literałów), ESLint potrzebował globals Node dla `scripts/**/*.mjs`. Zakres produktowy nierozszerzony; lista plików w planie jest jednak niepełna jako zapis.
- **Poprawka**: Dopisz oba do listy plików fazy 3 w planie, z jednozdaniowym powodem.
- **Decyzja**: PENDING

### F5 — `implemented` przy 27 nieodhaczonych wierszach Manual

- **Ważność**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: `context/changes/visual-identity-themes/change.md:4`
- **Szczegóły**: 25/25 wierszy Automated zweryfikowanych ponownie i zielonych; żaden wiersz Manual nie odhaczony, co jest zachowaniem prawidłowym (brak podpisywania na ślepo). `status: implemented` oznacza tu „automaty zielone", nie „obejrzane" — cała weryfikacja wizualna tej zmiany jest wciąż przed człowiekiem.
- **Poprawka**: Bez zmiany w kodzie. Przejść 3 motywy × 7 ekranów przed PR-em i archiwizacją.
- **Decyzja**: PENDING
