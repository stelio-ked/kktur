import https from "https";

function fetchUrl(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        "User-Agent": "NodeJS-App"
      }
    };
    https.get(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error("Failed to parse JSON response: " + data.substring(0, 200)));
        }
      });
    }).on("error", (err) => {
      reject(err);
    });
  });
}

async function run() {
  try {
    const commits = await fetchUrl("https://api.github.com/repos/stelio-ked/kktur/commits");
    if (!Array.isArray(commits)) {
      console.log("Error fetching commits:", commits);
      return;
    }
    console.log("Commits found:");
    for (const c of commits) {
      console.log(`- SHA: ${c.sha} | Date: ${c.commit.author.date} | Message: ${c.commit.message}`);
    }
  } catch (err: any) {
    console.error("Error:", err.message);
  }
}

run();
