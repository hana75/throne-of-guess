# Throne of Guess

A daily Wordle-like puzzle for characters from the seven main *Throne of Glass* books. Guess unlimited names; each attempt is scored on name, kingdom, gender, species, and first book.

The secret character is the same for every player on a given **UTC** day.

## Local preview

This is a static site. `fetch` needs HTTP, so do not open `index.html` as a file.

```bash
python3 -m http.server 8080
```

Then visit [http://localhost:8080](http://localhost:8080).

## GitHub Pages

1. Push this repository to GitHub.
2. In the repo settings, enable Pages from the `main` branch, folder `/` (root).
3. The site will serve `index.html` at `https://<user>.github.io/<repo>/`.

If the project lives at a subpath, keep the asset URLs relative (they already are).

## Data

Playable characters live in [`data/characters.json`](data/characters.json). Portraits are original illustrations in [`img/characters/`](img/characters/).
