<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Filter the board-game catalog

- **Plan**: `context/changes/filter-catalog/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-07-11
- **Werdykt**: SOLIDNY (z drobnymi poprawkami)
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędne wykonanie | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE |
| Kompletność planu | ZALICZONY |

## Ugruntowanie

5/5 ścieżek ✓ (`catalog.astro`, `games.ts`, `types.ts`, `index.test.ts`, `components/catalog/`), 4/4 symboli ✓ (`listGames`@games.ts:22, `LoanStatus`@types.ts:52, `newGameSchema`@index.ts:28, `searchParams`@catalog.astro:9), brief↔plan ✓.

Uwagi ugruntowania:
- `listGames` jest wywoływany wyłącznie w `catalog.astro:18` — uczynienie `filters?` opcjonalnym jest w pełni wstecznie kompatybilne; brak promienia rażenia.
- Bloki faz używają `- [ ]` w Kryteriach Sukcesu — to zgodne z ustaloną konwencją repo (zarchiwizowany plan `edit-and-archive-games` robi tak samo), więc NIE jest ustaleniem.

## Ustalenia

### F1 — Zestaw opcji gatunku może rozjechać się z zapytaniem `.eq("genre")`

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 1, zmiana #5 (`listGenres`, linia 148) ↔ zmiana #4 (genre `.eq`, linia 134); Faza 2, zmiana #1 (`<select>`)
- **Szczegóły**: Dropdown gatunków jest budowany z `listGenres`, a filtr używa `.eq("genre", genre)` (dokładne, case-sensitive dopasowanie). Dwie fasety mogą cicho ukryć gry: (a) Plan mówi „dedupe and sort case-insensitively" — case-insensitive DEDUP zwija „Strategy"/„strategy" w jedną opcję, której wartość dopasuje przez `.eq` tylko jedną pisownię, a wiersze o drugiej pisowni znikają z wyników. (b) Nieaktualny/ręcznie edytowany `?genre=OldGenre` (gatunek nieobecny w żywym katalogu) filtruje listę, ale `<select>` nie ma pasującej opcji i pokazuje „All genres" — formularz przestaje odzwierciedlać aktywny filtr.
- **Poprawka**: Dedupuj gatunki po dokładnej przechowywanej wartości (case-sensitive), a case-insensitivity zastosuj TYLKO do sortowania wyświetlania — wtedy każda wartość opcji zawsze dopasuje `.eq`. Dodatkowo, gdy `current.genre` nie jest w `genres`, dołącz go jako wybraną opcję (lub w inny sposób odzwierciedl w kontrolce), by formularz pokazywał aktywny filtr.
  - Siła: Usuwa całą klasę „gra pasuje, ale zniknęła"; zgodne z zamierzonym wzorcem exact-match dropdown (plan sam odrzucił ilike na rzecz `.eq`).
  - Kompromis: Brak istotnego — to zawężenie zachowania dedup, nie nowa złożoność.
  - Pewność: WYSOKA — `.eq` jest case-sensitive w PostgREST; dedup case-insensitive udokumentowany wprost w linii 148.
  - Martwy punkt: Prawdopodobieństwo mieszanej pisowni przy household-scale jest niskie, ale wolny tekst wpisywany przez dwie osoby czyni to realnym.
- **Decyzja**: FIXED — naprawiono w planie (Faza 1 #5: exact dedup + case-insensitive tylko do sortowania; Faza 2 #1: nieaktualny `current.genre` dołączany jako wybrana opcja)

### F2 — Sprzeczne sformułowanie w „Desired end state" o zachowaniu filtrów

- **Waga**: 💡 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Desired end state, linie 36–38
- **Szczegóły**: Zdanie mówi, że filtry są „preserved across add/edit/delete redirects — those redirect to plain /catalog, which simply clears filters". „Preserved" i „clears" są sprzeczne, i to przeczy sekcji „What we are NOT doing" (linia 62: „No preservation of filters across ... redirects"). Intencja jest jasna (filtry są czyszczone), ale sformułowanie może zmylić implementatora.
- **Poprawka**: Przeredaguj na jednoznaczne: przekierowania add/edit/delete idą do czystego `/catalog`, co czyści filtry (nie zachowuje) — zgodnie z zakresem.
- **Decyzja**: FIXED — naprawiono w planie (Desired end state przeredagowane: filtry nie są zachowywane przez mutacje)
