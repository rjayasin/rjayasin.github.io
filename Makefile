PRETTIER_VERSION := 3.3.3
PRETTIER := npx --yes prettier@$(PRETTIER_VERSION)
HTML_VALIDATE_VERSION := 8.29.0
HTML_VALIDATE := npx --yes html-validate@$(HTML_VALIDATE_VERSION)

.PHONY: format format-check html-check syntax-check check sitemap

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
