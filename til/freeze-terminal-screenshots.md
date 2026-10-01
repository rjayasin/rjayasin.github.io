---
added: 2026-09-26
tags: [cli, go, freeze, screenshots]
---

# Make terminal screenshots of a TUI from with freeze

I wanted a nice looking screenshot of [rtr](https://github.com/rjayasin/rtr), my TUI for moving files over SSH, for its README.

Claude wrote a test that fills the app's model with fabricated hosts, files and transfers and writes its rendered frame out as ANSI. Then [freeze](https://github.com/charmbracelet/freeze) turns that ANSI into an image of a terminal window.

Claude then wrote a script that renders the image on a gradient background using headless chrome.

![rtr browsing a NAS with the local pane open and transfers running](freeze-terminal-screenshots.png)

It took a few workarounds to get there, which claude wrote up:

<!-- claude -->

## Rendering the frame from fabricated state

Because the screenshot is the app's own `View()` output, it stays pixel-accurate to the real UI, and re-rendering after a UI change is one command (`make screenshot`). The test is skipped unless `RTR_SCREENSHOT` is set, so CI never runs it.

Two details make the captured frame look like a live terminal:

- **Force true color.** Under `go test`, stdout isn't a terminal, so lipgloss strips every color. Call `lipgloss.SetColorProfile(termenv.TrueColor)` before rendering.
- **Replace reverse video.** freeze ignores the reverse-video escape (`\x1b[7m`), which is how bubbles' text input draws its cursor. Swapping it for an explicit background color (`\x1b[48;5;252m`) makes the cursor show up.

## freeze gotchas

- **It hangs when stdin isn't a TTY, even when given a file.** freeze reads stdin whenever it isn't a terminal, so under a script or another tool with an open pipe it waits forever. Run it as `freeze ... frame.ansi </dev/null`.
- **PNG output ignores `--font.file`.** The built-in PNG renderer only loads the bundled JetBrains Mono. The custom font is only embedded in SVG output (as an `@font-face`).
- **The bundled font is missing some glyphs.** JetBrains Mono has no `➤`, so it rendered as an empty box. DejaVu Sans Mono (the free font Menlo is based on) covers the arrows, check marks, box drawing and eighth-block progress bar characters.
- **Background cells drift from the text with other fonts.** freeze places background rectangles (a highlighted label, a cursor) on a grid of `1/1.68` em per column, but DejaVu Sans Mono's glyphs are `1233/2048` em wide. Across 40 columns the text ends up about 4px off. Injecting `text { letter-spacing: -0.0068em; }` into the SVG's `<style>` puts the glyphs back on freeze's grid.
- **The background can only be a solid color.** There's no option for gradients or images behind the window.

## Adding the gradient with headless Chrome

Since freeze can only fill a solid color, the last step is a small HTML page that shows `window.svg` in an `<img>` over a CSS background of a few `radial-gradient`s layered on a `linear-gradient`, plus a `drop-shadow` filter on the window. Headless Chrome screenshots it at 2x:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --hide-scrollbars --force-device-scale-factor=2 \
  --allow-file-access-from-files --window-size=1035,637 \
  --screenshot=screenshot.png "file://$PWD/page.html"
```

Chrome also falls back to other fonts for any glyph the main font lacks, the way a real terminal does, so this step would cover a missing character too.

The whole pipeline is in [docs/screenshot.sh](https://github.com/rjayasin/rtr/blob/main/docs/screenshot.sh).
