// @ts-check
const esbuild = require("esbuild");
const path = require("path");

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/webview/index.tsx"],
  bundle: true,
  outfile: "dist/webview/index.js",
  format: "iife",
  platform: "browser",
  target: ["chrome114"],
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": isProduction ? '"production"' : '"development"',
  },
  loader: {
    ".svg": "dataurl",
    ".png": "dataurl",
  },
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("[webview] watching...");
  } else {
    await esbuild.build(buildOptions);
    console.log("[webview] build complete");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
