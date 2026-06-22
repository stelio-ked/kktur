import pg from "pg";
import fs from "fs";

async function generateDump() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("ERRO: DATABASE_URL não encontrada no ambiente.");
    return;
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Conectado ao banco de dados Supabase para gerar o dump...");

    let sqlDump = `-- =========================================================\n`;
    sqlDump += `-- DUMP DE BANCO DE DADOS - MIGRAÇÃO PARA EASYPANEL\n`;
    sqlDump += `-- Gerado em: ${new Date().toISOString()}\n`;
    sqlDump += `-- Origem: Supabase (PostgreSQL)\n`;
    sqlDump += `-- =========================================================\n\n`;

    sqlDump += `-- Desabilita integridade referencial para permitir inserção fora de ordem\n`;
    sqlDump += `SET session_replication_role = 'replica';\n\n`;

    // 1. Obter listas de tabelas públicas
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log("Tabelas encontradas:", tables);

    // 2. Para cada tabela, gerar o DDL de criação
    for (const table of tables) {
      sqlDump += `-- ---------------------------------------------------------\n`;
      sqlDump += `-- Estrutura de criação para a tabela: ${table}\n`;
      sqlDump += `-- ---------------------------------------------------------\n`;
      sqlDump += `DROP TABLE IF EXISTS "${table}" CASCADE;\n`;
      sqlDump += `CREATE TABLE "${table}" (\n`;

      const colsRes = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [table]);

      const colDefs: string[] = [];
      for (const col of colsRes.rows) {
        let def = `  "${col.column_name}" ${col.data_type}`;
        if (col.character_maximum_length) {
          def += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === "NO") {
          def += " NOT NULL";
        }
        if (col.column_default) {
          // Ignorar os defaults que referenciam sequências ou que podem falhar dependendo do sistema de destino, mas manter defaults normais
          if (!col.column_default.includes("nextval")) {
            def += ` DEFAULT ${col.column_default}`;
          }
        }
        colDefs.push(def);
      }

      // Buscar Chaves Primárias
      const pkRes = await client.query(`
        SELECT a.attname
        FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = $1::regclass AND i.indisprimary
      `, [table]);

      if (pkRes.rows.length > 0) {
        const pkCols = pkRes.rows.map(r => `"${r.attname}"`).join(", ");
        colDefs.push(`  PRIMARY KEY (${pkCols})`);
      }

      sqlDump += colDefs.join(",\n") + "\n);\n\n";
    }

    // 3. Gerar inserções de dados para cada tabela
    for (const table of tables) {
      sqlDump += `-- ---------------------------------------------------------\n`;
      sqlDump += `-- Dados da tabela: ${table}\n`;
      sqlDump += `-- ---------------------------------------------------------\n`;

      const dataRes = await client.query(`SELECT * FROM "${table}"`);
      const rows = dataRes.rows;

      if (rows.length === 0) {
        sqlDump += `-- (Nenhum dado cadastrado para ${table})\n\n`;
        continue;
      }

      const columns = Object.keys(rows[0]);
      const columnNamesList = columns.map(c => `"${c}"`).join(", ");

      // Vamos criar os blocos de INSERT INTO em lotes
      for (const row of rows) {
        const valuesList = columns.map(col => {
          const val = row[col];
          if (val === null || val === undefined) {
            return "NULL";
          }
          if (typeof val === "boolean") {
            return val ? "TRUE" : "FALSE";
          }
          if (val instanceof Date) {
            return `'${val.toISOString()}'`;
          }
          if (typeof val === "object") {
            // Tratar campos JSON/JSONB
            return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
          }
          if (typeof val === "number") {
            return val.toString();
          }
          // String standard, escapar aspas simples
          const escaped = val.toString().replace(/'/g, "''");
          return `'${escaped}'`;
        });

        sqlDump += `INSERT INTO "${table}" (${columnNamesList}) VALUES (${valuesList.join(", ")});\n`;
      }
      sqlDump += `\n`;
    }

    // 4. Reabilitar triggers
    sqlDump += `-- Reabilita integridade referencial\n`;
    sqlDump += `SET session_replication_role = 'origin';\n`;

    fs.writeFileSync("./supabase_dump.sql", sqlDump);
    console.log("🎉 SUCESSO! O arquivo './supabase_dump.sql' com todo o esquema e dados foi gerado.");

    await client.end();
  } catch (err: any) {
    console.error("ERRO durante a geração do dump:", err.message);
    try {
      await client.end();
    } catch {}
  }
}

generateDump();
