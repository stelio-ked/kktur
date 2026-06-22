import pg from "pg";

async function run() {
  const connectionString = process.env.NEW_DATABASE_URL;
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT id, email FROM users WHERE email = 'theoked25@gmail.com'");
    console.log("Users:", res.rows);
    await client.end();
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
