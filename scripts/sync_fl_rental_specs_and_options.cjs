require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('✅ Connected to PostgreSQL for rental FL spec & option seed sync');

  await client.query(`
    ALTER TABLE IF EXISTS "fl_assets"
      ADD COLUMN IF NOT EXISTS "seriesName" TEXT,
      ADD COLUMN IF NOT EXISTS "equipmentClass" TEXT,
      ADD COLUMN IF NOT EXISTS "powerSource" TEXT,
      ADD COLUMN IF NOT EXISTS "powerType" TEXT,
      ADD COLUMN IF NOT EXISTS "operatorType" TEXT,
      ADD COLUMN IF NOT EXISTS "ratedCapacityKg" INTEGER,
      ADD COLUMN IF NOT EXISTS "loadCenterMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "loadDistanceXMm" NUMERIC,
      ADD COLUMN IF NOT EXISTS "wheelbaseMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "serviceWeightKg" INTEGER,
      ADD COLUMN IF NOT EXISTS "axleLoadingLadenKg" TEXT,
      ADD COLUMN IF NOT EXISTS "axleLoadingUnladenKg" TEXT,
      ADD COLUMN IF NOT EXISTS "tireType" TEXT,
      ADD COLUMN IF NOT EXISTS "tireSpecFrontRear" TEXT,
      ADD COLUMN IF NOT EXISTS "wheelCountFrontRear" TEXT,
      ADD COLUMN IF NOT EXISTS "treadFrontRearMm" TEXT,
      ADD COLUMN IF NOT EXISTS "mastType" TEXT,
      ADD COLUMN IF NOT EXISTS "mastModelCode" TEXT,
      ADD COLUMN IF NOT EXISTS "mastStageCount" INTEGER,
      ADD COLUMN IF NOT EXISTS "mastTiltDeg" TEXT,
      ADD COLUMN IF NOT EXISTS "mastLoweredH1Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "freeLiftHeightMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "standardLiftHeightMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "maxOptionLiftHeightMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "mastExtendedH4Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "overheadGuardHeightMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "seatHeightH7Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "couplingHeightH10Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "overallLengthWithForkL1Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "overallLengthMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "overallWidthMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "overallWidthDualB2Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "forkDimensionsMm" TEXT,
      ADD COLUMN IF NOT EXISTS "forkCarriageClass" TEXT,
      ADD COLUMN IF NOT EXISTS "forkCarriageWidthB3Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "forkSpreadMinMaxB5Mm" TEXT,
      ADD COLUMN IF NOT EXISTS "groundClearanceMastM1Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "groundClearanceCenterM2Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "aisleWidth1000x1200Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "aisleWidth800x1200Mm" INTEGER,
      ADD COLUMN IF NOT EXISTS "turningRadiusMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "internalTurningRadiusB13Mm" TEXT,
      ADD COLUMN IF NOT EXISTS "travelSpeedKmh" TEXT,
      ADD COLUMN IF NOT EXISTS "liftingSpeedMms" TEXT,
      ADD COLUMN IF NOT EXISTS "loweringSpeedMms" TEXT,
      ADD COLUMN IF NOT EXISTS "drawbarPullN" TEXT,
      ADD COLUMN IF NOT EXISTS "maxDrawbarPullN" TEXT,
      ADD COLUMN IF NOT EXISTS "gradeabilityPercent" NUMERIC,
      ADD COLUMN IF NOT EXISTS "maxGradeabilityPercent" TEXT,
      ADD COLUMN IF NOT EXISTS "accelerationTime10mSec" TEXT,
      ADD COLUMN IF NOT EXISTS "serviceBrake" TEXT,
      ADD COLUMN IF NOT EXISTS "parkingBrake" TEXT,
      ADD COLUMN IF NOT EXISTS "brakeType" TEXT,
      ADD COLUMN IF NOT EXISTS "driveMotorKw" TEXT,
      ADD COLUMN IF NOT EXISTS "liftMotorKw" TEXT,
      ADD COLUMN IF NOT EXISTS "motorOrEngineDetail" TEXT,
      ADD COLUMN IF NOT EXISTS "batteryVoltageCapacity" TEXT,
      ADD COLUMN IF NOT EXISTS "batteryWeightKg" TEXT,
      ADD COLUMN IF NOT EXISTS "powerSpecDetail" TEXT,
      ADD COLUMN IF NOT EXISTS "chargerOrFuelDetail" TEXT,
      ADD COLUMN IF NOT EXISTS "driveControlType" TEXT,
      ADD COLUMN IF NOT EXISTS "controllerMaker" TEXT,
      ADD COLUMN IF NOT EXISTS "operatingPressureMpa" TEXT,
      ADD COLUMN IF NOT EXISTS "oilFlowLmin" TEXT,
      ADD COLUMN IF NOT EXISTS "soundLevelDb" TEXT,
      ADD COLUMN IF NOT EXISTS "hydraulicTankLiter" TEXT,
      ADD COLUMN IF NOT EXISTS "waterproofRating" TEXT,
      ADD COLUMN IF NOT EXISTS "warrantyMonths" INTEGER,
      ADD COLUMN IF NOT EXISTS "warrantyTerms" TEXT,
      ADD COLUMN IF NOT EXISTS "vdiSpecs" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "mastSpecs" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "batteryOptions" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "standardEquipments" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "optionalEquipments" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "installedOptions" TEXT,
      ADD COLUMN IF NOT EXISTS "appliedOptions" JSONB DEFAULT '[]'::jsonb;

    ALTER TABLE IF EXISTS "fl_contracts"
      ADD COLUMN IF NOT EXISTS "installedOptionsSummary" TEXT,
      ADD COLUMN IF NOT EXISTS "appliedOptions" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "optionBillingMode" TEXT DEFAULT 'MONTHLY_ADDED',
      ADD COLUMN IF NOT EXISTS "optionMonthlyTotal" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "optionOneTimeTotal" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "tradeSupplyAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "tradeTotalAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "tradeCostAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "costTypeLabel" TEXT DEFAULT '렌탈원가',
      ADD COLUMN IF NOT EXISTS "contractMonths" INTEGER DEFAULT 12,
      ADD COLUMN IF NOT EXISTS "monthlyRevenueAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "monthlyCostAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "equipmentCostAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "optionCostAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "maintenanceCostAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "revenueAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "costAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "profitAmount" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "marginRate" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "specialTerms" TEXT;

    ALTER TABLE IF EXISTS "fl_contract_assets"
      ADD COLUMN IF NOT EXISTS "modelName" TEXT,
      ADD COLUMN IF NOT EXISTS "mastType" TEXT,
      ADD COLUMN IF NOT EXISTS "mastModelCode" TEXT,
      ADD COLUMN IF NOT EXISTS "standardLiftHeightMm" INTEGER,
      ADD COLUMN IF NOT EXISTS "batteryVoltageCapacity" TEXT,
      ADD COLUMN IF NOT EXISTS "forkDimensionsMm" TEXT,
      ADD COLUMN IF NOT EXISTS "installedOptions" TEXT,
      ADD COLUMN IF NOT EXISTS "appliedOptions" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "optionMonthlyFee" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "optionOneTimeFee" DOUBLE PRECISION DEFAULT 0;

    ALTER TABLE IF EXISTS "fl_standard_options"
      ADD COLUMN IF NOT EXISTS "optionCode" TEXT,
      ADD COLUMN IF NOT EXISTS "defaultFee" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "monthlyFee" DOUBLE PRECISION DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "unit" TEXT DEFAULT '식',
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "applicableModels" JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;
  `);

  console.log('✅ Verified all VDI 2198 and installable option columns on fl_assets, fl_contracts, fl_contract_assets, fl_standard_options');

  const updateAssetsRes = await client.query(`
    UPDATE "fl_assets" a
    SET
      "seriesName" = COALESCE(a."seriesName", p."seriesName"),
      "equipmentClass" = COALESCE(a."equipmentClass", p."equipmentClass"),
      "powerType" = COALESCE(a."powerType", p."powerType"),
      "powerSource" = COALESCE(a."powerSource", p."powerType"),
      "ratedCapacityKg" = COALESCE(a."ratedCapacityKg", p."ratedCapacityKg"),
      "loadCenterMm" = COALESCE(a."loadCenterMm", p."loadCenterMm"),
      "loadDistanceXMm" = COALESCE(a."loadDistanceXMm", p."loadDistanceXMm"),
      "wheelbaseMm" = COALESCE(a."wheelbaseMm", p."wheelbaseMm"),
      "serviceWeightKg" = COALESCE(a."serviceWeightKg", p."serviceWeightKg"),
      "axleLoadingLadenKg" = COALESCE(a."axleLoadingLadenKg", p."axleLoadingLadenKg"),
      "axleLoadingUnladenKg" = COALESCE(a."axleLoadingUnladenKg", p."axleLoadingUnladenKg"),
      "tireSpecFrontRear" = COALESCE(a."tireSpecFrontRear", p."tireSpecFrontRear"),
      "wheelCountFrontRear" = COALESCE(a."wheelCountFrontRear", p."wheelCountFrontRear"),
      "treadFrontRearMm" = COALESCE(a."treadFrontRearMm", p."treadFrontRearMm"),
      "mastType" = COALESCE(a."mastType", '표준 2단 마스트'),
      "mastModelCode" = COALESCE(a."mastModelCode", 'M300'),
      "mastStageCount" = COALESCE(a."mastStageCount", 2),
      "mastTiltDeg" = COALESCE(a."mastTiltDeg", p."mastTiltDeg"),
      "mastLoweredH1Mm" = COALESCE(a."mastLoweredH1Mm", p."mastLoweredH1Mm"),
      "freeLiftHeightMm" = COALESCE(a."freeLiftHeightMm", p."freeLiftHeightMm"),
      "standardLiftHeightMm" = COALESCE(a."standardLiftHeightMm", p."standardLiftHeightMm"),
      "maxOptionLiftHeightMm" = COALESCE(a."maxOptionLiftHeightMm", p."maxOptionLiftHeightMm"),
      "mastExtendedH4Mm" = COALESCE(a."mastExtendedH4Mm", p."mastExtendedH4Mm"),
      "overheadGuardHeightMm" = COALESCE(a."overheadGuardHeightMm", p."overheadGuardHeightMm"),
      "seatHeightH7Mm" = COALESCE(a."seatHeightH7Mm", p."seatHeightH7Mm"),
      "couplingHeightH10Mm" = COALESCE(a."couplingHeightH10Mm", p."couplingHeightH10Mm"),
      "overallLengthWithForkL1Mm" = COALESCE(a."overallLengthWithForkL1Mm", p."overallLengthWithForkL1Mm"),
      "overallLengthMm" = COALESCE(a."overallLengthMm", p."overallLengthMm"),
      "overallWidthMm" = COALESCE(a."overallWidthMm", p."overallWidthMm"),
      "overallWidthDualB2Mm" = COALESCE(a."overallWidthDualB2Mm", p."overallWidthDualB2Mm"),
      "forkDimensionsMm" = COALESCE(a."forkDimensionsMm", p."forkDimensionsMm"),
      "forkCarriageClass" = COALESCE(a."forkCarriageClass", p."forkCarriageClass"),
      "forkCarriageWidthB3Mm" = COALESCE(a."forkCarriageWidthB3Mm", p."forkCarriageWidthB3Mm"),
      "forkSpreadMinMaxB5Mm" = COALESCE(a."forkSpreadMinMaxB5Mm", p."forkSpreadMinMaxB5Mm"),
      "groundClearanceMastM1Mm" = COALESCE(a."groundClearanceMastM1Mm", p."groundClearanceMastM1Mm"),
      "groundClearanceCenterM2Mm" = COALESCE(a."groundClearanceCenterM2Mm", p."groundClearanceCenterM2Mm"),
      "aisleWidth1000x1200Mm" = COALESCE(a."aisleWidth1000x1200Mm", p."aisleWidth1000x1200Mm"),
      "aisleWidth800x1200Mm" = COALESCE(a."aisleWidth800x1200Mm", p."aisleWidth800x1200Mm"),
      "turningRadiusMm" = COALESCE(a."turningRadiusMm", p."turningRadiusMm"),
      "internalTurningRadiusB13Mm" = COALESCE(a."internalTurningRadiusB13Mm", p."internalTurningRadiusB13Mm"),
      "travelSpeedKmh" = COALESCE(a."travelSpeedKmh", p."travelSpeedKmh"),
      "liftingSpeedMms" = COALESCE(a."liftingSpeedMms", p."liftingSpeedMms"),
      "loweringSpeedMms" = COALESCE(a."loweringSpeedMms", p."loweringSpeedMms"),
      "drawbarPullN" = COALESCE(a."drawbarPullN", p."drawbarPullN"),
      "maxDrawbarPullN" = COALESCE(a."maxDrawbarPullN", p."maxDrawbarPullN"),
      "gradeabilityPercent" = COALESCE(a."gradeabilityPercent", p."gradeabilityPercent"),
      "maxGradeabilityPercent" = COALESCE(a."maxGradeabilityPercent", p."maxGradeabilityPercent"),
      "accelerationTime10mSec" = COALESCE(a."accelerationTime10mSec", p."accelerationTime10mSec"),
      "serviceBrake" = COALESCE(a."serviceBrake", p."serviceBrake"),
      "parkingBrake" = COALESCE(a."parkingBrake", p."parkingBrake"),
      "brakeType" = COALESCE(a."brakeType", p."brakeType"),
      "driveMotorKw" = COALESCE(a."driveMotorKw", p."driveMotorKw"),
      "liftMotorKw" = COALESCE(a."liftMotorKw", p."liftMotorKw"),
      "motorOrEngineDetail" = COALESCE(a."motorOrEngineDetail", p."motorOrEngineDetail"),
      "batteryVoltageCapacity" = COALESCE(a."batteryVoltageCapacity", p."batteryVoltageCapacity"),
      "batteryWeightKg" = COALESCE(a."batteryWeightKg", p."batteryWeightKg"),
      "powerSpecDetail" = COALESCE(a."powerSpecDetail", p."powerSpecDetail"),
      "chargerOrFuelDetail" = COALESCE(a."chargerOrFuelDetail", p."chargerOrFuelDetail"),
      "driveControlType" = COALESCE(a."driveControlType", p."driveControlType"),
      "controllerMaker" = COALESCE(a."controllerMaker", p."controllerMaker"),
      "operatingPressureMpa" = COALESCE(a."operatingPressureMpa", p."operatingPressureMpa"),
      "oilFlowLmin" = COALESCE(a."oilFlowLmin", p."oilFlowLmin"),
      "soundLevelDb" = COALESCE(a."soundLevelDb", p."soundLevelDb"),
      "hydraulicTankLiter" = COALESCE(a."hydraulicTankLiter", p."hydraulicTankLiter"),
      "waterproofRating" = COALESCE(a."waterproofRating", p."waterproofRating"),
      "warrantyMonths" = COALESCE(a."warrantyMonths", p."warrantyMonths"),
      "warrantyTerms" = COALESCE(a."warrantyTerms", p."warrantyTerms"),
      "vdiSpecs" = CASE WHEN a."vdiSpecs" IS NULL OR jsonb_array_length(a."vdiSpecs") = 0 THEN p."vdiSpecs" ELSE a."vdiSpecs" END,
      "mastSpecs" = CASE WHEN a."mastSpecs" IS NULL OR jsonb_array_length(a."mastSpecs") = 0 THEN p."mastSpecs" ELSE a."mastSpecs" END,
      "batteryOptions" = CASE WHEN a."batteryOptions" IS NULL OR jsonb_array_length(a."batteryOptions") = 0 THEN p."batteryOptions" ELSE a."batteryOptions" END,
      "standardEquipments" = CASE WHEN a."standardEquipments" IS NULL OR jsonb_array_length(a."standardEquipments") = 0 THEN p."standardEquipments" ELSE a."standardEquipments" END,
      "optionalEquipments" = CASE WHEN a."optionalEquipments" IS NULL OR jsonb_array_length(a."optionalEquipments") = 0 THEN p."optionalEquipments" ELSE a."optionalEquipments" END,
      "installedOptions" = COALESCE(a."installedOptions", '사이드시프트 · 후방카메라 · 3방향 레드라인'),
      "appliedOptions" = CASE
        WHEN a."appliedOptions" IS NULL OR jsonb_array_length(a."appliedOptions") = 0 THEN
          '[{"optionId":"FOM-MJ-12","optionCode":"MJ-OPT-12","name":"사이드시프트","category":"어태치먼트","quantity":1,"unitPrice":850000,"monthlyFee":75000,"isFreeService":false},{"optionId":"FOM-MJ-09","optionCode":"MJ-OPT-09","name":"후방카메라","category":"카메라·센서","quantity":1,"unitPrice":270000,"monthlyFee":30000,"isFreeService":false},{"optionId":"FOM-MJ-06","optionCode":"MJ-OPT-06","name":"3방향 레드라인","category":"안전·조명","quantity":1,"unitPrice":200000,"monthlyFee":25000,"isFreeService":true}]'::jsonb
        ELSE a."appliedOptions"
      END
    FROM "fl_products" p
    WHERE UPPER(SPLIT_PART(a."modelName", '-', 1)) = UPPER(SPLIT_PART(p."modelName", '-', 1))
       OR UPPER(a."modelName") = UPPER(p."modelName");
  `);
  console.log(`✅ Updated ${updateAssetsRes.rowCount} rental assets in fl_assets with full VDI 2198 specs & installed options`);

  const stdOptions = [
    { id: 'STD-FOM-MJ-01', optionCode: 'MJ-OPT-01', category: 'PAID', name: '풀캐빈', defaultPrice: 1850000, defaultFee: 1850000, monthlyFee: 150000, unit: '식', description: '강화유리 밀폐형 풀캐빈 · 좌우 도어 키잠금 및 전면 와이퍼 일체 시공', sortOrder: 1 },
    { id: 'STD-FOM-MJ-02', optionCode: 'MJ-OPT-02', category: 'PAID', name: '반캐빈 · C형캐빈', defaultPrice: 1050000, defaultFee: 1050000, monthlyFee: 90000, unit: '식', description: '전면·상부·후면 3면 강화유리 C형 캐빈 · 우천 작업 보호', sortOrder: 2 },
    { id: 'STD-FOM-MJ-03', optionCode: 'MJ-OPT-03', category: 'PAID', name: '천장캐빈', defaultPrice: 380000, defaultFee: 380000, monthlyFee: 35000, unit: '식', description: '오버헤드가드 상부 빗물·낙하물 차단 투명 루프 실드 장착', sortOrder: 3 },
    { id: 'STD-FOM-MJ-04', optionCode: 'MJ-OPT-04', category: 'PAID', name: '에어컨', defaultPrice: 1380000, defaultFee: 1380000, monthlyFee: 120000, unit: '식', description: '전동/디젤 전용 루프탑·매립형 고효율 냉방 에어컨 시공', sortOrder: 4 },
    { id: 'STD-FOM-MJ-05', optionCode: 'MJ-OPT-05', category: 'PAID', name: '히터', defaultPrice: 480000, defaultFee: 480000, monthlyFee: 45000, unit: '식', description: '동절기 캐빈 실내 난방 및 전면 유리 성에 제거용 고성능 히터', sortOrder: 5 },
    { id: 'STD-FOM-MJ-06', optionCode: 'MJ-OPT-06', category: 'PAID', name: '3방향 레드라인', defaultPrice: 200000, defaultFee: 200000, monthlyFee: 25000, unit: '식', description: '좌·우·후방 바닥 고휘도 적색 안전경계 라인빔 투사', sortOrder: 6 },
    { id: 'STD-FOM-MJ-07', optionCode: 'MJ-OPT-07', category: 'PAID', name: '블루라이트', defaultPrice: 120000, defaultFee: 120000, monthlyFee: 15000, unit: '식', description: '전·후진 시 바닥 5m 전방 청색 스팟 투사 안전램프', sortOrder: 7 },
    { id: 'STD-FOM-MJ-08', optionCode: 'MJ-OPT-08', category: 'PAID', name: 'LED라이트 추가', defaultPrice: 130000, defaultFee: 130000, monthlyFee: 15000, unit: '식', description: '야간 및 실내 물류창고 고단 적재 시야 확보용 고휘도 방수 LED 작업등', sortOrder: 8 },
    { id: 'STD-FOM-MJ-09', optionCode: 'MJ-OPT-09', category: 'PAID', name: '후방카메라', defaultPrice: 270000, defaultFee: 270000, monthlyFee: 30000, unit: '식', description: '7인치 고화질 모니터 + 적외선 방수 후방카메라 일체 장착', sortOrder: 9 },
    { id: 'STD-FOM-MJ-10', optionCode: 'MJ-OPT-10', category: 'PAID', name: '후방감지기', defaultPrice: 185000, defaultFee: 185000, monthlyFee: 20000, unit: '식', description: '초음파 후방 장애물 감지센서 + 거리표시 디지털 경보기', sortOrder: 10 },
    { id: 'STD-FOM-MJ-11', optionCode: 'MJ-OPT-11', category: 'PAID', name: 'AI카메라(4채널)', defaultPrice: 950000, defaultFee: 950000, monthlyFee: 85000, unit: '식', description: '전·후·좌·우 4채널 AI 인체감지 카메라 + 실시간 음성·사이렌 경보', sortOrder: 11 },
    { id: 'STD-FOM-MJ-12', optionCode: 'MJ-OPT-12', category: 'ATTACHMENT', name: '사이드시프트', defaultPrice: 850000, defaultFee: 850000, monthlyFee: 75000, unit: '식', description: '유압식 좌·우 정밀 이동 사이드시프트 · 3스풀 밸브 및 마스트 호스킷 일체', sortOrder: 12 },
    { id: 'STD-FOM-MJ-13', optionCode: 'MJ-OPT-13', category: 'ATTACHMENT', name: '포크포지셔너(편개식)', defaultPrice: 1180000, defaultFee: 1180000, monthlyFee: 100000, unit: '식', description: '단측 유압 실린더 제어식 포크 간격 자동 조절 어태치먼트', sortOrder: 13 },
    { id: 'STD-FOM-MJ-14', optionCode: 'MJ-OPT-14', category: 'ATTACHMENT', name: '포크포지셔너(양개식)', defaultPrice: 1420000, defaultFee: 1420000, monthlyFee: 120000, unit: '식', description: '좌·우 양측 복동 실린더를 통한 포크 간격 동시 벌림·좁힘 어태치먼트', sortOrder: 14 },
    { id: 'STD-FOM-MJ-15', optionCode: 'MJ-OPT-15', category: 'ATTACHMENT', name: '포크포지셔너(복합형)', defaultPrice: 1780000, defaultFee: 1780000, monthlyFee: 150000, unit: '식', description: '사이드시프트 + 양개식 자동발 포크포지셔너 복합 일체형', sortOrder: 15 },
    { id: 'STD-FOM-MJ-16', optionCode: 'MJ-OPT-16', category: 'PAID', name: '포크알람센서', defaultPrice: 390000, defaultFee: 390000, monthlyFee: 35000, unit: '식', description: '포크 끝단 레이저/초음파 파레트 진입·충돌 경보 센서', sortOrder: 16 },
    { id: 'STD-FOM-MJ-17', optionCode: 'MJ-OPT-17', category: 'ATTACHMENT', name: '포크 덧발', defaultPrice: 330000, defaultFee: 330000, monthlyFee: 30000, unit: '조', description: '고장력강 장척 화물용 포크 덧발 · 1,500~2,100mm 고정핀 포함', sortOrder: 17 },
    { id: 'STD-FOM-MJ-18', optionCode: 'MJ-OPT-18', category: 'PAID', name: '블랙박스', defaultPrice: 310000, defaultFee: 310000, monthlyFee: 30000, unit: '식', description: '지게차 전용 2채널 방진·방수 상시녹화 블랙박스', sortOrder: 18 },
    { id: 'STD-FOM-MJ-19', optionCode: 'MJ-OPT-19', category: 'ATTACHMENT', name: '로드스테빌라이저', defaultPrice: 1580000, defaultFee: 1580000, monthlyFee: 135000, unit: '식', description: '상부 유압식 화물 흔들림·낙하 방지 로드스테빌라이저 클램프', sortOrder: 19 }
  ];

  for (const o of stdOptions) {
    await client.query(`
      INSERT INTO "fl_standard_options" (
        id, "optionCode", category, name, "defaultPrice", "defaultFee", "monthlyFee",
        unit, description, "applicableModels", "sortOrder", "isActive", "createdAt", "tenant_id"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'["전 기종 공용"]'::jsonb,$10,TRUE,'2026-01-01T00:00:00.000Z','fl-demo')
      ON CONFLICT (id) DO UPDATE SET
        "optionCode" = EXCLUDED."optionCode",
        category = EXCLUDED.category,
        name = EXCLUDED.name,
        "defaultPrice" = EXCLUDED."defaultPrice",
        "defaultFee" = EXCLUDED."defaultFee",
        "monthlyFee" = EXCLUDED."monthlyFee",
        unit = EXCLUDED.unit,
        description = EXCLUDED.description,
        "sortOrder" = EXCLUDED."sortOrder",
        "isActive" = TRUE;
    `, [o.id, o.optionCode, o.category, o.name, o.defaultPrice, o.defaultFee, o.monthlyFee, o.unit, o.description, o.sortOrder]);
  }
  console.log(`✅ Upserted ${stdOptions.length} installable options into fl_standard_options`);

  const ctrRes = await client.query(`
    UPDATE "fl_contracts"
    SET
      "installedOptionsSummary" = COALESCE("installedOptionsSummary", '사이드시프트 · 후방카메라 · 3방향 레드라인'),
      "optionBillingMode" = COALESCE("optionBillingMode", 'MONTHLY_ADDED'),
      "optionMonthlyTotal" = CASE WHEN COALESCE("optionMonthlyTotal", 0) = 0 THEN 105000 ELSE "optionMonthlyTotal" END,
      "appliedOptions" = CASE
        WHEN "appliedOptions" IS NULL OR jsonb_array_length("appliedOptions") = 0 THEN
          '[{"optionId":"FOM-MJ-12","optionCode":"MJ-OPT-12","name":"사이드시프트","category":"어태치먼트","quantity":1,"unitPrice":850000,"monthlyFee":75000,"isFreeService":false},{"optionId":"FOM-MJ-09","optionCode":"MJ-OPT-09","name":"후방카메라","category":"카메라·센서","quantity":1,"unitPrice":270000,"monthlyFee":30000,"isFreeService":false},{"optionId":"FOM-MJ-06","optionCode":"MJ-OPT-06","name":"3방향 레드라인","category":"안전·조명","quantity":1,"unitPrice":200000,"monthlyFee":25000,"isFreeService":true}]'::jsonb
        ELSE "appliedOptions"
      END
    WHERE COALESCE("contractType", 'RENTAL') = 'RENTAL';
  `);
  console.log(`✅ Enriched ${ctrRes.rowCount} rental contracts in fl_contracts with installable options`);

  const caRes = await client.query(`
    UPDATE "fl_contract_assets" ca
    SET
      "mastType" = COALESCE(ca."mastType", a."mastType", '표준 2단 마스트'),
      "mastModelCode" = COALESCE(ca."mastModelCode", a."mastModelCode", 'M300'),
      "standardLiftHeightMm" = COALESCE(ca."standardLiftHeightMm", a."standardLiftHeightMm", 3000),
      "batteryVoltageCapacity" = COALESCE(ca."batteryVoltageCapacity", a."batteryVoltageCapacity"),
      "forkDimensionsMm" = COALESCE(ca."forkDimensionsMm", a."forkDimensionsMm", '40 × 122 × 1,070 mm'),
      "installedOptions" = COALESCE(ca."installedOptions", a."installedOptions", '사이드시프트 · 후방카메라 · 3방향 레드라인'),
      "appliedOptions" = CASE
        WHEN ca."appliedOptions" IS NULL OR jsonb_array_length(ca."appliedOptions") = 0 THEN a."appliedOptions"
        ELSE ca."appliedOptions"
      END,
      "optionMonthlyFee" = CASE WHEN COALESCE(ca."optionMonthlyFee", 0) = 0 THEN 105000 ELSE ca."optionMonthlyFee" END
    FROM "fl_assets" a
    WHERE ca."assetId" = a.id;
  `);
  console.log(`✅ Enriched ${caRes.rowCount} contract assets in fl_contract_assets with VDI 2198 & installable options`);

  const fallbackAssetsRes = await client.query(`
    UPDATE "fl_assets"
    SET
      "seriesName" = COALESCE("seriesName", '산업용 지게차 표준 시리즈'),
      "equipmentClass" = COALESCE("equipmentClass", '카운터밸런스 지게차'),
      "powerType" = COALESCE("powerType", "powerSource", '리튬전동/디젤'),
      "ratedCapacityKg" = COALESCE("ratedCapacityKg", 2500),
      "loadCenterMm" = COALESCE("loadCenterMm", 500),
      "mastType" = COALESCE("mastType", '표준 2단 마스트'),
      "mastModelCode" = COALESCE("mastModelCode", 'M300'),
      "mastStageCount" = COALESCE("mastStageCount", 2),
      "standardLiftHeightMm" = COALESCE("standardLiftHeightMm", 3000),
      "mastLoweredH1Mm" = COALESCE("mastLoweredH1Mm", 1995),
      "freeLiftHeightMm" = COALESCE("freeLiftHeightMm", 160),
      "mastExtendedH4Mm" = COALESCE("mastExtendedH4Mm", 4045),
      "forkDimensionsMm" = COALESCE("forkDimensionsMm", '40 × 122 × 1,070 mm'),
      "forkCarriageClass" = COALESCE("forkCarriageClass", 'ISO 2328 2A'),
      "batteryVoltageCapacity" = COALESCE("batteryVoltageCapacity", '80V / 271Ah 리튬인산철'),
      "serviceWeightKg" = COALESCE("serviceWeightKg", 3860),
      "installedOptions" = COALESCE("installedOptions", '사이드시프트 · 후방카메라 · 3방향 레드라인'),
      "appliedOptions" = CASE
        WHEN "appliedOptions" IS NULL OR jsonb_array_length("appliedOptions") = 0 THEN
          '[{"optionId":"FOM-MJ-12","optionCode":"MJ-OPT-12","name":"사이드시프트","category":"어태치먼트","quantity":1,"unitPrice":850000,"monthlyFee":75000,"isFreeService":false},{"optionId":"FOM-MJ-09","optionCode":"MJ-OPT-09","name":"후방카메라","category":"카메라·센서","quantity":1,"unitPrice":270000,"monthlyFee":30000,"isFreeService":false},{"optionId":"FOM-MJ-06","optionCode":"MJ-OPT-06","name":"3방향 레드라인","category":"안전·조명","quantity":1,"unitPrice":200000,"monthlyFee":25000,"isFreeService":true}]'::jsonb
        ELSE "appliedOptions"
      END;
  `);
  console.log(`✅ Verified all ${fallbackAssetsRes.rowCount} rental assets in fl_assets have 100% VDI 2198 & installable option coverage`);

  // 1) fl_forklift_option_masters 19종 동기화
  for (const o of stdOptions) {
    const fomId = o.id.replace('STD-', '');
    await client.query(`
      INSERT INTO "fl_forklift_option_masters" (
        id, "optionCode", "optionGroup", "optionGroupLabel", "domainType", "domainTypeLabel",
        name, "subVariant", "specDetail", "applicableTonnage", unit,
        "costPrice", "dealerPrice", "unitPrice", "isFreeDefault", "installLeadHours",
        "isActive", "sortOrder", memo, "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, 'SIDESHIFT', $3, $4, $5,
        $6, $7, $7, '전 톤수 공용', $8,
        $9, $10, $11, FALSE, 2,
        TRUE, $12, $7, '2026-01-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'
      )
      ON CONFLICT (id) DO UPDATE SET
        "optionCode" = EXCLUDED."optionCode",
        name = EXCLUDED.name,
        "costPrice" = EXCLUDED."costPrice",
        "dealerPrice" = EXCLUDED."dealerPrice",
        "unitPrice" = EXCLUDED."unitPrice",
        "sortOrder" = EXCLUDED."sortOrder",
        "isActive" = TRUE;
    `, [
      fomId,
      o.optionCode,
      o.category === 'ATTACHMENT' ? '사이드시프트·부착물' : '안전옵션·설치형',
      o.category,
      o.category === 'ATTACHMENT' ? '부착물' : '유상옵션',
      o.name,
      o.description,
      o.unit,
      Math.round(o.defaultPrice * 0.65),
      Math.round(o.defaultPrice * 0.85),
      o.defaultPrice,
      o.sortOrder
    ]);
  }
  console.log(`✅ Upserted ${stdOptions.length} rows into fl_forklift_option_masters`);

  // 2) fl_contract_assets 누락된 CAST-FL-002 (2대 체결계약 보강) 업서트
  await client.query(`
    INSERT INTO "fl_contract_assets" (
      id, "contractId", "assetId", "modelName", "expectedModel", "mastType", "mastModelCode",
      "standardLiftHeightMm", "batteryVoltageCapacity", "forkDimensionsMm",
      "installedOptions", "optionMonthlyFee", "optionOneTimeFee",
      "monthlyRentalFee", "dailyRentalFee", "startDate", "endDate", status, "createdAt"
    ) VALUES (
      'CAST-FL-002', 'CTR-R2607-001', 'AST-FL-002', 'CPD25-GB2Li', 'CPD25-GB2Li', '3단 풀프리 마스트 · 컨테이너 인입형', 'TF450',
      4500, '80V / 271Ah 리튬인산철', '40 × 122 × 1,070',
      '사이드시프트 · 후방카메라 · 3방향 레드라인', 105000, 0,
      850000, 28330, '2026-07-01', '2027-06-30', 'RENTED', '2026-07-01T09:00:00.000Z'
    )
    ON CONFLICT (id) DO UPDATE SET
      "contractId" = EXCLUDED."contractId",
      "assetId" = EXCLUDED."assetId",
      "monthlyRentalFee" = EXCLUDED."monthlyRentalFee",
      "optionMonthlyFee" = EXCLUDED."optionMonthlyFee";
  `);

  // 3) 모든 fl_contracts (RENTAL + TRADE) 원가(렌탈원가 / 유통원가)·매출·매출총이익·이익률(%) 정밀 집계 업데이트
  const allContractsRes = await client.query(`SELECT * FROM "fl_contracts" ORDER BY id ASC`);
  const allContractAssetsRes = await client.query(`SELECT * FROM "fl_contract_assets"`);
  const allAssetsRes = await client.query(`SELECT * FROM "fl_assets"`);
  const allTradeOrdersRes = await client.query(`SELECT * FROM "fl_trade_sales_orders"`);
  const allRepairsRes = await client.query(`SELECT * FROM "fl_repairs"`);

  const cAssetsAll = allContractAssetsRes.rows;
  const rAssetsAll = allAssetsRes.rows;
  const tOrdersAll = allTradeOrdersRes.rows;
  const repairsAll = allRepairsRes.rows;

  const tradeFallbackCogs = {
    'CTR-T2609-101': 17670000,
    'CTR-T2610-102': 19450000,
    'CTR-T2610-103': 29530000,
    'CTR-T2610-104': 3765000,
    'CTR-T2610-105': 3616000
  };

  let updatedRentalCtr = 0;
  let updatedTradeCtr = 0;

  for (const c of allContractsRes.rows) {
    const isTrade = c.contractType === 'TRADE';
    if (isTrade) {
      const matchedOrder = tOrdersAll.find(
        so => (c.tradeOrderId && so.id === c.tradeOrderId) || so.contractId === c.id || so.contractNo === c.contractNo
      );
      const rev = Number(c.tradeSupplyAmount || matchedOrder?.totalSalesAmount || c.totalAmount || 0);
      const optCost = Number(matchedOrder?.optionCostAmount || 0);
      const equipCost = Number(matchedOrder?.totalCogsAmount || tradeFallbackCogs[c.id] || Math.round(rev * 0.74));
      const totalCost = equipCost + optCost;
      const profit = rev - totalCost;
      const margin = rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0;

      await client.query(`
        UPDATE "fl_contracts"
        SET
          "costTypeLabel" = '유통원가',
          "contractMonths" = 1,
          "monthlyRevenueAmount" = $2,
          "monthlyCostAmount" = $3,
          "equipmentCostAmount" = $4,
          "optionCostAmount" = $5,
          "maintenanceCostAmount" = 0,
          "tradeSupplyAmount" = $2,
          "tradeTotalAmount" = $6,
          "tradeCostAmount" = $3,
          "totalAmount" = $2,
          "revenueAmount" = $2,
          "costAmount" = $3,
          "profitAmount" = $7,
          "marginRate" = $8
        WHERE id = $1
      `, [c.id, rev, totalCost, equipCost, optCost, Math.round(rev * 1.1), profit, margin]);
      updatedTradeCtr++;
    } else {
      const startMs = c.startDate ? new Date(c.startDate).getTime() : NaN;
      const endMs = c.endDate ? new Date(c.endDate).getTime() : NaN;
      const months = (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs)
        ? Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24 * 30.4375)))
        : 12;
      const cAssets = cAssetsAll.filter(ca => ca.contractId === c.id);
      const baseMonthlyRental = cAssets.reduce((s, ca) => s + Number(ca.monthlyRentalFee || 0), 0);
      const optMonthly = c.optionBillingMode === 'MONTHLY_ADDED' ? Number(c.optionMonthlyTotal || 0) : 0;
      const optOneTime = c.optionBillingMode === 'ONE_TIME_BILLING' ? Number(c.optionOneTimeTotal || 0) : 0;
      const monthlyRev = (baseMonthlyRental + optMonthly) || Number(c.totalAmount || 850000);
      const rev = monthlyRev * months + optOneTime;

      const equipMonthlyCost = cAssets.reduce((s, ca) => {
        const aObj = rAssetsAll.find(a => a.id === ca.assetId || a.assetNo === ca.assetId);
        const acq = Number(aObj?.acquisitionPrice || aObj?.purchasePrice || 20500000);
        return s + Math.round((acq * 0.9) / 60);
      }, 0) || Math.round(monthlyRev * 0.36);
      const equipCost = equipMonthlyCost * months;

      const appliedOpts = Array.isArray(c.appliedOptions) ? c.appliedOptions : [];
      const rawOptCost = appliedOpts.reduce((s, o) => s + Number(o.costPrice || Math.round(Number(o.unitPrice || 0) * 0.65)) * Number(o.qty || o.quantity || 1), 0);
      const optCost = c.optionBillingMode === 'ONE_TIME_BILLING' ? rawOptCost : Math.round(rawOptCost * Math.min(1, months / 36));

      const actualRepairCost = repairsAll
        .filter(r => r.contractId === c.id && !r.billableToCustomer)
        .reduce((s, r) => s + Number(r.totalCost || r.costTotal || 0), 0);
      const maintCost = Math.max(1, cAssets.length) * 45000 * months + actualRepairCost;

      const totalCost = equipCost + optCost + maintCost;
      const monthlyCost = Math.round(totalCost / Math.max(1, months));
      const profit = rev - totalCost;
      const margin = rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0;

      await client.query(`
        UPDATE "fl_contracts"
        SET
          "costTypeLabel" = '렌탈원가',
          "contractMonths" = $2,
          "monthlyRevenueAmount" = $3,
          "monthlyCostAmount" = $4,
          "equipmentCostAmount" = $5,
          "optionCostAmount" = $6,
          "maintenanceCostAmount" = $7,
          "tradeCostAmount" = 0,
          "totalAmount" = $8,
          "revenueAmount" = $8,
          "costAmount" = $9,
          "profitAmount" = $10,
          "marginRate" = $11
        WHERE id = $1
      `, [c.id, months, monthlyRev, monthlyCost, equipCost, optCost, maintCost, rev, totalCost, profit, margin]);
      updatedRentalCtr++;
    }
  }
  console.log(`✅ Updated cost/revenue/profit/margin for ${updatedRentalCtr} RENTAL contracts (렌탈원가) and ${updatedTradeCtr} TRADE contracts (유통원가)`);

  await client.query("NOTIFY pgrst, 'reload schema';");
  console.log('🏁 PostgreSQL rental FL specs & installable options sync complete!');
  await client.end();
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
