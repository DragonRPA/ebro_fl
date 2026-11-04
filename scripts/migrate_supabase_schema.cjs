require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_CONFIG = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
} : {
  host: 'aws-1-ap-southeast-1.pooler.supabase.com',
  port: 6543,
  user: 'postgres.lkohpffieaanwhohttbu',
  password: process.env.SUPABASE_DB_PASSWORD || '',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
};

function prefixSchemaSql(sql, prefix = 'fl_') {
  let out = sql;
  out = out.replace(
    /\b(CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+)"?([a-zA-Z0-9_]+)"?/gi,
    (_, pre, tbl) => {
      const clean = tbl.startsWith(prefix) ? tbl : `${prefix}${tbl}`;
      return `${pre}"${clean}"`;
    }
  );
  out = out.replace(
    /\b(ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?)"?([a-zA-Z0-9_]+)"?/gi,
    (_, pre, tbl) => {
      const clean = (tbl.startsWith(prefix) || tbl.startsWith('core_')) ? tbl : `${prefix}${tbl}`;
      return `${pre}"${clean}"`;
    }
  );
  out = out.replace(
    /\b(CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+[a-zA-Z0-9_]+\s+ON\s+)"?([a-zA-Z0-9_]+)"?/gi,
    (_, pre, tbl) => {
      const clean = (tbl.startsWith(prefix) || tbl.startsWith('core_')) ? tbl : `${prefix}${tbl}`;
      return `${pre}"${clean}"`;
    }
  );
  out = out.replace(
    /\b(REFERENCES\s+)"?([a-zA-Z0-9_]+)"?\s*\(/gi,
    (_, pre, tbl) => {
      const clean = tbl.startsWith(prefix) ? tbl : `${prefix}${tbl}`;
      return `${pre}"${clean}"(`;
    }
  );
  // Replace the trailing DO $$ block to only target fl_* and core_* tables
  out = out.replace(
    /WHERE\s+table_schema\s*=\s*'public'\s+AND\s+table_type\s*=\s*'BASE TABLE'/gi,
    "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND (table_name LIKE 'fl_%' OR table_name LIKE 'core_%')"
  );
  return out;
}

async function migrate() {
  console.log('=== ebro_fl (dragonrpa-erp fl_* 프리픽스) Supabase PostgreSQL DDL 마이그레이션 시작 ===');
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Supabase PostgreSQL 직접 연결 성공!');
  await client.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;').catch(() => {});
  await client.query('SET search_path TO public, extensions;');

  const schemaPath = path.resolve(__dirname, '../schema.sql');
  const rawSql = fs.readFileSync(schemaPath, 'utf8');
  const sql = prefixSchemaSql(rawSql, 'fl_');
  console.log('📖 schema.sql (fl_ 프리픽스 변환) 로드 완료 (' + (sql.length / 1024).toFixed(1) + ' KB)');

  console.log('🚀 DDL 전체 스키마 실행 중...');
  console.time('DDL 실행 시간');
  await client.query(sql);
  console.timeEnd('DDL 실행 시간');

  console.log('🛡️ fl_* 및 core_* 테이블 RLS 상태 점검 및 권한 부여 중...');
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND (table_name LIKE 'fl_%' OR table_name LIKE 'core_%');
  `);
  const tables = res.rows.map(r => r.table_name);
  console.log('총 ' + tables.length + '개 fl_*/core_* 테이블 확인.');

  for (const tbl of tables) {
    try {
      await client.query('ALTER TABLE "' + tbl + '" ENABLE ROW LEVEL SECURITY;');
      await client.query('DROP POLICY IF EXISTS "allow_anon_all" ON "' + tbl + '";');
      await client.query('DROP POLICY IF EXISTS "allow_auth_all" ON "' + tbl + '";');
      await client.query('CREATE POLICY "allow_anon_all" ON "' + tbl + '" FOR ALL TO anon USING (true) WITH CHECK (true);');
      await client.query('CREATE POLICY "allow_auth_all" ON "' + tbl + '" FOR ALL TO authenticated USING (true) WITH CHECK (true);');
      await client.query('GRANT ALL ON TABLE "' + tbl + '" TO anon, authenticated, service_role;');
    } catch (e) {
      console.warn('권한 부여 경고 (' + tbl + '):', e.message);
    }
  }
  await client.query('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;');
  await client.query("NOTIFY pgrst, 'reload schema';");

  await client.end();
  console.log('🏁 ebro_fl 스키마 마이그레이션 정상 종료!');
}

migrate().catch(err => {
  console.error('❌ 마이그레이션 실패:', err);
  process.exit(1);
});
