-- ==============================================================================
-- [ebro_FL ERP] 지게차 및 부품 유통·수입·재고·영업·정비 통합 데이터베이스 스키마 (SSOT)
-- 대상 DBMS: Supabase PostgreSQL (PostgreSQL 15+)
-- 설계 원칙:
--   1. 지게차 국제표준 제원 규격 (VDI 2198 / ISO 5053) 제품 마스터 1:1 관통
--   2. 불필요한 고소작업대(AWP) 렌탈 전용 및 IT 부가 스키마 전면 제거
--   3. 차대번호(S/N)별 입출고·재고경과(Aging)·수입부대비용 도착원가(Landed Cost)·대리점/최종고객 매출이익 완벽 추적
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 기존 불필요 테이블(AWP 전용 / IT 전용) 및 재편 대상 테이블 정리 (FK 역순 CASCADE)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS v_awp_shared_memories_compat CASCADE;
DROP TABLE IF EXISTS site_masters CASCADE;
DROP TABLE IF EXISTS contract_history CASCADE;
DROP TABLE IF EXISTS external_leases CASCADE;
DROP TABLE IF EXISTS outbound_inspections CASCADE;
DROP TABLE IF EXISTS contract_assets CASCADE;
DROP TABLE IF EXISTS contracts CASCADE;
DROP TABLE IF EXISTS standard_options CASCADE;
DROP TABLE IF EXISTS depreciation_logs CASCADE;
DROP TABLE IF EXISTS call_pipeline_logs CASCADE;
DROP TABLE IF EXISTS call_uploads CASCADE;
DROP TABLE IF EXISTS draft_dispatch_orders CASCADE;
DROP TABLE IF EXISTS walkie_channels CASCADE;
DROP TABLE IF EXISTS print_queue CASCADE;
DROP TABLE IF EXISTS print_stations CASCADE;
DROP TABLE IF EXISTS apk_releases CASCADE;
DROP TABLE IF EXISTS developer_authorized_devices CASCADE;

-- ==============================================================================
-- 🏢 [도메인 0] 멀티테넌트 및 전사 기본 설정 (Tenants & Core Workplace)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS tenants (
    id                    TEXT PRIMARY KEY,
    "tenantCode"          TEXT NOT NULL UNIQUE,
    "systemName"          TEXT NOT NULL,
    "displayName"         TEXT NOT NULL,
    "corporateName"       TEXT NOT NULL,
    "tradeName"           TEXT,
    "businessNumber"      TEXT NOT NULL,
    "corporateRegistrationNumber" TEXT,
    "representativeName"  TEXT NOT NULL,
    "openingDate"         TEXT NOT NULL,
    "businessAddress"     TEXT NOT NULL,
    "headOfficeAddress"   TEXT,
    "businessCategory"    TEXT NOT NULL,
    "businessItem"        TEXT NOT NULL,
    "businessTypes"       JSONB DEFAULT '[]'::jsonb,
    "isUnitTaxation"      BOOLEAN NOT NULL DEFAULT FALSE,
    "taxEmail"            TEXT NOT NULL,
    "taxOffice"           TEXT,
    "certificateIssueDate" TEXT,
    tel                   TEXT NOT NULL,
    fax                   TEXT,
    "salesPhone"          TEXT,
    email                 TEXT,
    "websiteUrl"          TEXT,
    workplaces            JSONB DEFAULT '[]'::jsonb,
    yards                 JSONB DEFAULT '[]'::jsonb,
    "mainYardAddress"     TEXT,
    "stampBase64"         TEXT,
    "stampImageUrl"       TEXT,
    "targetRepo"          TEXT,
    "solutionType"        TEXT DEFAULT 'FL_DISTRIBUTION',
    "allowedPages"        JSONB DEFAULT '[]'::jsonb,
    "hiddenPages"         JSONB DEFAULT '[]'::jsonb,
    "features"            JSONB DEFAULT '{}'::jsonb,
    "subscription"        JSONB DEFAULT '{}'::jsonb,
    "bankAccounts"        JSONB DEFAULT '[]'::jsonb,
    "logoUrl"             TEXT,
    "ciUrl"               TEXT,
    "subdomain"           TEXT,
    status                TEXT DEFAULT 'ACTIVE',
    "isDefault"           BOOLEAN DEFAULT FALSE,
    "privacyOfficer"      JSONB DEFAULT '{}'::jsonb,
    "privacyOfficerName"  TEXT,
    "privacyOfficerPosition" TEXT,
    "privacyOfficerDepartment" TEXT,
    "privacyOfficerPhone" TEXT,
    "privacyOfficerEmail" TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL
);

-- ==============================================================================
-- 🏛️ [도메인 1] 조직, 계정 및 권한 관리 (Org, Users & Permissions)
-- ==============================================================================

-- 1-1. 부서 마스터 (departments)
CREATE TABLE IF NOT EXISTS departments (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL UNIQUE,
    "parentDepartmentId"  TEXT REFERENCES departments(id) ON DELETE SET NULL,
    "managerId"           TEXT,
    "functional_tags"     JSONB DEFAULT '[]'::jsonb,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 1-2. 사용자 및 임직원 마스터 (users)
CREATE TABLE IF NOT EXISTS users (
    id                    TEXT PRIMARY KEY,
    "loginId"             TEXT NOT NULL UNIQUE,
    "passwordHash"        TEXT NOT NULL,
    name                  TEXT NOT NULL,
    "departmentId"        TEXT REFERENCES departments(id) ON DELETE SET NULL,
    position              TEXT,
    duty                  TEXT,
    "managerId"           TEXT REFERENCES users(id) ON DELETE SET NULL,
    role                  TEXT CHECK (role IN ('ADMIN', 'MANAGER', 'USER', 'MECHANIC')) NOT NULL DEFAULT 'USER',
    status                TEXT CHECK (status IN ('ACTIVE', 'LEAVE_OF_ABSENCE', 'RETIRED')) NOT NULL DEFAULT 'ACTIVE',
    department            TEXT,
    "baseSalary"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    phone                 TEXT,
    email                 TEXT,
    address               TEXT,
    "birthDate"           TEXT,
    "joinDate"            TEXT,
    "retireDate"          TEXT,
    "profileImageUrl"     TEXT,
    "customRoleId"        TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 1-3. 메뉴별 권한 마스터 (permissions)
CREATE TABLE IF NOT EXISTS permissions (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "menuId"              TEXT NOT NULL,
    role                  TEXT DEFAULT 'USER',
    "canView"             BOOLEAN NOT NULL DEFAULT FALSE,
    "canSave"             BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"           TEXT,
    "updatedAt"           TEXT,
    UNIQUE("userId", "menuId"),
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 1-4. 사용자 정의 권한 역할 마스터 (custom_roles)
CREATE TABLE IF NOT EXISTS custom_roles (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    description           TEXT,
    "isSystem"            BOOLEAN DEFAULT FALSE,
    "createdAt"           TIMESTAMPTZ DEFAULT now(),
    "updatedAt"           TIMESTAMPTZ DEFAULT now(),
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 1-5. 권한 역할별 메뉴 접근 규칙 (role_permissions)
CREATE TABLE IF NOT EXISTS role_permissions (
    id                    TEXT PRIMARY KEY,
    "roleId"              TEXT NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
    "menuId"              TEXT NOT NULL,
    "canView"             BOOLEAN NOT NULL DEFAULT FALSE,
    "canSave"             BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt"           TIMESTAMPTZ DEFAULT now(),
    "updatedAt"           TIMESTAMPTZ DEFAULT now(),
    UNIQUE("roleId", "menuId"),
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 🤝 [도메인 2] 거래처 및 지게차 기술제원 기준정보 (Master Data & Forklift Specs)
-- ==============================================================================

-- 2-1. 매입처 및 해외 수출사 마스터 (vendors)
CREATE TABLE IF NOT EXISTS vendors (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    type                  TEXT CHECK (type IN ('PURCHASE', 'TRANSPORT', 'REPAIR', 'CONSUMABLE', 'OTHER')) NOT NULL DEFAULT 'PURCHASE',
    types                 TEXT,
    "bizRegNo"            TEXT,
    representative        TEXT,
    "contactName"         TEXT,
    contact               TEXT,
    email                 TEXT,
    address               TEXT,
    "bankAccount"         TEXT,
    "bankName"            TEXT,
    "accountNumber"       TEXT,
    "accountHolder"       TEXT,
    "passbookFileUrl"     TEXT,
    "passbookFileName"    TEXT,
    "businessCertFileUrl" TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
    memo                  TEXT,
    "firstTradeDate"      TEXT,
    "lastTradeDate"       TEXT,
    "totalPurchaseAmount" BIGINT DEFAULT 0,
    "taxType"             TEXT,
    "businessStatus"      TEXT DEFAULT 'ACTIVE',
    "closedDate"          TEXT,
    "lastStatusCheckDate" TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 2-2. 고객사 및 대리점 마스터 (customers)
CREATE TABLE IF NOT EXISTS customers (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    "bizRegNo"            TEXT,
    representative        TEXT,
    "repContact"          TEXT,
    "repEmail"            TEXT,
    address               TEXT,
    "bizType"             TEXT,
    "bizItem"             TEXT,
    "transactionStatus"   TEXT CHECK ("transactionStatus" IN ('ALLOWED', 'RESTRICT_NEW', 'BLOCKED_ALL', 'BLOCKED')) NOT NULL DEFAULT 'ALLOWED',
    "defaultBillingDay"   INTEGER DEFAULT 30,
    "defaultStatementClosingDay" INTEGER DEFAULT 25,
    "paymentDueDay"       INTEGER,
    "paymentDueMonthOffset" INTEGER DEFAULT 1,
    "paymentTermDays"     INTEGER,
    "prepaidBalance"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bankAccounts"        JSONB,
    "openingDate"         TEXT,
    "taxOffice"           TEXT,
    "headOfficeAddress"   TEXT,
    "businessCertFileUrl" TEXT,
    "passbookFileUrl"     TEXT,
    "passbookFileName"    TEXT,
    "taxType"             TEXT,
    "taxTypeCd"           TEXT,
    "businessStatus"      TEXT DEFAULT 'ACTIVE',
    "closedDate"          TEXT,
    "lastStatusCheckDate" TEXT,
    "isClosed"            BOOLEAN NOT NULL DEFAULT FALSE,
    "specialNotes"        TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 2-3. 고객사 담당자 (customer_contacts)
CREATE TABLE IF NOT EXISTS customer_contacts (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    position              TEXT,
    contact               TEXT,
    email                 TEXT,
    "isPrimary"           BOOLEAN NOT NULL DEFAULT FALSE,
    "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 2-4. 고객사 납품 사업장·물류센터 (customer_sites)
CREATE TABLE IF NOT EXISTS customer_sites (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name                  TEXT NOT NULL,
    address               TEXT,
    "contactName"         TEXT,
    contact               TEXT,
    email                 TEXT,
    "contacts"            JSONB DEFAULT '[]'::jsonb,
    "billingDay"          INTEGER,
    "statementClosingDay" INTEGER,
    "paymentDueDay"       INTEGER,
    "paymentDueMonthOffset" INTEGER DEFAULT 1,
    "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 2-5. 지게차 공식 제품 카탈로그 및 VDI 2198 국제표준 제원 마스터 (products)
CREATE TABLE IF NOT EXISTS products (
    id                        TEXT PRIMARY KEY,
    "modelName"               TEXT NOT NULL UNIQUE,
    "shortName"               TEXT,
    "seriesName"              TEXT,
    manufacturer              TEXT NOT NULL,
    "originCountry"           TEXT DEFAULT '중국 수입',
    "equipmentClass"          TEXT DEFAULT '전동 좌승식 카운터밸런스',
    "powerSource"             TEXT DEFAULT '리튬인산철 전동',
    "ratedCapacityKg"         INTEGER DEFAULT 2500,
    "loadCenterMm"            INTEGER DEFAULT 500,
    "standardLiftHeightMm"    INTEGER DEFAULT 3000,
    "maxOptionLiftHeightMm"   INTEGER DEFAULT 4700,
    "freeLiftHeightMm"        INTEGER DEFAULT 150,
    "forkDimensionsMm"        TEXT DEFAULT '40 × 122 × 1,070',
    "overallLengthMm"         INTEGER DEFAULT 2485,
    "overallWidthMm"          INTEGER DEFAULT 1180,
    "overheadGuardHeightMm"   INTEGER DEFAULT 2140,
    "turningRadiusMm"         INTEGER DEFAULT 2120,
    "aisleWidth1000x1200Mm"   INTEGER DEFAULT 3845,
    "travelSpeedKmh"          TEXT,
    "liftingSpeedMms"         TEXT,
    "gradeabilityPercent"     DOUBLE PRECISION DEFAULT 20,
    "serviceWeightKg"         INTEGER DEFAULT 3980,
    "powerSpecDetail"         TEXT,
    "motorOrEngineDetail"     TEXT,
    "chargerOrFuelDetail"     TEXT,
    "tireSpecFrontRear"       TEXT,
    "brakeType"               TEXT,
    "waterproofRating"        TEXT,
    "warrantyMonths"          INTEGER DEFAULT 24,
    "warrantyTerms"           TEXT,
    spec                      TEXT,
    weight                    TEXT,
    "machineDimensions"       TEXT,
    gradeability              TEXT,
    speed                     TEXT,
    "asContact"               TEXT DEFAULT '1588-0000',
    "safetyCertDate"          TEXT,
    "safetyCertUrl"           TEXT,
    "specSheetUrl"            TEXT,
    "brochureUrl"             TEXT,
    "operatorManualUrl"       TEXT,
    "isActive"                BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 2-6. 실물 지게차 장비 및 보증 관리 원장 (assets)
CREATE TABLE IF NOT EXISTS assets (
    id                    TEXT PRIMARY KEY,
    "assetNo"             TEXT NOT NULL UNIQUE,
    "serialNo"            TEXT,
    "modelName"           TEXT NOT NULL REFERENCES products("modelName") ON UPDATE CASCADE,
    manufacturer          TEXT,
    "manufactureYear"     TEXT,
    "ownerType"           TEXT CHECK ("ownerType" IN ('OWNED', 'RENTED')) NOT NULL DEFAULT 'OWNED',
    yard                  TEXT NOT NULL DEFAULT 'A창고',
    "vendorId"            TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    supplier              TEXT,
    "maintenanceScore"    INTEGER NOT NULL DEFAULT 0,
    "currentCustomerId"   TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "currentSiteId"       TEXT REFERENCES customer_sites(id) ON DELETE SET NULL,
    "acquisitionDate"     TEXT,
    "acquisitionPrice"    DOUBLE PRECISION DEFAULT 0,
    "depreciationMonths"  INTEGER DEFAULT 60,
    "residualValueRate"   DOUBLE PRECISION DEFAULT 10,
    "accumDepreciation"   DOUBLE PRECISION DEFAULT 0,
    "bookValue"           DOUBLE PRECISION DEFAULT 0,
    "cumRepairCost"       DOUBLE PRECISION DEFAULT 0,
    status                TEXT CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'AWAITING_TRANSPORT', 'RENTED', 'REPAIRING', 'SOLD', 'LOST', 'DISPOSED')) NOT NULL DEFAULT 'AVAILABLE',
    memo                  TEXT,
    note                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 📦 [도메인 3] 지게차 및 부품 유통·수입·재고·매입매출 핵심 원장 (Trade & Inventory)
-- ==============================================================================

-- 3-1. 유통 품목(지게차 완제품·부품) 및 공식 기술제원 통합 마스터 (trade_products)
CREATE TABLE IF NOT EXISTS trade_products (
    id                        TEXT PRIMARY KEY,
    "skuCode"                 TEXT NOT NULL UNIQUE,
    name                      TEXT NOT NULL,
    category                  TEXT NOT NULL,
    "itemType"                TEXT CHECK ("itemType" IN ('EQUIPMENT', 'PART')) NOT NULL DEFAULT 'EQUIPMENT',
    manufacturer              TEXT,
    "modelName"               TEXT,
    "seriesName"              TEXT,
    "originCountry"           TEXT DEFAULT '중국 수입',
    "defaultWarehouse"        TEXT DEFAULT 'A창고',
    spec                      TEXT,
    unit                      TEXT DEFAULT '대',
    "standardCost"            DOUBLE PRECISION DEFAULT 0,
    "dealerPrice"             DOUBLE PRECISION DEFAULT 0,
    "standardPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "safetyStock"             DOUBLE PRECISION DEFAULT 3,
    "warrantyMonths"          INTEGER DEFAULT 12,
    "warrantyTerms"           TEXT,
    status                    TEXT CHECK (status IN ('ACTIVE', 'DISCONTINUED')) NOT NULL DEFAULT 'ACTIVE',
    "cogsMethod"              TEXT CHECK ("cogsMethod" IN ('FIFO', 'MOVING_AVG')) NOT NULL DEFAULT 'FIFO',
    -- 지게차 VDI 2198 국제표준 제원 컬럼
    "equipmentClass"          TEXT,
    "powerType"               TEXT,
    "ratedCapacityKg"         INTEGER,
    "loadCenterMm"            INTEGER,
    "standardLiftHeightMm"    INTEGER,
    "maxOptionLiftHeightMm"   INTEGER,
    "freeLiftHeightMm"        INTEGER,
    "forkDimensionsMm"        TEXT,
    "overallLengthMm"         INTEGER,
    "overallWidthMm"          INTEGER,
    "overheadGuardHeightMm"   INTEGER,
    "turningRadiusMm"         INTEGER,
    "aisleWidth1000x1200Mm"   INTEGER,
    "travelSpeedKmh"          TEXT,
    "liftingSpeedMms"         TEXT,
    "gradeabilityPercent"     DOUBLE PRECISION,
    "serviceWeightKg"         INTEGER,
    "powerSpecDetail"         TEXT,
    "motorOrEngineDetail"     TEXT,
    "chargerOrFuelDetail"     TEXT,
    "tireSpecFrontRear"       TEXT,
    "brakeType"               TEXT,
    "waterproofRating"        TEXT,
    "specSheetUrl"            TEXT,
    "manualUrl"               TEXT,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-2. 국내매입 및 해외수입(외화·환율·관세·부대비용) 발주 원장 (trade_purchases)
CREATE TABLE IF NOT EXISTS trade_purchases (
    id                        TEXT PRIMARY KEY,
    "vendorId"                TEXT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    "purchaseType"            TEXT CHECK ("purchaseType" IN ('DOMESTIC', 'IMPORT')) DEFAULT 'IMPORT',
    currency                  TEXT CHECK (currency IN ('KRW', 'CNY', 'USD')) DEFAULT 'CNY',
    "exchangeRate"            DOUBLE PRECISION DEFAULT 1,
    "foreignTotalAmount"      DOUBLE PRECISION DEFAULT 0,
    "customsDuty"             DOUBLE PRECISION DEFAULT 0,
    "customsClearanceFee"     DOUBLE PRECISION DEFAULT 0,
    "freightCost"             DOUBLE PRECISION DEFAULT 0,
    "otherIncidentalCost"     DOUBLE PRECISION DEFAULT 0,
    "totalIncidentalCost"     DOUBLE PRECISION DEFAULT 0,
    "landedTotalAmount"       DOUBLE PRECISION DEFAULT 0,
    "warehouseName"           TEXT DEFAULT 'A창고',
    "blNumber"                TEXT,
    "orderDate"               TEXT NOT NULL,
    "expectedDate"            TEXT,
    "receivedDate"            TEXT,
    status                    TEXT CHECK (status IN ('REQUESTED', 'ORDERED', 'PARTIAL_RECEIVED', 'RECEIVED', 'CANCELLED')) NOT NULL DEFAULT 'ORDERED',
    "totalAmount"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount"               DOUBLE PRECISION DEFAULT 0,
    "requesterName"           TEXT,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-3. 매입·수입 품목 상세 및 부대비용 안분 도착원가 내역 (trade_purchase_items)
CREATE TABLE IF NOT EXISTS trade_purchase_items (
    id                        TEXT PRIMARY KEY,
    "purchaseId"              TEXT NOT NULL REFERENCES trade_purchases(id) ON DELETE CASCADE,
    "productId"               TEXT NOT NULL REFERENCES trade_products(id) ON DELETE RESTRICT,
    "orderQty"                DOUBLE PRECISION NOT NULL DEFAULT 1,
    "receivedQty"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foreignUnitCost"         DOUBLE PRECISION DEFAULT 0,
    "incidentalCostPerUnit"   DOUBLE PRECISION DEFAULT 0,
    "landedUnitCost"          DOUBLE PRECISION DEFAULT 0,
    "warehouseName"           TEXT DEFAULT 'A창고',
    "serialNumbers"           JSONB DEFAULT '[]'::jsonb,
    memo                      TEXT,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-4. 차대번호(S/N) 및 부품 로트별 현재고·보유경과일수(Aging)·보증만료 원장 (trade_inventory_lots)
CREATE TABLE IF NOT EXISTS trade_inventory_lots (
    id                        TEXT PRIMARY KEY,
    "purchaseId"              TEXT,
    "productId"               TEXT NOT NULL REFERENCES trade_products(id) ON DELETE CASCADE,
    "serialNumber"            TEXT,
    "warehouseName"           TEXT DEFAULT 'A창고',
    "inboundDate"             TEXT,
    "foreignCurrency"         TEXT CHECK ("foreignCurrency" IN ('KRW', 'CNY', 'USD')) DEFAULT 'KRW',
    "foreignUnitPrice"        DOUBLE PRECISION DEFAULT 0,
    "exchangeRate"            DOUBLE PRECISION DEFAULT 1,
    "incidentalCostPerUnit"   DOUBLE PRECISION DEFAULT 0,
    "lotStatus"               TEXT CHECK ("lotStatus" IN ('IN_STOCK', 'SOLD', 'RESERVED', 'RETURNED')) DEFAULT 'IN_STOCK',
    "soldOrderId"             TEXT,
    "soldDate"                TEXT,
    "soldCustomerName"        TEXT,
    "warrantyEndDate"         TEXT,
    "initialQty"              DOUBLE PRECISION NOT NULL DEFAULT 1,
    "remainingQty"            DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE INDEX IF NOT EXISTS idx_trade_lots_product ON trade_inventory_lots("productId");
CREATE INDEX IF NOT EXISTS idx_trade_lots_serial ON trade_inventory_lots("serialNumber");
CREATE INDEX IF NOT EXISTS idx_trade_lots_warehouse ON trade_inventory_lots("warehouseName");
CREATE INDEX IF NOT EXISTS idx_trade_lots_inbound_date ON trade_inventory_lots("inboundDate");

-- 3-5. 창고별 재고실사 및 수량 보정 이력 (trade_inventory_adjustments)
CREATE TABLE IF NOT EXISTS trade_inventory_adjustments (
    id                        TEXT PRIMARY KEY,
    "productId"               TEXT NOT NULL REFERENCES trade_products(id) ON DELETE CASCADE,
    "warehouseId"             TEXT NOT NULL,
    "adjustQty"               DOUBLE PRECISION NOT NULL,
    reason                    TEXT NOT NULL,
    "createdAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-6. 대리점 및 최종고객 매출 수주·판매계약 원장 (trade_sales_orders)
CREATE TABLE IF NOT EXISTS trade_sales_orders (
    id                        TEXT PRIMARY KEY,
    "customerId"              TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "customerTier"            TEXT CHECK ("customerTier" IN ('DEALER', 'END_USER')) DEFAULT 'END_USER',
    "siteId"                  TEXT,
    "siteName"                TEXT,
    "billingMode"             TEXT DEFAULT 'STANDALONE',
    "targetBillingYm"         TEXT,
    "linkedReceivableId"      TEXT,
    "linkedBillingId"         TEXT,
    "deliveryMethod"          TEXT CHECK ("deliveryMethod" IN ('COURIER', 'DIRECT', 'BUNDLE_WITH_RENTAL')) DEFAULT 'DIRECT',
    "orderDate"               TEXT NOT NULL,
    status                    TEXT CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED')) NOT NULL DEFAULT 'CONFIRMED',
    "totalSalesAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCogsAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "appliedOptions"          JSONB DEFAULT '[]'::jsonb,
    "optionSupplyAmount"      DOUBLE PRECISION DEFAULT 0,
    "optionCostAmount"        DOUBLE PRECISION DEFAULT 0,
    "contractDocStatus"       TEXT DEFAULT 'DRAFT',
    "contractSentAt"          TEXT,
    "contractSentTo"          TEXT,
    "deliveryLocation"        TEXT,
    "deliveryDate"            TEXT,
    "receiverName"            TEXT,
    "receiverPhone"           TEXT,
    "paymentTerms"            TEXT,
    "specialTerms"            TEXT,
    "salespersonName"         TEXT,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-7. 매출 수주 품목 및 출고 차대번호 할당 내역 (trade_sales_order_lines)
CREATE TABLE IF NOT EXISTS trade_sales_order_lines (
    id                        TEXT PRIMARY KEY,
    "orderId"                 TEXT NOT NULL REFERENCES trade_sales_orders(id) ON DELETE CASCADE,
    "productId"               TEXT NOT NULL REFERENCES trade_products(id) ON DELETE RESTRICT,
    qty                       DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCogs"                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "serialNumbers"           JSONB DEFAULT '[]'::jsonb,
    "warehouseName"           TEXT DEFAULT 'A창고',
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-8. 지게차 화물탁송 및 부품 택배 출고·인수증 원장 (trade_outbounds)
CREATE TABLE IF NOT EXISTS trade_outbounds (
    id                        TEXT PRIMARY KEY,
    "orderId"                 TEXT NOT NULL REFERENCES trade_sales_orders(id) ON DELETE CASCADE,
    status                    TEXT CHECK (status IN ('REQUESTED', 'ALLOCATED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')) NOT NULL DEFAULT 'REQUESTED',
    "deliveryType"            TEXT CHECK ("deliveryType" IN ('COURIER', 'DIRECT', 'BUNDLE_WITH_RENTAL')) DEFAULT 'DIRECT',
    "courierName"             TEXT,
    "trackingNumber"          TEXT,
    "shippingCost"            DOUBLE PRECISION DEFAULT 0,
    "paidBy"                  TEXT CHECK ("paidBy" IN ('OURS', 'CUSTOMER')) DEFAULT 'OURS',
    "driverName"              TEXT,
    "driverContact"           TEXT,
    "vehicleNo"               TEXT,
    "destinationAddress"      TEXT,
    "receiverName"            TEXT,
    "receiverPhone"           TEXT,
    "proofUrl"                TEXT,
    "proofType"               TEXT CHECK ("proofType" IN ('SIGNATURE', 'PHOTO')),
    "appliedOptions"          JSONB DEFAULT '[]'::jsonb,
    "optionBillingAmount"     DOUBLE PRECISION DEFAULT 0,
    "allocatedAt"             TEXT,
    "packedAt"                TEXT,
    "shippedAt"               TEXT,
    "deliveredAt"             TEXT,
    "closingMemo"             TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-8-2. 지게차 옵션·부착물·장비보호 단가 마스터 (forklift_option_masters)
CREATE TABLE IF NOT EXISTS forklift_option_masters (
    id                        TEXT PRIMARY KEY,
    "optionCode"              TEXT NOT NULL,
    "optionGroup"             TEXT NOT NULL,
    "optionGroupLabel"        TEXT NOT NULL,
    "domainType"              TEXT CHECK ("domainType" IN ('PAID', 'PROTECTION', 'ATTACHMENT', 'SPEC')) NOT NULL DEFAULT 'PAID',
    "domainTypeLabel"         TEXT NOT NULL DEFAULT '유상옵션',
    name                      TEXT NOT NULL,
    "subVariant"              TEXT,
    "specDetail"              TEXT,
    "applicableTonnage"       TEXT,
    unit                      TEXT DEFAULT '식',
    "costPrice"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dealerPrice"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice"               DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFreeDefault"           BOOLEAN NOT NULL DEFAULT FALSE,
    "installLeadHours"        DOUBLE PRECISION DEFAULT 0,
    "isActive"                BOOLEAN NOT NULL DEFAULT TRUE,
    "sortOrder"               INTEGER NOT NULL DEFAULT 1,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-9. 유통 거래명세서·세금계산서 청구 및 미수금 원장 (trade_billings)
CREATE TABLE IF NOT EXISTS trade_billings (
    id                        TEXT PRIMARY KEY,
    "orderId"                 TEXT,
    "orderIds"                JSONB DEFAULT '[]'::jsonb,
    "customerId"              TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    "billingMonth"            TEXT NOT NULL,
    "billingDate"             TEXT,
    "supplyAmount"            DOUBLE PRECISION DEFAULT 0,
    "vatAmount"               DOUBLE PRECISION DEFAULT 0,
    "totalAmount"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                    TEXT CHECK (status IN ('DRAFT', 'ISSUED', 'SENT', 'PAID', 'CANCELLED')) NOT NULL DEFAULT 'ISSUED',
    "recipientName"           TEXT,
    "recipientEmail"          TEXT,
    "ccEmail"                 TEXT,
    "emailSubject"            TEXT,
    "sentAt"                  TEXT,
    "paidAt"                  TEXT,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT NOT NULL,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 3-10. 유통 환입·반품 및 보증교환 원장 (trade_returns)
CREATE TABLE IF NOT EXISTS trade_returns (
    id                        TEXT PRIMARY KEY,
    "orderId"                 TEXT,
    "orderLineId"             TEXT NOT NULL,
    "returnDate"              TEXT NOT NULL,
    qty                       DOUBLE PRECISION NOT NULL DEFAULT 1,
    condition                 TEXT CHECK (condition IN ('SELLABLE', 'DEFECTIVE')) NOT NULL DEFAULT 'SELLABLE',
    status                    TEXT CHECK (status IN ('REQUESTED', 'COMPLETED', 'CANCELLED')) DEFAULT 'COMPLETED',
    reason                    TEXT,
    "refundAmount"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "processedBy"             TEXT,
    memo                      TEXT,
    "createdAt"               TEXT NOT NULL,
    "updatedAt"               TEXT,
    "tenant_id"               TEXT NOT NULL DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 🔧 [도메인 4] 지게차 A/S 보증이력, 예방정비 및 부품 수불 (After-Sales & Maintenance)
-- ==============================================================================

-- 4-1. 정비소모품 카탈로그 (consumables)
CREATE TABLE IF NOT EXISTS consumables (
    id                    TEXT PRIMARY KEY,
    "modelName"           TEXT NOT NULL UNIQUE,
    unit                  TEXT NOT NULL,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stockQty"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    category              TEXT,
    note                  TEXT,
    "repairingQty"        DOUBLE PRECISION DEFAULT 0,
    supplier              TEXT,
    "vendorId"            TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-2. 소모품 로트 재고 (consumable_lots)
CREATE TABLE IF NOT EXISTS consumable_lots (
    id                    TEXT PRIMARY KEY,
    "consumableId"        TEXT,
    "lotNo"               TEXT,
    "inboundDate"         TEXT,
    "receivedDate"        TEXT,
    "unitPrice"           NUMERIC DEFAULT 0,
    "unitCost"            NUMERIC DEFAULT 0,
    "initialQty"          NUMERIC DEFAULT 0,
    "currentQty"          NUMERIC DEFAULT 0,
    "remainingQty"        NUMERIC DEFAULT 0,
    "purchaseRequestId"   TEXT,
    "purchaseId"          TEXT,
    "createdAt"           TEXT,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT DEFAULT 'fl-demo'
);

-- 4-3. 소모품 구매 내역 (consumable_purchases)
CREATE TABLE IF NOT EXISTS consumable_purchases (
    id                    TEXT PRIMARY KEY,
    "consumableId"        TEXT REFERENCES consumables(id) ON DELETE SET NULL,
    "modelName"           TEXT NOT NULL,
    "requestedQty"        INTEGER NOT NULL DEFAULT 1,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sellerName"          TEXT NOT NULL,
    status                TEXT CHECK (status IN ('REQUESTED', 'ACCEPTED', 'COMPLETED', 'CANCELLED')) NOT NULL DEFAULT 'REQUESTED',
    "requesterId"         TEXT NOT NULL,
    "requesterName"       TEXT NOT NULL,
    "accepterId"          TEXT,
    "accepterName"        TEXT,
    "inbounderName"       TEXT,
    "receivedQty"         INTEGER NOT NULL DEFAULT 0,
    "statementFileUrl"    TEXT,
    "requestDate"         TEXT NOT NULL,
    "acceptedDate"        TEXT,
    "completedDate"       TEXT,
    "actualReturnDate"    TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-4. 정비사 차량별 부품 적재 재고 (mechanic_consumable_stocks)
CREATE TABLE IF NOT EXISTS mechanic_consumable_stocks (
    id                    TEXT PRIMARY KEY,
    "mechanicId"          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "consumableId"        TEXT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    "lotId"               TEXT,
    "stockQty"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"           TEXT,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-5. 지게차 예방점검 항목 마스터 (inspection_checklist_items)
CREATE TABLE IF NOT EXISTS inspection_checklist_items (
    id                    TEXT PRIMARY KEY,
    code                  TEXT NOT NULL UNIQUE,
    name                  TEXT NOT NULL,
    category              TEXT NOT NULL,
    score                 INTEGER NOT NULL DEFAULT 5,
    "standardManHours"    DOUBLE PRECISION DEFAULT 0.5,
    "isDefectSymptom"     BOOLEAN DEFAULT FALSE,
    "recommendedConsumableIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relatedManualIds"    TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actionGuide"         TEXT,
    description           TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-6. 지게차 A/S 보증수리 및 현장정비 대장 (repairs)
CREATE TABLE IF NOT EXISTS repairs (
    id                    TEXT PRIMARY KEY,
    "ticketNo"            TEXT,
    "workCategory"        TEXT DEFAULT 'FIELD_AS',
    "workLocation"        TEXT DEFAULT 'SITE',
    "stockSource"         TEXT DEFAULT 'VEHICLE_VAN',
    source                TEXT DEFAULT 'DIRECT_INTAKE',
    "repairType"          TEXT NOT NULL DEFAULT 'INTERNAL',
    "maintenanceType"     TEXT,
    priority              TEXT DEFAULT 'NORMAL',
    "assetId"             TEXT REFERENCES assets(id) ON DELETE SET NULL,
    "assetNo"             TEXT,
    "modelName"           TEXT,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "customerName"        TEXT,
    "siteId"              TEXT REFERENCES customer_sites(id) ON DELETE SET NULL,
    "siteName"            TEXT,
    "siteAddress"         TEXT,
    "locationDetail"      TEXT,
    "reporterName"        TEXT,
    "reporterContact"     TEXT,
    "issueCategory"       TEXT,
    "inspectionItemCode"  TEXT,
    "inspectionItemId"    TEXT REFERENCES inspection_checklist_items(id) ON DELETE SET NULL,
    "degradationScore"    INTEGER NOT NULL DEFAULT 0,
    "issueDescription"    TEXT,
    details               TEXT,
    "errorCode"           TEXT,
    "mechanicId"          TEXT REFERENCES users(id) ON DELETE SET NULL,
    "assignedMechanicId"  TEXT,
    "mechanicName"        TEXT,
    "vendorId"            TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    "requestDate"         TEXT NOT NULL,
    "scheduleDate"        TEXT,
    "visitDate"           TEXT,
    "repairDate"          TEXT,
    "completedDate"       TEXT,
    "outboundDate"        TEXT,
    status                TEXT NOT NULL DEFAULT 'REQUESTED',
    "resolutionType"      TEXT,
    "unresolvedReason"    TEXT,
    "nextAction"          TEXT,
    "actionTaken"         TEXT,
    "partsUsed"           JSONB DEFAULT '[]'::jsonb,
    "collectedParts"      JSONB DEFAULT '[]'::jsonb,
    consumables           JSONB DEFAULT '[]'::jsonb,
    "timelineLogs"        JSONB DEFAULT '[]'::jsonb,
    "timelineEvents"      JSONB DEFAULT '[]'::jsonb,
    "billableType"        TEXT DEFAULT 'FREE',
    "billableAmount"      DOUBLE PRECISION DEFAULT 0,
    "billableToCustomer"  BOOLEAN NOT NULL DEFAULT FALSE,
    "totalCost"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costTotal"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingAmount"       DOUBLE PRECISION,
    "laborHours"          DOUBLE PRECISION,
    "isCustomerFault"     BOOLEAN NOT NULL DEFAULT FALSE,
    "faultImageUrl"       TEXT,
    "evidenceImages"      TEXT[],
    "beforeImage"         TEXT,
    "afterImage"          TEXT,
    "customerSignature"   TEXT,
    "customerConfirmName" TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-7. 수리 투입 부품 내역 (repair_consumables)
CREATE TABLE IF NOT EXISTS repair_consumables (
    id                    TEXT PRIMARY KEY,
    "repairId"            TEXT NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
    "consumableId"        TEXT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    quantity              DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost                  DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-8. 소모품 수불 로그 (consumable_logs)
CREATE TABLE IF NOT EXISTS consumable_logs (
    id                    TEXT PRIMARY KEY,
    "consumableId"        TEXT NOT NULL REFERENCES consumables(id) ON DELETE CASCADE,
    type                  TEXT CHECK (type IN ('INBOUND', 'OUTBOUND', 'ADJUST', 'TRANSFER_TO_VEHICLE', 'RETURN_TO_HQ')) NOT NULL,
    quantity              DOUBLE PRECISION NOT NULL,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    supplier              TEXT,
    "vendorId"            TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    "userId"              TEXT REFERENCES users(id) ON DELETE SET NULL,
    "mechanicId"          TEXT REFERENCES users(id) ON DELETE SET NULL,
    "fromLocation"        TEXT,
    "toLocation"          TEXT,
    "targetAssetId"       TEXT REFERENCES assets(id) ON DELETE SET NULL,
    "evidenceFileUrl"     TEXT,
    description           TEXT,
    "actionDate"          TEXT NOT NULL,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-9. 지게차 제조사 공식 기술매뉴얼·제원표 아카이브 (equipment_manuals)
CREATE TABLE IF NOT EXISTS equipment_manuals (
    id                    TEXT PRIMARY KEY,
    "modelName"           TEXT NOT NULL,
    manufacturer          TEXT NOT NULL,
    "equipmentClass"      TEXT,
    "ratedCapacityKg"     INTEGER,
    category              TEXT NOT NULL CHECK (category IN ('PARTS_BOOK', 'ERROR_CODE', 'WIRING_DIAGRAM', 'OPERATOR_MANUAL', 'SPEC_SHEET', 'BROCHURE')),
    title                 TEXT NOT NULL,
    "fileUrl"             TEXT NOT NULL,
    "fileName"            TEXT NOT NULL,
    "fileSize"            BIGINT NOT NULL DEFAULT 0,
    "fileSizeLabel"       TEXT,
    version               TEXT DEFAULT 'Rev. 1.0',
    "uploadDate"          TEXT NOT NULL DEFAULT CURRENT_DATE::TEXT,
    "uploadedBy"          TEXT NOT NULL,
    memo                  TEXT,
    "inspectionItemCodes" JSONB DEFAULT '[]'::jsonb,
    media_type            TEXT DEFAULT 'PDF' CHECK (media_type IN ('PDF', 'YOUTUBE', 'WEB_LINK')),
    "externalUrl"         TEXT,
    keywords              JSONB DEFAULT '[]'::jsonb,
    "errorCodes"          JSONB DEFAULT '[]'::jsonb,
    "majorParts"          JSONB DEFAULT '[]'::jsonb,
    symptoms              JSONB DEFAULT '[]'::jsonb,
    "aiSummary"           TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 4-10. 창고·차량 부품 재고실사 원장 (stocktaking_audits & stocktaking_audit_items & collected_parts)
CREATE TABLE IF NOT EXISTS stocktaking_audits (
    id                    TEXT PRIMARY KEY,
    "auditNo"             TEXT NOT NULL,
    "targetType"          TEXT CHECK ("targetType" IN ('HQ', 'VEHICLE')) NOT NULL,
    "mechanicId"          TEXT,
    "mechanicName"        TEXT,
    "vehicleNo"           TEXT,
    "auditDate"           TEXT NOT NULL,
    "auditorId"           TEXT NOT NULL,
    "auditorName"         TEXT NOT NULL,
    status                TEXT CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')) NOT NULL DEFAULT 'DRAFT',
    "totalSystemQty"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalActualQty"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDiffQty"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSystemAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalActualAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDiffAmount"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    memo                  TEXT,
    "confirmedAt"         TEXT,
    "confirmedBy"         TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS stocktaking_audit_items (
    id                    TEXT PRIMARY KEY,
    "auditId"             TEXT NOT NULL REFERENCES stocktaking_audits(id) ON DELETE CASCADE,
    "consumableId"        TEXT NOT NULL,
    "modelName"           TEXT NOT NULL,
    unit                  TEXT NOT NULL,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "systemQty"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actualQty"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diffQty"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diffAmount"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diffReason"          TEXT CHECK ("diffReason" IN ('LOST', 'DAMAGED', 'UNRECORDED_USAGE', 'SURPLUS', 'OTHER')),
    note                  TEXT,
    "createdAt"           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS collected_parts (
    id                    TEXT PRIMARY KEY,
    "partNo"              TEXT NOT NULL,
    "consumableId"        TEXT NOT NULL,
    "modelName"           TEXT NOT NULL,
    "mechanicId"          TEXT NOT NULL,
    "mechanicName"        TEXT NOT NULL,
    quantity              DOUBLE PRECISION NOT NULL DEFAULT 1,
    disposition           TEXT CHECK (disposition IN ('REBUILD', 'SCRAP', 'VENDOR_WARRANTY')) NOT NULL DEFAULT 'REBUILD',
    status                TEXT CHECK (status IN ('RECEIVED', 'IN_PROCESS', 'COMPLETED')) NOT NULL DEFAULT 'RECEIVED',
    "receivedDate"        TEXT NOT NULL,
    "actionDate"          TEXT,
    "actionMemo"          TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 🚚 [도메인 5] 화물운송, 대금청구·수납 및 경영지원 (Logistics, Finance & Admin)
-- ==============================================================================

-- 5-1. 운송 협력사 및 기사 (transport_companies & transport_drivers & deliveries)
CREATE TABLE IF NOT EXISTS transport_companies (
    id                    TEXT PRIMARY KEY,
    name                  TEXT NOT NULL,
    "businessNo"          TEXT,
    contact               TEXT,
    "bankName"            TEXT,
    "bankAccount"         TEXT,
    "bankHolder"          TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS transport_drivers (
    id                    TEXT PRIMARY KEY,
    "companyId"           TEXT REFERENCES transport_companies(id) ON DELETE SET NULL,
    "driverName"          TEXT NOT NULL,
    "driverContact"       TEXT,
    "vehicleNo"           TEXT,
    "vehicleType"         TEXT,
    "vehicleColor"        TEXT,
    "birthDate"           TEXT,
    address               TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS deliveries (
    id                    TEXT PRIMARY KEY,
    "orderNo"             TEXT,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "siteId"              TEXT REFERENCES customer_sites(id) ON DELETE SET NULL,
    "assetIds"            TEXT,
    type                  TEXT CHECK (type IN ('OUTBOUND', 'INBOUND', 'EXCHANGE', 'MOVEMENT', 'RETURN')) NOT NULL DEFAULT 'OUTBOUND',
    "dispatchCategory"    TEXT DEFAULT '출고',
    purpose               TEXT,
    "paidBy"              TEXT,
    "transportVendorId"   TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    "transportCompany"    TEXT,
    "driverName"          TEXT,
    "driverContact"       TEXT,
    "vehicleNo"           TEXT,
    "vehicleType"         TEXT,
    "originAddress"       TEXT,
    "loadingDate"         TEXT,
    "destinationAddress"  TEXT,
    "unloadingDate"       TEXT,
    "expectedCost"        DOUBLE PRECISION DEFAULT 0,
    "deliveryCost"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalCost"           DOUBLE PRECISION DEFAULT 0,
    "reconciliationStatus" TEXT DEFAULT 'PENDING',
    status                TEXT CHECK (status IN ('PENDING', 'REQUESTED', 'DISPATCHED', 'DELIVERED', 'COMPLETED', 'CANCELLED')) NOT NULL DEFAULT 'PENDING',
    "requestDate"         TEXT NOT NULL,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS asset_inout_logs (
    id                    TEXT PRIMARY KEY,
    "assetId"             TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    "assetNo"             TEXT NOT NULL,
    "modelName"           TEXT NOT NULL,
    type                  TEXT NOT NULL,
    "inboundNo"           TEXT,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "customerName"        TEXT,
    "siteId"              TEXT REFERENCES customer_sites(id) ON DELETE SET NULL,
    "siteName"            TEXT,
    "deliveryId"          TEXT REFERENCES deliveries(id) ON DELETE SET NULL,
    "repairId"            TEXT,
    "maintenanceScore"    INTEGER DEFAULT 0,
    "eventDate"           TEXT NOT NULL,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- 5-2. 일반 청구·미수금·수납 및 통장 대사 (billings, receivables, payments, bank_transactions)
CREATE TABLE IF NOT EXISTS billing_invoices (
    id                    TEXT PRIMARY KEY,
    "customId"            TEXT,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "billingYm"           TEXT NOT NULL,
    "siteId"              TEXT REFERENCES customer_sites(id) ON DELETE SET NULL,
    "totalAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vatAmount"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grandTotal"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                TEXT CHECK (status IN ('DRAFT', 'ISSUED', 'PAID', 'PARTIAL', 'CANCELLED')) NOT NULL DEFAULT 'DRAFT',
    "dueDate"             TEXT,
    "issuedAt"            TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS billings (
    id                    TEXT PRIMARY KEY,
    "billingType"         TEXT CHECK ("billingType" IN ('ASSET_SALE', 'REPAIR', 'TRANSPORT', 'RENTAL')) NOT NULL DEFAULT 'ASSET_SALE',
    "billingYm"           TEXT NOT NULL,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "invoiceId"           TEXT REFERENCES billing_invoices(id) ON DELETE SET NULL,
    "billingDate"         TEXT NOT NULL,
    "totalAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                TEXT CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID', 'REQUESTED', 'REJECTED')) NOT NULL DEFAULT 'UNPAID',
    "rejectReason"        TEXT,
    details               JSONB,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS billing_details (
    id                    TEXT PRIMARY KEY,
    "billingId"           TEXT NOT NULL REFERENCES billings(id) ON DELETE CASCADE,
    "assetId"             TEXT REFERENCES assets(id) ON DELETE SET NULL,
    "receivableId"        TEXT,
    "itemName"            TEXT NOT NULL,
    "displayName"         TEXT,
    "internalDescription" TEXT,
    quantity              DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    amount                DOUBLE PRECISION NOT NULL DEFAULT 0,
    description           TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS receivables (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "vendorName"          TEXT,
    "assetNo"             TEXT,
    type                  TEXT CHECK (type IN ('TRANSPORT', 'REPAIR', 'CLEANING', 'OTHER', 'VENDOR_CLAIM')) NOT NULL,
    "occurredDate"        TEXT NOT NULL,
    "internalDescription" TEXT NOT NULL,
    "displayName"         TEXT,
    "totalAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billedAmount"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                TEXT CHECK (status IN ('PENDING', 'PARTIAL', 'CLEARED')) NOT NULL DEFAULT 'PENDING',
    "repairId"            TEXT REFERENCES repairs(id) ON DELETE SET NULL,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS payments (
    id                    TEXT PRIMARY KEY,
    "billingId"           TEXT NOT NULL REFERENCES billings(id) ON DELETE CASCADE,
    "paymentDate"         TEXT NOT NULL,
    amount                DOUBLE PRECISION NOT NULL,
    method                TEXT NOT NULL,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS bank_transactions (
    id                    TEXT PRIMARY KEY,
    "bankName"            TEXT,
    "accountNumber"       TEXT,
    "transactionDate"     TEXT NOT NULL,
    summary               TEXT,
    counterparty          TEXT,
    "senderName"          TEXT NOT NULL,
    "senderAccount"       TEXT,
    "depositAmount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "withdrawAmount"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    balance               DOUBLE PRECISION,
    "branchName"          TEXT,
    "customerId"          TEXT REFERENCES customers(id) ON DELETE SET NULL,
    "matchedBillingId"    TEXT REFERENCES billings(id) ON DELETE SET NULL,
    "matchingType"        TEXT CHECK ("matchingType" IN ('AUTO', 'MANUAL')),
    "isDeposit"           BOOLEAN NOT NULL DEFAULT TRUE,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS payment_deposit_links (
    id                    TEXT PRIMARY KEY,
    "paymentId"           TEXT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    "bankTransactionId"   TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    "usedAmount"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS bank_matching_rules (
    id                    TEXT PRIMARY KEY,
    "senderName"          TEXT NOT NULL UNIQUE,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS bank_initial_balances (
    id                    TEXT PRIMARY KEY,
    "bankName"            TEXT NOT NULL,
    "accountNumber"       TEXT,
    "initialBalance"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "asOfDate"            TEXT,
    "createdAt"           TEXT,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS purchase_settlements (
    id                    TEXT PRIMARY KEY,
    "settlementYm"        TEXT NOT NULL,
    "settlementType"      TEXT NOT NULL,
    "vendorId"            TEXT REFERENCES vendors(id) ON DELETE SET NULL,
    "vendorName"          TEXT NOT NULL,
    "totalAmount"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                TEXT CHECK (status IN ('PENDING', 'APPROVED', 'CONFIRMED', 'PAID', 'REJECTED')) NOT NULL DEFAULT 'PENDING',
    "paymentDate"         TEXT,
    "paymentMethod"       TEXT,
    "bankAccount"         TEXT,
    "bankTransactionId"   TEXT REFERENCES bank_transactions(id) ON DELETE SET NULL,
    "confirmedAt"         TEXT,
    "confirmedBy"         TEXT,
    "itemCount"           INTEGER NOT NULL DEFAULT 0,
    memo                  TEXT,
    "taxInvoiceNo"        TEXT,
    "taxInvoiceIssueDate" TEXT,
    "taxInvoiceSupplyAmount" DOUBLE PRECISION,
    "taxInvoiceVatAmount" DOUBLE PRECISION,
    "taxInvoiceTotalAmount" DOUBLE PRECISION,
    "taxInvoiceMatchStatus" TEXT DEFAULT 'UNMATCHED',
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS purchase_settlement_items (
    id                    TEXT PRIMARY KEY,
    "settlementId"        TEXT NOT NULL REFERENCES purchase_settlements(id) ON DELETE CASCADE,
    "sourceType"          TEXT NOT NULL,
    "sourceId"            TEXT NOT NULL,
    "itemDescription"     TEXT NOT NULL,
    quantity              DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    amount                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidenceFileUrl"     TEXT,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS settlement_payment_logs (
    id                    TEXT PRIMARY KEY,
    "settlementId"        TEXT NOT NULL REFERENCES purchase_settlements(id) ON DELETE CASCADE,
    "bankTransactionId"   TEXT REFERENCES bank_transactions(id) ON DELETE SET NULL,
    "paidAmount"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paymentDate"         TEXT NOT NULL,
    "paymentMethod"       TEXT,
    "bankAccount"         TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS prepaid_transactions (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "transactionDate"     TEXT,
    type                  TEXT CHECK (type IN ('DEPOSIT', 'DEDUCTION', 'REFUND', 'CHARGE', 'USE_FOR_BILLING')) NOT NULL,
    amount                DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balanceAfter"        DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billingId"           TEXT REFERENCES billings(id) ON DELETE SET NULL,
    "paymentId"           TEXT REFERENCES payments(id) ON DELETE SET NULL,
    "bankTransactionId"   TEXT REFERENCES bank_transactions(id) ON DELETE SET NULL,
    description           TEXT,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS delinquency_action_logs (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "actionDate"          TEXT,
    "actionType"          TEXT CHECK ("actionType" IN ('CALL', 'SMS', 'VISIT', 'LEGAL_NOTICE', 'DEVICE_LOCK', 'NOTICE_SENT', 'LEGAL', 'DIRECTIVE')) NOT NULL,
    "actionDetails"       TEXT,
    "recordedBy"          TEXT,
    "promiseDate"         TEXT,
    "promiseAmount"       DOUBLE PRECISION,
    "promiseStatus"       TEXT DEFAULT 'PENDING',
    "actorId"             TEXT REFERENCES users(id) ON DELETE SET NULL,
    "createdAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS legal_notice_logs (
    id                    TEXT PRIMARY KEY,
    "customerId"          TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    "customerName"        TEXT NOT NULL,
    representative        TEXT NOT NULL,
    "bizRegNo"            TEXT,
    address               TEXT NOT NULL,
    "overdueAmount"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overdueDays"         INTEGER NOT NULL DEFAULT 0,
    "noticeTitle"         TEXT NOT NULL,
    "noticeContent"       TEXT NOT NULL,
    "deadlineDays"        INTEGER NOT NULL DEFAULT 14,
    "sentDate"            TEXT NOT NULL,
    "sentByUserId"        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "sentByName"          TEXT NOT NULL,
    "postalTrackingNo"    TEXT,
    status                TEXT DEFAULT 'SENT',
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS legal_notice_templates (
    id                    TEXT PRIMARY KEY,
    title                 TEXT NOT NULL,
    content               TEXT NOT NULL,
    "deadlineDays"        INTEGER NOT NULL DEFAULT 14,
    "isDefault"           BOOLEAN DEFAULT FALSE,
    "createdAt"           TEXT,
    "updatedAt"           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_flow_snapshots (
    id                    TEXT PRIMARY KEY,
    "snapshotDate"        TEXT NOT NULL,
    "startingBalance"     BIGINT NOT NULL DEFAULT 0,
    "projectedInflow"     BIGINT NOT NULL DEFAULT 0,
    "projectedOpex"       BIGINT NOT NULL DEFAULT 0,
    "projectedCapex"      BIGINT NOT NULL DEFAULT 0,
    "projectedFinalBalance" BIGINT NOT NULL DEFAULT 0,
    notes                 TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS monthly_income_statements (
    id                    TEXT PRIMARY KEY,
    "targetYm"            TEXT,
    status                TEXT,
    "issuedAt"            TEXT,
    "issuedBy"            TEXT,
    "issuedByName"        TEXT,
    "rentalRevenue"       NUMERIC DEFAULT 0,
    "distributionRevenue" NUMERIC DEFAULT 0,
    "otherRevenue"        JSONB,
    "totalRevenue"        NUMERIC DEFAULT 0,
    "rentalCost"          JSONB,
    "pureRentalProfit"    NUMERIC DEFAULT 0,
    "rentalMarginRate"    NUMERIC DEFAULT 0,
    "distributionCost"    NUMERIC DEFAULT 0,
    "pureDistributionProfit" NUMERIC DEFAULT 0,
    "distributionMarginRate" NUMERIC DEFAULT 0,
    "otherCost"           JSONB,
    "otherNetProfit"      NUMERIC DEFAULT 0,
    "totalCostOfSales"    NUMERIC DEFAULT 0,
    "grossProfit"         NUMERIC DEFAULT 0,
    "grossMarginRate"     NUMERIC DEFAULT 0,
    "sgaExpenses"         JSONB,
    "operatingProfit"     NUMERIC DEFAULT 0,
    "operatingMarginRate" NUMERIC DEFAULT 0,
    "estimatedTax"        NUMERIC DEFAULT 0,
    "projectedNetProfit"  NUMERIC DEFAULT 0,
    "netMarginRate"       NUMERIC DEFAULT 0,
    "settlementClosingStatus" JSONB,
    memo                  TEXT,
    "createdAt"           TEXT,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT DEFAULT 'fl-demo'
);

-- 5-3. 영업일지, 할일, 인사근태 및 법인차량 (sales_journals, todos, HR, corporate_vehicles)
CREATE TABLE IF NOT EXISTS sales_journals (
    id                  TEXT PRIMARY KEY,
    "journalDate"       TEXT NOT NULL,
    "salespersonId"     TEXT NOT NULL,
    "salespersonName"   TEXT NOT NULL,
    "department"        TEXT,
    "customerId"        TEXT,
    "customerName"      TEXT NOT NULL,
    "contactName"       TEXT,
    "contactTitle"      TEXT,
    "stage"             TEXT NOT NULL DEFAULT '영업개시',
    "summary"           TEXT NOT NULL,
    "nextSchedule"      TEXT,
    "nextScheduleDate"  TEXT,
    "rawContent"        TEXT NOT NULL,
    "extractedJson"     JSONB,
    "aiModel"           TEXT,
    "createdAt"         TEXT NOT NULL,
    "updatedAt"         TEXT,
    "tenant_id"         TEXT DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS todos (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "assignedUserId"      TEXT REFERENCES users(id) ON DELETE SET NULL,
    "targetDept"          TEXT,
    "targetRole"          TEXT,
    "taskCategory"        TEXT NOT NULL DEFAULT 'GENERAL',
    type                  TEXT NOT NULL DEFAULT 'GENERAL',
    title                 TEXT NOT NULL,
    content               TEXT NOT NULL,
    priority              TEXT NOT NULL DEFAULT 'NORMAL',
    "dueDate"             TEXT,
    "actionUrl"           TEXT NOT NULL DEFAULT '/',
    "entityType"          TEXT,
    "entityId"            TEXT,
    "targetType"          TEXT,
    "isCompleted"         BOOLEAN NOT NULL DEFAULT FALSE,
    "relatedEntityId"     TEXT,
    "senderId"            TEXT REFERENCES users(id) ON DELETE SET NULL,
    "senderName"          TEXT,
    "resolutionNote"      TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "completedAt"         TEXT,
    "completedByUserId"   TEXT REFERENCES users(id) ON DELETE SET NULL,
    "completedByName"     TEXT,
    "completionAction"    TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS annual_leave_quotas (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    year                  INTEGER NOT NULL,
    "baseDays"            DOUBLE PRECISION NOT NULL DEFAULT 15,
    "bonusDays"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDays"           DOUBLE PRECISION NOT NULL DEFAULT 15,
    "usedDays"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingDays"       DOUBLE PRECISION NOT NULL DEFAULT 15,
    "periodStart"         TEXT,
    "periodEnd"           TEXT,
    "grantedDays"         DOUBLE PRECISION NOT NULL DEFAULT 15,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    UNIQUE("userId", year),
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS leave_usages (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "leaveType"           TEXT CHECK ("leaveType" IN ('ANNUAL', 'HALF_AM', 'HALF_PM', 'SPECIAL', 'SICK', 'OFFICIAL', 'UNPAID')) NOT NULL,
    "startDate"           TEXT NOT NULL,
    "endDate"             TEXT NOT NULL,
    "usedDays"            DOUBLE PRECISION NOT NULL,
    reason                TEXT,
    status                TEXT CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')) NOT NULL DEFAULT 'PENDING',
    "approverId"          TEXT REFERENCES users(id) ON DELETE SET NULL,
    "approvedAt"          TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS overtime_records (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "workDate"            TEXT NOT NULL,
    "overtimeType"        TEXT CHECK ("overtimeType" IN ('OVERTIME', 'NIGHT', 'HOLIDAY')) NOT NULL,
    "startTime"           TEXT NOT NULL,
    "endTime"             TEXT NOT NULL,
    "hoursWorked"         DOUBLE PRECISION NOT NULL,
    "startDateTime"       TEXT,
    hours                 DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workDetail"          TEXT,
    reason                TEXT NOT NULL,
    status                TEXT CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')) NOT NULL DEFAULT 'PENDING',
    "approverId"          TEXT REFERENCES users(id) ON DELETE SET NULL,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS payroll_closings (
    id                    TEXT PRIMARY KEY,
    "payrollYm"           TEXT NOT NULL,
    month                 TEXT,
    "approvedAt"          TEXT,
    "approvedBy"          TEXT,
    "userId"              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "baseSalary"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimePay"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusPay"            DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowance"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalGross"          DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incomeTax"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "residentTax"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nationalPension"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthInsurance"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "careInsurance"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "employmentInsurance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalDeductions"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    status                TEXT CHECK (status IN ('DRAFT', 'CONFIRMED', 'PAID')) NOT NULL DEFAULT 'DRAFT',
    "paymentDate"         TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    UNIQUE("payrollYm", "userId"),
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS corporate_vehicles (
    id                    TEXT PRIMARY KEY,
    "vehicleNo"           TEXT NOT NULL UNIQUE,
    "modelName"           TEXT NOT NULL,
    "vehicleType"         TEXT DEFAULT '승합차',
    "ownershipType"       TEXT CHECK ("ownershipType" IN ('OWNED', 'LEASE', 'RENTAL')) DEFAULT 'OWNED',
    "fuelType"            TEXT CHECK ("fuelType" IN ('DIESEL', 'GASOLINE', 'LPG', 'HYBRID', 'ELECTRIC')) DEFAULT 'DIESEL',
    "assignedDepartment"  TEXT DEFAULT '영업부',
    "primaryDriverId"     TEXT REFERENCES users(id) ON DELETE SET NULL,
    "primaryDriverName"   TEXT,
    "initialMileage"      INTEGER NOT NULL DEFAULT 0,
    "currentMileage"      INTEGER NOT NULL DEFAULT 0,
    "insuranceExpiryDate" TEXT,
    "inspectionExpiryDate" TEXT,
    "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS vehicle_operation_logs (
    id                    TEXT PRIMARY KEY,
    "vehicleId"           TEXT NOT NULL REFERENCES corporate_vehicles(id) ON DELETE CASCADE,
    "vehicleNo"           TEXT NOT NULL,
    "driverId"            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "driverName"          TEXT NOT NULL,
    "driverDept"          TEXT,
    "operationDate"       TEXT NOT NULL,
    "purposeType"         TEXT CHECK ("purposeType" IN ('COMMUTE', 'BUSINESS_GENERAL', 'CLIENT_MEETING', 'SITE_AS', 'LOGISTICS_DELIVERY', 'OTHER')) NOT NULL DEFAULT 'BUSINESS_GENERAL',
    "purposeDetail"       TEXT,
    "departureLocation"   TEXT NOT NULL,
    "arrivalLocation"     TEXT NOT NULL,
    "departureMileage"    INTEGER NOT NULL,
    "arrivalMileage"      INTEGER NOT NULL,
    "driveDistance"       INTEGER NOT NULL,
    "businessDistance"    INTEGER NOT NULL,
    "commuteDistance"     INTEGER NOT NULL DEFAULT 0,
    "dashboardPhotoStart" TEXT,
    "dashboardPhotoEnd"   TEXT,
    memo                  TEXT,
    status                TEXT CHECK (status IN ('SUBMITTED', 'CONFIRMED', 'REJECTED')) NOT NULL DEFAULT 'SUBMITTED',
    "confirmedBy"         TEXT,
    "confirmedAt"         TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS vehicle_fuel_logs (
    id                    TEXT PRIMARY KEY,
    "vehicleId"           TEXT NOT NULL REFERENCES corporate_vehicles(id) ON DELETE CASCADE,
    "vehicleNo"           TEXT NOT NULL,
    "driverId"            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    "driverName"          TEXT NOT NULL,
    "fuelDate"            TEXT NOT NULL,
    "fuelType"            TEXT NOT NULL,
    "fuelVolume"          DOUBLE PRECISION NOT NULL,
    "fuelAmount"          DOUBLE PRECISION NOT NULL,
    "fuelUnitPrice"       DOUBLE PRECISION,
    "currentMileage"      INTEGER NOT NULL,
    "dashboardPhotoUrl"   TEXT,
    "receiptPhotoUrl"     TEXT NOT NULL,
    "gasStationName"      TEXT,
    "paymentMethod"       TEXT DEFAULT 'CORPORATE_CARD',
    "cardLast4"           TEXT,
    "fuelEfficiency"      DOUBLE PRECISION,
    memo                  TEXT,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT NOT NULL,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS privacy_access_logs (
    id                    TEXT PRIMARY KEY,
    "userId"              TEXT,
    "userName"            TEXT,
    "ipAddress"           TEXT,
    "actionType"          TEXT NOT NULL,
    "targetMenu"          TEXT NOT NULL,
    "targetSubjectId"     TEXT,
    "targetSubjectName"   TEXT,
    "actionDetail"        TEXT,
    "isMasked"            BOOLEAN DEFAULT TRUE,
    "createdAt"           TEXT NOT NULL,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS error_reports (
    id                    TEXT PRIMARY KEY,
    "reportNo"            TEXT,
    title                 TEXT,
    description           TEXT,
    "menuId"              TEXT,
    "menuName"            TEXT,
    category              TEXT,
    severity              TEXT,
    status                TEXT DEFAULT 'REGISTERED',
    "reporterId"          TEXT,
    "reporterName"        TEXT,
    "reporterDept"        TEXT,
    "reporterPhone"       TEXT,
    "reportedAt"          TEXT,
    attachments           JSONB DEFAULT '[]'::jsonb,
    "environmentInfo"     JSONB,
    "receiverId"          TEXT,
    "receiverName"        TEXT,
    "receivedAt"          TEXT,
    "assigneeId"          TEXT,
    "assigneeName"        TEXT,
    "receptionNote"       TEXT,
    "targetCompletionDate" TEXT,
    "resolverId"          TEXT,
    "resolverName"        TEXT,
    "completedAt"         TEXT,
    "resolutionNote"      TEXT,
    "resolvedVersion"     TEXT,
    "rootCause"           TEXT,
    "createdAt"           TEXT,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 🚜 지게차 옵션·부착물 단가 마스터 및 유통 출고 옵션 청구 확장 스키마
-- ==============================================================================
CREATE TABLE IF NOT EXISTS developer_authorized_devices (
    id                        TEXT PRIMARY KEY,
    "deviceId"                TEXT,
    "developerId"             TEXT,
    "developerName"           TEXT,
    "machineName"             TEXT,
    "macAddress"              TEXT,
    "hardwareFingerprint"     TEXT,
    platform                  TEXT,
    status                    TEXT DEFAULT 'ACTIVE',
    "isPrimary"               BOOLEAN DEFAULT FALSE,
    "emergencyBreakGlassUsed" BOOLEAN DEFAULT FALSE,
    note                      TEXT,
    "registeredAt"            TEXT,
    "lastVerifiedAt"          TEXT,
    "createdAt"               TEXT,
    "updatedAt"               TEXT,
    "tenant_id"               TEXT DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS forklift_option_masters (
    id                    TEXT PRIMARY KEY,
    code                  TEXT NOT NULL UNIQUE,
    "optionGroup"         TEXT NOT NULL,
    "optionGroupLabel"    TEXT NOT NULL,
    "domainType"          TEXT NOT NULL,
    name                  TEXT NOT NULL,
    spec                  TEXT NOT NULL,
    "subType"             TEXT,
    "applicableModels"    JSONB DEFAULT '[]'::jsonb,
    "applicableCapacity"  TEXT,
    "unitPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dealerPrice"         DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPrice"           DOUBLE PRECISION NOT NULL DEFAULT 0,
    "installLeadHours"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isFreeDefault"       BOOLEAN NOT NULL DEFAULT FALSE,
    "isActive"            BOOLEAN NOT NULL DEFAULT TRUE,
    description           TEXT,
    "updatedAt"           TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS trade_sales_orders (
    id                    TEXT PRIMARY KEY,
    "orderNo"             TEXT NOT NULL,
    "orderDate"           TEXT NOT NULL,
    "customerId"          TEXT NOT NULL,
    "customerName"        TEXT NOT NULL,
    "customerBizNo"       TEXT,
    "customerType"        TEXT,
    "salesRepName"        TEXT,
    "itemType"            TEXT,
    "manufacturer"        TEXT,
    "modelName"           TEXT,
    "serialNumber"        TEXT,
    "partId"              TEXT,
    "partNumber"          TEXT,
    quantity              INTEGER DEFAULT 1,
    "unitSalesPrice"      DOUBLE PRECISION DEFAULT 0,
    "totalSalesAmount"    DOUBLE PRECISION DEFAULT 0,
    "unitCogs"            DOUBLE PRECISION DEFAULT 0,
    "totalCogsAmount"     DOUBLE PRECISION DEFAULT 0,
    "appliedOptions"      JSONB DEFAULT '[]'::jsonb,
    "optionSupplyAmount"  DOUBLE PRECISION DEFAULT 0,
    "optionCostAmount"    DOUBLE PRECISION DEFAULT 0,
    "deliveryDate"        TEXT,
    "deliveryLocation"    TEXT,
    "warehouseName"       TEXT,
    status                TEXT DEFAULT 'CONFIRMED',
    memo                  TEXT,
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

CREATE TABLE IF NOT EXISTS trade_outbounds (
    id                    TEXT PRIMARY KEY,
    "outboundNo"          TEXT NOT NULL,
    "salesOrderId"        TEXT,
    "orderNo"             TEXT,
    "requestDate"         TEXT,
    "scheduledDate"       TEXT,
    "completedDate"       TEXT,
    "customerId"          TEXT,
    "customerName"        TEXT,
    "destinationAddress"  TEXT,
    "receiverName"        TEXT,
    "receiverPhone"       TEXT,
    "itemType"            TEXT,
    "manufacturer"        TEXT,
    "modelName"           TEXT,
    "serialNumber"        TEXT,
    "partNumber"          TEXT,
    quantity              INTEGER DEFAULT 1,
    "warehouseName"       TEXT,
    "appliedOptions"      JSONB DEFAULT '[]'::jsonb,
    "optionBillingAmount" DOUBLE PRECISION DEFAULT 0,
    "transportType"       TEXT,
    "driverName"          TEXT,
    "driverPhone"         TEXT,
    "vehicleNo"           TEXT,
    "freightCost"         DOUBLE PRECISION DEFAULT 0,
    "freightPaidBy"       TEXT,
    "inspectorName"       TEXT,
    "inspectionNote"      TEXT,
    status                TEXT DEFAULT 'REQUESTED',
    "tenant_id"           TEXT NOT NULL DEFAULT 'fl-demo'
);

-- ==============================================================================
-- 🔒 전 테이블 Row Level Security (RLS) 및 권한 일괄 활성화
-- ==============================================================================
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_anon_all" ON %I;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "allow_auth_all" ON %I;', tbl);
        EXECUTE format('CREATE POLICY "allow_anon_all" ON %I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
        EXECUTE format('CREATE POLICY "allow_auth_all" ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
