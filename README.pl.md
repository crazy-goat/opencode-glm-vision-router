# @crazy-goat/opencode-glm-vision-router

Wtyczka [OpenCode](https://opencode.ai) V2. Kieruje wiadomości z obrazem z
modelu `GLM 5.3` na model `GLM 5.3 Flash` tego samego dostawcy.

Zmiana dotyczy jednego żądania. Sesja nadal pokazuje wybrany model. Wiadomość
asystenta zapisuje model faktycznie użyty. Kolejna wiadomość bez obrazu wraca
do modelu tekstowego.

Jest to tłumaczenie [README.md](README.md). Dokumentacja źródłowa jest w języku
angielskim.

## Wymagania

- OpenCode V2 w wersji 2.2.7 lub nowszej. Sprawdzono na 2.3.2.
- Dwa modele pod jednym dostawcą: jeden bez obsługi obrazu, jeden z obsługą.

Domyślna para dotyczy [OpenCode Go](https://opencode.ai/docs/console/go/):

| Rola  | Model                       | Wejście             |
| ----- | --------------------------- | ------------------- |
| tekst | `opencode-go/glm-5.3`       | tekst               |
| obraz | `opencode-go/glm-5.3-flash` | tekst, obraz, wideo |

## Instalacja

```sh
opencode plugin add github:crazy-goat/opencode-glm-vision-router
```

Gdy `opencode-go/glm-5.3` obsługuje wiadomość z obrazem, wtyczka używa
`opencode-go/glm-5.3-flash` dla tego jednego żądania. Inne modele pozostają bez
zmian. Wtyczka nie wymaga opcji.

## Jak to działa

1. Hook `prompt` sprawdza pliki promptu i załączniki z metadanych dla każdej
   nowej wiadomości użytkownika. Załączniki z klientów TUI i desktopu działają.
2. Hook `context` utrzymuje flagę, gdy złożone żądanie zawiera obraz. Działa
   tylko na późniejsze żądania tej samej tury.
3. Hook `experimental.model.resolve` przepisuje model dla żądań `primary`, gdy
   flaga jest ustawiona, a wybrany model to `opencode-go/glm-5.3`.
4. Gdy model tekstowy czyta plik obrazu narzędziem `read`, hook
   `execute.after` zamienia wynik na krótki wskaźnik i uzbraja flagę. Wskaźnik
   podaje ścieżkę pliku i model z obsługą obrazu. Następne żądanie idzie na
   model wizyjny, a powtórne czytanie zwraca obraz.

Obraz ze starszych tur nie utrzymuje flagi. Nowa wiadomość bez obrazu czyści
flagę.

## Ograniczenia

- Hook `experimental.model.resolve` jest eksperymentalny. Jego nazwa może się
  zmienić w kolejnej wersji OpenCode.
- Zmiana modelu działa tylko w obrębie jednego dostawcy.
- Wariant przechodzi tylko wtedy, gdy jest na liście `variants`.
- OpenCode zamienia nieobsługiwane części obrazu na krótką notatkę, gdy aktywny
  model nie ma wejścia obrazu. Wtyczka omija to, przełączając model wcześniej.
  Wynik narzędzia z obrazem inline, na przykład zrzut ekranu z przeglądarki,
  nie da się uratować: OpenCode porzuca obraz przed każdym hookiem. Zapisz taki
  obraz do pliku i przeczytaj go narzędziem `read`.
- Wtyczka nie zmienia modelu wybranego w sesji. `/models` nadal pokazuje model
  tekstowy.

## Licencja

MIT. Zobacz [LICENSE](LICENSE).
