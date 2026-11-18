export interface FlArchivedDocument {
  id: string;
  docCategory: 'BROCHURE' | 'OPERATOR_MANUAL' | 'SPEC_SHEET' | 'SAFETY_CERT' | 'PARTS_WARRANTY';
  docCategoryLabel: string;
  title: string;
  docNo: string;
  language: string;
  pageCount: number;
  fileSizeLabel: string;
  issuedDate: string;
  r2Url: string;
  localUrl?: string;
  summary: string;
}

export interface FlCompatiblePartSpec {
  partCode: string;
  partName: string;
  category: string;
  replacementCycle: string;
  LinkedSkuCode?: string;
}

export interface FlVdiSpecItem {
  code: string;
  category: string;
  itemKo: string;
  itemEn: string;
  unit: string;
  value: string;
}

export interface FlMastSpecRow {
  mastType: string;
  mastModel: string;
  liftHeightH3Mm: number;
  loweredHeightH1Mm: number;
  extendedHeightWithBackrestH4Mm: number;
  freeLiftWithBackrestH2Mm: number;
  tiltAngleDeg: string;
  loadCapacity500MmSingleKg: number;
  loadCapacity500MmDualKg?: number;
  loadCapacity600MmSingleKg?: number;
}

export interface FlBatteryOptionRow {
  cellBrand: string;
  batteryModel: string;
  voltageCapacity: string;
  weightKg?: string;
  applicableModels: string;
  status: '표준' | '옵션';
  chargerOptions?: string;
}

export interface FlModelTechnicalSpec {
  id: string;
  manufacturerCode: 'HELI' | 'BYD' | 'HANGCHA' | 'EP' | 'HYUNDAI' | 'DOOSAN' | 'CLARK' | 'TOYOTA';
  manufacturerName: string;
  originCountry: string;
  modelName: string;
  seriesName: string;
  linkedSkuCode?: string;
  equipmentClass: '전동 좌승식 카운터밸런스' | '디젤 카운터밸런스' | '전동 파레트트럭' | '전동 입승식 리치트럭';
  powerType: '리튬인산철 전동' | '납산배터리 전동' | '디젤 내연기관';
  ratedCapacityKg: number;
  loadCenterMm: number;
  loadDistanceXMm?: number;
  wheelbaseMm?: number;
  serviceWeightKg: number;
  axleLoadingLadenKg?: string;
  axleLoadingUnladenKg?: string;
  tireSpecFrontRear: string;
  wheelCountFrontRear?: string;
  treadFrontRearMm?: string;
  mastTiltDeg?: string;
  mastLoweredH1Mm?: number;
  freeLiftHeightMm: number;
  standardLiftHeightMm: number;
  maxOptionLiftHeightMm: number;
  mastExtendedH4Mm?: number;
  overheadGuardHeightMm: number;
  seatHeightH7Mm?: number;
  couplingHeightH10Mm?: number;
  overallLengthWithForkL1Mm?: number;
  overallLengthMm: number;
  overallWidthMm: number;
  overallWidthDualB2Mm?: number;
  forkDimensionsMm: string;
  forkCarriageClass?: string;
  forkCarriageWidthB3Mm?: number;
  forkSpreadMinMaxB5Mm?: string;
  groundClearanceMastM1Mm?: number;
  groundClearanceCenterM2Mm?: number;
  aisleWidth1000x1200Mm: number;
  aisleWidth800x1200Mm?: number;
  turningRadiusMm: number;
  internalTurningRadiusB13Mm?: string;
  travelSpeedKmh: string;
  liftingSpeedMms: string;
  loweringSpeedMms?: string;
  drawbarPullN?: string;
  maxDrawbarPullN?: string;
  gradeabilityPercent: number;
  maxGradeabilityPercent?: string;
  accelerationTime10mSec?: string;
  serviceBrake?: string;
  parkingBrake?: string;
  brakeType: string;
  driveMotorKw?: string;
  liftMotorKw?: string;
  motorOrEngineDetail: string;
  batteryVoltageCapacity?: string;
  batteryWeightKg?: string;
  powerSpecDetail: string;
  chargerOrFuelDetail: string;
  driveControlType?: string;
  controllerMaker?: string;
  operatingPressureMpa?: string;
  oilFlowLmin?: string;
  soundLevelDb?: string;
  hydraulicTankLiter?: string;
  waterproofRating: string;
  warrantyTerms: string;
  safetyFeatures: string[];
  dailyChecklist: string[];
  periodicMaintenance: string[];
  compatibleParts: FlCompatiblePartSpec[];
  documents: FlArchivedDocument[];
  vdiSpecs?: FlVdiSpecItem[];
  mastSpecs?: FlMastSpecRow[];
  batteryOptions?: FlBatteryOptionRow[];
  standardEquipments?: string[];
  optionalEquipments?: string[];
}

export function getCompleteVdiSpecs(spec: FlModelTechnicalSpec): FlVdiSpecItem[] {
  if (spec.vdiSpecs && spec.vdiSpecs.length > 0) {
    return spec.vdiSpecs;
  }
  const rows: FlVdiSpecItem[] = [
    { code: '1.1', category: '식별 정보', itemKo: '제조사', itemEn: 'Manufacturer', unit: '-', value: spec.manufacturerName },
    { code: '1.2', category: '식별 정보', itemKo: '모델명 · 시리즈', itemEn: 'Model / Type designation', unit: '-', value: `${spec.modelName} · ${spec.seriesName}` },
    { code: '1.3', category: '식별 정보', itemKo: '동력 방식', itemEn: 'Drive', unit: '-', value: spec.powerType },
    { code: '1.4', category: '식별 정보', itemKo: '장비 분류 · 운전방식', itemEn: 'Operator type', unit: '-', value: spec.equipmentClass },
    { code: '1.5', category: '식별 정보', itemKo: '정격 적재하중 Q', itemEn: 'Rated capacity / rated load', unit: 'kg', value: spec.ratedCapacityKg.toLocaleString('ko-KR') },
    { code: '1.6', category: '식별 정보', itemKo: '하중중심 거리 c', itemEn: 'Load centre distance', unit: 'mm', value: spec.loadCenterMm.toLocaleString('ko-KR') },
  ];
  if (spec.loadDistanceXMm !== undefined) {
    rows.push({ code: '1.8', category: '식별 정보', itemKo: '하중거리 x', itemEn: 'Load distance', unit: 'mm', value: String(spec.loadDistanceXMm) });
  }
  if (spec.wheelbaseMm !== undefined) {
    rows.push({ code: '1.9', category: '식별 정보', itemKo: '축거 · 휠베이스 y', itemEn: 'Wheelbase', unit: 'mm', value: String(spec.wheelbaseMm) });
  }
  rows.push({ code: '2.1', category: '중량 제원', itemKo: '장비 총중량 (자중)', itemEn: 'Service weight', unit: 'kg', value: spec.serviceWeightKg.toLocaleString('ko-KR') });
  if (spec.axleLoadingLadenKg) {
    rows.push({ code: '2.2', category: '중량 제원', itemKo: '적재 시 축중 (전/후)', itemEn: 'Axle loading laden', unit: 'kg', value: spec.axleLoadingLadenKg });
  }
  if (spec.axleLoadingUnladenKg) {
    rows.push({ code: '2.3', category: '중량 제원', itemKo: '공차 시 축중 (전/후)', itemEn: 'Axle loading unladen', unit: 'kg', value: spec.axleLoadingUnladenKg });
  }
  rows.push(
    { code: '3.2', category: '타이어 · 섀시', itemKo: '전·후륜 타이어 규격', itemEn: 'Tire size front / rear', unit: '-', value: spec.tireSpecFrontRear },
    { code: '4.1', category: '치수 · 작업반경', itemKo: '마스트 경사각 (전/후)', itemEn: 'Tilt of mast forward / backward', unit: '°', value: spec.mastTiltDeg || '6 / 12' },
    { code: '4.2', category: '치수 · 작업반경', itemKo: '마스트 최저전고 h1', itemEn: 'Height, mast lowered', unit: 'mm', value: (spec.mastLoweredH1Mm || spec.overheadGuardHeightMm).toLocaleString('ko-KR') },
    { code: '4.3', category: '치수 · 작업반경', itemKo: '자유 인상높이 h2', itemEn: 'Free lift', unit: 'mm', value: spec.freeLiftHeightMm.toLocaleString('ko-KR') },
    { code: '4.4', category: '치수 · 작업반경', itemKo: '표준 인상높이 h3', itemEn: 'Lift height', unit: 'mm', value: spec.standardLiftHeightMm.toLocaleString('ko-KR') },
    { code: '4.4b', category: '치수 · 작업반경', itemKo: '최대 옵션 인상높이', itemEn: 'Max optional lift height', unit: 'mm', value: spec.maxOptionLiftHeightMm.toLocaleString('ko-KR') },
    { code: '4.5', category: '치수 · 작업반경', itemKo: '최대 작업높이 h4', itemEn: 'Height, mast extended', unit: 'mm', value: (spec.mastExtendedH4Mm || spec.standardLiftHeightMm + 1040).toLocaleString('ko-KR') },
    { code: '4.7', category: '치수 · 작업반경', itemKo: '헤드가드 높이 h6', itemEn: 'Height of overhead guard', unit: 'mm', value: spec.overheadGuardHeightMm.toLocaleString('ko-KR') },
    { code: '4.19', category: '치수 · 작업반경', itemKo: '포크포함 전장 l1', itemEn: 'Overall length', unit: 'mm', value: (spec.overallLengthWithForkL1Mm || spec.overallLengthMm + 1070).toLocaleString('ko-KR') },
    { code: '4.20', category: '치수 · 작업반경', itemKo: '포크면까지 전장 l2', itemEn: 'Length to face of forks', unit: 'mm', value: spec.overallLengthMm.toLocaleString('ko-KR') },
    { code: '4.21', category: '치수 · 작업반경', itemKo: '차체 전폭 b1', itemEn: 'Overall width', unit: 'mm', value: spec.overallWidthMm.toLocaleString('ko-KR') },
    { code: '4.22', category: '치수 · 작업반경', itemKo: '포크 규격 s×e×l', itemEn: 'Fork dimensions', unit: 'mm', value: spec.forkDimensionsMm },
    { code: '4.34.1', category: '치수 · 작업반경', itemKo: '직각적재 통로폭 (1000×1200) Ast', itemEn: 'Aisle width for pallets 1000×1200', unit: 'mm', value: spec.aisleWidth1000x1200Mm.toLocaleString('ko-KR') },
    { code: '4.35', category: '치수 · 작업반경', itemKo: '최소 회전반경 Wa', itemEn: 'Turning radius', unit: 'mm', value: spec.turningRadiusMm.toLocaleString('ko-KR') },
    { code: '5.1', category: '주행 · 작업 성능', itemKo: '주행 속도 (적재/공차)', itemEn: 'Travel speed, laden / unladen', unit: 'km/h', value: spec.travelSpeedKmh },
    { code: '5.2', category: '주행 · 작업 성능', itemKo: '인상 속도 (적재/공차)', itemEn: 'Lift speed, laden / unladen', unit: 'mm/s', value: spec.liftingSpeedMms },
    { code: '5.8', category: '주행 · 작업 성능', itemKo: '최대 등판능력', itemEn: 'Max. gradeability', unit: '%', value: String(spec.gradeabilityPercent) },
    { code: '5.10', category: '주행 · 작업 성능', itemKo: '제동 시스템', itemEn: 'Service / Parking brake', unit: '-', value: spec.brakeType },
    { code: '6.1', category: '모터 · 배터리', itemKo: '구동·인양 동력 출력', itemEn: 'Drive / Lift motor rating', unit: '-', value: spec.motorOrEngineDetail },
    { code: '6.4', category: '모터 · 배터리', itemKo: '배터리 · 엔진 상세 사양', itemEn: 'Battery voltage / nominal capacity', unit: '-', value: spec.powerSpecDetail },
    { code: '8.1', category: '제어 · 유압 기타', itemKo: '충전기 · 연료·변속 계통', itemEn: 'Charger / Transmission', unit: '-', value: spec.chargerOrFuelDetail },
    { code: '10.8', category: '제어 · 유압 기타', itemKo: '방수 · 운용 환경 등급', itemEn: 'Protection / Environment', unit: '-', value: spec.waterproofRating },
    { code: '10.9', category: '제어 · 유압 기타', itemKo: '공식 품질보증 기준', itemEn: 'Manufacturer Warranty', unit: '-', value: spec.warrantyTerms },
  );
  return rows;
}

export function getCompleteMastSpecs(spec: FlModelTechnicalSpec): FlMastSpecRow[] {
  if (spec.mastSpecs && spec.mastSpecs.length > 0) {
    return spec.mastSpecs;
  }
  const baseH1 = spec.mastLoweredH1Mm || spec.overheadGuardHeightMm;
  const stdH3 = spec.standardLiftHeightMm;
  const maxH3 = spec.maxOptionLiftHeightMm;
  const rows: FlMastSpecRow[] = [
    {
      mastType: '2단 표준 광시야 마스트',
      mastModel: `STD-${stdH3}`,
      liftHeightH3Mm: stdH3,
      loweredHeightH1Mm: baseH1,
      extendedHeightWithBackrestH4Mm: spec.mastExtendedH4Mm || stdH3 + 1040,
      freeLiftWithBackrestH2Mm: spec.freeLiftHeightMm,
      tiltAngleDeg: spec.mastTiltDeg || '6 / 12',
      loadCapacity500MmSingleKg: spec.ratedCapacityKg,
    },
  ];
  if (maxH3 > stdH3) {
    const midH3 = Math.round((stdH3 + maxH3) / 200) * 100;
    if (midH3 > stdH3 && midH3 < maxH3) {
      rows.push({
        mastType: '2단 풀프리 마스트 (옵션)',
        mastModel: `FF2-${midH3}`,
        liftHeightH3Mm: midH3,
        loweredHeightH1Mm: baseH1 + 120,
        extendedHeightWithBackrestH4Mm: midH3 + 1040,
        freeLiftWithBackrestH2Mm: Math.max(spec.freeLiftHeightMm, Math.round(baseH1 * 0.65)),
        tiltAngleDeg: spec.mastTiltDeg || '6 / 10',
        loadCapacity500MmSingleKg: Math.round(spec.ratedCapacityKg * 0.92),
      });
    }
    rows.push({
      mastType: '3단 풀프리 마스트 (컨테이너 대응)',
      mastModel: `FF3-${maxH3}`,
      liftHeightH3Mm: maxH3,
      loweredHeightH1Mm: baseH1 + 140,
      extendedHeightWithBackrestH4Mm: maxH3 + 1040,
      freeLiftWithBackrestH2Mm: Math.max(spec.freeLiftHeightMm, Math.round(baseH1 * 0.68)),
      tiltAngleDeg: '6 / 6',
      loadCapacity500MmSingleKg: Math.round(spec.ratedCapacityKg * 0.8),
    });
  }
  return rows;
}
