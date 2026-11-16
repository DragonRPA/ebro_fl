-- eBroFL (eBro Forklift ERP v2.0) — Normalized PostgreSQL SSOT Schema
-- Strict 1-Term-1-Meaning Domain Model | 29 Core fl_* Tables | snake_case | Idempotent RLS

-- ============================================================================
-- Group A. 조직 · 권한 · 7단계 결재 · 문서양식 (6 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_departments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  name TEXT NOT NULL,
  parent_department_id TEXT,
  manager_id TEXT,
  functional_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 100,
  memo TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  login_id TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  employee_no TEXT,
  department_id TEXT,
  position TEXT,
  duty TEXT,
  tier_level INTEGER NOT NULL DEFAULT 1 CHECK (tier_level BETWEEN 1 AND 7),
  mask_sales_price BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  email TEXT,
  birth_date TEXT,
  join_date TEXT,
  retire_date TEXT,
  address TEXT,
  emergency_contact TEXT,
  base_salary_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
  payroll_bank_name TEXT,
  payroll_account_no TEXT,
  profile_image_url TEXT,
  resident_reg_no TEXT,
  annual_leave_grant NUMERIC(5, 1) NOT NULL DEFAULT 15.0,
  annual_leave_used NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
  pledge_date TEXT,
  pledge_scan_name TEXT,
  pledge_scan_url TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  payroll_account_holder TEXT,
  hourly_wage_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
  meal_allowance_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
  vehicle_allowance_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
  service_contract_krw NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ins_national_pension BOOLEAN NOT NULL DEFAULT true,
  ins_health_insurance BOOLEAN NOT NULL DEFAULT true,
  ins_employment_insurance BOOLEAN NOT NULL DEFAULT true,
  ins_industrial_accident BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_hr_histories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  prev_summary TEXT,
  next_summary TEXT,
  reason TEXT,
  actor_id TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fl_hr_histories_user ON public.fl_hr_histories(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.fl_user_permissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  user_id TEXT,
  tier_level INTEGER CHECK (tier_level BETWEEN 1 AND 7),
  page_id TEXT NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT true,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_approval_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  action_code TEXT NOT NULL UNIQUE,
  action_name TEXT NOT NULL,
  description TEXT,
  required_tier INTEGER NOT NULL DEFAULT 3 CHECK (required_tier BETWEEN 1 AND 7),
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_approval_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  action_code TEXT NOT NULL,
  target_table TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  required_tier INTEGER NOT NULL DEFAULT 3 CHECK (required_tier BETWEEN 1 AND 7),
  requester_id TEXT NOT NULL,
  requester_name TEXT NOT NULL,
  requester_tier INTEGER NOT NULL CHECK (requester_tier BETWEEN 1 AND 7),
  approver_id TEXT,
  approver_name TEXT,
  approver_tier INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reject_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.fl_document_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  doc_type TEXT NOT NULL CHECK (doc_type IN ('견적서_유통', '견적서_렌탈', '계약서_유통', '계약서_렌탈', '거래명세서')),
  template_name TEXT NOT NULL,
  template_path TEXT,
  template_base64 TEXT,
  header_note TEXT,
  footer_note TEXT,
  is_default BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Group B. 기준정보 · 제원 · 카탈로그 · 환율 (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_partners (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  name TEXT NOT NULL,
  biz_reg_no TEXT,
  representative TEXT,
  biz_type TEXT,
  biz_item TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_email TEXT,
  partner_roles JSONB NOT NULL DEFAULT '["매출처"]'::jsonb,
  default_closing_day INTEGER NOT NULL DEFAULT 25,
  default_payment_due_day INTEGER NOT NULL DEFAULT 10,
  default_payment_month_offset INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL DEFAULT '계좌이체',
  bank_name TEXT,
  bank_account TEXT,
  bank_holder TEXT,
  credit_grade TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  biz_cert_url TEXT,
  biz_cert_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_partner_sites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  partner_id TEXT NOT NULL,
  site_name TEXT NOT NULL,
  address TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_item_masters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  item_category TEXT NOT NULL CHECK (item_category IN ('완제품', '어태치먼트', '부품', '소모품')),
  item_domain TEXT NOT NULL DEFAULT 'TRADE' CHECK (item_domain IN ('TRADE', 'RENTAL', 'BOTH')),
  management_type TEXT NOT NULL CHECK (management_type IN ('SERIAL', 'LOT')),
  manufacturer TEXT,
  model_name TEXT,
  tonnage NUMERIC(8,2),
  power_type TEXT,
  spec_summary TEXT,
  unit_name TEXT NOT NULL DEFAULT '대',
  standard_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  dealer_price_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  retail_price_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  standard_monthly_rental_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  standard_daily_rental_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  depreciation_months INTEGER NOT NULL DEFAULT 60,
  residual_value_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  warehouse_location TEXT NOT NULL DEFAULT '평택 주기장',
  diagram_type TEXT,
  image_url TEXT,
  spec_sheet_url TEXT,
  manual_url TEXT,
  vdi_specs JSONB NOT NULL DEFAULT '[]'::jsonb,
  mast_specs JSONB NOT NULL DEFAULT '[]'::jsonb,
  battery_options JSONB NOT NULL DEFAULT '[]'::jsonb,
  oem_cross_ref_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
  compatible_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_catalog_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  catalog_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  target_partner_role TEXT NOT NULL DEFAULT '대리점',
  target_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_item_skus JSONB NOT NULL DEFAULT '[]'::jsonb,
  show_unit_price BOOLEAN NOT NULL DEFAULT true,
  show_stock BOOLEAN NOT NULL DEFAULT true,
  header_notice TEXT,
  footer_contact TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_exchange_rates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  rate_date DATE NOT NULL,
  currency_code TEXT NOT NULL CHECK (currency_code IN ('USD', 'CNY', 'EUR', 'JPY')),
  base_rate_krw NUMERIC(12,4) NOT NULL,
  tt_selling_rate NUMERIC(12,4),
  source TEXT NOT NULL DEFAULT '한국수출입은행',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, rate_date, currency_code)
);

-- ============================================================================
-- Group C. 매입 · 통관 · 물류비 · 매입채무 (4 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_purchases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  purchase_no TEXT NOT NULL UNIQUE,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('IMPORT', 'DOMESTIC')),
  supplier_id TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  target_domain TEXT NOT NULL CHECK (target_domain IN ('TRADE', 'RENTAL')),
  bl_no TEXT,
  lc_no TEXT,
  currency_code TEXT NOT NULL DEFAULT 'KRW',
  fx_rate NUMERIC(12,4) NOT NULL DEFAULT 1,
  fx_date DATE,
  foreign_merchandise_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  krw_merchandise_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  customs_duty_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  ocean_freight_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  clearance_fee_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  inland_freight_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_landed_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_purchase_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  purchase_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL,
  management_type TEXT NOT NULL CHECK (management_type IN ('SERIAL', 'LOT')),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  foreign_unit_price NUMERIC(18,4) NOT NULL DEFAULT 0,
  foreign_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  allocated_merchandise_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  allocated_ancillary_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  landed_unit_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  landed_total_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  serial_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  lot_no TEXT,
  warehouse_location TEXT NOT NULL DEFAULT '평택 주기장',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_logistics_dispatches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  dispatch_no TEXT NOT NULL UNIQUE,
  dispatch_purpose TEXT NOT NULL DEFAULT '일반운송' CHECK (dispatch_purpose IN ('일반운송', '납품운송', '회수운송', '교환', '자체이동')),
  carrier_partner_id TEXT,
  carrier_name TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  vehicle_no TEXT,
  origin_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  related_ref_type TEXT,
  related_ref_id TEXT,
  transport_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_bearer TEXT NOT NULL DEFAULT 'OURS' CHECK (cost_bearer IN ('OURS', 'CUSTOMER', 'SUPPLIER')),
  customer_charge_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  settlement_status TEXT NOT NULL DEFAULT 'UNSETTLED' CHECK (settlement_status IN ('UNSETTLED', 'SETTLED', 'PAID')),
  settlement_ym TEXT,
  dispatch_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_ap_payables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  payable_no TEXT NOT NULL UNIQUE,
  payable_type TEXT NOT NULL CHECK (payable_type IN ('PURCHASE', 'LOGISTICS', 'FINANCE_LEASE', 'SUBLEASE_RENT', 'EXTERNAL_REPAIR')),
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  ref_table TEXT,
  ref_id TEXT,
  currency_code TEXT NOT NULL DEFAULT 'KRW',
  booked_fx_rate NUMERIC(12,4) NOT NULL DEFAULT 1,
  foreign_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  supply_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  settled_fx_rate NUMERIC(12,4),
  fx_gain_loss_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID')),
  due_date DATE,
  accrual_date DATE NOT NULL,
  paid_date DATE,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Group D. 통합 자산/재고 원장 · 수불 이력 (2 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_inventory_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  unit_code TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL CHECK (item_category IN ('완제품', '어태치먼트', '부품', '소모품')),
  management_type TEXT NOT NULL CHECK (management_type IN ('SERIAL', 'LOT')),
  ownership_domain TEXT NOT NULL CHECK (ownership_domain IN ('유통재고', '렌탈자산', '전대자산')),
  serial_no TEXT,
  lot_no TEXT,
  qty_on_hand NUMERIC(12,2) NOT NULL DEFAULT 1,
  qty_reserved NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  accumulated_depreciation_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  book_value_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  depreciation_months INTEGER NOT NULL DEFAULT 60,
  residual_value_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '보유중' CHECK (status IN ('보유중', '출고대기', '대여중', '정비중', '판매완료', '전대반납', '폐기')),
  acquisition_type TEXT NOT NULL DEFAULT 'PURCHASE' CHECK (acquisition_type IN ('PURCHASE', 'FINANCE_LEASE', 'SUBLEASE', 'ACCOUNT_TRANSFER', 'RETURN')),
  acquisition_date DATE NOT NULL,
  purchase_line_id TEXT,
  finance_lease_id TEXT,
  sublease_supplier_id TEXT,
  sublease_supplier_name TEXT,
  sublease_monthly_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  current_contract_id TEXT,
  current_partner_id TEXT,
  current_site_id TEXT,
  warehouse_location TEXT NOT NULL DEFAULT '평택 주기장',
  operating_hours NUMERIC(10,1) NOT NULL DEFAULT 0,
  monthly_rental_fee_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  daily_rental_fee_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_stock_movements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'INBOUND', 'ACCOUNT_TRANSFER', 'TRADE_RESERVE', 'TRADE_OUTBOUND',
    'TRADE_RETURN', 'RENTAL_OUTBOUND', 'RENTAL_RETURN', 'EXCHANGE_OUT',
    'EXCHANGE_IN', 'REPAIR_OUT', 'DISPOSAL'
  )),
  unit_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  from_domain TEXT,
  to_domain TEXT,
  from_status TEXT,
  to_status TEXT,
  qty_delta NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  ref_table TEXT,
  ref_id TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT
);

-- ============================================================================
-- Group E. 견적 · 계약 · 출고 실행완료 · 유통 반품/중개 · 렌탈 정비 (7 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_quotations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  quote_no TEXT NOT NULL UNIQUE,
  quote_domain TEXT NOT NULL CHECK (quote_domain IN ('TRADE', 'RENTAL')),
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  site_id TEXT,
  salesperson_id TEXT NOT NULL,
  salesperson_name TEXT NOT NULL,
  quote_date DATE NOT NULL,
  valid_until DATE NOT NULL,
  rental_months INTEGER DEFAULT 12,
  supply_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'ACCEPTED', 'CONVERTED', 'CANCELLED')),
  converted_contract_id TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  contract_no TEXT NOT NULL UNIQUE,
  contract_domain TEXT NOT NULL CHECK (contract_domain IN ('TRADE', 'RENTAL')),
  quotation_id TEXT,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  site_id TEXT,
  site_name TEXT,
  site_address TEXT,
  salesperson_id TEXT NOT NULL,
  salesperson_name TEXT NOT NULL,
  contract_date DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  closing_day INTEGER NOT NULL DEFAULT 25,
  payment_due_day INTEGER NOT NULL DEFAULT 10,
  payment_month_offset INTEGER NOT NULL DEFAULT 1,
  payment_method TEXT NOT NULL DEFAULT '계좌이체',
  supply_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  monthly_rental_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  daily_rental_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'FULFILLING', 'COMPLETED', 'TERMINATED', 'CANCELLED')),
  special_terms TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_contract_lines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  contract_id TEXT NOT NULL,
  line_no INTEGER NOT NULL DEFAULT 1,
  item_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  item_name TEXT NOT NULL,
  item_category TEXT NOT NULL,
  management_type TEXT NOT NULL CHECK (management_type IN ('SERIAL', 'LOT')),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  fulfilled_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  supply_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  option_summary TEXT,
  assigned_unit_id TEXT,
  assigned_serial_no TEXT,
  assigned_lot_no TEXT,
  line_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (line_status IN ('ACTIVE', 'FULFILLED', 'REPLACED_OUT', 'RETURNED', 'CANCELLED')),
  effective_start_date DATE,
  effective_end_date DATE,
  predecessor_unit_id TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_fulfillments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  fulfillment_no TEXT NOT NULL UNIQUE,
  fulfillment_domain TEXT NOT NULL CHECK (fulfillment_domain IN ('TRADE', 'RENTAL')),
  action_type TEXT NOT NULL CHECK (action_type IN ('유통출고', '렌탈출고', '렌탈회수', '교환')),
  contract_id TEXT NOT NULL,
  contract_line_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  site_id TEXT,
  item_id TEXT NOT NULL,
  unit_id TEXT,
  replacement_unit_id TEXT,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  cogs_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'COMPLETED', 'CANCELLED')),
  effective_date DATE,
  recorded_at TIMESTAMPTZ,
  executed_by TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_trade_aftercare_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  case_no TEXT NOT NULL UNIQUE,
  contract_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('공급사 정비중개', '반품환불', '반품교환')),
  supplier_partner_id TEXT,
  supplier_name TEXT,
  refund_supply_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  refund_vat_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  replacement_unit_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_rental_maintenances (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  maint_no TEXT NOT NULL UNIQUE,
  maint_type TEXT NOT NULL CHECK (maint_type IN ('주기장정비', '현장정비', '순회정비')),
  unit_id TEXT NOT NULL,
  serial_no TEXT,
  contract_id TEXT,
  partner_id TEXT,
  partner_name TEXT,
  mechanic_id TEXT,
  mechanic_name TEXT,
  vendor_partner_id TEXT,
  operating_hours NUMERIC(10,1) NOT NULL DEFAULT 0,
  parts_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  parts_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  labor_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  external_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_cost_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_customer_billable BOOLEAN NOT NULL DEFAULT false,
  customer_charge_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_asset_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  unit_id TEXT NOT NULL,
  contract_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PURCHASE', 'LEASE_INIT', 'ACCOUNT_TRANSFER', 'RENTAL_START',
    'EXCHANGE_OUT', 'EXCHANGE_IN', 'RENTAL_RETURN', 'MAINTENANCE',
    'TRADE_OUTBOUND', 'TRADE_RETURN', 'DEPRECIATION', 'DISPOSAL'
  )),
  predecessor_unit_id TEXT,
  successor_unit_id TEXT,
  operating_hours NUMERIC(10,1) NOT NULL DEFAULT 0,
  delta_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  effective_date DATE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_name TEXT,
  memo TEXT
);

-- ============================================================================
-- Group F. 청구 · 세금계산서 · 수납 · 통장대사 · 금융리스 (5 tables)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fl_billings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  billing_no TEXT NOT NULL UNIQUE,
  billing_ym TEXT NOT NULL,
  billing_domain TEXT NOT NULL CHECK (billing_domain IN ('TRADE', 'RENTAL', 'MIXED')),
  contract_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  billing_date DATE NOT NULL,
  due_date DATE NOT NULL,
  supply_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  vat_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  paid_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  unpaid_balance_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_invoice_issued BOOLEAN NOT NULL DEFAULT false,
  tax_invoice_no TEXT,
  tax_invoice_issued_at DATE,
  statement_sent_at TIMESTAMPTZ,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'CANCELLED')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_collections (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  collection_no TEXT NOT NULL UNIQUE,
  billing_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  collection_date DATE NOT NULL,
  amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT '계좌이체',
  bank_tx_id TEXT,
  recorded_by TEXT NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_bank_transactions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  tx_date DATE NOT NULL,
  tx_direction TEXT NOT NULL CHECK (tx_direction IN ('IN', 'OUT')),
  bank_name TEXT NOT NULL,
  account_no TEXT,
  counterparty_name TEXT NOT NULL,
  amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  matched_type TEXT CHECK (matched_type IN ('AR_BILLING', 'AP_PAYABLE', 'LEASE_INSTALLMENT')),
  matched_id TEXT,
  match_status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (match_status IN ('UNMATCHED', 'MATCHED', 'EXCLUDED')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_finance_leases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  lease_no TEXT NOT NULL UNIQUE,
  lender_partner_id TEXT NOT NULL,
  lender_name TEXT NOT NULL,
  unit_id TEXT,
  unit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  serial_no TEXT,
  principal_amount_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  annual_interest_rate NUMERIC(6,3) NOT NULL DEFAULT 0,
  term_months INTEGER NOT NULL DEFAULT 36,
  repayment_method TEXT NOT NULL CHECK (repayment_method IN ('원리금균등', '원금균등')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  payment_day INTEGER NOT NULL DEFAULT 25,
  remaining_principal_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAID_OFF', 'TERMINATED')),
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fl_finance_lease_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-ebro-fl',
  lease_id TEXT NOT NULL,
  installment_no INTEGER NOT NULL,
  due_ym TEXT NOT NULL,
  due_date DATE NOT NULL,
  opening_principal_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  principal_payment_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  interest_expense_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_installment_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  ending_principal_krw NUMERIC(18,2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_date DATE,
  bank_tx_id TEXT,
  UNIQUE (lease_id, installment_no)
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_fl_users_tenant ON public.fl_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fl_approval_requests_status ON public.fl_approval_requests (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fl_partners_tenant ON public.fl_partners (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fl_partner_sites_partner ON public.fl_partner_sites (partner_id);
CREATE INDEX IF NOT EXISTS idx_fl_item_masters_cat ON public.fl_item_masters (tenant_id, item_category);
CREATE INDEX IF NOT EXISTS idx_fl_purchases_date ON public.fl_purchases (tenant_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_fl_inventory_units_domain ON public.fl_inventory_units (tenant_id, ownership_domain, status);
CREATE INDEX IF NOT EXISTS idx_fl_stock_movements_date ON public.fl_stock_movements (tenant_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_fl_contracts_domain ON public.fl_contracts (tenant_id, contract_domain, status);
CREATE INDEX IF NOT EXISTS idx_fl_fulfillments_domain ON public.fl_fulfillments (tenant_id, fulfillment_domain, status);
CREATE INDEX IF NOT EXISTS idx_fl_maintenances_unit ON public.fl_rental_maintenances (tenant_id, unit_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_fl_billings_ym ON public.fl_billings (tenant_id, billing_ym, status);
CREATE INDEX IF NOT EXISTS idx_fl_lease_schedules_ym ON public.fl_finance_lease_schedules (lease_id, due_ym);

-- ============================================================================
-- Idempotent Row Level Security Policies (anon + authenticated)
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  fl_tables TEXT[] := ARRAY[
    'fl_departments', 'fl_users', 'fl_user_permissions', 'fl_approval_policies',
    'fl_approval_requests', 'fl_document_templates',
    'fl_partners', 'fl_partner_sites', 'fl_item_masters', 'fl_catalog_packages',
    'fl_exchange_rates',
    'fl_purchases', 'fl_purchase_lines', 'fl_logistics_dispatches', 'fl_ap_payables',
    'fl_inventory_units', 'fl_stock_movements',
    'fl_quotations', 'fl_contracts', 'fl_contract_lines', 'fl_fulfillments',
    'fl_trade_aftercare_cases', 'fl_rental_maintenances', 'fl_asset_events',
    'fl_billings', 'fl_collections', 'fl_bank_transactions',
    'fl_finance_leases', 'fl_finance_lease_schedules', 'fl_hr_histories'
  ];
BEGIN
  FOREACH tbl IN ARRAY fl_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_anon_all', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', tbl || '_anon_all', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', tbl || '_auth_all', tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl || '_auth_all', tbl);
  END LOOP;
END $$;
