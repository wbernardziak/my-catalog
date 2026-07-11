<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Edit and Archive Board Games

- **Plan**: context/changes/edit-and-archive-games/plan.md
- **Zakres**: Fazy 1–3 z 3 (pełny plan)
- **Data**: 2026-07-11
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych  0 ostrzeżeń  3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Kryteria sukcesu (zweryfikowane)

- Automatyczne: `npm run lint` — PASS (brak błędów), `npm test` — PASS (25 testów, 5 plików), `npm run build` — PASS (Cloudflare SSR, 11.4s).
- Ręczne (3.4–3.10): wszystkie zweryfikowane w sesji przez sterowanie aplikacją (Playwright/Chromium na lokalnym Supabase). Edycja persystuje (min-max 1→6), soft-delete zachowuje wiersz z `deleted_at`, dwustopniowy confirm działa, add-game regresja OK, mobile bez poziomego przewijania.

## Ustalenia

### F1 — Współdzielona schema zod importowana z pliku route, nie z src/lib/

- **Ważność**: 👀 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/pages/api/games/[id].ts:4
- **Szczegóły**: `[id].ts` importuje `newGameSchema` i `parseAuthors` z `./index` (sąsiedni plik route). CLAUDE.md mówi „Services/helpers go in src/lib/". Kod runtime walidacji współdzielony między route'ami mieszka w pliku endpointu. Plan świadomie to zaakceptował („already exported, import as-is; no rename required"), a test `id-endpoints.test.ts` egzekwuje współdzielenie — działa i jest zamierzone, tylko lekko odbiega od konwencji lokalizacji helperów.
- **Poprawka**: Przenieś `newGameSchema` + `parseAuthors` do `src/lib/services/games.ts` (lub `src/lib/validation/games.ts`) i importuj z obu route'ów oraz z `GameForm`; odkłada sprzężenie route→route.
- **Decyzja**: PENDING

### F2 — Kliencki validate() nie odwzorowuje górnych limitów serwera

- **Ważność**: 👀 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/components/catalog/GameForm.tsx:86
- **Szczegóły**: Serwerowa `newGameSchema` egzekwuje `max(99)` graczy i `max(6000)` minut; kliencki `validate()` sprawdza tylko dolne granice (int ≥ 1, minuty > 0). Wpisanie 100 graczy przechodzi walidację klienta, serwer odrzuca i robi pełny redirect `?error=` — komunikat pojawia się na formularzu „Add a game" w aside, a otwarty formularz edycji znika. Zachowanie odziedziczone z S-01 `AddGameForm`, nie wprowadzone w tym slice; serwer pozostaje autorytatywny.
- **Poprawka**: Dodaj górne granice do `validate()` (`min > 99` / `minutes > 6000`) aby błąd pojawiał się inline zamiast po przeładowaniu — lub zostaw, bo serwer chroni dane.
- **Decyzja**: PENDING

### F3 — POST-y zmieniające stan bez ochrony CSRF (przekrojowe, wcześniejsze)

- **Ważność**: 👀 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/pages/api/games/[id]/delete.ts:13
- **Szczegóły**: Soft-delete i update to POST-y na sesji cookie bez tokenu CSRF — złośliwa strona mogłaby wywołać soft-delete zalogowanego użytkownika. Wzorzec jest przekrojowy i wcześniejszy (identyczny w `POST /api/games` z S-01), nie wprowadzony przez ten slice, a soft-delete jest odwracalny (dane zostają). Odnotowane, bo delete jest teraz akcją destrukcyjną osiągalną przez POST.
- **Poprawka**: Poza zakresem tego slice — rozważ globalną ochronę CSRF (SameSite=Strict na cookie sesji lub token) jako osobną pracę przekrojową.
- **Decyzja**: PENDING
