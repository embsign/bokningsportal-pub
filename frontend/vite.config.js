// Copyright (C) 2026 embsign AB
// SPDX-License-Identifier: AGPL-3.0-only

import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: __dirname,
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: "esbuild",
    cssMinify: true,
    esbuild: {
      legalComments: "none",
    },
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
    assetsDir: "assets",
    cssCodeSplit: true,
    sourcemap: false,
  },
});
