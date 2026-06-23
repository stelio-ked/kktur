import https from "https";
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "NodeJS" } }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        downloadFile(response.headers.location!, dest).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: status code ${response.statusCode}`));
        return;
      }

      const fileStream = fs.createWriteStream(dest);
      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close();
        resolve();
      });

      fileStream.on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    });

    request.on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  const sha = "64c73b45b0ec8a924dadd43c8735f67c2449c0ae";
  const url = `https://github.com/stelio-ked/kktur/archive/${sha}.zip`;
  const tempZip = path.join(__dirname, "temp.zip");

  console.log(`Downloading zip for commit ${sha}...`);
  try {
    await downloadFile(url, tempZip);
    console.log("Download complete. Extracting...");

    const zip = new AdmZip(tempZip);
    const zipEntries = zip.getEntries();

    console.log(`Found ${zipEntries.length} entries in zip.`);

    // Let's print first 10 paths to understand the directory prefix
    console.log("Pruning patterns:");
    zipEntries.slice(0, 10).forEach(entry => {
      console.log(`- ${entry.entryName}`);
    });

    // Extracting
    const extractionPath = path.join(__dirname, "extraction_temp");
    zip.extractAllTo(extractionPath, true);
    console.log(`Extracted all entries to ${extractionPath}`);

    // Let's identify the prefix folder name (should be kktur-64c73b45b0ec8a924dadd43c8735f67c2449c0ae)
    const dirs = fs.readdirSync(extractionPath);
    console.log("Root extracted dirs:", dirs);

  } catch (err: any) {
    console.error("Error during restore:", err);
  }
}

run();
