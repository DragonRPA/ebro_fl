require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB_CONFIG = process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
} : {
  host: 'aws-0-ap-southeast-2.pooler.supabase.com',
  port: 5432,
  user: 'postgres.mluhhrbcogvsalkchrdp',
  password: process.env.SUPABASE_DB_PASSWORD || '',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
};

async function migrate() {
  console.log('=== ebro_fl Supabase PostgreSQL DDL 마이그레이션 시작 ===');
  const client = new Client(DB_CONFIG);
  await client.connect();
  console.log('✅ Supabase PostgreSQL 직접 연결 성공!');
  await client.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;').catch(() => {});
  await client.query('SET search_path TO public, extensions;');

  const schemaPath = path.resolve(__dirname, '../schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('📖 schema.sql 로드 완료 (' + (sql.length / 1024).toFixed(1) + ' KB)');

  console.log('🚀 DDL 전체 스키마 실행 중...');
  console.time('DDL 실행 시간');
  await client.query(sql);
  console.timeEnd('DDL 실행 시간');

  console.log('🛠️ dev_get_columns / dev_exec_ddl RPC 설치 중...');
  await client.query(`
    CREATE OR REPLACE FUNCTION dev_get_columns(p_table TEXT)
    RETURNS TABLE(column_name TEXT) AS $$
      SELECT column_name::TEXT FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = p_table
      ORDER BY ordinal_position;
    $$ LANGUAGE sql SECURITY DEFINER;

    CREATE OR REPLACE FUNCTION dev_exec_ddl(statements TEXT[])
    RETURNS JSONB AS $$
    DECLARE
      stmt TEXT;
      results JSONB := '[]'::JSONB;
    BEGIN
      FOREACH stmt IN ARRAY statements LOOP
        BEGIN
          EXECUTE stmt;
          results := results || jsonb_build_array(jsonb_build_object('sql', stmt, 'ok', true));
        EXCEPTION WHEN OTHERS THEN
          results := results || jsonb_build_array(jsonb_build_object('sql', stmt, 'ok', false, 'err', SQLERRM));
        END;
      END LOOP;
      NOTIFY pgrst, 'reload schema';
      RETURN results;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `);

  console.log('🛡️ RLS 상태 점검 및 anon/authenticated/service_role 권한 부여 중...');
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
  `);
  const tables = res.rows.map(r => r.table_name);
  console.log('총 ' + tables.length + '개 테이블 생성 확인.');

  for (const tbl of tables) {
    try {
      await client.query('ALTER TABLE "' + tbl + '" DISABLE ROW LEVEL SECURITY;');
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
