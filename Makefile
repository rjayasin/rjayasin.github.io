PRETTIER_VERSION := 3.3.3
PRETTIER := npx --yes prettier@$(PRETTIER_VERSION)

.PHONY: format format-check

format:
	$(PRETTIER) --write .

format-check:
	$(PRETTIER) --check .
