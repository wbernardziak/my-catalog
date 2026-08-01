<!-- PLAN-REVIEW-REPORT -->

# Przegląd planu: Board-game visual identity with theme selection

- **Plan**: `context/changes/visual-identity-themes/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-08-01
- **Werdykt**: DO POPRAWY → SOLIDNY po poprawkach (2026-08-01, wszystkie 6 ustaleń naprawione)
- **Ustalenia**: 2 krytyczne, 3 ostrzeżenia, 1 obserwacja

## Werdykty

| Wymiar                       | Werdykt      |
| ---------------------------- | ------------ |
| Zgodność ze stanem końcowym  | OSTRZEŻENIE  |
| Oszczędne wykonanie          | OSTRZEŻENIE  |
| Dopasowanie architektoniczne | ZALICZONY    |
| Martwe punkty                | NIEZALICZONY |
| Kompletność planu            | NIEZALICZONY |

## Ugruntowanie

11/11 ścieżek ✓ (`scripts/` nie istnieje — plan oznacza go jako nowy), 3/3 symboli ✓ (`App.Locals` w `src/env.d.ts:2`, `bg-cosmic` w `global.css:113`, `dark:` wyłącznie w `button.tsx`), brief↔plan ✓. Progress↔Faza: 4/4 fazy, 39/39 kryteriów zmapowanych ✓. Weryfikacja kodu wykonana bezpośrednio, bez podagenta.

## Ustalenia

### F1 — Istniejący blok `.dark` nadpisze kolory motywu Felt

- **Waga**: ❌ KRYTYCZNE
- **Wpływ**: 🔬 WYSOKI — stawka architektoniczna; pomyśl dokładnie przed decyzją
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2 (blok tokenów) + Faza 3 (`rootClass`)
- **Szczegóły**: Plan każe współstosować `.dark` dla Felt i Punchboard, ale nigdy nie mówi, co się dzieje z istniejącym blokiem `.dark` w `global.css:41-73`, który redefiniuje każdy token shadcn na szarość. Przy `<html class="theme-felt dark">` blok `.dark` wygrywa specyficznością nad `:root` i cała paleta Felt znika. Drugi skutek: w fazie 2 `.dark` nie jest stosowany w ogóle, więc ręczna weryfikacja obu motywów odbywa się w trybie renderowania, który nie przetrwa fazy 3 — faza podpisująca słownik tokenów ogląda inny obraz niż finalny.
- **Poprawka A ⭐ Zalecana**: Usuń blok `.dark` w fazie 2; jego rolę przejmują bloki motywów, a `.dark` zostaje wyłącznie przełącznikiem wariantu `dark:`. Faza 2 stempluje pełną klasę statycznie w `Layout.astro`.
  - Siła: Jedno źródło prawdy dla tokenów; faza 2 weryfikuje dokładnie to, co użytkownik zobaczy po fazie 3.
  - Kompromis: Faza 2 musi dotknąć `Layout.astro`, co rozmywa jej „tylko kolor” charakter.
  - Pewność: WYSOKA — zweryfikowane, że `dark:` występuje wyłącznie w `button.tsx`.
  - Martwy punkt: Czy przyszłe komponenty shadcn zakładają wartości w `.dark` przy instalacji.
- **Poprawka B**: Zostaw `.dark`, oprzyj motywy na wyższej specyficzności.
  - Siła: Zero zmian w Layout w fazie 2; zgodność z przyszłymi komponentami shadcn.
  - Kompromis: Utrwala walkę specyficzności, którą każdy nowy token musi wygrywać.
  - Pewność: ŚREDNIA — kolejność kaskady dla `@theme inline` w Tailwind 4 nie została przetestowana.
  - Martwy punkt: Zachowanie `@theme inline` przy konkurencyjnych blokach.
- **Decyzja**: NAPRAWIONE (Poprawka A) — blok `.dark` usuwany w fazie 2; `rootClass` wprowadzony statycznie w fazie 2, w fazie 4 podmieniany na wartość z cookie

### F2 — Komponenty badge nierozstrzygnięte, a dwaj konsumenci to wyspy React

- **Waga**: ❌ KRYTYCZNE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 4, zmiana #2
- **Szczegóły**: Kontrakt mówi „`GameMeta.astro` (new) **or a small component set**”, po czym dodaje, że wyspy potrzebują „React-side equivalent”. To nierozstrzygnięta decyzja projektowa: `GameCard.tsx` i `RecommendationFlow.tsx` są wyspami React, w których komponentu `.astro` użyć się nie da — zostawione tak, kończy się dwiema równoległymi implementacjami pipsów i kostki.
- **Poprawka**: Zadeklaruj jedną implementację w `.tsx`; renderuje się statycznie w `.astro` (PreferenceStatsTable) bez dyrektywy klienta i importuje wprost w obu wyspach.
- **Decyzja**: NAPRAWIONE — jedna implementacja `GameMeta.tsx`; wersja `.astro` jawnie odrzucona

### F3 — Landing przepisywany dwa razy

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 1 zmiana #3 vs Faza 2 zmiana #2
- **Szczegóły**: Faza 1 przepisuje `Welcome.astro` (28 literałów) pod zasadą „every class stays as-is”, więc nowy landing powstaje w słowniku, który faza 2 kasuje — ten sam plik jest pisany dwa razy.
- **Poprawka A ⭐ Zalecana**: Przenieś przepisanie landingu do fazy 2.
  - Siła: Landing powstaje raz, od razu w tokenach; faza 1 zostaje czysto strukturalna.
  - Kompromis: Faza 2 rośnie o pracę copywriterską.
  - Pewność: WYSOKA — treść landingu nie zależy od niczego w fazie 1.
  - Martwy punkt: Brak znaczących.
- **Poprawka B**: Zostaw w fazie 1, ale pisz od razu w tokenach.
  - Siła: Kolejność faz bez zmian; landing gotowy najwcześniej.
  - Kompromis: Łamie regułę „faza 1 bez decyzji kolorystycznych”; landing przez całą fazę 1 renderuje się bez stylu.
  - Pewność: ŚREDNIA — zależy od tolerancji na tymczasowo brzydki ekran.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: NAPRAWIONE (Poprawka A) — przepisanie landingu przeniesione do fazy 2, pisane od razu w tokenach

### F4 — „may adopt button.tsx” to niedomknięty zakres

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 2, zmiana #2 (kontrakt) vs sekcja „What we are NOT doing”
- **Szczegóły**: Kontrakt pozwala kontrolkom „adopt `button.tsx`” tam, gdzie pasują, a zakres mówi „no bulk migration”. Granica jest nieokreślona — klasyczne „refaktoryzuj w razie potrzeby”, które puchnie w sweepie przez 21 plików.
- **Poprawka**: Usuń pozwolenie z fazy 2; konwersja pozostaje czysto mechaniczna (literał → token).
- **Decyzja**: NAPRAWIONE — pozwolenie usunięte z fazy 3; sekcja zakresu mówi wprost, że żadna kontrolka nie adoptuje `button.tsx`

### F5 — Guard nie łapie literałów spoza utility Tailwind

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2, zmiana #4
- **Szczegóły**: Guard skanuje wyłącznie utility Tailwind, a aplikacja już wstrzykuje kolory inaczej — `Welcome.astro:22` niesie `rgba(...)` w atrybucie `style`. Faza 1 kasuje ten przypadek, ale nic nie powstrzyma następnego, a stan końcowy obiecuje „No `src/` file names a colour directly”.
- **Poprawka**: Rozszerz skaner o literały hex/`rgb()` oraz właściwości koloru w atrybutach `style`, z tymi samymi wyjątkami (`global.css`, `BrandMark.astro`).
- **Decyzja**: NAPRAWIONE — guard rozszerzony o literały hex/rgb/hsl/oklch i właściwości koloru w `style`, z dwoma testami deliberate-break

### F6 — Faza 2 jest znacząco większa niż pozostałe

- **Waga**: 💡 OBSERWACJA
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 2 + brief („~4 sesje, po jednej na fazę”)
- **Szczegóły**: Faza 2 to 233 konwersje w 21 plikach + słownik tokenów + dwa motywy + znak + skrypt guard + krok CI, z 12 kryteriami sukcesu, traktowana w szacunku na równi z fazą 4 (3 zmiany). Przy `capacity` jako głównym blockerze projektu warto ją rozbić.
- **Poprawka**: Podziel fazę 2 wzdłuż katalogów — tokeny+motywy, potem `auth/` (23), `catalog/` (89), `play/` (32), strony (47) — z ręcznym sprawdzeniem po każdej porcji; guard po ostatniej.
- **Decyzja**: NAPRAWIONE — faza 2 rozbita na fazę 2 (tokeny/motywy/znak/landing) i fazę 3 (sweep w 4 porcjach + guard); plan ma teraz 5 faz, szacunek 5-6 sesji
