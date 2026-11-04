/**
 * scripts/backup_fl_golden_snapshot.cjs
 * 현재까지 준비된 eBro FL의 모든 원격 PostgreSQL (fl_* 테이블 전체) 데이터를
 * 무손실 골든 스냅샷 JSON으로 백업합니다.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[오류] .env 파일에 DATABASE_URL이 설정되어 있지 않습니다.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('=== [eBro FL 전체 데이터 골든 백업 시작] ===');

    const tblRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE 'fl_%'
      ORDER BY table_name
    `);

    const tables = tblRes.rows.map(r => r.table_name);
    const snapshot = {
      meta: {
        project: 'ebro_FL (무진글로벌 · 지게차 렌탈 및 호환부품 유통 ERP)',
        createdAt: new Date().toISOString(),
        databaseProjectRef: 'lkohpffieaanwhohttbu',
        tableCount: tables.length,
        totalRows: 0,
        tableCounts: {}
      },
      tables: {}
    };

    let totalRows = 0;

    for (const table of tables) {
      // Check if table has 'id' column for deterministic ordering
      const colRes = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = 'id'
      `, [table]);

      const orderClause = colRes.rows.length > 0 ? ' ORDER BY "id" ASC' : '';
      const dataRes = await client.query(`SELECT * FROM public."${table}"${orderClause}`);
      const rows = dataRes.rows || [];

      snapshot.tables[table] = rows;
      snapshot.meta.tableCounts[table] = rows.length;
      totalRows += rows.length;

      if (rows.length > 0) {
        console.log(`  ✔ ${table.padEnd(36)} : ${String(rows.length).padStart(6)}건`);
      }
    }

    snapshot.meta.totalRows = totalRows;

    const backupDir = path.join(__dirname, '..', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const latestPath = path.join(backupDir, 'fl_golden_snapshot_latest.json');
    const datedPath = path.join(backupDir, `fl_golden_snapshot_${dateTag}.json`);

    const jsonContent = JSON.stringify(snapshot, null, 2);
    fs.writeFileSync(latestPath, jsonContent, 'utf8');
    fs.writeFileSync(datedPath, jsonContent, 'utf8');

    console.log('------------------------------------------------------------');
    console.log(`총 테이블 수 : ${tables.length}개`);
    console.log(`총 백업 행 수: ${totalRows.toLocaleString()}건`);
    console.log(`저장 경로 1  : ${latestPath}`);
    console.log(`저장 경로 2  : ${datedPath}`);
    console.log('=== [eBro FL 전체 데이터 골든 백업 완료] ===');
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('[백업 실패]', err);
  process.exit(1);
});
