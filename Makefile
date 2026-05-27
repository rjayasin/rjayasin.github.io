PRETTIER_VERSION := 3.3.3
PRETTIER := npx --yes prettier@$(PRETTIER_VERSION)

.PHONY: format format-check sitemap

format:
	$(PRETTIER) --write .

format-check:
	$(PRETTIER) --check .

sitemap:
	node scripts/build-sitemap-dates.js
