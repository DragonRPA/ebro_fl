require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const TARGET_URL = process.env.VITE_SUPABASE_URL || 'https://mluhhrbcogvsalkchrdp.supabase.co';
const TARGET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const target = createClient(TARGET_URL, TARGET_KEY, { auth: { persistSession: false } });
const goldenPath = path.join(__dirname, '..', 'src', 'services', 'demo_golden_dataset.json');
const prodData = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

function inferPostgresType(val) {
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') {
    return Number.isInteger(val) ? 'bigint' : 'numeric';
  }
  if (val && typeof val === 'object') return 'jsonb';
  return 'text';
}

async function seedToFlDb() {
  console.log('=== Cloning initial dataset from ebro_awp golden snapshot into ebro_fl DB ===');
  const tables = Object.keys(prodData);

  // Ensure label_templates table exists
  await target.rpc('dev_exec_ddl', {
    statements: [
      `CREATE TABLE IF NOT EXISTS label_templates (
        id text PRIMARY KEY,
        schema_id text,
        target_table text,
        name text,
        paper jsonb,
        elements jsonb,
        target_printer_id text,
        target_printer_name text,
        is_default boolean,
        is_locked boolean,
        tenant_id text,
        created_at timestamptz,
        updated_at timestamptz
      );`,
      `ALTER TABLE label_templates DISABLE ROW LEVEL SECURITY;`,
      `GRANT ALL ON TABLE label_templates TO anon, authenticated, service_role;`,
      `NOTIFY pgrst, 'reload schema';`
    ]
  });

  for (const tbl of tables) {
    const rows = prodData[tbl];
    if (!rows || rows.length === 0) continue;

    let rowsToInsert = rows;
    if (tbl === 'departments') {
      rowsToInsert = rows.map(r => ({ ...r, managerId: null, parentDepartmentId: null }));
    } else if (tbl === 'users') {
      rowsToInsert = rows.map(r => ({ ...r, managerId: null }));
    } else if (tbl === 'contracts') {
      rowsToInsert = rows.map(r => ({ ...r, predecessorContractId: null, successorContractId: null }));
    }

    const CHUNK_SIZE = 300;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK_SIZE) {
      const chunk = rowsToInsert.slice(i, i + CHUNK_SIZE);
      let { error } = await target.from(tbl).upsert(chunk, { onConflict: 'id' });

      let retries = 0;
      while (error && retries < 10) {
        const msg = error.message || '';
        const colMatch = msg.match(/Could not find the '([^']+)' column of '([^']+)'/) ||
                         msg.match(/column "([^"]+)" of relation "([^"]+)" does not exist/);
        if (colMatch) {
          const missingCol = colMatch[1];
          let sampleVal = null;
          for (const r of rows) {
            if (r[missingCol] !== null && r[missingCol] !== undefined) {
              sampleVal = r[missingCol];
              break;
            }
          }
          const colType = inferPostgresType(sampleVal);
          console.log(`  [Auto-DDL] Adding missing column "${missingCol}" (${colType}) to ${tbl}...`);
          await target.rpc('dev_exec_ddl', {
            statements: [
              `ALTER TABLE "${tbl}" ADD COLUMN IF NOT EXISTS "${missingCol}" ${colType};`,
              `NOTIFY pgrst, 'reload schema';`
            ]
          });
          await new Promise(r => setTimeout(r, 1200));
          const retryRes = await target.from(tbl).upsert(chunk, { onConflict: 'id' });
          error = retryRes.error;
          retries++;
        } else if (msg.includes('violates not-null constraint') || error.code === '23502') {
          const nnMatch = msg.match(/null value in column "([^"]+)"/);
          if (nnMatch) {
            await target.rpc('dev_exec_ddl', {
              statements: [
                `ALTER TABLE "${tbl}" ALTER COLUMN "${nnMatch[1]}" DROP NOT NULL;`,
                `NOTIFY pgrst, 'reload schema';`
              ]
            });
            await new Promise(r => setTimeout(r, 500));
            const retryRes = await target.from(tbl).upsert(chunk, { onConflict: 'id' });
            error = retryRes.error;
            retries++;
          } else break;
        } else if (
          msg.includes('duplicate key value violates unique constraint') || error.code === '23505' ||
          msg.includes('foreign key constraint') || error.code === '23503' ||
          msg.includes('check constraint') || error.code === '23514'
        ) {
          const cMatch = msg.match(/constraint "([^"]+)"/);
          if (cMatch && !cMatch[1].endsWith('_pkey')) {
            console.log(`  [Auto-DDL] Dropping constraint "${cMatch[1]}" on ${tbl}...`);
            await target.rpc('dev_exec_ddl', {
              statements: [
                `ALTER TABLE "${tbl}" DROP CONSTRAINT IF EXISTS "${cMatch[1]}";`,
                `DROP INDEX IF EXISTS "${cMatch[1]}";`,
                `NOTIFY pgrst, 'reload schema';`
              ]
            });
            await new Promise(r => setTimeout(r, 500));
            const retryRes = await target.from(tbl).upsert(chunk, { onConflict: 'id' });
            error = retryRes.error;
            retries++;
          } else break;
        } else {
          break;
        }
      }

      if (error) {
        console.warn(`  [Warning] Upsert on ${tbl} failed: ${error.message}`);
        break;
      }
    }
    console.log(`  [Seeded] ${tbl.padEnd(30)}: ${rows.length} rows`);
  }

  for (const tbl of ['departments', 'users', 'contracts']) {
    const rows = prodData[tbl];
    if (rows && rows.length > 0) {
      await target.from(tbl).upsert(rows, { onConflict: 'id' });
    }
  }
  console.log('✅ Initial data seeding to ebro_fl complete!');
}

seedToFlDb().catch(err => {
  console.error(err);
  process.exit(1);
});
