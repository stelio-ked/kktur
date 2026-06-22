import express from "express";
import path from "path";
import fs from "fs";
import pg from "pg";

const app = express();
const port = 3000;

app.use(express.json());

// Helper to sanitize connection strings for public display (masking user/password)
function getSanitizedDbUrl(urlStr: string | undefined): string {
  if (!urlStr) return "Não configurado";
  try {
    const url = new URL(urlStr);
    return `postgresql://${url.hostname}:${url.port || "5432"}${url.pathname}`;
  } catch {
    return "Configurado (Formato inválido/oculto)";
  }
}

// Helper to query database info
async function getDbInfo(connectionString: string | undefined) {
  if (!connectionString) {
    return { status: "Erro", error: "Não configurado", tables: [] };
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000
  });

  try {
    await client.connect();
    
    // Obter tabelas
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    const tableNames = tablesRes.rows.map(r => r.table_name);
    
    const tablesWithCounts = [];
    for (const name of tableNames) {
      try {
        const countRes = await client.query(`SELECT COUNT(*) as count FROM "${name}"`);
        tablesWithCounts.push({
          name,
          count: parseInt(countRes.rows[0].count, 10)
        });
      } catch (err: any) {
        tablesWithCounts.push({ name, count: 0, error: err.message });
      }
    }

    await client.end();
    return {
      status: "Online",
      sanitizedUrl: getSanitizedDbUrl(connectionString),
      tables: tablesWithCounts,
      totalRows: tablesWithCounts.reduce((acc, t) => acc + (t.count || 0), 0)
    };
  } catch (err: any) {
    try { await client.end(); } catch {}
    return {
      status: "Erro",
      error: err.message,
      sanitizedUrl: getSanitizedDbUrl(connectionString),
      tables: []
    };
  }
}

// API Status
app.get("/api/status", async (req, res) => {
  const supabaseInfo = await getDbInfo(process.env.DATABASE_URL);
  const easypanelInfo = await getDbInfo(process.env.NEW_DATABASE_URL);

  res.json({
    supabase: supabaseInfo,
    easypanel: easypanelInfo,
    dumpExists: fs.existsSync("./supabase_dump.sql")
  });
});

// API Download Dump
app.get("/api/download-dump", (req, res) => {
  const filePath = path.join(__dirname, "supabase_dump.sql");
  if (fs.existsSync(filePath)) {
    res.download(filePath, "supabase_dump.sql");
  } else {
    res.status(404).send("Arquivo de dump ainda não gerado. Execute a extração primeiro.");
  }
});

// API Live Migration Trigger
app.post("/api/migrate", async (req, res) => {
  const sourceUrl = process.env.DATABASE_URL;
  const destUrl = process.env.NEW_DATABASE_URL;

  if (!sourceUrl || !destUrl) {
    return res.status(400).json({
      success: false,
      message: "Por favor, garanta que ambas DATABASE_URL e NEW_DATABASE_URL estejam configuradas."
    });
  }

  const logs: string[] = [];
  logs.push(`[${new Date().toLocaleTimeString()}] Iniciando migração manual via trigger do Painel...`);

  const sourceClient = new pg.Client({
    connectionString: sourceUrl,
    ssl: { rejectUnauthorized: false }
  });

  const destClient = new pg.Client({
    connectionString: destUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await sourceClient.connect();
    logs.push("✔ Conectado ao banco de Origem (Supabase).");

    await destClient.connect();
    logs.push("✔ Conectado ao banco de Destino (Easypanel).");

    logs.push("⚙ Desabilitando temporariamente as chaves estrangeiras no banco de destino...");
    await destClient.query("SET session_replication_role = 'replica';");

    // 1. Obter tabelas
    const tablesRes = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    logs.push(`Identificadas ${tables.length} tabelas para transferir.`);

    // 2. Transferir estrutura e dados
    for (const table of tables) {
      logs.push(`Migrando estrutura da tabela "${table}"...`);

      // Obter colunas
      const colsRes = await sourceClient.query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      const colDefs: string[] = [];
      for (const col of colsRes.rows) {
        let def = `"${col.column_name}" ${col.data_type}`;
        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === "NO") {
          def += " NOT NULL";
        }
        if (col.column_default && !col.column_default.includes("nextval")) {
          def += ` DEFAULT ${col.column_default}`;
        }
        colDefs.push(def);
      }

      // Obter pk
      const pkRes = await sourceClient.query(`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
      `, [table]);

      if (pkRes.rows.length > 0) {
        const pkCols = pkRes.rows.map(r => `"${r.attname}"`).join(", ");
        colDefs.push(`PRIMARY KEY (${pkCols})`);
      }

      await destClient.query(`DROP TABLE IF EXISTS "${table}" CASCADE;`);
      await destClient.query(`CREATE TABLE "${table}" ( ${colDefs.join(",\n")} );`);
      logs.push(`✔ Tabela "${table}" recriada.`);

      // Obter dados
      const dataRes = await sourceClient.query(`SELECT * FROM "${table}"`);
      const rows = dataRes.rows;

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const columnNamesList = columns.map(c => `"${c}"`).join(", ");
        
        logs.push(`📤 Transferindo ${rows.length} linhas para "${table}"...`);
        for (const row of rows) {
          const queryParams: any[] = [];
          const placeholders = columns.map((col, idx) => {
            queryParams.push(row[col]);
            return `$${idx + 1}`;
          }).join(", ");

          const insertQuery = `INSERT INTO "${table}" (${columnNamesList}) VALUES (${placeholders})`;
          await destClient.query(insertQuery, queryParams);
        }
      } else {
        logs.push(`(Tabela "${table}" vazia)`);
      }
    }

    logs.push("⚙ Reabilitando chaves estrangeiras no banco de destino...");
    await destClient.query("SET session_replication_role = 'origin';");
    logs.push("🎉 PARABÉNS! Migração concluída com sucesso completo!");

    await sourceClient.end();
    await destClient.end();

    res.json({
      success: true,
      logs
    });
  } catch (err: any) {
    logs.push(`❌ ERRO DURANTE A MIGRAÇÃO: ${err.message}`);
    try { await destClient.query("SET session_replication_role = 'origin';"); } catch {}
    try { await sourceClient.end(); } catch {}
    try { await destClient.end(); } catch {}
    res.status(500).json({
      success: false,
      logs
    });
  }
});

// Serve the SPA Dashboard
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Migration dashboard server listening on http://localhost:${port}`);
});
