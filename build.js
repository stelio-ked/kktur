const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

async function build() {
  console.log("🚀 Starting build process...");

  // 1. Create target directory
  const distPath = path.join(__dirname, "dist");
  if (!fs.existsSync(distPath)) {
    fs.mkdirSync(distPath, { recursive: true });
    console.log("✔ Created 'dist' directory.");
  }

  // 2. Build TypeScript with esbuild
  console.log("⚙ Compiling TypeScript files...");
  try {
    await esbuild.build({
      entryPoints: ["server.ts"],
      bundle: true,
      platform: "node",
      target: "node20",
      outfile: "dist/server.js",
      external: ["express", "pg"], // Keep express and pg external to run in normal node modules
    });
    console.log("✔ TypeScript compiled to dist/server.js successfully.");
  } catch (err) {
    console.error("❌ Failed compiling TypeScript:", err);
    process.exit(1);
  }

  // 3. Copy assets
  try {
    fs.copyFileSync("index.html", "dist/index.html");
    console.log("✔ Copied index.html to dist/index.html.");

    if (fs.existsSync("supabase_dump.sql")) {
      fs.copyFileSync("supabase_dump.sql", "dist/supabase_dump.sql");
      console.log("✔ Copied supabase_dump.sql to dist/supabase_dump.sql.");
    }
  } catch (err) {
    console.error("❌ Failed to copy assets:", err);
    process.exit(1);
  }

  console.log("🎉 Build completed successfully. Output ready in /app/dist");
}

build();
