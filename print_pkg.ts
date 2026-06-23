import fs from "fs";

console.log("Reading /app/applet/package.json:");
try {
  console.log(fs.readFileSync("/app/applet/package.json", "utf-8"));
} catch (e: any) {
  console.log("Error:", e.message);
}

console.log("Reading ./package.json:");
try {
  console.log(fs.readFileSync("./package.json", "utf-8"));
} catch (e: any) {
  console.log("Error:", e.message);
}
