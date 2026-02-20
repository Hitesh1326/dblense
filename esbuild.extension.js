// @ts-check
const esbuild = require("esbuild");

const isProduction = process.argv.includes("--production");
const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: [
    "vscode",
    // Native node modules that must stay external
    "mssql",
    "pg",
    "mysql2",
    "@lancedb/lancedb",
    "@xenova/transformers",
    "apache-arrow",
  ],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: "info",
};

async function main() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("[extension] watching...");
  } else {
    await esbuild.build(buildOptions);
    console.log("[extension] build complete");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
