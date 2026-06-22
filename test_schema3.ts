import pg from "pg";

async function run() {
  const connectionString = process.env.NEW_DATABASE_URL;
  if (!connectionString) {
    console.error("No NEW_DATABASE_URL defined");
    return;
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    // Log traveler ids
    const travelersRes = await client.query(`SELECT id, email FROM travelers LIMIT 5`);
    console.log("Travelers:", travelersRes.rows);

    await client.end();
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
