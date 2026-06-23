import fs from "fs";
import path from "path";

const sourceDir = path.join(__dirname, "extraction_temp", "kktur-64c73b45b0ec8a924dadd43c8735f67c2449c0ae");

function main() {
  console.log("Reading old package.json...");
  const oldPkgPath = path.join(sourceDir, "package.json");
  if (fs.existsSync(oldPkgPath)) {
    const content = fs.readFileSync(oldPkgPath, "utf-8");
    console.log(content);
  } else {
    console.log("Old package.json does not exist!");
  }
}

main();
