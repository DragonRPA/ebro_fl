/**
 * scripts/restore_fl_golden_snapshot.cjs
 * 백업된 골든 스냅샷(backups/fl_golden_snapshot_latest.json)으로부터
 * eBro FL의 모든 fl_* 테이블 데이터를 테스트 훼손 이전 상태로 100% 원자적(Atomic) 복원합니다.
 *
 * 사용법:
 *   node scripts/restore_fl_golden_snapshot.cjs [스냅샷파일경로]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PRIORITY_PARENTS = [
  'fl_tenants',
  'fl_users',
  'fl_company_settings',
  'fl_system_configs',
  'fl_standard_options',
  'fl_forklift_option_masters',
  'fl_site_masters',
  'fl_products',
  'fl_assets',
  'fl_customers',
  'fl_customer_sites',
  'fl_customer_contacts',
  'fl_vendors',
  'fl_vendor_contacts',
  'fl_transport_companies',
  'fl_transport_drivers',
  'fl_contracts',
  'fl_contract_assets',
  'fl_contract_history',
  'fl_consumables',
  'fl_consumable_lots',
  'fl_consumable_purchases',
  'fl_consumable_logs',
  'fl_trade_products',
  'fl_trade_purchases',
  'fl_trade_purchase_items',
  'fl_trade_inventory_lots',
  'fl_trade_sales_orders',
  'fl_trade_sales_order_lines',
  'fl_trade_outbounds',
  'fl_trade_billings',
  'fl_trade_returns'
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[오류] .env 파일에 DATABASE_URL이 설정되어 있지 않습니다.');
    process.exit(1);
  }

  const customArg = process.argv[2];
  const snapshotPath = customArg
    ? path.resolve(customArg)
    : path.join(__dirname, '..', 'backups', 'fl_golden_snapshot_latest.json');

  if (!fs.existsSync(snapshotPath)) {
    console.error(`[오류] 백업 스냅샷 파일을 찾을 수 없습니다: ${snapshotPath}`);
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const tableDataMap = snapshot.tables || {};
  const allSnapshotTables = Object.keys(tableDataMap).filter(t => t.startsWith('fl_'));

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('=== [eBro FL 골든 스냅샷 데이터 복원 시작] ===');
    console.log(`스냅샷 파일 : ${snapshotPath}`);
    console.log(`스냅샷 시각 : ${snapshot.meta?.createdAt || '미상'}`);

    // 1. 원격 DB에 존재하는 fl_* 테이블 및 컬럼 타입 조회
    const colRes = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'fl_%'
    `);

    const dbTableCols = {};
    for (const row of colRes.rows) {
      if (!dbTableCols[row.table_name]) {
        dbTableCols[row.table_name] = {};
      }
      dbTableCols[row.table_name][row.column_name] = row.data_type;
    }

    const validTables = allSnapshotTables.filter(t => Boolean(dbTableCols[t]));

    // 부모 테이블 우선 정렬
    const orderedTables = [
      ...PRIORITY_PARENTS.filter(t => validTables.includes(t)),
      ...validTables.filter(t => !PRIORITY_PARENTS.includes(t)).sort()
    ];

    await client.query('BEGIN');

    // 외래키 제약이 있는 경우를 대비해 TRUNCATE ... CASCADE 일괄 수행
    if (orderedTables.length > 0) {
      const quotedList = orderedTables.map(t => `public."${t}"`).join(', ');
      await client.query(`TRUNCATE TABLE ${quotedList} RESTART IDENTITY CASCADE`);
    }

    let restoredRows = 0;
    let restoredTables = 0;

    for (const table of orderedTables) {
      const rows = tableDataMap[table] || [];
      if (rows.length === 0) continue;

      const colTypes = dbTableCols[table];
      // 스냅샷의 모든 행에 등장하는 컬럼 중 실제 DB 테이블에 존재하는 컬럼만 추출
      const colSet = new Set();
      for (const r of rows) {
        Object.keys(r).forEach(k => {
          if (colTypes[k] !== undefined) colSet.add(k);
        });
      }
      const cols = Array.from(colSet);
      if (cols.length === 0) continue;

      const quotedCols = cols.map(c => `"${c}"`).join(', ');

      // 100건 단위 배치 INSERT
      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const values = [];
        const rowPlaceholders = [];

        batch.forEach((row, rIdx) => {
          const ph = cols.map((col, cIdx) => {
            const paramIdx = rIdx * cols.length + cIdx + 1;
            let val = row[col];
            const dtype = colTypes[col];
            if (val !== null && val !== undefined && (dtype === 'jsonb' || dtype === 'json')) {
              val = JSON.stringify(val);
            }
            values.push(val === undefined ? null : val);
            return `$${paramIdx}`;
          });
          rowPlaceholders.push(`(${ph.join(', ')})`);
        });

        const sql = `INSERT INTO public."${table}" (${quotedCols}) VALUES ${rowPlaceholders.join(', ')} ON CONFLICT DO NOTHING`;
        await client.query(sql, values);
      }

      restoredRows += rows.length;
      restoredTables += 1;
      console.log(`  ✔ ${table.padEnd(36)} : ${String(rows.length).padStart(6)}건 복원 완료`);
    }

    await client.query('COMMIT');
    console.log('------------------------------------------------------------');
    console.log(`복원 완료 테이블 : ${restoredTables}개 (전체 스냅샷 테이블 ${orderedTables.length}개 초기화 포함)`);
    console.log(`총 복원 행 수    : ${restoredRows.toLocaleString()}건`);
    console.log('=== [eBro FL 골든 스냅샷 데이터 복원 완료] ===');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[복원 실패 — 트랜잭션 롤백 완료]', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
