# til

Short "today I learned" notes, rendered at
[rjayasin.github.io/til](https://rjayasin.github.io/til/).

## How it works

- Every TIL is one markdown file in this folder — flat, no subfolders. Each
  file starts with a small frontmatter block (`added`, `tags`) followed by an
  `# <Title>` heading.
- `index.html` is both the list page and the post renderer. It fetches the
  markdown file named by the URL hash and renders it client-side
  (`/til/#<slug>` loads `til/<slug>.md`, with the frontmatter stripped).
- The list is data-driven by `tils.json`, which
  `scripts/build-til-index.js` generates from every `til/*.md` file's
  frontmatter (title comes from the `#` heading). It is **not committed**
  (see `.gitignore`): the deploy workflow regenerates it into the published
  artifact, and `make til` writes it locally for previewing. So the markdown
  files are the single source of truth — no array to keep in sync.
- Clicking a tag filters the list (`/til/#tag:<tag>`).
- A lone `<!-- claude -->` line splits a post in two: everything above it is my
  own writing, everything below is claude's notes, rendered in a tinted panel
  with a "claude's notes" chip. Posts without the marker render entirely as
  mine. The marker is stripped before rendering, so it stays invisible both on
  the page and in GitHub's view of the markdown.

## Adding a TIL

1. Create `til/<slug>.md`. Use a short kebab-case slug (e.g.
   `duti-default-apps`). Start the file with frontmatter, then the `# <Title>`
   heading:

   ```markdown
   ---
   added: 2026-07-10 # the day you learned it (not necessarily the commit date)
   tags: [macos, cli] # lowercase; reuse existing tags when possible
   ---

   # Exactly the h1 text shown in the list
   ```

   Write your own notes first. Where claude's notes take over, keep the
   sentence that hands off to them and put a `<!-- claude -->` line after it —
   the rest of the file renders in the claude panel.

2. Commit the `.md`. That's all the index needs — the deploy workflow
   regenerates `tils.json` on every build. To preview locally, run `make til`
   (or the page shows "failed to load index").
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
