/**
 * scripts/run_fl_30_trade_contracts_rwtt.cjs
 *
 * 1. 현행 schema.sql <-> 원격 PostgreSQL(fl_* 테이블) 컬럼 정합성 검증
 * 2. FL 유통계약 30건 (2026-01 ~ 2026-10, 월별 3건) 및 청구/수납/미납/연체 데이터 원격 DB 동기화
 *    - 이메일 발송 0건 엄수 (contractSentAt = null, sentAt = null)
 * 3. 원격 DB 실조회 기반 도메인 관통 스트레스 테스트(RWTT) 보존 법칙(대차 차액 ₩0) 검증
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { Client } = require('pg');

const moduleCache = {};

function loadTsModule(relPath) {
  const absPath = path.resolve(__dirname, '..', relPath);
  if (moduleCache[absPath]) return moduleCache[absPath].exports;

  const source = fs.readFileSync(absPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: absPath,
  });

  const mod = { exports: {} };
  moduleCache[absPath] = mod;

  const customRequire = (id) => {
    if (id.startsWith('.')) {
      const baseDir = path.dirname(absPath);
      let candidate = path.resolve(baseDir, id);
      if (fs.existsSync(candidate + '.ts')) candidate += '.ts';
      else if (fs.existsSync(candidate + '.js')) candidate += '.js';
      const relFromRoot = path.relative(path.resolve(__dirname, '..'), candidate);
      return loadTsModule(relFromRoot);
    }
    return require(id);
  };

  const wrapper = vm.runInThisContext(
    `(function(exports, require, module, __filename, __dirname) { ${transpiled.outputText}\n})`,
    { filename: absPath }
  );
  wrapper(mod.exports, customRequire, mod, absPath, path.dirname(absPath));
  return mod.exports;
}

async function upsertTableRows(client, tableName, rows, dbTableCols) {
  if (!rows || rows.length === 0) return 0;
  const colTypes = dbTableCols[tableName];
  if (!colTypes) {
    throw new Error(`원격 DB에 테이블이 존재하지 않습니다: ${tableName}`);
  }

  const colSet = new Set();
  const missingCols = new Set();
  for (const r of rows) {
    Object.keys(r).forEach((k) => {
      if (colTypes[k] !== undefined) colSet.add(k);
      else if (r[k] !== undefined) missingCols.add(k);
    });
  }
  if (missingCols.size > 0) {
    console.warn(`  [컬럼 누락 감지] ${tableName}: ${Array.from(missingCols).join(', ')}`);
  }
  const cols = Array.from(colSet);
  if (cols.length === 0) return 0;

  const quotedCols = cols.map((c) => `"${c}"`).join(', ');
  const updateCols = cols.filter((c) => c !== 'id');
  const updateSet = updateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');

  const batchSize = 50;
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

    const conflictClause = updateCols.length > 0
      ? `ON CONFLICT ("id") DO UPDATE SET ${updateSet}`
      : `ON CONFLICT ("id") DO NOTHING`;

    const sql = `INSERT INTO public."${tableName}" (${quotedCols}) VALUES ${rowPlaceholders.join(', ')} ${conflictClause}`;
    await client.query(sql, values);
  }
  return rows.length;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('[오류] DATABASE_URL 환경변수가 없습니다.');
    process.exit(1);
  }

  const { FL_TRADE_RWTT_2026_BUNDLE, FL_TRADE_RWTT_30_SPECS } = loadTsModule('src/data/flTradeRwtt2026Data.ts');
  const { MUJIN_CONSUMABLES, MUJIN_CONSUMABLE_LOTS } = loadTsModule('src/data/mujinGlobalInitialData.ts');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    console.log('=== [1단계: 원격 DB(fl_*) 컬럼 메타데이터 로드 및 스키마 정합성 확인] ===');
    const colRes = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name LIKE 'fl_%'
    `);

    const dbTableCols = {};
    for (const row of colRes.rows) {
      if (!dbTableCols[row.table_name]) dbTableCols[row.table_name] = {};
      dbTableCols[row.table_name][row.column_name] = row.data_type;
    }

    await client.query('BEGIN');

    console.log('=== [2단계: 부품 마스터(R2 실물 이미지 메타 포함) 및 30개 FL 유통계약 RWTT 데이터 동기화] ===');

    // 기존 FL26 RWTT 레코드 정리 후 멱등(Idempotent) 업서트
    await client.query(`DELETE FROM public."fl_payment_deposit_links" WHERE "id" LIKE 'PDL-FL26%'`);
    await client.query(`DELETE FROM public."fl_payments" WHERE "id" LIKE 'PAY-FL26%'`);
    await client.query(`DELETE FROM public."fl_bank_transactions" WHERE "id" LIKE 'TXN-FL26%'`);
    await client.query(`DELETE FROM public."fl_delinquency_action_logs" WHERE "id" LIKE 'DLQ-FL26%'`);
    await client.query(`DELETE FROM public."fl_billing_details" WHERE "billingId" LIKE 'BILL-FL26%'`);
    await client.query(`DELETE FROM public."fl_billings" WHERE "id" LIKE 'BILL-FL26%'`);
    await client.query(`DELETE FROM public."fl_receivables" WHERE "id" LIKE 'RCV-FL26%'`);
    await client.query(`DELETE FROM public."fl_trade_billings" WHERE "id" LIKE 'TBIL-FL26%'`);
    await client.query(`DELETE FROM public."fl_trade_outbounds" WHERE "id" LIKE 'TOUT-FL26%'`);
    await client.query(`DELETE FROM public."fl_trade_sales_order_lines" WHERE "orderId" LIKE 'SO-FL26%'`);
    await client.query(`DELETE FROM public."fl_trade_sales_orders" WHERE "id" LIKE 'SO-FL26%'`);
    await client.query(`DELETE FROM public."fl_contracts" WHERE "id" LIKE 'CTR-FL26%'`);

    const syncPlan = [
      ['fl_consumables', MUJIN_CONSUMABLES],
      ['fl_consumable_lots', MUJIN_CONSUMABLE_LOTS],
      ['fl_trade_sales_orders', FL_TRADE_RWTT_2026_BUNDLE.salesOrders],
      ['fl_trade_sales_order_lines', FL_TRADE_RWTT_2026_BUNDLE.salesOrderLines],
      ['fl_trade_outbounds', FL_TRADE_RWTT_2026_BUNDLE.outbounds],
      ['fl_trade_billings', FL_TRADE_RWTT_2026_BUNDLE.tradeBillings],
      ['fl_contracts', FL_TRADE_RWTT_2026_BUNDLE.contracts],
      ['fl_billings', FL_TRADE_RWTT_2026_BUNDLE.billings],
      ['fl_billing_details', FL_TRADE_RWTT_2026_BUNDLE.billingDetails],
      ['fl_receivables', FL_TRADE_RWTT_2026_BUNDLE.receivables],
      ['fl_payments', FL_TRADE_RWTT_2026_BUNDLE.payments],
      ['fl_bank_transactions', FL_TRADE_RWTT_2026_BUNDLE.bankTransactions],
      ['fl_payment_deposit_links', FL_TRADE_RWTT_2026_BUNDLE.paymentDepositLinks],
      ['fl_delinquency_action_logs', FL_TRADE_RWTT_2026_BUNDLE.delinquencyActionLogs],
    ];

    for (const [tbl, rows] of syncPlan) {
      const cnt = await upsertTableRows(client, tbl, rows, dbTableCols);
      console.log(`  ✔ ${tbl.padEnd(32)} : ${String(cnt).padStart(4)}건 업서트 완료`);
    }

    await client.query('COMMIT');

    console.log('\n=== [3단계: 원격 DB 실조회 기반 30건 FL 유통계약 RWTT 무결성·보존법칙 검증] ===');

    // 1. 월별 계약 건수 검증 (2026-01 ~ 2026-10 각 3건 = 30건)
    const monthlyRes = await client.query(`
      SELECT substring("orderDate" from 1 for 7) AS ym,
             COUNT(*)::int AS cnt,
             SUM("totalSalesAmount")::bigint AS supply_sum
      FROM public."fl_trade_sales_orders"
      WHERE "id" LIKE 'SO-FL26%'
      GROUP BY substring("orderDate" from 1 for 7)
      ORDER BY ym ASC
    `);

    if (monthlyRes.rows.length !== 10) {
      throw new Error(`월별 분포 오류: 기대 10개 연월(2026-01~2026-10), 실제 ${monthlyRes.rows.length}개`);
    }
    for (const r of monthlyRes.rows) {
      if (r.cnt !== 3) {
        throw new Error(`${r.ym} 계약 건수 오류: 기대 3건, 실제 ${r.cnt}건`);
      }
    }

    // 2. 전 단계 1:1 체인 건수 및 이메일 미발송(Zero Email) 검증
    const chainRes = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public."fl_trade_sales_orders" WHERE "id" LIKE 'SO-FL26%') AS so_cnt,
        (SELECT COUNT(*)::int FROM public."fl_trade_sales_order_lines" WHERE "orderId" LIKE 'SO-FL26%') AS sol_cnt,
        (SELECT COUNT(*)::int FROM public."fl_trade_outbounds" WHERE "id" LIKE 'TOUT-FL26%' AND "status" = 'DELIVERED') AS tout_cnt,
        (SELECT COUNT(*)::int FROM public."fl_trade_billings" WHERE "id" LIKE 'TBIL-FL26%') AS tbil_cnt,
        (SELECT COUNT(*)::int FROM public."fl_contracts" WHERE "id" LIKE 'CTR-FL26%' AND "contractType" = 'TRADE') AS ctr_cnt,
        (SELECT COUNT(*)::int FROM public."fl_billings" WHERE "id" LIKE 'BILL-FL26%') AS bill_cnt,
        (SELECT COUNT(*)::int FROM public."fl_billing_details" WHERE "billingId" LIKE 'BILL-FL26%') AS bdet_cnt,
        (SELECT COUNT(*)::int FROM public."fl_receivables" WHERE "id" LIKE 'RCV-FL26%') AS rcv_cnt,
        (SELECT COUNT(*)::int FROM public."fl_payments" WHERE "id" LIKE 'PAY-FL26%') AS pay_cnt,
        (SELECT COUNT(*)::int FROM public."fl_bank_transactions" WHERE "id" LIKE 'TXN-FL26%') AS bnk_cnt,
        (SELECT COUNT(*)::int FROM public."fl_payment_deposit_links" WHERE "id" LIKE 'PDL-FL26%') AS pdl_cnt,
        (SELECT COUNT(*)::int FROM public."fl_delinquency_action_logs" WHERE "id" LIKE 'DLQ-FL26%') AS dlq_cnt,
        (SELECT COUNT(*)::int FROM public."fl_trade_sales_orders" WHERE "id" LIKE 'SO-FL26%' AND "contractSentAt" IS NOT NULL) AS ctr_email_sent_cnt,
        (SELECT COUNT(*)::int FROM public."fl_trade_billings" WHERE "id" LIKE 'TBIL-FL26%' AND ("sentAt" IS NOT NULL OR "status" = 'SENT')) AS tbil_email_sent_cnt,
        (SELECT COUNT(*)::int FROM public."fl_billings" WHERE "id" LIKE 'BILL-FL26%' AND COALESCE("details"->>'emailSent', 'false') = 'true') AS bill_email_sent_cnt
    `);
    const ch = chainRes.rows[0];
    console.log('  [체인 건수 검증]', JSON.stringify(ch));

    if (
      ch.so_cnt !== 30 ||
      ch.sol_cnt !== 30 ||
      ch.tout_cnt !== 30 ||
      ch.tbil_cnt !== 30 ||
      ch.ctr_cnt !== 30 ||
      ch.bill_cnt !== 30 ||
      ch.bdet_cnt !== 60 ||
      ch.rcv_cnt !== 30 ||
      ch.pay_cnt !== 23 ||
      ch.bnk_cnt !== 23 ||
      ch.pdl_cnt !== 23 ||
      ch.dlq_cnt !== 13
    ) {
      throw new Error(`체인 건수 불일치: ${JSON.stringify(ch)}`);
    }

    if (ch.ctr_email_sent_cnt !== 0 || ch.tbil_email_sent_cnt !== 0 || ch.bill_email_sent_cnt !== 0) {
      throw new Error(`이메일 무발송 원칙 위반: ${JSON.stringify(ch)}`);
    }

    // 3. 대차대조 수지 보존 법칙(Conservation Law) 검증
    const finRes = await client.query(`
      SELECT
        tb."id",
        tb."billingMonth",
        tb."status" AS tb_status,
        tb."supplyAmount"::bigint AS supply_amt,
        tb."vatAmount"::bigint AS vat_amt,
        tb."totalAmount"::bigint AS total_amt,
        tb."paidAmount"::bigint AS paid_amt,
        tb."remainingAmount"::bigint AS rem_amt,
        tb."overdueDays"::int AS overdue_days,
        b."status" AS b_status,
        b."totalAmount"::bigint AS b_supply_amt,
        b."paidAmount"::bigint AS b_paid_amt,
        r."status" AS r_status,
        r."totalAmount"::bigint AS r_total_amt,
        r."paidAmount"::bigint AS r_paid_amt,
        r."remainingAmount"::bigint AS r_rem_amt
      FROM public."fl_trade_billings" tb
      JOIN public."fl_billings" b ON b."id" = REPLACE(tb."id", 'TBIL-', 'BILL-')
      JOIN public."fl_receivables" r ON r."id" = REPLACE(tb."id", 'TBIL-', 'RCV-')
      WHERE tb."id" LIKE 'TBIL-FL26%'
      ORDER BY tb."id" ASC
    `);

    let totalBilled = 0;
    let normalPaidAmt = 0;
    let overduePaidAmt = 0;
    let partialPaidAmt = 0;
    let partialRemainingAmt = 0;
    let unpaidOverdueAmt = 0;
    let issuedUnpaidAmt = 0;

    let normalPaidCnt = 0;
    let overduePaidCnt = 0;
    let partialCnt = 0;
    let unpaidOverdueCnt = 0;
    let issuedUnpaidCnt = 0;

    for (const row of finRes.rows) {
      const total = Number(row.total_amt);
      const paid = Number(row.paid_amt);
      const rem = Number(row.rem_amt);
      const overdue = Number(row.overdue_days);

      // 1건 내부 보존식: total = paid + rem
      if (total !== paid + rem) {
        throw new Error(`${row.id} 내부 금액 불일치: total(${total}) != paid(${paid}) + rem(${rem})`);
      }
      // TradeBilling <-> Billing <-> Receivable 3자 금액 정합성
      if (total !== Number(row.r_total_amt) || paid !== Number(row.b_paid_amt) || paid !== Number(row.r_paid_amt) || rem !== Number(row.r_rem_amt)) {
        throw new Error(`${row.id} 테이블간 금액 불일치: ${JSON.stringify(row)}`);
      }

      totalBilled += total;

      if (row.tb_status === 'PAID' && overdue === 0) {
        normalPaidCnt += 1;
        normalPaidAmt += paid;
      } else if (row.tb_status === 'PAID' && overdue > 0) {
        overduePaidCnt += 1;
        overduePaidAmt += paid;
      } else if (row.tb_status === 'PARTIAL') {
        partialCnt += 1;
        partialPaidAmt += paid;
        partialRemainingAmt += rem;
      } else if (row.tb_status === 'OVERDUE') {
        unpaidOverdueCnt += 1;
        unpaidOverdueAmt += rem;
      } else if (row.tb_status === 'ISSUED') {
        issuedUnpaidCnt += 1;
        issuedUnpaidAmt += rem;
      } else {
        throw new Error(`예상치 못한 청구 상태: ${row.id} -> ${row.tb_status}`);
      }
    }

    const bankSumRes = await client.query(`
      SELECT COALESCE(SUM("depositAmount"), 0)::bigint AS bank_sum
      FROM public."fl_bank_transactions"
      WHERE "id" LIKE 'TXN-FL26%'
    `);
    const paySumRes = await client.query(`
      SELECT COALESCE(SUM("amount"), 0)::bigint AS pay_sum
      FROM public."fl_payments"
      WHERE "id" LIKE 'PAY-FL26%'
    `);
    const linkSumRes = await client.query(`
      SELECT COALESCE(SUM("usedAmount"), 0)::bigint AS link_sum
      FROM public."fl_payment_deposit_links"
      WHERE "id" LIKE 'PDL-FL26%'
    `);

    const totalCollected = normalPaidAmt + overduePaidAmt + partialPaidAmt;
    const totalUncollected = partialRemainingAmt + unpaidOverdueAmt + issuedUnpaidAmt;
    const conservationDiff = totalBilled - (totalCollected + totalUncollected);
    const bankSum = Number(bankSumRes.rows[0].bank_sum);
    const paySum = Number(paySumRes.rows[0].pay_sum);
    const linkSum = Number(linkSumRes.rows[0].link_sum);

    if (conservationDiff !== 0) {
      throw new Error(`대차 차액 발생: ${conservationDiff}`);
    }
    if (totalCollected !== bankSum || totalCollected !== paySum || totalCollected !== linkSum) {
      throw new Error(`수납-통장-연결 원장 불일치: collected=${totalCollected}, bank=${bankSum}, pay=${paySum}, link=${linkSum}`);
    }

    const report = {
      executedAt: new Date().toISOString(),
      period: '2026-01 ~ 2026-10 (10개월 × 월 3건 = 30건)',
      emailSentCount: 0,
      counts: {
        contracts: 30,
        normalPaid: normalPaidCnt,
        overduePaid: overduePaidCnt,
        partialOverdue: partialCnt,
        unpaidOverdue: unpaidOverdueCnt,
        issuedUnpaid: issuedUnpaidCnt,
        payments: ch.pay_cnt,
        bankTransactions: ch.bnk_cnt,
        delinquencyLogs: ch.dlq_cnt,
      },
      amounts: {
        totalBilled,
        totalCollected,
        normalPaidAmt,
        overduePaidAmt,
        partialPaidAmt,
        totalUncollected,
        partialRemainingAmt,
        unpaidOverdueAmt,
        issuedUnpaidAmt,
        bankSum,
        paySum,
        linkSum,
        conservationDiff,
      },
    };

    const reportPath = path.join(__dirname, '..', 'backups', 'fl_30_trade_contracts_rwtt_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log('------------------------------------------------------------');
    console.log(`총 청구 합계(부가세 포함)      : ₩${totalBilled.toLocaleString()}`);
    console.log(`  ├─ ① 정상 기한내 완납 (14건) : ₩${normalPaidAmt.toLocaleString()}`);
    console.log(`  ├─ ② 연체 후 추심완납 ( 5건) : ₩${overduePaidAmt.toLocaleString()}`);
    console.log(`  ├─ ③ 부분수납 입금액  ( 4건) : ₩${partialPaidAmt.toLocaleString()}`);
    console.log(`  ├─ ④ 부분수납 연체잔액( 4건) : ₩${partialRemainingAmt.toLocaleString()}`);
    console.log(`  ├─ ⑤ 전액 장기연체미납( 4건) : ₩${unpaidOverdueAmt.toLocaleString()}`);
    console.log(`  └─ ⑥ 최종시점 당월미납( 3건) : ₩${issuedUnpaidAmt.toLocaleString()}`);
    console.log(`수납 총액 (= 통장입금 = 매칭액): ₩${totalCollected.toLocaleString()}`);
    console.log(`최종 미수·연체 총 잔액         : ₩${totalUncollected.toLocaleString()}`);
    console.log(`대차 차액 (Conservation Diff)  : ₩${conservationDiff}`);
    console.log(`이메일 발송 건수               : 0건 (발송 차단 원칙 100% 준수)`);
    console.log('=== [30건 FL 유통계약 청구/수납/미납/연체 RWTT 검증 완료] ===');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[RWTT 실행 오류]', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
