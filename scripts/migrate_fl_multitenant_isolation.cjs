const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Client } = require('pg');

const COMPOSITE_UNIQUES = [
  { table: 'fl_ap_payables', oldName: 'fl_ap_payables_payable_no_key', newName: 'fl_ap_payables_tenant_payable_no_key', col: 'payable_no' },
  { table: 'fl_approval_policies', oldName: 'fl_approval_policies_action_code_key', newName: 'fl_approval_policies_tenant_action_code_key', col: 'action_code' },
  { table: 'fl_billings', oldName: 'fl_billings_billing_no_key', newName: 'fl_billings_tenant_billing_no_key', col: 'billing_no' },
  { table: 'fl_catalog_packages', oldName: 'fl_catalog_packages_catalog_code_key', newName: 'fl_catalog_packages_tenant_catalog_code_key', col: 'catalog_code' },
  { table: 'fl_collections', oldName: 'fl_collections_collection_no_key', newName: 'fl_collections_tenant_collection_no_key', col: 'collection_no' },
  { table: 'fl_contracts', oldName: 'fl_contracts_contract_no_key', newName: 'fl_contracts_tenant_contract_no_key', col: 'contract_no' },
  { table: 'fl_finance_leases', oldName: 'fl_finance_leases_lease_no_key', newName: 'fl_finance_leases_tenant_lease_no_key', col: 'lease_no' },
  { table: 'fl_fulfillments', oldName: 'fl_fulfillments_fulfillment_no_key', newName: 'fl_fulfillments_tenant_fulfillment_no_key', col: 'fulfillment_no' },
  { table: 'fl_inventory_units', oldName: 'fl_inventory_units_unit_code_key', newName: 'fl_inventory_units_tenant_unit_code_key', col: 'unit_code' },
  { table: 'fl_item_masters', oldName: 'fl_item_masters_sku_key', newName: 'fl_item_masters_tenant_sku_key', col: 'sku' },
  { table: 'fl_logistics_dispatches', oldName: 'fl_logistics_dispatches_dispatch_no_key', newName: 'fl_logistics_dispatches_tenant_dispatch_no_key', col: 'dispatch_no' },
  { table: 'fl_purchases', oldName: 'fl_purchases_purchase_no_key', newName: 'fl_purchases_tenant_purchase_no_key', col: 'purchase_no' },
  { table: 'fl_quotations', oldName: 'fl_quotations_quote_no_key', newName: 'fl_quotations_tenant_quote_no_key', col: 'quote_no' },
  { table: 'fl_rental_maintenances', oldName: 'fl_rental_maintenances_maint_no_key', newName: 'fl_rental_maintenances_tenant_maint_no_key', col: 'maint_no' },
  { table: 'fl_trade_aftercare_cases', oldName: 'fl_trade_aftercare_cases_case_no_key', newName: 'fl_trade_aftercare_cases_tenant_case_no_key', col: 'case_no' },
  { table: 'fl_users', oldName: 'fl_users_login_id_key', newName: 'fl_users_tenant_login_id_key', col: 'login_id' },
];

const FL_OPERATIONAL_TABLES = [
  'fl_departments',
  'fl_users',
  'fl_hr_histories',
  'fl_user_permissions',
  'fl_approval_policies',
  'fl_approval_requests',
  'fl_document_templates',
  'fl_partners',
  'fl_partner_sites',
  'fl_item_masters',
  'fl_catalog_packages',
  'fl_exchange_rates',
  'fl_purchases',
  'fl_purchase_lines',
  'fl_logistics_dispatches',
  'fl_ap_payables',
  'fl_inventory_units',
  'fl_stock_movements',
  'fl_quotations',
  'fl_contracts',
  'fl_contract_lines',
  'fl_fulfillments',
  'fl_trade_aftercare_cases',
  'fl_rental_maintenances',
  'fl_asset_events',
  'fl_billings',
  'fl_collections',
  'fl_bank_transactions',
  'fl_finance_leases',
  'fl_finance_lease_schedules',
];

async function addCompositeUniqueIfMissing(client, table, conName, colsSql) {
  const res = await client.query(
    `SELECT 1 FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
    [`public.${table}`, conName]
  );
  if (res.rowCount === 0) {
    await client.query(`ALTER TABLE public.${table} ADD CONSTRAINT ${conName} UNIQUE (${colsSql})`);
    return true;
  }
  return false;
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured in .env');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const item of COMPOSITE_UNIQUES) {
      await client.query(`ALTER TABLE public.${item.table} DROP CONSTRAINT IF EXISTS ${item.oldName}`);
      const added = await addCompositeUniqueIfMissing(
        client,
        item.table,
        item.newName,
        `tenant_id, ${item.col}`
      );
      console.log(`[UNIQUE] ${item.table}: dropped ${item.oldName} -> ${item.newName} (${added ? 'CREATED' : 'EXISTS'})`);
    }

    const docTplAdded = await addCompositeUniqueIfMissing(
      client,
      'fl_document_templates',
      'fl_document_templates_tenant_doc_type_key',
      'tenant_id, doc_type'
    );
    console.log(`[UNIQUE] fl_document_templates: fl_document_templates_tenant_doc_type_key (${docTplAdded ? 'CREATED' : 'EXISTS'})`);

    for (const tbl of FL_OPERATIONAL_TABLES) {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_${tbl}_tenant ON public.${tbl} (tenant_id)`);
    }
    console.log(`[INDEX] Ensured tenant_id indexes on ${FL_OPERATIONAL_TABLES.length} fl_* tables.`);

    await client.query('COMMIT');

    const verifyRes = await client.query(`
      SELECT c.relname AS table_name, con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname LIKE 'fl\\_%' ESCAPE '\\'
        AND c.relname NOT LIKE 'fl\\_backup\\_%' ESCAPE '\\'
        AND con.contype = 'u'
      ORDER BY c.relname, con.conname
    `);
    console.log(`\n=== ACTIVE FL UNIQUE CONSTRAINTS (${verifyRes.rows.length}) ===`);
    for (const row of verifyRes.rows) {
      console.log(`- ${row.table_name}.${row.conname}: ${row.definition}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed and rolled back:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
