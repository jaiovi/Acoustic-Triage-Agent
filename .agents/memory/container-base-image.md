---
name: Container base image
description: Docker base-image constraint for this pnpm/Vite workspace.
---

Use a glibc-based Node image such as Debian slim for Docker builds of this workspace; Alpine may not have Rollup's musl native package available from the current dependency installation.

**Why:** The container build succeeded through dependency installation and typechecking on Alpine but failed when Vite needed its platform-specific Rollup binary. Installing unrelated native packages to preserve Alpine adds avoidable fragility.

**How to apply:** Keep the dependency, builder, and runner stages on the same glibc-based Node image, and build only the app and shared API needed by the container.
