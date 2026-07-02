.PHONY: help ensure-macos install rebuild build stage-runtime-deps package launch package-launch verify-package clean-package

PNPM ?= pnpm
APP_NAME ?= OmniPaw
BUILDER_CONFIG ?= electron-builder.config.cjs
CSC_IDENTITY_AUTO_DISCOVERY ?= false

help:
	@echo "Available targets:"
	@echo "  make package-launch Build the macOS package and launch the packaged app"
	@echo "  make package       Install dependencies and build the macOS package"
	@echo "  make launch        Launch the latest packaged app without rebuilding"
	@echo "  make install       Install this nested Electron project independently"
	@echo "  make rebuild       Rebuild Electron native dependencies"
	@echo "  make build         Run the production build without packaging"
	@echo "  make stage-runtime-deps Stage native/runtime deps for packaging"
	@echo "  make verify-package Check packaged app runtime dependencies"
	@echo "  make clean-package Remove generated build/package output"

ensure-macos:
	@test "$$(uname -s)" = "Darwin" || { echo "macOS packaging must run on macOS."; exit 1; }

install:
	$(PNPM) install --ignore-workspace

rebuild: install
	$(PNPM) rebuild:electron

build: rebuild
	$(PNPM) build

stage-runtime-deps: rebuild
	$(PNPM) exec node scripts/stage-runtime-deps.mjs

package: ensure-macos build stage-runtime-deps
	CSC_IDENTITY_AUTO_DISCOVERY=$(CSC_IDENTITY_AUTO_DISCOVERY) $(PNPM) exec electron-builder --config $(BUILDER_CONFIG) --mac --publish never
	$(PNPM) exec node scripts/verify-packaged-app.mjs

launch:
	@app_path="$$(find release -maxdepth 2 -type d -name '$(APP_NAME).app' -print 2>/dev/null | sort | tail -n 1)"; \
	if [ -z "$$app_path" ]; then \
		echo "Cannot find packaged app under release/."; \
		exit 1; \
	fi; \
	echo "Opening $$app_path"; \
	open "$$app_path" || { \
		echo "open(1) failed; launching packaged executable directly."; \
		"$$app_path/Contents/MacOS/$(APP_NAME)" >/tmp/omnipaw.log 2>&1 & \
	}

package-launch: package launch

verify-package:
	$(PNPM) exec node scripts/verify-packaged-app.mjs

clean-package:
	rm -rf out release tmp/package-runtime
