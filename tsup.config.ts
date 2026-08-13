import { defineConfig } from "tsup";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));


export default defineConfig({
  entry: {
    cli: "bin/cli.ts"
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  minify: false,
  sourcemap: false,
  splitting: false,
  external: ["node:sqlite"],
  define: {
    __DRIXIO_VERSION__: JSON.stringify(pkg.version),
  },
});
