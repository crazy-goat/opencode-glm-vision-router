# @crazy-goat/opencode-glm-vision-router

Wtyczka [OpenCode](https://opencode.ai) V2. Kieruje tury medialne z modelu
`GLM 5.3` bez obsługi obrazu na model `GLM 5.3 Flash` z obsługą obrazu. Oba
modele mają tego samego dostawcę. Tura medialna ma plik, który przyjmuje tylko
model z obsługą obrazu. Dla domyślnej pary te pliki to obrazy i wideo.

Zmiana dotyczy pojedynczego żądania. Sesja nadal pokazuje wybrany model.
Wiadomość asystenta zapisuje model faktycznie użyty. Następna tura bez mediów
znowu używa wybranego modelu.

Jest to tłumaczenie [README.md](README.md). Dokumentacja źródłowa jest w języku
angielskim.

## Wymagania

- OpenCode V2 w wersji 2.2.7 lub nowszej. Sprawdzono na 2.3.2.
- Dwa modele pod jednym dostawcą: jeden bez obsługi obrazu, jeden z obsługą.
- Model z obsługą obrazu musi być na liście modeli OpenCode. Wyłączony model nie
  jest na tej liście.

Domyślna para dotyczy [OpenCode Go](https://opencode.ai/docs/console/go/):

| Rola  | Model                       | Wejście             |
| ----- | --------------------------- | ------------------- |
| tekst | `opencode-go/glm-5.3`       | tekst               |
| obraz | `opencode-go/glm-5.3-flash` | tekst, obraz, wideo |

Oba modele mają warianty `low`, `high` i `max`. W stałym planie Go żądania
mają koszt zero, ale zużywają limit żądań w oknie 5 godzin.

## Instalacja

```sh
opencode plugin add github:crazy-goat/opencode-glm-vision-router
```

Gdy `opencode-go/glm-5.3` obsługuje turę medialną, wtyczka wysyła żądania tej
tury do `opencode-go/glm-5.3-flash`. Inne modele pozostają bez zmian. Domyślne
ustawienia nie wymagają opcji.

## Opcje

Ustaw opcje we wpisie wtyczki w pliku `opencode.jsonc`:

```jsonc
{
  "plugins": [
    {
      "package": "github:crazy-goat/opencode-glm-vision-router",
      "options": {
        "variants": ["low", "high"],
        "screenshotTools": ["capture_screen"],
      },
    },
  ],
}
```

| Opcja             | Typ      | Domyślnie         | Opis                                                                                                                                                                                  |
| ----------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`        | string   | `"opencode-go"`   | Dostawca obu modeli.                                                                                                                                                                  |
| `text`            | string   | `"glm-5.3"`       | Model bez obsługi obrazu. Wtyczka zmienia tylko żądania na tym modelu.                                                                                                                |
| `vision`          | string   | `"glm-5.3-flash"` | Model z obsługą obrazu. Musi być na liście modeli dostawcy `provider`.                                                                                                                |
| `variants`        | string[] | brak              | Warianty, które wtyczka przenosi na model z obsługą obrazu. Bez tej opcji wtyczka przenosi każdy wariant, który ma ten model.                                                         |
| `rescue`          | boolean  | `true`            | Kieruje żądanie po wyniku narzędzia z obrazem. Przy `false` liczą się tylko obrazy od użytkownika, a `screenshotTools` nie działa.                                                    |
| `screenshotTools` | string[] | `[]`              | Narzędzia, które zapisują zrzut ekranu do pliku i nie zwracają obrazu. Gdy `output` podaje ścieżkę obrazu (zobacz „Jak to działa”), wtyczka dodaje do wyniku polecenie odczytu pliku. |

## Jak to działa

Wtyczka nie przechowuje stanu. Decyduje na podstawie wiadomości, które OpenCode
zapisuje w sesji.

1. Przed każdym żądaniem `primary` na modelu tekstowym hook
   `experimental.model.resolve` czyta zapisane wiadomości przez
   `ctx.session.context()`.
2. Wtyczka bierze wiadomości po ostatnim znaczniku `idle`. Te wiadomości to
   bieżąca tura. OpenCode zapisuje ten znacznik, gdy sesja kończy pracę.
3. Wtyczka szuka plików medialnych w bieżącej turze:
   - pliku w wiadomości użytkownika;
   - załącznika ze ścieżką do obrazu lub pliku pdf z klienta desktop, w
     metadanych wiadomości;
   - pliku w wyniku narzędzia, na przykład po odczycie obrazu narzędziem
     `read` albo po zrzucie ekranu. Opcja `rescue` steruje tym sprawdzeniem.
4. Plik wymaga modelu z obsługą obrazu, gdy lista modeli pokazuje, że ten model
   przyjmuje typ wejścia pliku (obraz, wideo, audio lub pdf), a model tekstowy
   go nie przyjmuje. Gdy tura ma taki plik, żądanie używa modelu z obsługą
   obrazu. Wtyczka przenosi wariant tylko wtedy, gdy ten model go ma i gdy
   opcja `variants` na to pozwala.
5. Gdy modelu z obsługą obrazu nie ma na liście modeli albo gdy sprawdzenie się
   nie uda, żądanie zostaje na wybranym modelu. Wtyczka raz zapisuje
   ostrzeżenie w logu.

OpenCode zapisuje nowy prompt przed pierwszym żądaniem tury. Wyniki narzędzi z
danego kroku zapisuje przed następnym żądaniem. Dlatego obraz od użytkownika
kieruje już pierwsze żądanie swojej tury. Obraz z narzędzia kieruje żądanie po
kroku z tym narzędziem.

Prompt tekstowy wysłany jako `steer` do trwającej tury medialnej zostaje w tej
turze. Kolejne żądania tej tury nadal używają modelu z obsługą obrazu.

Żądania innych rodzajów, na przykład tytuły i kompakcja, pozostają bez zmian.
Żądania na innych modelach i u innych dostawców też pozostają bez zmian.

Dla narzędzia z listy `screenshotTools` hook narzędzi `execute.after` sprawdza
zakończony wynik. Hook działa tylko wtedy, gdy wynik nie ma obrazu, a jego
`output` podaje ścieżkę obrazu: tekst w `output.path` albo element
`output.files` z typem MIME obrazu i polem `path`. Wtedy hook dodaje do wyniku
tekst: `Screenshot saved to: <path>. Read the file to view the image.` Model
czyta ten plik, a następne żądanie używa modelu z obsługą obrazu.

Dla narzędzia MCP OpenCode bierze `output` z `structuredContent`. Gdy narzędzie
nie ma `outputSchema`, OpenCode bierze `output` także z wyniku tekstowego w
formacie JSON. Zwykły tekst, na przykład `Saved to /tmp/a.png`,
nie podaje ścieżki, więc hook nic nie robi.

## Ograniczenia

- Hook `experimental.model.resolve` jest eksperymentalny. Jego nazwa lub
  kształt zdarzenia mogą się zmienić w kolejnej wersji OpenCode.
- Zmiana modelu działa tylko w obrębie **jednego dostawcy**. OpenCode uznaje
  model innego dostawcy za niedostępny.
- Wtyczka sprawdza listę włączonych modeli. Gdy modelu z obsługą obrazu nie ma
  na tej liście, tury medialne zostają na modelu tekstowym. Nie wyłączaj modelu
  z obsługą obrazu.
- Wtyczka czyta zapisaną sesję przed każdym żądaniem `primary` na modelu
  tekstowym. W długiej sesji ten odczyt trwa dłużej.
- Pliki medialne ze starszych tur nie zmieniają modelu. Gdy nowa tura dotyczy
  wcześniejszego pliku, załącz ten plik ponownie.
- OpenCode zapisuje jeden znacznik `idle`, gdy sesja kończy pracę. Prompt
  dodany do kolejki (`queue`) w czasie tury medialnej działa przed tym
  znacznikiem, więc też używa modelu z obsługą obrazu.
- Załącznik ze ścieżką z klienta desktop daje modelowi tylko ścieżkę pliku.
  Model z obsługą obrazu musi przeczytać plik, żeby go zobaczyć. Narzędzie
  `read` OpenCode zwraca tylko obrazy i pliki pdf, więc załącznik ze ścieżką do
  wideo nie kieruje tury.
- W późniejszej turze na modelu tekstowym OpenCode zamienia starsze obrazy na
  krótką notatkę.
- Wtyczka nie zmienia modelu wybranego w sesji. `/models` nadal pokazuje model
  tekstowy.

## Rozwój

```sh
bun install
bun test
bash bin/lint.sh
```

Repozytorium stosuje [standard repozytoriów
crazy-goat](https://github.com/crazy-goat/.github). Wszystko pisz po angielsku.
Używaj Conventional Commits. Dla zmian widocznych dla użytkownika dodaj wpis w
`CHANGELOG.md`.

## Licencja

MIT. Zobacz [LICENSE](LICENSE).
