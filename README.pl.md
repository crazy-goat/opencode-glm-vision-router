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

Następnie ustaw model tekstowy jako domyślny w `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/glm-5.3",
  "agent": {
    "build": {
      "model": "opencode-go/glm-5.3",
      "variant": "low",
    },
  },
}
```

Agent z własnym polem `model` nadpisuje ustawienie główne. Ustaw oba pola.

## Opcje

| Opcja      | Domyślna wartość         | Znaczenie                           |
| ---------- | ------------------------ | ----------------------------------- |
| `provider` | `opencode-go`            | ID dostawcy obu modeli              |
| `text`     | `glm-5.3`                | ID modelu dla wiadomości bez obrazu |
| `vision`   | `glm-5.3-flash`          | ID modelu dla wiadomości z obrazem  |
| `variants` | `["low", "high", "max"]` | Warianty dostępne w obu modelach    |

## Ograniczenia

- Hook `experimental.model.resolve` jest eksperymentalny. Jego nazwa może się
  zmienić w kolejnej wersji OpenCode.
- Zmiana modelu działa tylko w obrębie jednego dostawcy.
- Wariant przechodzi tylko wtedy, gdy jest na liście `variants`.
- Wtyczka nie zmienia modelu wybranego w sesji. `/models` nadal pokazuje model
  tekstowy.

## Licencja

MIT. Zobacz [LICENSE](LICENSE).
