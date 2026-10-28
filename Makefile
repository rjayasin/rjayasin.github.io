PRETTIER_VERSION := 3.3.3
PRETTIER := npx --yes prettier@$(PRETTIER_VERSION)
HTML_VALIDATE_VERSION := 11.5.3
HTML_VALIDATE := npx --yes html-validate@$(HTML_VALIDATE_VERSION)

.PHONY: format format-check html-check syntax-check check sitemap til clueward-test

format:
	$(PRETTIER) --write .

format-check:
	$(PRETTIER) --check .

html-check:
	git ls-files '*.html' | xargs $(HTML_VALIDATE)

syntax-check:
	git ls-files '*.js' '*.json' '*.html' | xargs node scripts/validate-files.js

check: format-check html-check syntax-check

sitemap:
	node scripts/build-sitemap-dates.js

# Regenerate til/tils.json for local preview. Not committed (see .gitignore);
# the deploy workflow regenerates it into the published artifact.
til:
	node scripts/build-til-index.js

# Needs @huggingface/transformers (see the script's header) and downloads the
# matcher's model on first run, so it isn't part of `make check`.
clueward-test:
	node scripts/test-clueward-matcher.js
