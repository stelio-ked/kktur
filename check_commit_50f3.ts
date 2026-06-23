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
  const sha = "da30f00af8335c6fef5e950108c12131394c2213";
  const url = `https://github.com/stelio-ked/kktur/archive/${sha}.zip`;
  const tempZip = path.join(__dirname, "temp_da30.zip");

  console.log(`Downloading zip for commit ${sha}...`);
  try {
    await downloadFile(url, tempZip);
    console.log("Download complete. Reading...");

    const zip = new AdmZip(tempZip);
    const zipEntries = zip.getEntries();

    console.log(`Found ${zipEntries.length} entries in zip.`);

    let hasSrc = false;
    zipEntries.forEach(entry => {
      if (entry.entryName.includes("/src/")) {
        hasSrc = true;
      }
    });

    console.log("Has src folder?", hasSrc);

  } catch (err: any) {
    console.error("Error during check:", err);
  }
}

run();
