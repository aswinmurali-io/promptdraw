/// <reference types="vitest/config" />
// @lat: [[deploy#Static build]]
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset URLs so the build works at a domain root or under a
  // sub-path such as a GitHub Pages project site (/promptdraw/).
  base: "./",
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
