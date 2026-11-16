'use strict';

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Add missing columns idempotently
    await client.query(`
      ALTER TABLE public.fl_partners
        ADD COLUMN IF NOT EXISTS default_payment_cycle TEXT NOT NULL DEFAULT '익월',
        ADD COLUMN IF NOT EXISTS bankbook_url TEXT,
        ADD COLUMN IF NOT EXISTS bankbook_name TEXT;
    `);
    await client.query(`
      ALTER TABLE public.fl_contracts
        ADD COLUMN IF NOT EXISTS payment_cycle TEXT NOT NULL DEFAULT '익월';
    `);

    // 2. Drop previously named constraints for idempotent re-run
    const dropConstraints = [
      ['fl_partners', 'fl_partners_payment_method_check'],
      ['fl_partners', 'fl_partners_default_closing_day_check'],
      ['fl_partners', 'fl_partners_default_payment_cycle_check'],
      ['fl_partners', 'fl_partners_default_payment_month_offset_check'],
      ['fl_partners', 'fl_partners_payment_due_day_check'],
      ['fl_contracts', 'fl_contracts_payment_method_check'],
      ['fl_contracts', 'fl_contracts_closing_day_check'],
      ['fl_contracts', 'fl_contracts_payment_cycle_check'],
      ['fl_contracts', 'fl_contracts_payment_month_offset_check'],
      ['fl_contracts', 'fl_contracts_payment_due_day_check'],
      ['fl_collections', 'fl_collections_payment_method_check'],
    ];
    for (const [tbl, cname] of dropConstraints) {
      await client.query(`ALTER TABLE public."${tbl}" DROP CONSTRAINT IF EXISTS "${cname}"`);
    }

    // 3. Migrate public.fl_partners semantic conflation ('당월말', '익월10일', '선입금' etc.)
    const preRows = (
      await client.query(`
        SELECT id, name, payment_method, default_closing_day, default_payment_month_offset, default_payment_due_day, memo
        FROM public.fl_partners
        ORDER BY name
      `)
    ).rows;

    let migratedCount = 0;
    for (const row of preRows) {
      const rawMethod = String(row.payment_method || '').trim();
      let closingDay = Number(row.default_closing_day ?? 31);
      if (!Number.isFinite(closingDay) || closingDay < 1 || closingDay > 31) closingDay = 31;

      let monthOffset = Number(row.default_payment_month_offset ?? 1);
      if (!Number.isFinite(monthOffset) || monthOffset < 0 || monthOffset > 6) monthOffset = 1;

      let dueDay = Number(row.default_payment_due_day ?? 10);
      let cycle = '익월';
      let nextMethod = rawMethod;
      let nextMemo = row.memo ? String(row.memo) : null;

      if (rawMethod === '선입금') {
        cycle = '선입금';
        monthOffset = 0;
        dueDay = 0;
        nextMethod = '계좌이체';
      } else if (rawMethod === '당월말 (24일까지 마감)') {
        closingDay = 24;
        cycle = '당월';
        monthOffset = 0;
        dueDay = 31;
        nextMethod = '계좌이체';
        if (!nextMemo || !nextMemo.includes('24일')) {
          nextMemo = nextMemo ? `${nextMemo} | 청구 24일 마감 조건` : '청구 24일 마감 조건';
        }
      } else {
        if (rawMethod.includes('당월')) {
          monthOffset = 0;
          if (rawMethod.includes('말')) dueDay = 31;
        } else if (rawMethod.includes('익익월')) {
          monthOffset = 2;
        } else if (rawMethod.includes('익월')) {
          monthOffset = 1;
          if (rawMethod.includes('말')) dueDay = 31;
        }

        if (rawMethod === '익월15일') dueDay = 15;
        if (rawMethod === '익월10일' || rawMethod === '익월 10일') dueDay = 10;
        if (rawMethod === '20일 결제') {
          monthOffset = 0;
          dueDay = 20;
        }

        if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) dueDay = 10;

        if (monthOffset === 0) cycle = '당월';
        else if (monthOffset === 1) cycle = '익월';
        else if (monthOffset === 2) cycle = '익익월';
        else cycle = '3개월후';

        if (!['계좌이체', '전자어음', '약속어음', '법인카드', '현금'].includes(rawMethod)) {
          if (rawMethod === '어음') nextMethod = '약속어음';
          else if (rawMethod === '카드') nextMethod = '법인카드';
          else nextMethod = '계좌이체';
        }
      }

      await client.query(
        `
        UPDATE public.fl_partners
        SET default_closing_day = $2,
            default_payment_cycle = $3,
            default_payment_month_offset = $4,
            default_payment_due_day = $5,
            payment_method = $6,
            memo = $7,
            updated_at = now()
        WHERE id = $1
        `,
        [row.id, closingDay, cycle, monthOffset, dueDay, nextMethod, nextMemo]
      );

      if (rawMethod !== nextMethod || rawMethod === '선입금' || rawMethod.includes('당월') || rawMethod.includes('익월') || rawMethod.includes('결제')) {
        migratedCount++;
      }
    }

    // 4. Backfill public.fl_contracts
    const ctrRows = (
      await client.query(`
        SELECT id, closing_day, payment_month_offset, payment_due_day, payment_method, payment_cycle
        FROM public.fl_contracts
      `)
    ).rows;
    for (const c of ctrRows) {
      let closingDay = Number(c.closing_day ?? 31);
      if (!Number.isFinite(closingDay) || closingDay < 1 || closingDay > 31) closingDay = 31;
      let offset = Number(c.payment_month_offset ?? 1);
      if (!Number.isFinite(offset) || offset < 0 || offset > 6) offset = 1;
      let dueDay = Number(c.payment_due_day ?? 10);
      let cycle = String(c.payment_cycle || '').trim();
      if (!['선입금', '당월', '익월', '익익월', '3개월후'].includes(cycle)) {
        cycle = offset === 0 ? '당월' : offset === 1 ? '익월' : offset === 2 ? '익익월' : '3개월후';
      }
      if (cycle === '선입금') {
        offset = 0;
        dueDay = 0;
      } else {
        if (!Number.isFinite(dueDay) || dueDay < 1 || dueDay > 31) dueDay = 10;
      }
      let pm = String(c.payment_method || '계좌이체').trim();
      if (!['계좌이체', '전자어음', '약속어음', '법인카드', '현금'].includes(pm)) {
        pm = pm === '어음' ? '약속어음' : pm === '카드' ? '법인카드' : '계좌이체';
      }
      await client.query(
        `
        UPDATE public.fl_contracts
        SET closing_day = $2,
            payment_cycle = $3,
            payment_month_offset = $4,
            payment_due_day = $5,
            payment_method = $6
        WHERE id = $1
        `,
        [c.id, closingDay, cycle, offset, dueDay, pm]
      );
    }

    // 5. Normalize public.fl_collections
    await client.query(`
      UPDATE public.fl_collections
      SET payment_method = CASE
        WHEN payment_method = '어음' THEN '약속어음'
        WHEN payment_method = '카드' THEN '법인카드'
        WHEN payment_method IN ('계좌이체', '전자어음', '약속어음', '법인카드', '현금') THEN payment_method
        ELSE '계좌이체'
      END;
    `);

    // 6. Set column defaults & CHECK constraints
    await client.query(`
      ALTER TABLE public.fl_partners
        ALTER COLUMN default_closing_day SET DEFAULT 31,
        ALTER COLUMN default_payment_cycle SET DEFAULT '익월',
        ALTER COLUMN default_payment_month_offset SET DEFAULT 1,
        ALTER COLUMN default_payment_due_day SET DEFAULT 10,
        ALTER COLUMN payment_method SET DEFAULT '계좌이체',
        ADD CONSTRAINT fl_partners_default_closing_day_check CHECK (default_closing_day BETWEEN 1 AND 31),
        ADD CONSTRAINT fl_partners_default_payment_cycle_check CHECK (default_payment_cycle IN ('선입금', '당월', '익월', '익익월', '3개월후')),
        ADD CONSTRAINT fl_partners_default_payment_month_offset_check CHECK (default_payment_month_offset BETWEEN 0 AND 6),
        ADD CONSTRAINT fl_partners_payment_due_day_check CHECK ((default_payment_cycle = '선입금' AND default_payment_due_day = 0) OR (default_payment_cycle <> '선입금' AND default_payment_due_day BETWEEN 1 AND 31)),
        ADD CONSTRAINT fl_partners_payment_method_check CHECK (payment_method IN ('계좌이체', '전자어음', '약속어음', '법인카드', '현금'));
    `);

    await client.query(`
      ALTER TABLE public.fl_contracts
        ALTER COLUMN closing_day SET DEFAULT 31,
        ALTER COLUMN payment_cycle SET DEFAULT '익월',
        ALTER COLUMN payment_month_offset SET DEFAULT 1,
        ALTER COLUMN payment_due_day SET DEFAULT 10,
        ALTER COLUMN payment_method SET DEFAULT '계좌이체',
        ADD CONSTRAINT fl_contracts_closing_day_check CHECK (closing_day BETWEEN 1 AND 31),
        ADD CONSTRAINT fl_contracts_payment_cycle_check CHECK (payment_cycle IN ('선입금', '당월', '익월', '익익월', '3개월후')),
        ADD CONSTRAINT fl_contracts_payment_month_offset_check CHECK (payment_month_offset BETWEEN 0 AND 6),
        ADD CONSTRAINT fl_contracts_payment_due_day_check CHECK ((payment_cycle = '선입금' AND payment_due_day = 0) OR (payment_cycle <> '선입금' AND payment_due_day BETWEEN 1 AND 31)),
        ADD CONSTRAINT fl_contracts_payment_method_check CHECK (payment_method IN ('계좌이체', '전자어음', '약속어음', '법인카드', '현금'));
    `);

    await client.query(`
      ALTER TABLE public.fl_collections
        ADD CONSTRAINT fl_collections_payment_method_check CHECK (payment_method IN ('계좌이체', '전자어음', '약속어음', '법인카드', '현금'));
    `);

    await client.query('COMMIT');

    const summary = (
      await client.query(`
        SELECT payment_method, default_payment_cycle, default_payment_due_day, default_closing_day, COUNT(*)::int AS cnt
        FROM public.fl_partners
        GROUP BY 1, 2, 3, 4
        ORDER BY cnt DESC, default_payment_cycle, default_payment_due_day
      `)
    ).rows;

    console.log(`[MIGRATION OK] Processed ${preRows.length} partners (${migratedCount} cleaned), ${ctrRows.length} contracts.`);
    console.table(summary);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION FAILED]', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
