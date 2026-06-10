.PHONY: package install build stage-runtime-deps verify-package clean-package help

PNPM ?= pnpm

help:
	@echo "Available targets:"
	@echo "  make package       Install dependencies and build the macOS package"
	@echo "  make install       Install this nested Electron project independently"
	@echo "  make build         Run the production build without packaging"
	@echo "  make stage-runtime-deps Stage native/runtime deps for packaging"
	@echo "  make verify-package Check packaged app runtime dependencies"
	@echo "  make clean-package Remove generated build/package output"

install:
	$(PNPM) install --ignore-workspace

build: install
	$(PNPM) build

stage-runtime-deps: install
	$(PNPM) exec node scripts/stage-runtime-deps.mjs

package: install stage-runtime-deps
	$(PNPM) dist
	$(PNPM) exec node scripts/verify-packaged-app.mjs

verify-package:
	$(PNPM) exec node scripts/verify-packaged-app.mjs

clean-package:
	rm -rf out release tmp/package-runtime
