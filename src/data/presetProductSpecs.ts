import { FL_TECHNICAL_ARCHIVE, FlModelTechnicalSpec } from './flTechnicalArchive';

export interface ProductPresetSpec {
  id?: string;
  modelName: string;
  shortName?: string | null;
  seriesName?: string | null;
  manufacturer: string;
  originCountry?: string | null;
  equipmentClass?: string | null;
  powerSource?: string | null;
  ratedCapacityKg?: number;
  loadCenterMm?: number;
  standardLiftHeightMm?: number;
  maxOptionLiftHeightMm?: number;
  freeLiftHeightMm?: number;
  forkDimensionsMm?: string | null;
  overallLengthMm?: number;
  overallWidthMm?: number;
  overheadGuardHeightMm?: number;
  turningRadiusMm?: number;
  aisleWidth1000x1200Mm?: number;
  travelSpeedKmh?: string | null;
  liftingSpeedMms?: string | null;
  gradeabilityPercent?: number;
  serviceWeightKg?: number;
  powerSpecDetail?: string | null;
  motorOrEngineDetail?: string | null;
  chargerOrFuelDetail?: string | null;
  tireSpecFrontRear?: string | null;
  brakeType?: string | null;
  waterproofRating?: string | null;
  warrantyTerms?: string | null;
  spec?: string | null;
  weight?: string | null;
  machineDimensions?: string | null;
  gradeability?: string | null;
  speed?: string | null;
  asContact?: string | null;
  safetyCertDate?: string | null;
  specSheetUrl?: string | null;
  safetyCertUrl?: string | null;
  brochureUrl?: string | null;
  operatorManualUrl?: string | null;
  isActive?: boolean;
  // 하위 호환 선택 필드
  feet?: number;
  workingHeight?: string | null;
  platformHeight?: string | null;
  capacityPreExt?: string | null;
  capacityPostExtMain?: string | null;
  capacityPostExtDeck?: string | null;
  platformDimensions?: string | null;
  maxWindSpeed?: string | null;
  emergencyGuideUrl?: string | null;
  [key: string]: any;
}

function buildPresetFromArchive(item: FlModelTechnicalSpec, index: number): ProductPresetSpec {
  const primarySpecDoc =
    item.documents.find(d => d.docCategory === 'SPEC_SHEET' || d.docCategory === 'BROCHURE') ||
    item.documents[0];
  const primaryManualDoc =
    item.documents.find(d => d.docCategory === 'OPERATOR_MANUAL' || d.docCategory === 'SAFETY_CERT') ||
    item.documents[1] ||
    primarySpecDoc;

  const dimensionsStr = `${item.overallLengthMm.toLocaleString()} × ${item.overallWidthMm.toLocaleString()} × ${item.overheadGuardHeightMm.toLocaleString()} mm`;
  const specSummary = `정격하중 ${item.ratedCapacityKg.toLocaleString()}kg (하중중심 ${item.loadCenterMm}mm) / 표준인상고 ${item.standardLiftHeightMm.toLocaleString()}mm (최대 ${item.maxOptionLiftHeightMm.toLocaleString()}mm) / ${item.powerSpecDetail}`;

  return {
    id: `FL-PROD-${String(index + 1).padStart(3, '0')}`,
    modelName: item.modelName,
    shortName: item.modelName.split('-')[0] || item.modelName,
    seriesName: item.seriesName,
    manufacturer: item.manufacturerName,
    originCountry: item.originCountry,
    equipmentClass: item.equipmentClass,
    powerSource: item.powerType,
    ratedCapacityKg: item.ratedCapacityKg,
    loadCenterMm: item.loadCenterMm,
    standardLiftHeightMm: item.standardLiftHeightMm,
    maxOptionLiftHeightMm: item.maxOptionLiftHeightMm,
    freeLiftHeightMm: item.freeLiftHeightMm,
    forkDimensionsMm: item.forkDimensionsMm,
    overallLengthMm: item.overallLengthMm,
    overallWidthMm: item.overallWidthMm,
    overheadGuardHeightMm: item.overheadGuardHeightMm,
    turningRadiusMm: item.turningRadiusMm,
    aisleWidth1000x1200Mm: item.aisleWidth1000x1200Mm,
    travelSpeedKmh: `${item.travelSpeedKmh} km/h`,
    liftingSpeedMms: `${item.liftingSpeedMms} mm/s`,
    gradeabilityPercent: item.gradeabilityPercent,
    serviceWeightKg: item.serviceWeightKg,
    powerSpecDetail: item.powerSpecDetail,
    motorOrEngineDetail: item.motorOrEngineDetail,
    chargerOrFuelDetail: item.chargerOrFuelDetail,
    tireSpecFrontRear: item.tireSpecFrontRear,
    brakeType: item.brakeType,
    waterproofRating: item.waterproofRating,
    warrantyTerms: item.warrantyTerms,
    spec: specSummary,
    weight: `${item.serviceWeightKg.toLocaleString()} kg`,
    machineDimensions: dimensionsStr,
    gradeability: `${item.gradeabilityPercent} %`,
    speed: `${item.travelSpeedKmh} km/h`,
    asContact: '1588-0000',
    safetyCertDate: primarySpecDoc?.issuedDate || '2026-03-01',
    specSheetUrl: primarySpecDoc?.r2Url || null,
    brochureUrl: primarySpecDoc?.r2Url || null,
    operatorManualUrl: primaryManualDoc?.r2Url || null,
    safetyCertUrl: primaryManualDoc?.r2Url || null,
    // 하위 호환 매핑
    feet: Math.round((item.ratedCapacityKg / 1000) * 10) / 10,
    workingHeight: `${item.maxOptionLiftHeightMm.toLocaleString()} mm`,
    platformHeight: `${item.standardLiftHeightMm.toLocaleString()} mm`,
    capacityPreExt: `${item.ratedCapacityKg.toLocaleString()} kg`,
    platformDimensions: `${item.forkDimensionsMm} mm`,
    isActive: true,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z'
  };
}

export const PRESET_PRODUCT_SPECS: Record<string, ProductPresetSpec> = (() => {
  const map: Record<string, ProductPresetSpec> = {};
  FL_TECHNICAL_ARCHIVE.forEach((item, idx) => {
    const preset = buildPresetFromArchive(item, idx);
    map[item.modelName] = preset;
    map[item.modelName.toUpperCase()] = preset;
  });

  // 기존 유통 마스터 호환 별칭 모델 매핑
  if (map['CPD25-GB2Li']) {
    map['CPD25-L1'] = {
      ...map['CPD25-GB2Li'],
      id: 'FL-PROD-012',
      modelName: 'CPD25-L1',
      shortName: 'CPD25'
    };
  }
  if (map['EPL205Z']) {
    map['EPL1531'] = {
      ...map['EPL205Z'],
      id: 'FL-PROD-013',
      modelName: 'EPL1531',
      shortName: 'EPL1531',
      seriesName: 'EPL 시리즈 리튬 파레트트럭 1.5톤',
      ratedCapacityKg: 1500,
      serviceWeightKg: 120,
      weight: '120 kg',
      capacityPreExt: '1,500 kg',
      powerSpecDetail: '24V / 20Ah 탈착식 리튬이온 배터리 카트리지'
    };
  }
  if (map['D30S-7']) {
    map['FD30T-7'] = {
      ...map['D30S-7'],
      id: 'FL-PROD-014',
      modelName: 'FD30T-7',
      shortName: 'FD30T'
    };
  }
  if (map['CPD25-XEY2-SI']) {
    map['CQD15-XC4'] = {
      ...map['CPD25-XEY2-SI'],
      id: 'FL-PROD-015',
      modelName: 'CQD15-XC4',
      shortName: 'CQD15',
      seriesName: 'XC 시리즈 입승식 리치트럭 1.5톤',
      equipmentClass: '전동 입승식 리치트럭',
      ratedCapacityKg: 1500,
      standardLiftHeightMm: 3000,
      maxOptionLiftHeightMm: 6000,
      serviceWeightKg: 2450,
      weight: '2,450 kg',
      capacityPreExt: '1,500 kg'
    };
  }

  return map;
})();
