# til

Short "today I learned" notes, rendered at
[rjayasin.github.io/til](https://rjayasin.github.io/til/).

## How it works

- Every TIL is one markdown file in this folder — flat, no subfolders.
- `index.html` is both the list page and the post renderer. There is no build
  step: it fetches the markdown file named by the URL hash and renders it
  client-side (`/til/#<slug>` loads `til/<slug>.md`).
- The page only shows entries listed in the `TILS` array at the top of the
  `<script>` in `index.html` — a markdown file alone is not enough.
- Clicking a tag filters the list (`/til/#tag:<tag>`).

## Adding a TIL

1. Create `til/<slug>.md`. Use a short kebab-case slug (e.g.
   `duti-default-apps`). The file must start with an `# <Title>` heading.
2. Append an entry to the bottom of the `TILS` array in `index.html` —
   entries are ordered by date added, oldest at the top, newest at the
   bottom:

   ```js
   {
     slug: 'my-new-til',           // filename without .md
     title: 'Exactly the h1 text', // shown in the list
     tags: ['macos', 'cli'],       // lowercase; reuse existing tags when possible
     added: 'YYYY-MM-DD',          // today's date
   },
   ```

3. From the repo root, run `make format` and `make check`. Before committing,
   also run `make sitemap` (repo-wide convention; the `/til/` entry's date
   comes from this folder's git history).

## Markdown support

The renderer in `index.html` supports a small subset of markdown, so keep
TILs simple:

- headings `#` through `####`
- paragraphs, `---` horizontal rules, `>` blockquotes
- fenced code blocks (no syntax highlighting; a language tag after the
  opening fence is ignored)
- `inline code`, `[links](https://...)`, `**bold**`, `*italic*`
- flat `-` or `1.` lists — no nesting, no multi-line list items

Not supported: tables, images, footnotes, nested lists, raw HTML (it gets
escaped and shown literally).
