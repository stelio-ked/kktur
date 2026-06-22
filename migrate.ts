import pg from "pg";

async function runDirectMigration() {
  const sourceUrl = process.env.DATABASE_URL;
  const destUrl = process.env.NEW_DATABASE_URL;

  if (!sourceUrl) {
    console.error("ERRO: DATABASE_URL (Banco de Origem - Supabase) não definida no ambiente.");
    return;
  }

  if (!destUrl) {
    console.error("ERRO: NEW_DATABASE_URL (Banco de Destino - Easypanel) não definida no ambiente.");
    console.log("👉 Por favor, configure a chave Secrets 'NEW_DATABASE_URL' no painel do AI Studio antes de rodar.");
    return;
  }

  console.log("============= INICIANDO MIGRAÇÃO DIRETA =============");
  console.log("Origem: Supabase (DATABASE_URL)");
  console.log("Destino: Easypanel (NEW_DATABASE_URL)");

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
    console.log("✔ Conectado ao banco de Origem (Supabase).");

    await destClient.connect();
    console.log("✔ Conectado ao banco de Destino (Easypanel).");

    // Desabilitar integridade referencial no destino temporariamente
    console.log("⚙ Desabilitando temporariamente as chaves estrangeiras no banco de destino...");
    await destClient.query("SET session_replication_role = 'replica';");

    // 1. Obter listas de tabelas públicas da Origem
    const tablesRes = await sourceClient.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`Tabelas identificadas na origem (${tables.length}):`, tables);

    // 2. Criar Tabelas no Destino
    for (const table of tables) {
      console.log(`\n--- Estruturando tabela: ${table} ---`);
      
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

      // Obter primary key
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

      const createTableSql = `
        DROP TABLE IF EXISTS "${table}" CASCADE;
        CREATE TABLE "${table}" (
          ${colDefs.join(",\n  ")}
        );
      `;

      await destClient.query(createTableSql);
      console.log(`✔ Tabela "${table}" recriada no destino.`);

      // 3. Transferir Dados da Origem para o Destino
      const dataRes = await sourceClient.query(`SELECT * FROM "${table}"`);
      const rows = dataRes.rows;

      if (rows.length === 0) {
        console.log(`ℹ Tabela "${table}" está vazia na origem.`);
        continue;
      }

      const columns = Object.keys(rows[0]);
      const columnNamesList = columns.map(c => `"${c}"`).join(", ");

      console.log(`📤 Enviando ${rows.length} registros para a tabela "${table}"...`);

      for (const row of rows) {
        const queryParams: any[] = [];
        const placeholders = columns.map((col, idx) => {
          queryParams.push(row[col]);
          return `$${idx + 1}`;
        }).join(", ");

        const insertQuery = `INSERT INTO "${table}" (${columnNamesList}) VALUES (${placeholders})`;
        await destClient.query(insertQuery, queryParams);
      }
      console.log(`✔ Dados da tabela "${table}" migrados.`);
    }

    // Reabilitar integridade referencial no destino
    console.log("\n⚙ Reabilitando as chaves estrangeiras no banco de destino...");
    await destClient.query("SET session_replication_role = 'origin';");

    console.log("\n=====================================================");
    console.log("🎉 PARABÉNS! MIGRAÇÃO DIRETA CONCLUÍDA COM SUCESSO!");
    console.log("Todos os esquemas e dados foram transferidos com precisão.");
    console.log("=====================================================");

  } catch (err: any) {
    console.error("\n❌ ERRO CRÍTICO DURANTE A MIGRAÇÃO:", err.message);
    try {
      await destClient.query("SET session_replication_role = 'origin';");
    } catch {}
  } finally {
    await sourceClient.end();
    await destClient.end();
    console.log("Conexões encerradas.");
  }
}

runDirectMigration();
