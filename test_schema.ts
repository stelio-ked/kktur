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
    
    // Log the types of the returned UUIDs
    const res = await client.query(`SELECT id, email FROM users LIMIT 1`);
    console.log("User row example:", res.rows[0]);
    
    // Describe travelers
    const res2 = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'travelers';
    `);
    console.log("Travelers structure:");
    console.table(res2.rows);

    await client.end();
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
