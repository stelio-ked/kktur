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
    
    const res = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    
    const errors = [];
    const grouped = res.rows.reduce((acc, row) => {
        if (!acc[row.table_name]) acc[row.table_name] = [];
        acc[row.table_name].push({col: row.column_name, type: row.data_type});
        return acc;
    }, {});
    console.log(grouped);

    await client.end();
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}
run();
