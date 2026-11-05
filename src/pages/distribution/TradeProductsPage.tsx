import React, { useState, useMemo } from 'react';
import {
  Package, Plus, Download, Search, RefreshCw, Edit2, Trash2,
  SlidersHorizontal, CheckCircle2, Ban, X, Layers, Clock, Building2, ShieldCheck,
  FileText, ExternalLink, BookOpen
} from 'lucide-react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { TradeProduct, TradeInventoryLot, SerialWarrantyAsLog, calculateAssetDepreciation } from '../../services/db';
import { exportToExcel } from '../../services/excel';
import { createHangulMatcher } from '../../utils/hangulSearch';
import { FL_TECHNICAL_ARCHIVE, FlModelTechnicalSpec } from '../../data/flTechnicalArchive';

const CATEGORIES = ['전동지게차', '리치트럭', '디젤지게차', '배터리/충전기', '전장부품', '유압부품', '타이어/휠', '소모품', '기타'];
const WAREHOUSES = ['A창고', 'B창고', '부품창고'];
const UNITS = ['대', 'EA', 'SET', 'BOX', '조', '본'];

export type AgingBucket = 'ALL' | 'UNDER_30' | 'DAYS_31_60' | 'DAYS_61_90' | 'DAYS_91_180' | 'OVER_180';

export function calculateAgingDays(inboundDate?: string, createdAt?: string): number {
  const ref = inboundDate || (createdAt ? createdAt.split('T')[0] : '');
  if (!ref) return 0;
  const inTime = new Date(ref).getTime();
  if (Number.isNaN(inTime)) return 0;
  // 기준일: 2026-10-31 또는 현재일 중 큰 값으로 일관된 체화일수 산출
  const nowTime = Math.max(Date.now(), new Date('2026-10-31T00:00:00.000Z').getTime());
  return Math.max(0, Math.floor((nowTime - inTime) / 86400000));
}

export function getAgingBucket(days: number): {
  bucket: Exclude<AgingBucket, 'ALL'>;
  label: string;
  bg: string;
  color: string;
} {
  if (days <= 30) {
    return { bucket: 'UNDER_30', label: '30일 이내', bg: '#dcfce7', color: '#166534' };
  }
  if (days <= 60) {
    return { bucket: 'DAYS_31_60', label: '31~60일', bg: '#dbeafe', color: '#1d4ed8' };
  }
  if (days <= 90) {
    return { bucket: 'DAYS_61_90', label: '61~90일', bg: '#fef3c7', color: '#b45309' };
  }
  if (days <= 180) {
    return { bucket: 'DAYS_91_180', label: '91~180일', bg: '#ffedd5', color: '#c2410c' };
  }
  return { bucket: 'OVER_180', label: '180일 이상', bg: '#fee2e2', color: '#b91c1c' };
}

export const TradeProductsPage: React.FC = () => {
  const { assets, showErrorModal, setActiveTab: setGlobalActiveTab } = useApp();
  const {
    products,
    optionMasters,
    inventoryLots,
    purchases,
    accountTransferLogs,
    getVendorName,
    getProductStock,
    addProduct,
    updateProduct,
    deleteProduct,
    adjustProductStock,
    transferLotToRentalAsset,
    transferRentalAssetToTradeLot
  } = useTrade();

  // [아이디어 #4] 계정 간 자산 전배 및 감가상각 장부가 승계 스튜디오 상태
  const [isTransferStudioOpen, setIsTransferStudioOpen] = useState(false);
  const [transferStudioTab, setTransferStudioTab] = useState<'TRADE_TO_RENTAL' | 'RENTAL_TO_TRADE' | 'HISTORY'>('TRADE_TO_RENTAL');
  const [trfLotId, setTrfLotId] = useState<string>('');
  const [trfAssetNo, setTrfAssetNo] = useState<string>('');
  const [trfYard, setTrfYard] = useState<string>('평택');
  const [trfSelectedOptIds, setTrfSelectedOptIds] = useState<string[]>([]);
  const [trfDepMonths, setTrfDepMonths] = useState<number>(60);
  const [trfResidualRate, setTrfResidualRate] = useState<number>(10);
  const [trfMonthlyFee, setTrfMonthlyFee] = useState<number>(680000);
  const [trfDate, setTrfDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [trfMemo, setTrfMemo] = useState<string>('');

  const [revAssetId, setRevAssetId] = useState<string>('');
  const [revMethod, setRevMethod] = useState<'DEPRECIATION_BOOK' | 'REVENUE_DEDUCT_BOOK'>('DEPRECIATION_BOOK');
  const [revRefurbCost, setRevRefurbCost] = useState<number>(0);
  const [revWarehouse, setRevWarehouse] = useState<string>('A창고');
  const [revDealerPrice, setRevDealerPrice] = useState<number>(0);
  const [revStdPrice, setRevStdPrice] = useState<number>(0);
  const [revMemo, setRevMemo] = useState<string>('');

  // 메인 탭: MASTER (제품·부품·소모품 마스터) | SERIAL_AGING (차대번호별 입출고 및 재고 경과일수) | WAREHOUSE_PARTS (창고별·부품 재고현황)
  const [activeViewTab, setActiveViewTab] = useState<'MASTER' | 'SERIAL_AGING' | 'WAREHOUSE_PARTS'>('MASTER');

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 3200);
  };

  // 다음 품목코드 자동 채번 계산
  const nextAutoSku = useMemo(() => {
    const maxNum = products.reduce((max, p) => {
      const m = /(\d+)$/.exec((p.skuCode || '').trim());
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    return `FL-${String(maxNum + 1).padStart(4, '0')}`;
  }, [products]);

  // Quick inline registration state
  const [name, setName] = useState('');
  const [cost, setCost] = useState<number>(0);
  const [price, setPrice] = useState<number>(0);

  // Filter states (유형자산 분류: 완제품 지게차 기본, 용도 구분, 제조사, 카테고리, 창고, 품명/코드, 재고상태, 거래상태)
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'EQUIPMENT' | 'PART' | 'CONSUMABLE'>('EQUIPMENT');
  const [usagePurposeFilter, setUsagePurposeFilter] = useState<'ALL' | 'TRADE_SALE' | 'RENTAL_REPAIR' | 'DUAL_USE'>('ALL');
  const [manufacturerFilter, setManufacturerFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'NORMAL' | 'LOW' | 'OUT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISCONTINUED'>('ALL');

  // 탭 2 전용 필터: 차대번호 보유상태, 입고 경과일수 구간
  const [lotStatusFilter, setLotStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'SOLD'>('ALL');
  const [agingBucketFilter, setAgingBucketFilter] = useState<AgingBucket>('ALL');

  // Product Create/Edit Modal state
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<TradeProduct | null>(null);
  const [specDetailProduct, setSpecDetailProduct] = useState<TradeProduct | null>(null);
  const [formSku, setFormSku] = useState('');
  const [formItemType, setFormItemType] = useState<'EQUIPMENT' | 'PART' | 'CONSUMABLE'>('EQUIPMENT');
  const [formManufacturer, setFormManufacturer] = useState('');
  const [formModelName, setFormModelName] = useState('');
  const [formSeriesName, setFormSeriesName] = useState('');
  const [formOriginCountry, setFormOriginCountry] = useState('중국 수입');
  const [formDefaultWarehouse, setFormDefaultWarehouse] = useState('A창고');
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('전동지게차');
  const [formSpec, setFormSpec] = useState('');
  const [formEquipmentClass, setFormEquipmentClass] = useState('전동 좌승식 카운터밸런스');
  const [formPowerType, setFormPowerType] = useState('리튬인산철 전동');
  const [formRatedCapacityKg, setFormRatedCapacityKg] = useState<number>(2500);
  const [formLoadCenterMm, setFormLoadCenterMm] = useState<number>(500);
  const [formStandardLiftHeightMm, setFormStandardLiftHeightMm] = useState<number>(3000);
  const [formMaxOptionLiftHeightMm, setFormMaxOptionLiftHeightMm] = useState<number>(4700);
  const [formFreeLiftHeightMm, setFormFreeLiftHeightMm] = useState<number>(1480);
  const [formForkDimensionsMm, setFormForkDimensionsMm] = useState('40 × 122 × 1,070');
  const [formOverallLengthMm, setFormOverallLengthMm] = useState<number>(2485);
  const [formOverallWidthMm, setFormOverallWidthMm] = useState<number>(1180);
  const [formOverheadGuardHeightMm, setFormOverheadGuardHeightMm] = useState<number>(2140);
  const [formTurningRadiusMm, setFormTurningRadiusMm] = useState<number>(2120);
  const [formAisleWidth1000x1200Mm, setFormAisleWidth1000x1200Mm] = useState<number>(3845);
  const [formTravelSpeedKmh, setFormTravelSpeedKmh] = useState('18.0 / 19.0');
  const [formLiftingSpeedMms, setFormLiftingSpeedMms] = useState('460 / 540');
  const [formGradeabilityPercent, setFormGradeabilityPercent] = useState<number>(20);
  const [formServiceWeightKg, setFormServiceWeightKg] = useState<number>(3980);
  const [formPowerSpecDetail, setFormPowerSpecDetail] = useState('');
  const [formMotorOrEngineDetail, setFormMotorOrEngineDetail] = useState('');
  const [formChargerOrFuelDetail, setFormChargerOrFuelDetail] = useState('');
  const [formTireSpecFrontRear, setFormTireSpecFrontRear] = useState('');
  const [formBrakeType, setFormBrakeType] = useState('');
  const [formWaterproofRating, setFormWaterproofRating] = useState('');
  const [formWarrantyTerms, setFormWarrantyTerms] = useState('');
  const [formSpecSheetUrl, setFormSpecSheetUrl] = useState('');
  const [formManualUrl, setFormManualUrl] = useState('');
  const [formUnit, setFormUnit] = useState('대');
  const [formStandardCost, setFormStandardCost] = useState<number>(0);
  const [formDealerPrice, setFormDealerPrice] = useState<number>(0);
  const [formStandardPrice, setFormStandardPrice] = useState<number>(0);
  const [formSafetyStock, setFormSafetyStock] = useState<number>(3);
  const [formWarrantyMonths, setFormWarrantyMonths] = useState<number>(12);
  const [formCogsMethod, setFormCogsMethod] = useState<'FIFO' | 'MOVING_AVG'>('FIFO');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'DISCONTINUED'>('ACTIVE');
  const [formInitialStock, setFormInitialStock] = useState<number>(0);
  const [formInitialSerial, setFormInitialSerial] = useState<string>('');
  const [formMemo, setFormMemo] = useState('');

  // 공식 아카이브 모델 선택 시 VDI 2198 전 항목 자동 세팅
  const applyArchivePreset = (archiveId: string) => {
    const spec = FL_TECHNICAL_ARCHIVE.find(s => s.id === archiveId);
    if (!spec) return;
    const specDoc = spec.documents.find(d => d.docCategory === 'SPEC_SHEET') || spec.documents[0];
    const manualDoc = spec.documents.find(d => d.docCategory === 'OPERATOR_MANUAL') || spec.documents[1];
    setFormItemType('EQUIPMENT');
    setFormManufacturer(spec.manufacturerName);
    setFormModelName(spec.modelName);
    setFormSeriesName(spec.seriesName);
    setFormOriginCountry(spec.originCountry);
    setFormName(`${spec.manufacturerName} ${spec.seriesName}`);
    setFormCategory(spec.powerType.includes('디젤') ? '디젤지게차' : spec.equipmentClass.includes('리치') ? '리치트럭' : '전동지게차');
    setFormSpec(`정격하중 ${spec.ratedCapacityKg}kg / 표준인상고 ${spec.standardLiftHeightMm}mm / ${spec.powerSpecDetail}`);
    setFormEquipmentClass(spec.equipmentClass);
    setFormPowerType(spec.powerType);
    setFormRatedCapacityKg(spec.ratedCapacityKg);
    setFormLoadCenterMm(spec.loadCenterMm);
    setFormStandardLiftHeightMm(spec.standardLiftHeightMm);
    setFormMaxOptionLiftHeightMm(spec.maxOptionLiftHeightMm);
    setFormFreeLiftHeightMm(spec.freeLiftHeightMm);
    setFormForkDimensionsMm(spec.forkDimensionsMm);
    setFormOverallLengthMm(spec.overallLengthMm);
    setFormOverallWidthMm(spec.overallWidthMm);
    setFormOverheadGuardHeightMm(spec.overheadGuardHeightMm);
    setFormTurningRadiusMm(spec.turningRadiusMm);
    setFormAisleWidth1000x1200Mm(spec.aisleWidth1000x1200Mm);
    setFormTravelSpeedKmh(spec.travelSpeedKmh);
    setFormLiftingSpeedMms(spec.liftingSpeedMms);
    setFormGradeabilityPercent(spec.gradeabilityPercent);
    setFormServiceWeightKg(spec.serviceWeightKg);
    setFormPowerSpecDetail(spec.powerSpecDetail);
    setFormMotorOrEngineDetail(spec.motorOrEngineDetail);
    setFormChargerOrFuelDetail(spec.chargerOrFuelDetail);
    setFormTireSpecFrontRear(spec.tireSpecFrontRear);
    setFormBrakeType(spec.brakeType);
    setFormWaterproofRating(spec.waterproofRating);
    setFormWarrantyTerms(spec.warrantyTerms);
    setFormSpecSheetUrl(specDoc?.r2Url || '');
    setFormManualUrl(manualDoc?.r2Url || '');
    showToast(`[${spec.manufacturerName} ${spec.modelName}] 공식 VDI 2198 제원이 자동 적용되었습니다.`);
  };

  // Stock Adjustment Modal state
  const [adjustTarget, setAdjustTarget] = useState<TradeProduct | null>(null);
  const [adjustType, setAdjustType] = useState<'ADD' | 'SUB'>('ADD');
  const [adjustQty, setAdjustQty] = useState<number>(1);
  const [adjustUnitCost, setAdjustUnitCost] = useState<number>(0);
  const [adjustWarehouse, setAdjustWarehouse] = useState<string>('A창고');
  const [adjustSerialNumber, setAdjustSerialNumber] = useState<string>('');
  const [adjustInboundDate, setAdjustInboundDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adjustReason, setAdjustReason] = useState('정기 재고실사 수량 보정');

  // 차대번호별 입출고 및 보증·사후정비 이력 모달 상태
  const [selectedSerialLotId, setSelectedSerialLotId] = useState<string | null>(null);
  const [serialAsLogsMap, setSerialAsLogsMap] = useState<Record<string, SerialWarrantyAsLog[]>>(() => {
    try {
      const saved = localStorage.getItem('erp_fl_serial_warranty_as_logs_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });
  const [asFormDate, setAsFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [asFormServiceType, setAsFormServiceType] = useState<'WARRANTY_FREE' | 'PAID_AS' | 'PERIODIC_CHECK'>('WARRANTY_FREE');
  const [asFormSymptom, setAsFormSymptom] = useState<string>('');
  const [asFormActionDetail, setAsFormActionDetail] = useState<string>('');
  const [asFormPartsUsed, setAsFormPartsUsed] = useState<string>('');
  const [asFormCostAmount, setAsFormCostAmount] = useState<number>(0);
  const [asFormEngineerName, setAsFormEngineerName] = useState<string>('기술지원팀');

  const handleAddSerialAsLog = (e: React.FormEvent, serialNumber: string, lot: TradeInventoryLot) => {
    e.preventDefault();
    if (!asFormSymptom.trim() || !asFormActionDetail.trim()) {
      showErrorModal('고장증상·점검내용과 조치내역을 모두 입력해 주세요.');
      return;
    }
    const newLog: SerialWarrantyAsLog = {
      id: `SAS-${Date.now()}`,
      serviceDate: asFormDate,
      serviceType: asFormServiceType,
      symptom: asFormSymptom.trim(),
      actionDetail: asFormActionDetail.trim(),
      partsUsed: asFormPartsUsed.trim() || '-',
      costAmount: asFormServiceType === 'WARRANTY_FREE' ? 0 : Math.max(0, Number(asFormCostAmount) || 0),
      engineerName: asFormEngineerName.trim() || '기술지원팀',
      customerName: lot.soldCustomerName || '보유재고 자체점검'
    };
    const existing = serialAsLogsMap[serialNumber] || lot.warrantyAsLogs || [];
    const nextList = [newLog, ...existing];
    const nextMap = { ...serialAsLogsMap, [serialNumber]: nextList };
    setSerialAsLogsMap(nextMap);
    try {
      localStorage.setItem('erp_fl_serial_warranty_as_logs_v1', JSON.stringify(nextMap));
    } catch {
      // ignore
    }
    setAsFormSymptom('');
    setAsFormActionDetail('');
    setAsFormPartsUsed('');
    setAsFormCostAmount(0);
    showToast(`[${serialNumber}] 보증·정비 이력이 등록되었습니다.`);
  };

  // 제조사 목록 추출
  const manufacturerOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.manufacturer) set.add(p.manufacturer);
    });
    return Array.from(set);
  }, [products]);

  // Quick Add handler
  const handleQuickAdd = async () => {
    if (!name.trim() || cost <= 0 || price <= 0) {
      showErrorModal('제품명, 기준 매입단가, 판매단가를 모두 입력해 주세요.');
      return;
    }
    try {
      const created = await addProduct({
        skuCode: nextAutoSku,
        name: name.trim(),
        itemType: 'EQUIPMENT',
        manufacturer: '이피이큅먼트',
        modelName: name.trim().split(' ')[0] || nextAutoSku,
        originCountry: '중국 수입',
        defaultWarehouse: 'A창고',
        category: '전동지게차',
        spec: '표준규격',
        unit: '대',
        standardCost: cost,
        dealerPrice: Math.round((cost + price) / 2),
        standardPrice: price,
        safetyStock: 3,
        warrantyMonths: 12,
        status: 'ACTIVE',
        cogsMethod: 'FIFO',
        memo: ''
      });
      setName('');
      setCost(0);
      setPrice(0);
      showToast(`[${created.skuCode}] ${name.trim()} 제품이 등록되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '제품 등록 중 오류가 발생했습니다.');
    }
  };

  // Open Modal for New or Edit
  const openCreateModal = () => {
    setEditingProduct(null);
    setFormSku(nextAutoSku);
    setFormItemType('EQUIPMENT');
    setFormManufacturer('안후이 헬리');
    setFormModelName('');
    setFormSeriesName('');
    setFormOriginCountry('중국 수입');
    setFormDefaultWarehouse('A창고');
    setFormName('');
    setFormCategory('전동지게차');
    setFormSpec('');
    setFormEquipmentClass('전동 좌승식 카운터밸런스');
    setFormPowerType('리튬인산철 전동');
    setFormRatedCapacityKg(2500);
    setFormLoadCenterMm(500);
    setFormStandardLiftHeightMm(3000);
    setFormMaxOptionLiftHeightMm(4700);
    setFormFreeLiftHeightMm(1480);
    setFormForkDimensionsMm('40 × 122 × 1,070');
    setFormOverallLengthMm(2485);
    setFormOverallWidthMm(1180);
    setFormOverheadGuardHeightMm(2140);
    setFormTurningRadiusMm(2120);
    setFormAisleWidth1000x1200Mm(3845);
    setFormTravelSpeedKmh('18.0 / 19.0');
    setFormLiftingSpeedMms('460 / 540');
    setFormGradeabilityPercent(20);
    setFormServiceWeightKg(3980);
    setFormPowerSpecDetail('');
    setFormMotorOrEngineDetail('');
    setFormChargerOrFuelDetail('');
    setFormTireSpecFrontRear('');
    setFormBrakeType('');
    setFormWaterproofRating('');
    setFormWarrantyTerms('');
    setFormSpecSheetUrl('');
    setFormManualUrl('');
    setFormUnit('대');
    setFormStandardCost(0);
    setFormDealerPrice(0);
    setFormStandardPrice(0);
    setFormSafetyStock(3);
    setFormWarrantyMonths(12);
    setFormCogsMethod('FIFO');
    setFormStatus('ACTIVE');
    setFormInitialStock(0);
    setFormInitialSerial('');
    setFormMemo('');
    setIsProductModalOpen(true);
  };

  const openEditModal = (p: TradeProduct) => {
    setEditingProduct(p);
    setFormSku(p.skuCode);
    setFormItemType(p.itemType || (p.unit === '대' ? 'EQUIPMENT' : 'PART'));
    setFormManufacturer(p.manufacturer || '');
    setFormModelName(p.modelName || '');
    setFormSeriesName(p.seriesName || '');
    setFormOriginCountry(p.originCountry || '중국 수입');
    setFormDefaultWarehouse(p.defaultWarehouse || 'A창고');
    setFormName(p.name);
    setFormCategory(p.category || '전동지게차');
    setFormSpec(p.spec || '');
    setFormEquipmentClass(p.equipmentClass || '전동 좌승식 카운터밸런스');
    setFormPowerType(p.powerType || '리튬인산철 전동');
    setFormRatedCapacityKg(p.ratedCapacityKg ?? 2500);
    setFormLoadCenterMm(p.loadCenterMm ?? 500);
    setFormStandardLiftHeightMm(p.standardLiftHeightMm ?? 3000);
    setFormMaxOptionLiftHeightMm(p.maxOptionLiftHeightMm ?? 4700);
    setFormFreeLiftHeightMm(p.freeLiftHeightMm ?? 1480);
    setFormForkDimensionsMm(p.forkDimensionsMm || '40 × 122 × 1,070');
    setFormOverallLengthMm(p.overallLengthMm ?? 2485);
    setFormOverallWidthMm(p.overallWidthMm ?? 1180);
    setFormOverheadGuardHeightMm(p.overheadGuardHeightMm ?? 2140);
    setFormTurningRadiusMm(p.turningRadiusMm ?? 2120);
    setFormAisleWidth1000x1200Mm(p.aisleWidth1000x1200Mm ?? 3845);
    setFormTravelSpeedKmh(p.travelSpeedKmh || '18.0 / 19.0');
    setFormLiftingSpeedMms(p.liftingSpeedMms || '460 / 540');
    setFormGradeabilityPercent(p.gradeabilityPercent ?? 20);
    setFormServiceWeightKg(p.serviceWeightKg ?? 3980);
    setFormPowerSpecDetail(p.powerSpecDetail || '');
    setFormMotorOrEngineDetail(p.motorOrEngineDetail || '');
    setFormChargerOrFuelDetail(p.chargerOrFuelDetail || '');
    setFormTireSpecFrontRear(p.tireSpecFrontRear || '');
    setFormBrakeType(p.brakeType || '');
    setFormWaterproofRating(p.waterproofRating || '');
    setFormWarrantyTerms(p.warrantyTerms || '');
    setFormSpecSheetUrl(p.specSheetUrl || '');
    setFormManualUrl(p.manualUrl || '');
    setFormUnit(p.unit || '대');
    setFormStandardCost(p.standardCost ?? 0);
    setFormDealerPrice(p.dealerPrice ?? Math.round(((p.standardCost ?? 0) + p.standardPrice) / 2));
    setFormStandardPrice(p.standardPrice);
    setFormSafetyStock(p.safetyStock ?? 3);
    setFormWarrantyMonths(p.warrantyMonths ?? 12);
    setFormCogsMethod(p.cogsMethod || 'FIFO');
    setFormStatus(p.status);
    setFormInitialStock(0);
    setFormInitialSerial('');
    setFormMemo(p.memo || '');
    setIsProductModalOpen(true);
  };

  const handleSaveProductModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showErrorModal('제품명은 필수 입력 항목입니다.');
      return;
    }
    if (formStandardCost <= 0) {
      showErrorModal('기준 매입단가는 0원보다 커야 합니다.');
      return;
    }
    if (formStandardPrice <= 0) {
      showErrorModal('최종고객 판매단가는 0원보다 커야 합니다.');
      return;
    }

    try {
      const payload: Omit<TradeProduct, 'id' | 'createdAt' | 'updatedAt'> = {
        skuCode: formSku.trim() || nextAutoSku,
        itemType: formItemType,
        manufacturer: formManufacturer.trim() || '기타제조사',
        modelName: formModelName.trim() || formSku.trim(),
        seriesName: formItemType === 'EQUIPMENT' ? formSeriesName.trim() : undefined,
        originCountry: formOriginCountry,
        defaultWarehouse: formDefaultWarehouse,
        name: formName.trim(),
        category: formCategory,
        spec:
          formSpec.trim() ||
          (formItemType === 'EQUIPMENT'
            ? `정격하중 ${formRatedCapacityKg}kg / 표준인상고 ${formStandardLiftHeightMm}mm / ${formPowerSpecDetail || formPowerType}`
            : '-'),
        equipmentClass: formItemType === 'EQUIPMENT' ? formEquipmentClass : undefined,
        powerType: formItemType === 'EQUIPMENT' ? formPowerType : undefined,
        ratedCapacityKg: formItemType === 'EQUIPMENT' ? formRatedCapacityKg : undefined,
        loadCenterMm: formItemType === 'EQUIPMENT' ? formLoadCenterMm : undefined,
        standardLiftHeightMm: formItemType === 'EQUIPMENT' ? formStandardLiftHeightMm : undefined,
        maxOptionLiftHeightMm: formItemType === 'EQUIPMENT' ? formMaxOptionLiftHeightMm : undefined,
        freeLiftHeightMm: formItemType === 'EQUIPMENT' ? formFreeLiftHeightMm : undefined,
        forkDimensionsMm: formItemType === 'EQUIPMENT' ? formForkDimensionsMm : undefined,
        overallLengthMm: formItemType === 'EQUIPMENT' ? formOverallLengthMm : undefined,
        overallWidthMm: formItemType === 'EQUIPMENT' ? formOverallWidthMm : undefined,
        overheadGuardHeightMm: formItemType === 'EQUIPMENT' ? formOverheadGuardHeightMm : undefined,
        turningRadiusMm: formItemType === 'EQUIPMENT' ? formTurningRadiusMm : undefined,
        aisleWidth1000x1200Mm: formItemType === 'EQUIPMENT' ? formAisleWidth1000x1200Mm : undefined,
        travelSpeedKmh: formItemType === 'EQUIPMENT' ? formTravelSpeedKmh : undefined,
        liftingSpeedMms: formItemType === 'EQUIPMENT' ? formLiftingSpeedMms : undefined,
        gradeabilityPercent: formItemType === 'EQUIPMENT' ? formGradeabilityPercent : undefined,
        serviceWeightKg: formItemType === 'EQUIPMENT' ? formServiceWeightKg : undefined,
        powerSpecDetail: formItemType === 'EQUIPMENT' ? formPowerSpecDetail : undefined,
        motorOrEngineDetail: formItemType === 'EQUIPMENT' ? formMotorOrEngineDetail : undefined,
        chargerOrFuelDetail: formItemType === 'EQUIPMENT' ? formChargerOrFuelDetail : undefined,
        tireSpecFrontRear: formItemType === 'EQUIPMENT' ? formTireSpecFrontRear : undefined,
        brakeType: formItemType === 'EQUIPMENT' ? formBrakeType : undefined,
        waterproofRating: formItemType === 'EQUIPMENT' ? formWaterproofRating : undefined,
        warrantyTerms: formItemType === 'EQUIPMENT' ? formWarrantyTerms : undefined,
        specSheetUrl: formItemType === 'EQUIPMENT' ? formSpecSheetUrl : undefined,
        manualUrl: formItemType === 'EQUIPMENT' ? formManualUrl : undefined,
        unit: formUnit,
        standardCost: formStandardCost,
        dealerPrice: formDealerPrice > 0 ? formDealerPrice : formStandardPrice,
        standardPrice: formStandardPrice,
        safetyStock: formSafetyStock,
        warrantyMonths: formWarrantyMonths,
        cogsMethod: formCogsMethod,
        status: formStatus,
        memo: formMemo.trim()
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
        showToast(`[${formName.trim()}] 제품 마스터 및 VDI 2198 지게차 제원이 수정되었습니다.`);
      } else {
        const created = await addProduct(payload);
        if (formInitialStock > 0) {
          await adjustProductStock(
            created.id,
            formInitialStock,
            formStandardCost,
            '신규 제품 등록 기초 재고 입고',
            {
              warehouseName: formDefaultWarehouse,
              serialNumber: formInitialSerial.trim() || undefined,
              inboundDate: new Date().toISOString().split('T')[0]
            }
          );
        }
        showToast(`[${created.skuCode}] ${formName.trim()} 신규 제품이 등록되었습니다.`);
      }
      setIsProductModalOpen(false);
    } catch (err: any) {
      showErrorModal(err.message || '제품 저장 실패');
    }
  };

  const handleToggleStatus = async (p: TradeProduct) => {
    const nextStatus = p.status === 'ACTIVE' ? 'DISCONTINUED' : 'ACTIVE';
    try {
      await updateProduct(p.id, { status: nextStatus });
      showToast(
        `[${p.name}] 상태가 ${nextStatus === 'ACTIVE' ? '판매중' : '단종'} 상태로 변경되었습니다.`
      );
    } catch (err: any) {
      showErrorModal(err.message || '상태 변경 실패');
    }
  };

  const handleDeleteProduct = async (p: TradeProduct) => {
    if (!window.confirm(`[${p.skuCode}] ${p.name} 제품을 삭제하시겠습니까?`)) return;
    try {
      await deleteProduct(p.id);
      showToast(`[${p.name}] 제품이 삭제되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '제품 삭제 실패');
    }
  };

  const openAdjustModal = (p: TradeProduct) => {
    const st = getProductStock(p.id);
    setAdjustTarget(p);
    setAdjustType('ADD');
    setAdjustQty(1);
    setAdjustUnitCost(st.avgUnitCost || p.standardCost || 0);
    setAdjustWarehouse(p.defaultWarehouse || 'A창고');
    setAdjustSerialNumber('');
    setAdjustInboundDate(new Date().toISOString().split('T')[0]);
    setAdjustReason('정기 재고실사 수량 보정');
  };

  const handleConfirmAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustTarget) return;
    if (adjustQty <= 0) {
      showErrorModal('조정 수량은 1개 이상 입력해 주세요.');
      return;
    }
    try {
      const signedQty = adjustType === 'ADD' ? adjustQty : -adjustQty;
      await adjustProductStock(adjustTarget.id, signedQty, adjustUnitCost, adjustReason, {
        warehouseName: adjustWarehouse,
        serialNumber: adjustSerialNumber.trim() || undefined,
        inboundDate: adjustInboundDate
      });
      showToast(
        `[${adjustTarget.name}] 재고가 ${adjustType === 'ADD' ? `+${adjustQty}` : `-${adjustQty}`}${adjustTarget.unit || 'EA'} 조정되었습니다.`
      );
      setAdjustTarget(null);
    } catch (err: any) {
      showErrorModal(err.message || '재고 조정 실패');
    }
  };

  // Enriched products with stock & warehouse metrics
  const enrichedProducts = useMemo(() => {
    return products.map(p => {
      const st = getProductStock(p.id);
      const activeLots = inventoryLots.filter(l => l.productId === p.id && l.remainingQty > 0);
      const costVal = st.avgUnitCost || p.standardCost || 0;
      const safety = p.safetyStock ?? 3;
      const dealerP = p.dealerPrice ?? Math.round((costVal + p.standardPrice) / 2);
      const marginAmt = p.standardPrice - costVal;
      const marginRate = p.standardPrice > 0 ? (marginAmt / p.standardPrice) * 100 : 0;
      const regDate = (p.createdAt || '').split('T')[0];
      const maxAgingDays = activeLots.reduce(
        (max, l) => Math.max(max, calculateAgingDays(l.inboundDate, l.createdAt)),
        0
      );
      const warehouses = Array.from(
        new Set(activeLots.map(l => l.warehouseName || p.defaultWarehouse || 'A창고'))
      );

      const resolvedItemType: 'EQUIPMENT' | 'PART' | 'CONSUMABLE' =
        p.itemType ||
        (p.inventoryAssetClass === 'CONSUMABLE' || p.category === '소모품'
          ? 'CONSUMABLE'
          : p.unit === '대'
          ? 'EQUIPMENT'
          : 'PART');
      const resolvedAssetClass: 'PRODUCT' | 'PART' | 'CONSUMABLE' =
        (p.inventoryAssetClass === 'PRODUCT' || p.inventoryAssetClass === 'PART' || p.inventoryAssetClass === 'CONSUMABLE')
          ? p.inventoryAssetClass
          : resolvedItemType === 'EQUIPMENT'
          ? 'PRODUCT'
          : resolvedItemType === 'CONSUMABLE'
          ? 'CONSUMABLE'
          : 'PART';
      const resolvedUsagePurpose: 'TRADE_SALE' | 'RENTAL_REPAIR' | 'DUAL_USE' =
        (p.usagePurpose === 'TRADE_SALE' || p.usagePurpose === 'RENTAL_REPAIR' || p.usagePurpose === 'DUAL_USE')
          ? p.usagePurpose
          : resolvedItemType === 'EQUIPMENT'
          ? 'TRADE_SALE'
          : 'DUAL_USE';
      const saleStockQty =
        p.saleStockQty ??
        (resolvedItemType === 'EQUIPMENT'
          ? st.availableQty
          : resolvedUsagePurpose === 'RENTAL_REPAIR'
          ? 0
          : Math.ceil(st.availableQty * 0.7));
      const repairStockQty =
        p.repairStockQty ??
        (resolvedItemType === 'EQUIPMENT' || resolvedUsagePurpose === 'TRADE_SALE'
          ? 0
          : Math.max(0, st.availableQty - saleStockQty));

      return {
        ...p,
        resolvedItemType,
        resolvedAssetClass,
        resolvedUsagePurpose,
        saleStockQty,
        repairStockQty,
        availableQty: st.availableQty,
        avgUnitCost: costVal,
        stockValue: st.stockValue,
        standardCost: p.standardCost ?? 0,
        dealerPrice: dealerP,
        safetyStock: safety,
        marginAmt,
        marginRate,
        regDate,
        maxAgingDays,
        warehouses
      };
    });
  }, [products, inventoryLots, getProductStock]);

  // Filtered products for Tab 1 & Tab 3
  const filteredProducts = useMemo(() => {
    const matcher = searchTerm.trim() ? createHangulMatcher(searchTerm.trim()) : null;
    return enrichedProducts.filter(p => {
      if (itemTypeFilter !== 'ALL' && p.resolvedItemType !== itemTypeFilter) return false;
      if (usagePurposeFilter !== 'ALL') {
        if (usagePurposeFilter === 'TRADE_SALE' && p.resolvedUsagePurpose !== 'TRADE_SALE' && p.resolvedUsagePurpose !== 'DUAL_USE') return false;
        if (usagePurposeFilter === 'RENTAL_REPAIR' && p.resolvedUsagePurpose !== 'RENTAL_REPAIR' && p.resolvedUsagePurpose !== 'DUAL_USE') return false;
        if (usagePurposeFilter === 'DUAL_USE' && p.resolvedUsagePurpose !== 'DUAL_USE') return false;
      }
      if (manufacturerFilter !== 'ALL' && p.manufacturer !== manufacturerFilter) return false;
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (
        warehouseFilter !== 'ALL' &&
        p.defaultWarehouse !== warehouseFilter &&
        !p.warehouses.includes(warehouseFilter)
      ) {
        return false;
      }
      if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;

      if (stockFilter === 'OUT' && p.availableQty > 0) return false;
      if (stockFilter === 'LOW' && (p.availableQty === 0 || p.availableQty >= p.safetyStock)) return false;
      if (stockFilter === 'NORMAL' && p.availableQty < p.safetyStock) return false;

      if (matcher) {
        const testFn = (val?: string) => typeof matcher === 'function' ? matcher(val || '') : (matcher as any).test(val || '');
        const hit =
          testFn(p.name) ||
          testFn(p.skuCode) ||
          testFn(p.manufacturer) ||
          testFn(p.modelName) ||
          testFn(p.category) ||
          testFn(p.spec) ||
          testFn(p.memo);
        if (!hit) return false;
      }
      return true;
    });
  }, [
    enrichedProducts,
    itemTypeFilter,
    usagePurposeFilter,
    manufacturerFilter,
    categoryFilter,
    warehouseFilter,
    statusFilter,
    stockFilter,
    searchTerm
  ]);

  // Enriched Serial / Lot rows for Tab 2 (차대번호별 입출고 및 재고 경과일수)
  const enrichedLots = useMemo(() => {
    return inventoryLots
      .map(lot => {
        const prod = products.find(p => p.id === lot.productId);
        const po = purchases.find(pu => pu.id === lot.purchaseId);
        const inboundDate = lot.inboundDate || po?.receivedDate || (lot.createdAt || '').split('T')[0];
        const agingDays = calculateAgingDays(inboundDate, lot.createdAt);
        const agingInfo = getAgingBucket(agingDays);
        const isSold = lot.remainingQty === 0 || lot.lotStatus === 'SOLD';
        const warehouseName = lot.warehouseName || prod?.defaultWarehouse || 'A창고';
        const vendorName = po ? getVendorName(po.vendorId) : '기초재고/수동입고';

        return {
          lot,
          prod,
          po,
          serialNumber: lot.serialNumber || lot.id,
          itemType: prod?.itemType || (prod?.unit === '대' ? 'EQUIPMENT' : 'PART'),
          manufacturer: prod?.manufacturer || '-',
          modelName: prod?.modelName || prod?.skuCode || '-',
          productName: prod?.name || '미지정 품목',
          warehouseName,
          inboundDate,
          agingDays,
          agingInfo,
          isSold,
          vendorName,
          purchaseTypeLabel: po?.purchaseType === 'IMPORT' ? '해외수입' : '국내매입',
          currency: lot.foreignCurrency || po?.currency || 'KRW',
          foreignUnitPrice: lot.foreignUnitPrice ?? lot.unitCost,
          exchangeRate: lot.exchangeRate ?? po?.exchangeRate ?? 1,
          incidentalCostPerUnit: lot.incidentalCostPerUnit ?? 0,
          landedUnitCost: lot.unitCost,
          soldDate: lot.soldDate || '-',
          soldCustomerName: lot.soldCustomerName || '-',
          warrantyEndDate: lot.warrantyEndDate || '-'
        };
      })
      .sort((a, b) => b.agingDays - a.agingDays);
  }, [inventoryLots, products, purchases, getVendorName]);

  const filteredLots = useMemo(() => {
    const matcher = searchTerm.trim() ? createHangulMatcher(searchTerm.trim()) : null;
    return enrichedLots.filter(row => {
      if (itemTypeFilter !== 'ALL' && row.itemType !== itemTypeFilter) return false;
      if (manufacturerFilter !== 'ALL' && row.manufacturer !== manufacturerFilter) return false;
      if (warehouseFilter !== 'ALL' && row.warehouseName !== warehouseFilter) return false;
      if (lotStatusFilter === 'IN_STOCK' && row.isSold) return false;
      if (lotStatusFilter === 'SOLD' && !row.isSold) return false;
      if (agingBucketFilter !== 'ALL' && row.agingInfo.bucket !== agingBucketFilter) return false;

      if (matcher) {
        const testFn = (val?: string) => typeof matcher === 'function' ? matcher(val || '') : (matcher as any).test(val || '');
        const hit =
          testFn(row.serialNumber) ||
          testFn(row.productName) ||
          testFn(row.manufacturer) ||
          testFn(row.modelName) ||
          testFn(row.warehouseName) ||
          testFn(row.vendorName) ||
          testFn(row.soldCustomerName);
        if (!hit) return false;
      }
      return true;
    });
  }, [
    enrichedLots,
    itemTypeFilter,
    manufacturerFilter,
    warehouseFilter,
    lotStatusFilter,
    agingBucketFilter,
    searchTerm
  ]);

  // Aging 요약 집계 (현재고 보유중 기준)
  const agingSummary = useMemo(() => {
    const active = enrichedLots.filter(r => !r.isSold);
    const counts = {
      ALL: active.length,
      UNDER_30: active.filter(r => r.agingInfo.bucket === 'UNDER_30').length,
      DAYS_31_60: active.filter(r => r.agingInfo.bucket === 'DAYS_31_60').length,
      DAYS_61_90: active.filter(r => r.agingInfo.bucket === 'DAYS_61_90').length,
      DAYS_91_180: active.filter(r => r.agingInfo.bucket === 'DAYS_91_180').length,
      OVER_180: active.filter(r => r.agingInfo.bucket === 'OVER_180').length
    };
    const values = {
      OVER_90_VALUE: active
        .filter(r => r.agingDays > 90)
        .reduce((s, r) => s + r.lot.remainingQty * r.landedUnitCost, 0)
    };
    return { counts, values };
  }, [enrichedLots]);

  // 창고별 집계 (탭 3)
  const warehouseSummary = useMemo(() => {
    return WAREHOUSES.map(wh => {
      const whLots = enrichedLots.filter(r => !r.isSold && r.warehouseName === wh);
      const equipUnits = whLots
        .filter(r => r.itemType === 'EQUIPMENT')
        .reduce((s, r) => s + r.lot.remainingQty, 0);
      const partQty = whLots
        .filter(r => r.itemType === 'PART' || r.itemType === 'CONSUMABLE')
        .reduce((s, r) => s + r.lot.remainingQty, 0);
      const totalValue = whLots.reduce((s, r) => s + r.lot.remainingQty * r.landedUnitCost, 0);
      const over90Count = whLots.filter(r => r.agingDays > 90).length;
      return {
        warehouseName: wh,
        lotCount: whLots.length,
        equipUnits,
        partQty,
        totalValue,
        over90Count
      };
    });
  }, [enrichedLots]);

  // KPI Summary (회사의 유형자산·재고 4대 구성: 자산·렌탈용 / 제품·완제품판매용 / 부품·판매및정비용 / 소모품·판매및정비용)
  const kpi = useMemo(() => {
    const rentalAssetCount = (assets || []).length;
    const rentalActiveCount = (assets || []).filter(a => a.status === 'RENTED').length;
    const equipProducts = enrichedProducts.filter(p => p.resolvedItemType === 'EQUIPMENT');
    const partProducts = enrichedProducts.filter(p => p.resolvedItemType === 'PART');
    const consumableProducts = enrichedProducts.filter(p => p.resolvedItemType === 'CONSUMABLE');
    const equipStockUnits = equipProducts.reduce((s, p) => s + p.availableQty, 0);
    const partStockQty = partProducts.reduce((s, p) => s + p.availableQty, 0);
    const partSaleQty = partProducts.reduce((s, p) => s + p.saleStockQty, 0);
    const partRepairQty = partProducts.reduce((s, p) => s + p.repairStockQty, 0);
    const consumableStockQty = consumableProducts.reduce((s, p) => s + p.availableQty, 0);
    const consumableSaleQty = consumableProducts.reduce((s, p) => s + p.saleStockQty, 0);
    const consumableRepairQty = consumableProducts.reduce((s, p) => s + p.repairStockQty, 0);
    const lowStockCount = enrichedProducts.filter(p => p.status === 'ACTIVE' && p.availableQty < p.safetyStock).length;
    const totalStockValue = enrichedProducts.reduce((s, p) => s + p.stockValue, 0);
    const longAgingCount = agingSummary.counts.DAYS_91_180 + agingSummary.counts.OVER_180;
    return {
      rentalAssetCount,
      rentalActiveCount,
      equipCount: equipProducts.length,
      partCount: partProducts.length,
      consumableCount: consumableProducts.length,
      equipStockUnits,
      partStockQty,
      partSaleQty,
      partRepairQty,
      consumableStockQty,
      consumableSaleQty,
      consumableRepairQty,
      lowStockCount,
      totalStockValue,
      longAgingCount
    };
  }, [assets, enrichedProducts, agingSummary]);

  // Excel Export (현재 활성 탭 기준 맞춤형 다운로드)
  const handleExportExcel = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (activeViewTab === 'SERIAL_AGING') {
      const rows = filteredLots.map((r, idx) => ({
        순번: idx + 1,
        상태: r.isSold ? '출고완료' : '현재고보유',
        차대및로트번호: r.serialNumber,
        구분: r.itemType === 'EQUIPMENT' ? '지게차' : r.itemType === 'CONSUMABLE' ? '소모품' : '부품',
        제조사: r.manufacturer,
        모델명: r.modelName,
        품명: r.productName,
        보관창고: r.warehouseName,
        입고일자: r.inboundDate,
        보유경과일수: `${r.agingDays}일`,
        경과일수구간: r.agingInfo.label,
        매입구분: r.purchaseTypeLabel,
        수입통화: r.currency,
        외화단가: r.foreignUnitPrice,
        적용환율: r.exchangeRate,
        부대비용배부액: r.incidentalCostPerUnit,
        입고도착원가: r.landedUnitCost,
        현재고수량: r.lot.remainingQty,
        출고일자: r.soldDate,
        출고거래처: r.soldCustomerName,
        보증만료일: r.warrantyEndDate
      }));
      exportToExcel(rows, `차대번호별_입출고_재고보유일수_${todayStr}`, '차대번호별재고');
      showToast('차대번호별 입출고 및 재고 경과일수 엑셀 파일이 다운로드되었습니다.');
      return;
    }

    const rows = filteredProducts.map((p, idx) => ({
      순번: idx + 1,
      품목코드: p.skuCode,
      품목구분: p.resolvedItemType === 'EQUIPMENT' ? '지게차 완제품' : '부품/소모품',
      제조사: p.manufacturer || '-',
      모델명: p.modelName || '-',
      시리즈명: p.seriesName || '-',
      차종구분: p.equipmentClass || '-',
      동력방식: p.powerType || '-',
      제품명: p.name,
      카테고리: p.category,
      원산지: p.originCountry || '-',
      기본창고: p.defaultWarehouse || 'A창고',
      정격하중_kg: p.ratedCapacityKg ?? '-',
      하중중심_mm: p.loadCenterMm ?? '-',
      표준인상고_mm: p.standardLiftHeightMm ?? '-',
      최대인상고_mm: p.maxOptionLiftHeightMm ?? '-',
      자유인상고_mm: p.freeLiftHeightMm ?? '-',
      포크규격_mm: p.forkDimensionsMm || '-',
      전장_mm: p.overallLengthMm ?? '-',
      전폭_mm: p.overallWidthMm ?? '-',
      헤드가드고_mm: p.overheadGuardHeightMm ?? '-',
      최소회전반경_mm: p.turningRadiusMm ?? '-',
      직각적재통로폭_mm: p.aisleWidth1000x1200Mm ?? '-',
      주행속도_kmh: p.travelSpeedKmh || '-',
      인양속도_mms: p.liftingSpeedMms || '-',
      등판능력_퍼센트: p.gradeabilityPercent ?? '-',
      장비자중_kg: p.serviceWeightKg ?? '-',
      배터리및엔진사양: p.powerSpecDetail || '-',
      모터및출력사양: p.motorOrEngineDetail || '-',
      충전기및연료사양: p.chargerOrFuelDetail || '-',
      타이어규격: p.tireSpecFrontRear || '-',
      제동방식: p.brakeType || '-',
      방수방진등급: p.waterproofRating || '-',
      보증조건: p.warrantyTerms || '-',
      단위: p.unit || 'EA',
      평균매입원가: p.avgUnitCost,
      대리점공급단가: p.dealerPrice,
      최종고객판매단가: p.standardPrice,
      예상마진율: `${p.marginRate.toFixed(1)}%`,
      현재가용재고: p.availableQty,
      안전재고기준: p.safetyStock,
      재고자산금액: p.stockValue,
      최대보유경과일수: `${p.maxAgingDays}일`,
      상태: p.status === 'ACTIVE' ? '판매중' : '단종'
    }));
    exportToExcel(rows, `지게차_부품_VDI2198제원_재고현황_${todayStr}`, '제품및재고현황');
    showToast('제품 및 재고현황 엑셀 파일이 다운로드되었습니다.');
  };

  const resetFilters = () => {
    setItemTypeFilter('ALL');
    setUsagePurposeFilter('ALL');
    setManufacturerFilter('ALL');
    setCategoryFilter('ALL');
    setWarehouseFilter('ALL');
    setSearchTerm('');
    setStockFilter('ALL');
    setStatusFilter('ALL');
    setLotStatusFilter('ALL');
    setAgingBucketFilter('ALL');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px', backgroundColor: 'var(--bg-app)', padding: '16px 20px', overflow: 'hidden' }}>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '10px 18px',
            borderRadius: '6px',
            backgroundColor: toast.type === 'error' ? '#dc2626' : '#059669',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)'
          }}
        >
          {toast.text}
        </div>
      )}

      {/* 1. 상단 헤더 및 파이프라인 액션 바 */}
      <div
        style={{
          padding: '12px 18px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <h2
              data-mid="trade_products-header"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                margin: 0,
                color: 'var(--text-main)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Package size={20} color="var(--primary)" />
              <span>제품 및 재고 관리</span>
            </h2>
          </div>

          {/* 3대 핵심 뷰 전환 탭 */}
          <div style={{ display: 'inline-flex', backgroundColor: 'var(--bg-app)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-color)', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveViewTab('MASTER')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeViewTab === 'MASTER' ? 'var(--primary)' : 'transparent',
                color: activeViewTab === 'MASTER' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              제조사·모델별 제품 및 현재고
 </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('SERIAL_AGING')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeViewTab === 'SERIAL_AGING' ? 'var(--primary)' : 'transparent',
                color: activeViewTab === 'SERIAL_AGING' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              차대번호별 입출고 및 재고 경과일수
 </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('WAREHOUSE_PARTS')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: activeViewTab === 'WAREHOUSE_PARTS' ? 'var(--primary)' : 'transparent',
                color: activeViewTab === 'WAREHOUSE_PARTS' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              창고별·부품 재고현황
 </button>
            <button
              type="button"
              onClick={() => setGlobalActiveTab && setGlobalActiveTab('fl_doc_archive')}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '6px',
                border: '1px solid #93c5fd',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: '#eff6ff',
                color: '#1d4ed8'
              }}
            >
              제원·매뉴얼 보관함
            </button>
            <button
              type="button"
              onClick={() => {
                const firstEquipLot = enrichedLots.find(r => !r.isSold && r.itemType === 'EQUIPMENT');
                if (firstEquipLot && !trfLotId) {
                  setTrfLotId(firstEquipLot.lot.id);
                  setTrfAssetNo(`FL-R-${firstEquipLot.serialNumber.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`);
                  setTrfMonthlyFee(Math.round(((firstEquipLot.prod?.standardPrice || firstEquipLot.landedUnitCost * 1.25) * 0.032) / 10000) * 10000);
                }
                const firstAvailAsset = (assets || []).find(a => a.ownerType === 'OWNED' && a.status === 'AVAILABLE');
                if (firstAvailAsset && !revAssetId) {
                  setRevAssetId(firstAvailAsset.id);
                }
                setIsTransferStudioOpen(true);
              }}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 800,
                borderRadius: '6px',
                border: '1px solid #8b5cf6',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                backgroundColor: '#7c3aed',
                color: '#ffffff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <RefreshCw size={13} /> 계정간 자산전배 · 장부가승계 [{accountTransferLogs.length}]
            </button>
          </div>
        </div>

        {/* 우측 파이프라인: 빠른 등록 + 상세 등록 모달 + 엑셀 다운로드 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="text"
            data-mid="trade_products-sku-input"
            readOnly
            value={nextAutoSku}
            title="자동 채번 품목코드"
            style={{
              width: '86px',
              padding: '6px 8px',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'monospace',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--primary)'
            }}
          />
          <input
            type="text"
            data-mid="trade_products-name-input"
            placeholder="모델·제품명 입력"
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '140px',
              padding: '6px 10px',
              fontSize: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-main)'
            }}
          />
          <input
            type="number"
            data-mid="trade_products-cost-input"
            placeholder="기준 매입원가"
            value={cost || ''}
            onChange={e => setCost(Number(e.target.value))}
            style={{
              width: '105px',
              padding: '6px 10px',
              fontSize: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-main)'
            }}
          />
          <input
            type="number"
            data-mid="trade_products-price-input"
            placeholder="기준 판매단가"
            value={price || ''}
            onChange={e => setPrice(Number(e.target.value))}
            style={{
              width: '105px',
              padding: '6px 10px',
              fontSize: '12px',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              backgroundColor: 'var(--bg-app)',
              color: 'var(--text-main)'
            }}
          />
          <button
            type="button"
            data-mid="trade_products-add-btn"
            onClick={handleQuickAdd}
            className="btn-save"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Plus size={14} /> 빠른 등록
 </button>

          <button
            type="button"
            onClick={openCreateModal}
            className="btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Layers size={14} /> 제품·부품 상세 등록
 </button>

          <button
            type="button"
            data-mid="trade_products-excel-btn"
            onClick={handleExportExcel}
            className="btn-excel-download"
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '4px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              whiteSpace: 'nowrap',
              cursor: 'pointer'
            }}
          >
            <Download size={14} /> 엑셀 다운로드
 </button>
        </div>
      </div>

      {/* 3. 통합 조회 필터 바 (헌장 3.4 상하 스택 배치) */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexWrap: 'wrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>유형자산·재고 분류</label>
          <select
            value={itemTypeFilter}
            onChange={e => setItemTypeFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 분류 (제품·부품·소모품)</option>
            <option value="EQUIPMENT">제품 · 지게차 완제품 (판매용)</option>
            <option value="PART">부품 (유통 판매용 / 렌탈자산 정비용)</option>
            <option value="CONSUMABLE">소모품 (유통 판매용 / 렌탈자산 정비용)</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>보유 용도 구분</label>
          <select
            value={usagePurposeFilter}
            onChange={e => setUsagePurposeFilter(e.target.value as any)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 용도</option>
            <option value="TRADE_SALE">유통 판매용 포함</option>
            <option value="RENTAL_REPAIR">렌탈자산 정비용 포함</option>
            <option value="DUAL_USE">유통 판매 · 렌탈자산 정비 겸용</option>
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>제조사</label>
          <select
            value={manufacturerFilter}
            onChange={e => setManufacturerFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 제조사</option>
            {manufacturerOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>보관 창고</label>
          <select
            value={warehouseFilter}
            onChange={e => setWarehouseFilter(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
          >
            <option value="ALL">전체 창고</option>
            {WAREHOUSES.map(w => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>

        {activeViewTab === 'SERIAL_AGING' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>입출고 상태</label>
              <select
                value={lotStatusFilter}
                onChange={e => setLotStatusFilter(e.target.value as any)}
                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
              >
                <option value="ALL">전체</option>
                <option value="IN_STOCK">현재고 보유중</option>
                <option value="SOLD">판매 출고완료</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>입고일 기준 경과일수</label>
              <select
                value={agingBucketFilter}
                onChange={e => setAgingBucketFilter(e.target.value as AgingBucket)}
                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
              >
                <option value="ALL">전체 경과일수 구간</option>
                <option value="UNDER_30">30일 이내</option>
                <option value="DAYS_31_60">31일 ~ 60일</option>
                <option value="DAYS_61_90">61일 ~ 90일</option>
                <option value="DAYS_91_180">91일 ~ 180일</option>
                <option value="OVER_180">180일 이상</option>
              </select>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>카테고리</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
              >
                <option value="ALL">전체 카테고리</option>
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>재고 상태</label>
              <select
                value={stockFilter}
                onChange={e => setStockFilter(e.target.value as any)}
                style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', whiteSpace: 'nowrap' }}
              >
                <option value="ALL">전체 재고상태</option>
                <option value="NORMAL">정상 재고</option>
                <option value="LOW">안전재고 미달</option>
                <option value="OUT">품절</option>
              </select>
            </div>
          </>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>통합 검색</label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', top: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="차대번호, 모델명, 제조사, 품명 검색"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: '6px 10px 6px 28px', fontSize: '12px', width: '220px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={resetFilters}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', cursor: 'pointer' }}
        >
          <RefreshCw size={12} /> 초기화
 </button>
      </div>

      {/* 4. 메인 본문 그리드 */}
      <div
        className="card"
        style={{
          flex: 1,
          margin: 0,
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeViewTab === 'SERIAL_AGING' ? (
            <table
              data-mid="trade_serial_aging-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>관리 / 보증·수리</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>입출고 상태</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>차대·로트번호</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>구분</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제조사 / 모델명</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제품명</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>보관창고</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>입고일자</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>입고 경과일수</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>수입·매입처</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>외화단가 / 환율</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>부대비용 배부액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>최종 도착원가</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>현재고</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>출고일 / 출고거래처</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>보증만료일 / 수리건수</th>
                </tr>
              </thead>
              <tbody>
                {filteredLots.length === 0 ? (
                  <tr>
                    <td colSpan={16} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      조건에 해당하는 차대번호 및 로트 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredLots.map(r => {
                    const asLogs = serialAsLogsMap[r.serialNumber] || r.lot.warrantyAsLogs || [];
                    return (
                    <tr key={r.lot.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px', backgroundColor: r.isSold ? 'var(--bg-app)' : 'transparent' }}>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => setSelectedSerialLotId(r.lot.id)}
                            style={{
                              padding: '4px 9px',
                              fontSize: '11px',
                              fontWeight: 700,
                              borderRadius: '4px',
                              border: '1px solid var(--primary)',
                              backgroundColor: 'var(--bg-card)',
                              color: 'var(--primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            <ShieldCheck size={11} /> 이력·보증수리 {asLogs.length > 0 ? `[${asLogs.length}]` : ''}
                          </button>
                          {!r.isSold && r.itemType === 'EQUIPMENT' && (
                            <button
                              type="button"
                              onClick={() => {
                                setTrfLotId(r.lot.id);
                                setTrfAssetNo(`FL-R-${r.serialNumber.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`);
                                setTrfSelectedOptIds([]);
                                setTrfMonthlyFee(Math.round(((r.prod?.standardPrice || r.landedUnitCost * 1.25) * 0.032) / 10000) * 10000);
                                setTrfMemo(`차대번호 ${r.serialNumber} 유통재고에서 렌탈자산으로 계정전배`);
                                setTransferStudioTab('TRADE_TO_RENTAL');
                                setIsTransferStudioOpen(true);
                              }}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 800,
                                borderRadius: '4px',
                                border: '1px solid #7c3aed',
                                backgroundColor: '#f5f3ff',
                                color: '#6d28d9',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <RefreshCw size={10} /> 렌탈자산 전배
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '11px',
                            fontWeight: 800,
                            backgroundColor: r.isSold ? '#e2e8f0' : '#dcfce7',
                            color: r.isSold ? '#475569' : '#166534'
                          }}
                        >
                          {r.isSold ? '출고완료' : '현재고보유'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                        {r.serialNumber}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: r.itemType === 'EQUIPMENT' ? '#eff6ff' : r.itemType === 'CONSUMABLE' ? '#ccfbf1' : '#f3e8ff', color: r.itemType === 'EQUIPMENT' ? '#1d4ed8' : r.itemType === 'CONSUMABLE' ? '#0f766e' : '#7e22ce' }}>
                          {r.itemType === 'EQUIPMENT' ? '지게차' : r.itemType === 'CONSUMABLE' ? '소모품' : '부품'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                        {r.manufacturer} · <span style={{ fontFamily: 'monospace' }}>{r.modelName}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-main)', fontWeight: 600 }}>
                        {r.productName}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {r.warehouseName}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {r.inboundDate}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        {r.isSold ? (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>출고마감</span>
                        ) : (
                          <span
                            style={{
                              padding: '3px 9px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: r.agingInfo.bg,
                              color: r.agingInfo.color
                            }}
                          >
                            {r.agingDays}일 경과 · {r.agingInfo.label}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                        <span style={{ fontWeight: 700, color: r.purchaseTypeLabel === '해외수입' ? '#0284c7' : '#059669', marginRight: '5px' }}>
                          [{r.purchaseTypeLabel}]
                        </span>
                        {r.vendorName}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                        {r.currency === 'KRW'
                          ? `₩${r.foreignUnitPrice.toLocaleString()}`
                          : `${r.currency} ${r.foreignUnitPrice.toLocaleString()} / 환율 ${r.exchangeRate}`}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        {r.incidentalCostPerUnit > 0 ? `+₩${r.incidentalCostPerUnit.toLocaleString()}` : '-'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)' }}>
                        ₩{r.landedUnitCost.toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: r.isSold ? 'var(--text-muted)' : '#059669' }}>
                        {r.lot.remainingQty.toLocaleString()} {r.prod?.unit || 'EA'}
                      </td>
                      <td style={{ padding: '8px 12px', color: r.isSold ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: r.isSold ? 700 : 400 }}>
                        {r.isSold ? `${r.soldDate} · ${r.soldCustomerName}` : '미출고'}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontFamily: 'monospace', color: r.warrantyEndDate !== '-' ? '#0369a1' : 'var(--text-muted)' }}>
                        {r.warrantyEndDate} {asLogs.length > 0 ? `· 수리 ${asLogs.length}건` : ''}
                      </td>
                    </tr>
                  );
                  })
                )}
              </tbody>
              {filteredLots.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                    <td colSpan={12} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-main)' }}>
                      조회 합계 ({filteredLots.length}건 로트 / 현재고 보유 {filteredLots.filter(l => !l.isSold).length}건)
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-main)' }}>
                      현재고 원가합계 ₩{filteredLots.reduce((s, r) => s + r.lot.remainingQty * r.landedUnitCost, 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>
                      잔여 {filteredLots.reduce((s, r) => s + r.lot.remainingQty, 0).toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table
              data-mid="trade_products-table"
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}
            >
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', width: '240px' }}>관리 / 제원·조치</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>품목코드</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>구분 / 동력</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제조사 / 모델명</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>제품명 / 차종분류</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>정격하중 · 하중중심</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>표준 · 최대 인상고</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>포크규격 · 회전반경 · 자중</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)' }}>동력·배터리 사양 및 공식문서</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>조달구분 / 창고</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>평균 매입원가</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>대리점 공급가</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>최종고객 판매가</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>예상 마진율</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>현재 가용재고</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)' }}>재고자산 금액</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>최장 보유일수</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={18} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      조건에 해당하는 제품 및 부품 데이터가 없습니다.
 </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    const isLowStock = p.availableQty < p.safetyStock;
                    const agingBadge = getAgingBucket(p.maxAgingDays);
                    const isEquip = p.resolvedItemType === 'EQUIPMENT';
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', height: '44px' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {isEquip && (
                              <button
                                type="button"
                                onClick={() => setSpecDetailProduct(p)}
                                style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 700, borderRadius: '4px', border: '1px solid #6366f1', backgroundColor: '#eef2ff', color: '#4338ca', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                title="공식 VDI 2198 기술제원 및 매뉴얼 조회"
                              >
                                <BookOpen size={11} /> 제원·문서
 </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <Edit2 size={11} /> 수정
 </button>
                            <button
                              type="button"
                              onClick={() => openAdjustModal(p)}
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid #0284c7', backgroundColor: '#f0f9ff', color: '#0369a1', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              <SlidersHorizontal size={11} /> 재고조정
 </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(p)}
                              style={{ padding: '4px 8px', fontSize: '11px', fontWeight: 600, borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: p.status === 'ACTIVE' ? '#fff7ed' : '#ecfdf5', color: p.status === 'ACTIVE' ? '#c2410c' : '#047857', cursor: 'pointer' }}
                            >
                              {p.status === 'ACTIVE' ? '단종' : '재개'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              style={{ padding: '4px 6px', fontSize: '11px', borderRadius: '4px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                              title="제품 삭제"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>

                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                          {p.skuCode}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: isEquip ? '#dbeafe' : p.resolvedItemType === 'CONSUMABLE' ? '#ccfbf1' : '#f3e8ff',
                                color: isEquip ? '#1d4ed8' : p.resolvedItemType === 'CONSUMABLE' ? '#0f766e' : '#7e22ce'
                              }}
                            >
                              {isEquip ? '제품 · 완제품' : p.resolvedItemType === 'CONSUMABLE' ? '소모품' : '부품'}
                            </span>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: p.resolvedUsagePurpose === 'TRADE_SALE' ? '#0284c7' : p.resolvedUsagePurpose === 'RENTAL_REPAIR' ? '#b45309' : '#059669' }}>
                              {p.resolvedUsagePurpose === 'TRADE_SALE' ? '판매전용' : p.resolvedUsagePurpose === 'RENTAL_REPAIR' ? '렌탈정비용' : '유통판매·렌탈정비'}
                            </span>
                            {isEquip && p.powerType && (
                              <span style={{ fontSize: '10px', fontWeight: 700, color: p.powerType.includes('리튬') ? '#059669' : p.powerType.includes('디젤') ? '#b45309' : '#2563eb' }}>
                                {p.powerType}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                          <div>{p.manufacturer || '-'} · <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{p.modelName || '-'}</span></div>
                          {p.seriesName && <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{p.seriesName}</div>}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{p.name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.equipmentClass || p.category || '-'}</div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {isEquip && p.ratedCapacityKg ? (
                            <div>
                              <div style={{ fontWeight: 800, color: '#1d4ed8', fontFamily: 'monospace' }}>
                                {p.ratedCapacityKg.toLocaleString()} kg
 </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                중심 {p.loadCenterMm || 500} mm
 </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>부품 공통</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {isEquip && p.standardLiftHeightMm ? (
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                표준 {p.standardLiftHeightMm.toLocaleString()} mm
 </div>
                              <div style={{ fontSize: '10px', color: '#0369a1', fontWeight: 600 }}>
                                최대 {(p.maxOptionLiftHeightMm || p.standardLiftHeightMm).toLocaleString()} mm
 </div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          {isEquip && (p.forkDimensionsMm || p.turningRadiusMm || p.serviceWeightKg) ? (
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                                포크 {p.forkDimensionsMm || '-'} mm
 </div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                회전반경 {p.turningRadiusMm ? `${p.turningRadiusMm.toLocaleString()}mm` : '-'} · 자중 {p.serviceWeightKg ? `${p.serviceWeightKg.toLocaleString()}kg` : '-'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{p.spec || '-'}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)' }}>
                            {p.powerSpecDetail || p.spec || '-'}
                          </div>
                          {isEquip && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                                {p.motorOrEngineDetail ? p.motorOrEngineDetail.slice(0, 34) : `보증 ${p.warrantyMonths || 12}개월`}
                              </span>
                              {p.specSheetUrl && (
                                <a
                                  href={p.specSheetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontSize: '10px', fontWeight: 700, color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                >
                                  <FileText size={10} /> 스펙시트
 </a>
                              )}
                              {p.manualUrl && (
                                <a
                                  href={p.manualUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontSize: '10px', fontWeight: 700, color: '#059669', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                >
                                  <ExternalLink size={10} /> 매뉴얼
 </a>
                              )}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 700, color: p.originCountry === '중국 수입' ? '#0284c7' : '#059669' }}>
                            {p.originCountry || '중국 수입'}
                          </span>
                          <span style={{ marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-secondary)', fontSize: '11px', fontWeight: 600 }}>
                            {p.warehouses.length > 0 ? p.warehouses.join(', ') : (p.defaultWarehouse || 'A창고')}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          ₩{p.avgUnitCost.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0369a1', fontWeight: 700 }}>
                          ₩{p.dealerPrice.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)' }}>
                          ₩{p.standardPrice.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: p.marginRate >= 20 ? '#059669' : '#d97706' }}>
                          {p.marginRate.toFixed(1)}%
 </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800 }}>
                          <div>
                            <span style={{ color: p.availableQty === 0 ? '#dc2626' : isLowStock ? '#d97706' : '#059669' }}>
                              {p.availableQty.toLocaleString()} {p.unit || 'EA'}
                            </span>
                            {isLowStock && (
                              <span style={{ marginLeft: '5px', color: '#dc2626', fontSize: '10px', fontWeight: 700 }}>
                                [안전재고미달]
                              </span>
                            )}
                          </div>
                          {!isEquip && (
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '2px' }}>
                              판매용 {p.saleStockQty} / 정비용 {p.repairStockQty}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--text-main)' }}>
                          ₩{p.stockValue.toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {p.availableQty > 0 ? (
                            <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, backgroundColor: agingBadge.bg, color: agingBadge.color }}>
                              {p.maxAgingDays}일 · {agingBadge.label}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              backgroundColor: p.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                              color: p.status === 'ACTIVE' ? '#166534' : '#991b1b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}
                          >
                            {p.status === 'ACTIVE' ? <CheckCircle2 size={11} /> : <Ban size={11} />}
                            {p.status === 'ACTIVE' ? '판매중' : '단종'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredProducts.length > 0 && (
                <tfoot>
                  <tr style={{ backgroundColor: 'var(--bg-secondary)', borderTop: '2px solid var(--border-color)', fontWeight: 800 }}>
                    <td colSpan={10} style={{ padding: '10px 12px', textAlign: 'left', color: 'var(--text-main)' }}>
                      조회 합계 ({filteredProducts.length}종 품목)
 </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      평균 ₩{Math.round(filteredProducts.reduce((s, p) => s + p.avgUnitCost, 0) / filteredProducts.length).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0369a1' }}>
                      평균 ₩{Math.round(filteredProducts.reduce((s, p) => s + p.dealerPrice, 0) / filteredProducts.length).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-main)' }}>
                      평균 ₩{Math.round(filteredProducts.reduce((s, p) => s + p.standardPrice, 0) / filteredProducts.length).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#059669' }}>
                      {(filteredProducts.reduce((s, p) => s + p.marginRate, 0) / filteredProducts.length).toFixed(1)}%
 </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--primary)' }}>
                      {filteredProducts.reduce((s, p) => s + p.availableQty, 0).toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--text-main)' }}>
                      ₩{filteredProducts.reduce((s, p) => s + p.stockValue, 0).toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </div>

      {/* 최하단 1줄 요약 바 */}
      <div
        data-mid="trade-products-bottom-summary"
        style={{
          padding: '8px 16px',
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          flexShrink: 0
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span>조회 품목: <strong style={{ color: 'var(--text-main)' }}>{filteredProducts.length}종</strong></span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>가용재고 수량 합계: <strong style={{ color: 'var(--primary)' }}>{filteredProducts.reduce((s, p) => s + p.availableQty, 0).toLocaleString()}</strong></span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>재고자산 금액 합계: <strong style={{ color: '#059669' }}>₩{filteredProducts.reduce((s, p) => s + p.stockValue, 0).toLocaleString()}</strong></span>
          <span style={{ color: 'var(--border-color)' }}>|</span>
          <span>차대·로트 관리 건수: <strong style={{ color: '#1d4ed8' }}>{filteredLots.length}건</strong> (현재고 {filteredLots.filter(l => !l.isSold).length}건)</span>
        </div>
        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>유통 재고·차대 통합 원장</span>
      </div>

      {/* 5. 제품·부품 등록/수정 모달 (공식 VDI 2198 지게차 제원 통합) */}
      {isProductModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '880px', maxWidth: '96vw', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                {editingProduct ? `제품·부품 마스터 및 VDI 2198 제원 수정` : '신규 지게차·부품 마스터 및 VDI 2198 제원 등록'}
              </h3>
              <button type="button" onClick={() => setIsProductModalOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveProductModal} style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '84vh', overflowY: 'auto' }}>
              {/* 공식 아카이브 제원 1클릭 자동불러오기 바 */}
              {formItemType === 'EQUIPMENT' && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#1e40af', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BookOpen size={15} />
                    <span>공식 아카이브 제원 자동불러오기</span>
                  </div>
                  <select
                    defaultValue=""
                    onChange={e => {
                      if (e.target.value) applyArchivePreset(e.target.value);
                    }}
                    style={{ flex: 1, minWidth: '280px', padding: '7px 10px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid #93c5fd', backgroundColor: '#fff', color: '#1e3a8a' }}
                  >
                    <option value="">제조사 모델 선택...</option>
                    {FL_TECHNICAL_ARCHIVE.map(spec => (
                      <option key={spec.id} value={spec.id}>
                        [{spec.manufacturerName}] {spec.modelName} — {spec.seriesName} · 정격 {spec.ratedCapacityKg}kg / {spec.powerType}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>품목코드</label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={e => setFormSku(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--primary)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>품목 구분 *</label>
                  <select
                    value={formItemType}
                    onChange={e => {
                      const nextType = e.target.value as 'EQUIPMENT' | 'PART' | 'CONSUMABLE';
                      setFormItemType(nextType);
                      setFormUnit(nextType === 'EQUIPMENT' ? '대' : 'EA');
                      setFormDefaultWarehouse(nextType === 'EQUIPMENT' ? 'A창고' : '부품창고');
                    }}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    <option value="EQUIPMENT">지게차 완제품</option>
                    <option value="PART">부품</option>
                    <option value="CONSUMABLE">소모품</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>카테고리 *</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>수량 단위</label>
                  <select
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    {UNITS.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>제조사 *</label>
                  <input
                    type="text"
                    required
                    value={formManufacturer}
                    onChange={e => setFormManufacturer(e.target.value)}
                    placeholder="예: 안후이 헬리, 두산밥캣"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>모델명 *</label>
                  <input
                    type="text"
                    required
                    value={formModelName}
                    onChange={e => setFormModelName(e.target.value)}
                    placeholder="예: CPD25-GB2Li, D30S-7"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>조달 구분</label>
                  <select
                    value={formOriginCountry}
                    onChange={e => setFormOriginCountry(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    <option value="중국 수입">중국 수입</option>
                    <option value="국내 매입">국내 매입</option>
                    <option value="일본 수입">일본 수입</option>
                    <option value="해외 수입">기타 해외 수입</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>기본 창고</label>
                  <select
                    value={formDefaultWarehouse}
                    onChange={e => setFormDefaultWarehouse(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    {WAREHOUSES.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1.5fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>제품명 *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="예: 리튬 전동지게차 2.5톤"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>시리즈명</label>
                  <input
                    type="text"
                    value={formSeriesName}
                    onChange={e => setFormSeriesName(e.target.value)}
                    placeholder="예: G2 시리즈 리튬전동 2.5톤"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>요약 규격 설명</label>
                  <input
                    type="text"
                    value={formSpec}
                    onChange={e => setFormSpec(e.target.value)}
                    placeholder="예: 정격하중 2500kg / 3단 마스트 4700mm / 리튬인산철 80V 271Ah"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              {/* 지게차 완제품일 때 VDI 2198 / ISO 5053 표준 제원 섹션 노출 */}
              {formItemType === 'EQUIPMENT' && (
                <div style={{ padding: '14px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    공식 VDI 2198 지게차 표준 기술제원
 </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.8fr 0.8fr 0.8fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>차종 구분</label>
                      <select
                        value={formEquipmentClass}
                        onChange={e => setFormEquipmentClass(e.target.value)}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      >
                        <option value="전동 좌승식 카운터밸런스">전동 좌승식 카운터밸런스</option>
                        <option value="디젤 카운터밸런스">디젤 카운터밸런스</option>
                        <option value="전동 입승식 리치트럭">전동 입승식 리치트럭</option>
                        <option value="전동 파레트트럭">전동 파레트트럭</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>동력 방식</label>
                      <select
                        value={formPowerType}
                        onChange={e => setFormPowerType(e.target.value)}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      >
                        <option value="리튬인산철 전동">리튬인산철 전동</option>
                        <option value="납산배터리 전동">납산배터리 전동</option>
                        <option value="디젤 내연기관">디젤 내연기관</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>정격하중 · kg</label>
                      <input
                        type="number"
                        value={formRatedCapacityKg || ''}
                        onChange={e => setFormRatedCapacityKg(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', fontWeight: 700 }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>하중중심 · mm</label>
                      <input
                        type="number"
                        value={formLoadCenterMm || ''}
                        onChange={e => setFormLoadCenterMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>장비자중 · kg</label>
                      <input
                        type="number"
                        value={formServiceWeightKg || ''}
                        onChange={e => setFormServiceWeightKg(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>표준인상고 · mm</label>
                      <input
                        type="number"
                        value={formStandardLiftHeightMm || ''}
                        onChange={e => setFormStandardLiftHeightMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>최대인상고 · mm</label>
                      <input
                        type="number"
                        value={formMaxOptionLiftHeightMm || ''}
                        onChange={e => setFormMaxOptionLiftHeightMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>자유인상고 · mm</label>
                      <input
                        type="number"
                        value={formFreeLiftHeightMm || ''}
                        onChange={e => setFormFreeLiftHeightMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>포크 규격 · mm</label>
                      <input
                        type="text"
                        value={formForkDimensionsMm}
                        onChange={e => setFormForkDimensionsMm(e.target.value)}
                        placeholder="40 × 122 × 1,070"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>최소회전반경 · mm</label>
                      <input
                        type="number"
                        value={formTurningRadiusMm || ''}
                        onChange={e => setFormTurningRadiusMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>차체 전장 · mm</label>
                      <input
                        type="number"
                        value={formOverallLengthMm || ''}
                        onChange={e => setFormOverallLengthMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>차체 전폭 · mm</label>
                      <input
                        type="number"
                        value={formOverallWidthMm || ''}
                        onChange={e => setFormOverallWidthMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>헤드가드고 · mm</label>
                      <input
                        type="number"
                        value={formOverheadGuardHeightMm || ''}
                        onChange={e => setFormOverheadGuardHeightMm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>직각통로폭 · mm</label>
                      <input
                        type="number"
                        value={formAisleWidth1000x1200Mm || ''}
                        onChange={e => setFormAisleWidth1000x1200Mm(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>주행속도 · km/h</label>
                      <input
                        type="text"
                        value={formTravelSpeedKmh}
                        onChange={e => setFormTravelSpeedKmh(e.target.value)}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>등판능력 · 퍼센트</label>
                      <input
                        type="number"
                        value={formGradeabilityPercent || ''}
                        onChange={e => setFormGradeabilityPercent(Number(e.target.value))}
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>배터리 / 엔진 핵심 사양</label>
                      <input
                        type="text"
                        value={formPowerSpecDetail}
                        onChange={e => setFormPowerSpecDetail(e.target.value)}
                        placeholder="예: 80V / 271Ah 리튬인산철 배터리팩 기본"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>구동·유압모터 / 엔진 출력 사양</label>
                      <input
                        type="text"
                        value={formMotorOrEngineDetail}
                        onChange={e => setFormMotorOrEngineDetail(e.target.value)}
                        placeholder="예: 주행 AC 16.6kW + 유압 인양 AC 24.0kW"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>타이어 규격</label>
                      <input
                        type="text"
                        value={formTireSpecFrontRear}
                        onChange={e => setFormTireSpecFrontRear(e.target.value)}
                        placeholder="전륜 7.00-12 / 후륜 6.00-9"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>제동 방식</label>
                      <input
                        type="text"
                        value={formBrakeType}
                        onChange={e => setFormBrakeType(e.target.value)}
                        placeholder="습식 디스크 브레이크 + 회생제동"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>제조사 공식 보증 조건</label>
                      <input
                        type="text"
                        value={formWarrantyTerms}
                        onChange={e => setFormWarrantyTerms(e.target.value)}
                        placeholder="리튬배터리 5년 / 차체·구동계 2년"
                        style={{ padding: '7px 8px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>기준 매입원가 *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formStandardCost || ''}
                    onChange={e => setFormStandardCost(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>대리점 공급단가</label>
                  <input
                    type="number"
                    min={0}
                    value={formDealerPrice || ''}
                    onChange={e => setFormDealerPrice(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: '#0369a1', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>최종고객 판매단가 *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={formStandardPrice || ''}
                    onChange={e => setFormStandardPrice(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: editingProduct ? '1fr 1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>안전재고 수량</label>
                  <input
                    type="number"
                    min={0}
                    value={formSafetyStock}
                    onChange={e => setFormSafetyStock(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>무상보증 개월수</label>
                  <input
                    type="number"
                    min={0}
                    value={formWarrantyMonths}
                    onChange={e => setFormWarrantyMonths(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>거래 상태</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    <option value="ACTIVE">판매중</option>
                    <option value="DISCONTINUED">단종</option>
                  </select>
                </div>
                {!editingProduct && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>기초 입고 수량</label>
                    <input
                      type="number"
                      min={0}
                      value={formInitialStock}
                      onChange={e => setFormInitialStock(Number(e.target.value))}
                      style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                    />
                  </div>
                )}
              </div>

              {!editingProduct && formInitialStock > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>기초 입고 차대·로트번호</label>
                  <input
                    type="text"
                    value={formInitialSerial}
                    onChange={e => setFormInitialSerial(e.target.value)}
                    placeholder="예: HL-CPD25-261001"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>비고 / 관리 메모</label>
                <input
                  type="text"
                  value={formMemo}
                  onChange={e => setFormMemo(e.target.value)}
                  placeholder="수입 제조사 및 호환 기종 메모 입력"
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                >
                  취소
 </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                >
                  {editingProduct ? '수정 내용 저장' : '제품 등록 확정'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5-B. 공식 VDI 2198 기술제원 및 매뉴얼 상세 모달 */}
      {specDetailProduct && (() => {
        const matchedArchive = FL_TECHNICAL_ARCHIVE.find(
          s =>
            s.modelName === specDetailProduct.modelName ||
            s.linkedSkuCode === specDetailProduct.skuCode ||
            (specDetailProduct.modelName === 'CPD25-L1' && s.modelName === 'CPD25-GB2Li') ||
            (specDetailProduct.modelName === 'FD30T-7' && s.modelName === 'D30S-7') ||
            (specDetailProduct.modelName === 'EPL1531' && s.modelName === 'EPL205Z')
        );
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1250 }}>
            <div style={{ backgroundColor: 'var(--bg-card)', width: '860px', maxWidth: '96vw', maxHeight: '88vh', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 25px 35px -5px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)' }}>
                    {specDetailProduct.manufacturer} · {specDetailProduct.modelName} · 품목코드 {specDetailProduct.skuCode}
                  </div>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--text-main)' }}>
                    {specDetailProduct.name} — 공식 VDI 2198 기술제원 및 매뉴얼
 </h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const target = specDetailProduct;
                      setSpecDetailProduct(null);
                      openEditModal(target);
                    }}
                    style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Edit2 size={12} /> 제원 수정
 </button>
                  <button type="button" onClick={() => setSpecDetailProduct(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. 핵심 6대 제원 배지 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px' }}>
                  {[
                    { label: '정격하중', value: specDetailProduct.ratedCapacityKg ? `${specDetailProduct.ratedCapacityKg.toLocaleString()} kg` : '-' },
                    { label: '하중중심', value: specDetailProduct.loadCenterMm ? `${specDetailProduct.loadCenterMm} mm` : '-' },
                    { label: '표준인상고', value: specDetailProduct.standardLiftHeightMm ? `${specDetailProduct.standardLiftHeightMm.toLocaleString()} mm` : '-' },
                    { label: '최대인상고', value: specDetailProduct.maxOptionLiftHeightMm ? `${specDetailProduct.maxOptionLiftHeightMm.toLocaleString()} mm` : '-' },
                    { label: '최소회전반경', value: specDetailProduct.turningRadiusMm ? `${specDetailProduct.turningRadiusMm.toLocaleString()} mm` : '-' },
                    { label: '장비자중', value: specDetailProduct.serviceWeightKg ? `${specDetailProduct.serviceWeightKg.toLocaleString()} kg` : '-' }
                  ].map((item, idx) => (
                    <div key={idx} style={{ padding: '10px', borderRadius: '8px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>{item.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginTop: '3px', fontFamily: 'monospace' }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* 2. VDI 2198 상세 스펙 테이블 */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', backgroundColor: 'var(--bg-secondary)', fontWeight: 800, fontSize: '12px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                    국제 산업차량 표준 VDI 2198 / ISO 5053 상세 제원표
 </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <tbody>
                      {[
                        ['차종 분류', specDetailProduct.equipmentClass || '-', '동력 방식', specDetailProduct.powerType || '-'],
                        ['포크 규격 · 두께×폭×길이', `${specDetailProduct.forkDimensionsMm || '-'} mm`, '자유인상고', specDetailProduct.freeLiftHeightMm ? `${specDetailProduct.freeLiftHeightMm.toLocaleString()} mm` : '-'],
                        ['차체 전장 · 포크제외', specDetailProduct.overallLengthMm ? `${specDetailProduct.overallLengthMm.toLocaleString()} mm` : '-', '차체 전폭', specDetailProduct.overallWidthMm ? `${specDetailProduct.overallWidthMm.toLocaleString()} mm` : '-'],
                        ['헤드가드 높이', specDetailProduct.overheadGuardHeightMm ? `${specDetailProduct.overheadGuardHeightMm.toLocaleString()} mm` : '-', '직각 적재 통로폭', specDetailProduct.aisleWidth1000x1200Mm ? `${specDetailProduct.aisleWidth1000x1200Mm.toLocaleString()} mm` : '-'],
                        ['주행속도 · 부하/무부하', `${specDetailProduct.travelSpeedKmh || '-'} km/h`, '인양속도 · 부하/무부하', `${specDetailProduct.liftingSpeedMms || '-'} mm/s`],
                        ['최대 등판능력', specDetailProduct.gradeabilityPercent ? `${specDetailProduct.gradeabilityPercent} %` : '-', '타이어 규격 · 전륜/후륜', specDetailProduct.tireSpecFrontRear || '-'],
                        ['배터리 / 엔진 사양', specDetailProduct.powerSpecDetail || '-', '구동·유압모터 / 출력', specDetailProduct.motorOrEngineDetail || '-'],
                        ['충전기 / 연료계통', specDetailProduct.chargerOrFuelDetail || '-', '제동 시스템', specDetailProduct.brakeType || '-'],
                        ['방수·방진 등급', specDetailProduct.waterproofRating || '-', '공식 보증 조건', specDetailProduct.warrantyTerms || `${specDetailProduct.warrantyMonths || 12}개월`]
                      ].map((row, rIdx) => (
                        <tr key={rIdx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ width: '18%', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>{row[0]}</th>
                          <td style={{ width: '32%', padding: '8px 12px', color: 'var(--text-main)', fontWeight: 600 }}>{row[1]}</td>
                          <th style={{ width: '18%', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', fontWeight: 700, color: 'var(--text-secondary)' }}>{row[2]}</th>
                          <td style={{ width: '32%', padding: '8px 12px', color: 'var(--text-main)', fontWeight: 600 }}>{row[3]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 3. 공식 아카이브 연동 문서 및 점검기준 */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                      공식 기술문서 및 매뉴얼 원문
 </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {matchedArchive ? (
                        matchedArchive.documents.map(doc => (
                          <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', borderRadius: '6px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)' }}>{doc.title}</div>
                              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>문서번호 {doc.docNo} · {doc.pageCount}쪽 · {doc.fileSizeLabel}</div>
                            </div>
                            <a
                              href={doc.r2Url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ padding: '4px 10px', borderRadius: '4px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <ExternalLink size={11} /> 열람
 </a>
                          </div>
                        ))
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {specDetailProduct.specSheetUrl && (
                            <a href={specDetailProduct.specSheetUrl} target="_blank" rel="noreferrer" style={{ marginRight: '12px', color: '#2563eb', fontWeight: 700 }}>
                              공식 스펙시트 열람
 </a>
                          )}
                          {specDetailProduct.manualUrl && (
                            <a href={specDetailProduct.manualUrl} target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 700 }}>
                              운전·정비 매뉴얼 열람
 </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                      출고 전 필수 점검 및 정기 예방정비 기준
 </div>
                    {matchedArchive ? (
                      <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {matchedArchive.dailyChecklist.map((chk, idx) => (
                          <li key={idx}>{chk}</li>
                        ))}
                        {matchedArchive.periodicMaintenance.map((pm, idx) => (
                          <li key={`pm-${idx}`} style={{ color: '#0369a1', fontWeight: 600 }}>{pm}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        출고 전 마스트 작동유, 제동장치, 배터리 절연 및 타이어 마모 상태를 점검합니다.
 </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 6. 재고 실사/수량 조정 모달 */}
      {adjustTarget && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', width: '480px', maxWidth: '95vw', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>
                창고·차대 재고 조정 · {adjustTarget.name}
              </h3>
              <button type="button" onClick={() => setAdjustTarget(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmAdjust} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                <div>현재 가용 재고: <strong>{getProductStock(adjustTarget.id).availableQty.toLocaleString()} {adjustTarget.unit || 'EA'}</strong></div>
                <div style={{ marginTop: '4px', color: 'var(--text-muted)' }}>품목코드: {adjustTarget.skuCode} | 규격: {adjustTarget.spec || '-'}</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>조정 구분</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setAdjustType('ADD')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: adjustType === 'ADD' ? '2px solid #059669' : '1px solid var(--border-color)',
                      backgroundColor: adjustType === 'ADD' ? '#ecfdf5' : 'var(--bg-app)',
                      color: adjustType === 'ADD' ? '#047857' : 'var(--text-muted)',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    + 입고 / 재고 증가
 </button>
                  <button
                    type="button"
                    onClick={() => setAdjustType('SUB')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: adjustType === 'SUB' ? '2px solid #dc2626' : '1px solid var(--border-color)',
                      backgroundColor: adjustType === 'SUB' ? '#fef2f2' : 'var(--bg-app)',
                      color: adjustType === 'SUB' ? '#b91c1c' : 'var(--text-muted)',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    - 출고 / 실사 차감
 </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>보관 창고</label>
                  <select
                    value={adjustWarehouse}
                    onChange={e => setAdjustWarehouse(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  >
                    {WAREHOUSES.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>입고 기준일</label>
                  <input
                    type="date"
                    value={adjustInboundDate}
                    onChange={e => setAdjustInboundDate(e.target.value)}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              {adjustType === 'ADD' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>차대번호 또는 로트번호</label>
                  <input
                    type="text"
                    value={adjustSerialNumber}
                    onChange={e => setAdjustSerialNumber(e.target.value)}
                    placeholder="미입력 시 모델명 기준 자동 채번"
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>조정 수량 *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={adjustQty}
                    onChange={e => setAdjustQty(Math.max(1, Number(e.target.value)))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontWeight: 700 }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>단위 입고원가</label>
                  <input
                    type="number"
                    min={0}
                    disabled={adjustType === 'SUB'}
                    value={adjustUnitCost}
                    onChange={e => setAdjustUnitCost(Number(e.target.value))}
                    style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: adjustType === 'SUB' ? 'var(--bg-secondary)' : 'var(--bg-app)', color: 'var(--text-main)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>조정 사유 *</label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="예: 정기 실사 수량 보정, 전시장 이동 등"
                  style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
                <button
                  type="button"
                  onClick={() => setAdjustTarget(null)}
                  className="btn-secondary"
                  style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 600, borderRadius: '6px', cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  style={{ padding: '8px 18px', fontSize: '13px', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}
                >
                  재고 조정 확정
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. 차대번호별 입출고·수입원가 및 보증·사후정비 이력 모달 */}
      {selectedSerialLotId && (() => {
        const targetRow = enrichedLots.find(r => r.lot.id === selectedSerialLotId);
        if (!targetRow) return null;
        const asLogs = serialAsLogsMap[targetRow.serialNumber] || targetRow.lot.warrantyAsLogs || [];
        return (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1280 }}>
            <div style={{ backgroundColor: 'var(--bg-card)', width: '920px', maxWidth: '96vw', maxHeight: '88vh', borderRadius: '10px', border: '1px solid var(--border-color)', boxShadow: '0 25px 35px -5px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--primary)' }}>
                    차대·로트번호 {targetRow.serialNumber} · {targetRow.manufacturer} · {targetRow.modelName}
                  </div>
                  <h3 style={{ margin: '2px 0 0 0', fontSize: '15.5px', fontWeight: 800, color: 'var(--text-main)' }}>
                    {targetRow.productName} — 차대번호별 입출고·원가 및 보증·수리이력 대장
                  </h3>
                </div>
                <button type="button" onClick={() => setSelectedSerialLotId(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1. 차대번호별 입출고 및 수입원가·보증 현황 요약 */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', backgroundColor: 'var(--bg-secondary)', fontWeight: 800, fontSize: '12px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)' }}>
                    1. 차대번호별 입고원가 및 출고·무상보증 현황
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ width: '16%', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>입출고 상태</th>
                        <td style={{ width: '34%', padding: '8px 12px', fontWeight: 800, color: targetRow.isSold ? '#475569' : '#166534' }}>
                          {targetRow.isSold ? '출고완료' : `현재고보유 · ${targetRow.agingDays}일 경과`}
                        </td>
                        <th style={{ width: '16%', padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>보관창고 / 입고일</th>
                        <td style={{ width: '34%', padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {targetRow.warehouseName} / {targetRow.inboundDate}
                        </td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>매입구분 / 매입처</th>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                          [{targetRow.purchaseTypeLabel}] {targetRow.vendorName}
                        </td>
                        <th style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>외화단가 · 환율 · 부대비용</th>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-main)' }}>
                          {targetRow.currency === 'KRW'
                            ? `국내매입 ₩${targetRow.foreignUnitPrice.toLocaleString()}`
                            : `${targetRow.currency} ${targetRow.foreignUnitPrice.toLocaleString()} × 환율 ${targetRow.exchangeRate} + 부대비용 ₩${targetRow.incidentalCostPerUnit.toLocaleString()}`}
                        </td>
                      </tr>
                      <tr>
                        <th style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>최종 입고도착원가</th>
                        <td style={{ padding: '8px 12px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                          ₩{targetRow.landedUnitCost.toLocaleString()}
                        </td>
                        <th style={{ padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', textAlign: 'left', color: 'var(--text-secondary)' }}>출고처 / 무상보증만료일</th>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {targetRow.isSold ? `${targetRow.soldCustomerName} · 출고 ${targetRow.soldDate} · 만료 ${targetRow.warrantyEndDate}` : `미출고 · 출고 후 ${targetRow.prod?.warrantyMonths || 12}개월 무상보증 적용`}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 2. 차대번호별 보증·사후정비 신규 등록 폼 */}
                <form
                  onSubmit={e => handleAddSerialAsLog(e, targetRow.serialNumber, targetRow.lot)}
                  style={{ padding: '14px 16px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}
                >
                  <div style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-main)' }}>
                    2. 차대번호별 보증·수리 및 정기점검 이력 등록
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '130px 150px 1fr 1fr 120px 110px auto', gap: '8px', alignItems: 'end' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>처리일자</label>
                      <input
                        type="date"
                        value={asFormDate}
                        onChange={e => setAsFormDate(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>보증·수리 구분</label>
                      <select
                        value={asFormServiceType}
                        onChange={e => setAsFormServiceType(e.target.value as any)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      >
                        <option value="WARRANTY_FREE">무상보증수리</option>
                        <option value="PAID_AS">유상정비수리</option>
                        <option value="PERIODIC_CHECK">정기예방점검</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>증상 및 점검내용</label>
                      <input
                        type="text"
                        placeholder="예: 유압호스 미세누유 점검"
                        value={asFormSymptom}
                        onChange={e => setAsFormSymptom(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>조치내역 및 교체부품</label>
                      <input
                        type="text"
                        placeholder="예: 오링 무상교체 및 작동유 보충"
                        value={asFormActionDetail}
                        onChange={e => setAsFormActionDetail(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>수리비용</label>
                      <input
                        type="number"
                        min={0}
                        disabled={asFormServiceType === 'WARRANTY_FREE'}
                        value={asFormServiceType === 'WARRANTY_FREE' ? 0 : asFormCostAmount}
                        onChange={e => setAsFormCostAmount(Number(e.target.value))}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: asFormServiceType === 'WARRANTY_FREE' ? 'var(--bg-secondary)' : 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>담당기사</label>
                      <input
                        type="text"
                        value={asFormEngineerName}
                        onChange={e => setAsFormEngineerName(e.target.value)}
                        style={{ padding: '6px 8px', fontSize: '12px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-main)' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      이력 등록
                    </button>
                  </div>
                </form>

                {/* 3. 차대번호별 보증·수리 누적 이력 테이블 */}
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', backgroundColor: 'var(--bg-secondary)', fontWeight: 800, fontSize: '12px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>3. 차대번호별 보증 및 사후정비 누적 이력 ({asLogs.length}건)</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>처리일자</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>구분</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>고객사</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>증상 및 점검내용</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--text-muted)' }}>조치내역</th>
                        <th style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>담당기사</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>수리비용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {asLogs.length === 0 ? (
                        <tr>
                          <td colSpan={7} style={{ padding: '28px', textAlign: 'center', color: 'var(--text-muted)' }}>
                            등록된 보증·사후정비 이력이 없습니다. 상단 폼에서 차대번호별 점검 및 수리 이력을 등록할 수 있습니다.
                          </td>
                        </tr>
                      ) : (
                        asLogs.map(log => (
                          <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{log.serviceDate}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: log.serviceType === 'WARRANTY_FREE' ? '#059669' : log.serviceType === 'PAID_AS' ? '#dc2626' : '#0284c7' }}>
                              {log.serviceType === 'WARRANTY_FREE' ? '무상보증수리' : log.serviceType === 'PAID_AS' ? '유상정비수리' : '정기예방점검'}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{log.customerName || '-'}</td>
                            <td style={{ padding: '8px 10px' }}>{log.symptom}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 600 }}>{log.actionDetail}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>{log.engineerName || '-'}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>
                              {log.costAmount > 0 ? `₩${log.costAmount.toLocaleString()}` : '무상 ₩0'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* [아이디어 #4] 계정 간 자산 전배 및 감가상각 장부가 승계 스튜디오 모달 */}
      {isTransferStudioOpen && (() => {
        const availableEquipLots = enrichedLots.filter(r => !r.isSold && r.itemType === 'EQUIPMENT');
        const selectedLotRow = availableEquipLots.find(r => r.lot.id === trfLotId) || availableEquipLots[0];
        const selectedOpts = (optionMasters || []).filter(m => trfSelectedOptIds.includes(m.id));
        const optCostSum = selectedOpts.reduce((s, m) => s + (m.costPrice || Math.round((m.dealerPrice || m.unitPrice) * 0.7)), 0);
        const lotBaseCost = selectedLotRow ? selectedLotRow.landedUnitCost : 0;
        const inheritedAcqCost = lotBaseCost + optCostSum;
        const residualVal = Math.round(inheritedAcqCost * (trfResidualRate / 100));
        const estMonthlyDep = trfDepMonths > 0 ? Math.round((inheritedAcqCost - residualVal) / trfDepMonths) : 0;

        const transferableRentalAssets = (assets || []).filter(a => a.ownerType === 'OWNED' && a.status === 'AVAILABLE');
        const selectedRentalAsset = transferableRentalAssets.find(a => a.id === revAssetId) || transferableRentalAssets[0];
        const depCalc = selectedRentalAsset
          ? calculateAssetDepreciation(selectedRentalAsset, new Date(trfDate))
          : { accumDepreciation: 0, bookValue: 0, elapsedMonths: 0, monthlyDepreciation: 0 };
        const rentalAcqPrice = selectedRentalAsset?.acquisitionPrice || 0;
        const rentalCumRev = selectedRentalAsset?.cumRentalFee || 0;
        const revDeduction = revMethod === 'DEPRECIATION_BOOK' ? Math.round(depCalc.accumDepreciation) : Math.round(rentalCumRev);
        const revInheritedCost = Math.max(0, rentalAcqPrice - revDeduction + Math.max(0, Number(revRefurbCost) || 0));
        const effectiveDealerPrice = revDealerPrice > 0 ? revDealerPrice : Math.round((revInheritedCost * 1.15) / 10000) * 10000;
        const effectiveStdPrice = revStdPrice > 0 ? revStdPrice : Math.round((revInheritedCost * 1.25) / 10000) * 10000;

        const handleRunTradeToRental = async () => {
          if (!selectedLotRow) {
            showErrorModal('전배할 유통 완제품 차대번호 로트를 선택해 주세요.');
            return;
          }
          try {
            const log = await transferLotToRentalAsset(selectedLotRow.lot.id, {
              assetNo: trfAssetNo || `FL-R-${selectedLotRow.serialNumber.slice(-6)}`,
              yard: trfYard,
              optionCostAmount: optCostSum,
              selectedOptionNames: selectedOpts.map(o => o.name).join(', '),
              depreciationMonths: trfDepMonths,
              residualValueRate: trfResidualRate,
              monthlyRentalFee: trfMonthlyFee,
              transferDate: trfDate,
              memo: trfMemo
            });
            showToast(`유통재고 차대번호 [${log.serialNumber}]가 렌탈 유형자산 [${log.assetNo}]로 전배 완료되었습니다 · 승계장부가 ₩${log.inheritedBookValue.toLocaleString()}`);
            setTransferStudioTab('HISTORY');
          } catch (err: any) {
            showErrorModal(err?.message || '렌탈자산 전배 처리 중 오류가 발생했습니다.');
          }
        };

        const handleRunRentalToTrade = async () => {
          if (!selectedRentalAsset) {
            showErrorModal('전배할 당사 임대가능 렌탈자산을 선택해 주세요.');
            return;
          }
          try {
            const log = await transferRentalAssetToTradeLot(selectedRentalAsset.id, {
              valuationMethod: revMethod,
              refurbishCostAmount: Number(revRefurbCost) || 0,
              overrideTransferCost: revInheritedCost,
              warehouseName: revWarehouse,
              dealerPrice: effectiveDealerPrice,
              standardPrice: effectiveStdPrice,
              transferDate: trfDate,
              memo: revMemo
            });
            showToast(`렌탈 유형자산 [${log.assetNo}]가 유통 중고상품 재고로 전배 완료되었습니다 · 승계장부가 ₩${log.inheritedBookValue.toLocaleString()}`);
            setTransferStudioTab('HISTORY');
          } catch (err: any) {
            showErrorModal(err?.message || '유통재고 전배 처리 중 오류가 발생했습니다.');
          }
        };

        const handleExportTransferHistory = () => {
          const rows = accountTransferLogs.map((l, idx) => ({
            순번: idx + 1,
            전배일자: l.transferDate,
            전배방향: l.direction === 'TRADE_TO_RENTAL' ? '유통재고자산에서 렌탈유형자산 전배' : '렌탈유형자산에서 유통중고상품 전배',
            차대번호: l.serialNumber,
            관리번호: l.assetNo,
            제조사: l.manufacturer,
            모델명: l.modelName,
            장부가산정방식:
              l.valuationMethod === 'LANDED_PLUS_OPTION'
                ? '입고도착원가 및 장착옵션원가 합산'
                : l.valuationMethod === 'DEPRECIATION_BOOK'
                ? '정액법 감가상각 미상각잔액 승계'
                : '누적 렌탈매출 차감 미회수원가 승계',
            기초원가: l.baseCostAmount,
            상각및매출차감액: l.deductionAmount,
            옵션및리퍼비시가산액: l.additionCostAmount,
            최종승계장부가액: l.inheritedBookValue,
            입고주기장및창고: l.warehouseOrYard,
            처리담당자: l.actorName,
            전배사유및비고: l.memo
          }));
          exportToExcel(rows, `계정간자산전배_장부가승계원장_${trfDate}`, '계정간전배원장');
          showToast('계정 간 자산 전배 및 장부가 승계 이력 원장이 엑셀로 다운로드되었습니다.');
        };

        return (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1300,
              padding: '20px'
            }}
          >
            <div
              style={{
                width: '1080px',
                maxWidth: '96vw',
                maxHeight: '90vh',
                backgroundColor: 'var(--bg-card)',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                boxShadow: '0 24px 48px rgba(0,0,0,0.32)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* 모달 헤더 */}
              <div
                style={{
                  padding: '14px 20px',
                  backgroundColor: '#1e1b4b',
                  color: '#ffffff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <RefreshCw size={18} color="#c4b5fd" />
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                      계정 간 자산 전배 및 감가상각 장부가 승계 엔진
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#cbd5e1', marginTop: '2px', whiteSpace: 'nowrap' }}>
                      유통 재고자산과 렌탈 유형자산 간 원클릭 전환 및 취득원가·미상각장부가 100% 승계
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTransferStudioOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 상단 3대 전배 탭 */}
              <div
                style={{
                  padding: '10px 20px',
                  backgroundColor: 'var(--bg-secondary)',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setTransferStudioTab('TRADE_TO_RENTAL')}
                    style={{
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      borderRadius: '6px',
                      border: transferStudioTab === 'TRADE_TO_RENTAL' ? 'none' : '1px solid var(--border-color)',
                      backgroundColor: transferStudioTab === 'TRADE_TO_RENTAL' ? '#6d28d9' : 'var(--bg-card)',
                      color: transferStudioTab === 'TRADE_TO_RENTAL' ? '#ffffff' : 'var(--text-main)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    1. 유통 재고자산에서 렌탈 유형자산 전배 [{availableEquipLots.length}대 가능]
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferStudioTab('RENTAL_TO_TRADE')}
                    style={{
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      borderRadius: '6px',
                      border: transferStudioTab === 'RENTAL_TO_TRADE' ? 'none' : '1px solid var(--border-color)',
                      backgroundColor: transferStudioTab === 'RENTAL_TO_TRADE' ? '#0f766e' : 'var(--bg-card)',
                      color: transferStudioTab === 'RENTAL_TO_TRADE' ? '#ffffff' : 'var(--text-main)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    2. 렌탈 유형자산에서 유통 중고상품 전배 [{transferableRentalAssets.length}대 가능]
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransferStudioTab('HISTORY')}
                    style={{
                      padding: '7px 14px',
                      fontSize: '12.5px',
                      fontWeight: 800,
                      borderRadius: '6px',
                      border: transferStudioTab === 'HISTORY' ? 'none' : '1px solid var(--border-color)',
                      backgroundColor: transferStudioTab === 'HISTORY' ? '#1d4ed8' : 'var(--bg-card)',
                      color: transferStudioTab === 'HISTORY' ? '#ffffff' : 'var(--text-main)',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    3. 계정 간 전배 및 장부가 승계 원장 [{accountTransferLogs.length}건]
                  </button>
                </div>

                {transferStudioTab === 'HISTORY' && (
                  <button
                    type="button"
                    onClick={handleExportTransferHistory}
                    className="btn-excel-download"
                    style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                  >
                    <Download size={13} /> 전배 원장 엑셀 내보내기
                  </button>
                )}
              </div>

              {/* 모달 본문 */}
              <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {transferStudioTab === 'TRADE_TO_RENTAL' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>전배 대상 유통 완제품 차대번호</label>
                        <select
                          value={selectedLotRow?.lot.id || ''}
                          onChange={e => {
                            const nextId = e.target.value;
                            setTrfLotId(nextId);
                            const found = availableEquipLots.find(r => r.lot.id === nextId);
                            if (found) {
                              setTrfAssetNo(`FL-R-${found.serialNumber.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase()}`);
                              setTrfMonthlyFee(Math.round(((found.prod?.standardPrice || found.landedUnitCost * 1.25) * 0.032) / 10000) * 10000);
                            }
                          }}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          {availableEquipLots.map(r => (
                            <option key={r.lot.id} value={r.lot.id}>
                              [{r.serialNumber}] {r.manufacturer} {r.modelName} · 도착원가 ₩{r.landedUnitCost.toLocaleString()} · {r.agingDays}일 경과
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>부여할 렌탈 관리번호</label>
                        <input
                          type="text"
                          value={trfAssetNo}
                          onChange={e => setTrfAssetNo(e.target.value)}
                          placeholder="예: FL-R-261101"
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, fontFamily: 'monospace', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--primary)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>배치 주기장</label>
                        <select
                          value={trfYard}
                          onChange={e => setTrfYard(e.target.value)}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          <option value="평택">평택 주기장</option>
                          <option value="용인">용인 주기장</option>
                          <option value="김해">김해 주기장</option>
                          <option value="본사">본사 주기장</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>전배 기준일자</label>
                        <input
                          type="date"
                          value={trfDate}
                          onChange={e => setTrfDate(e.target.value)}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>정액법 상각 내용연수 개월</label>
                        <select
                          value={trfDepMonths}
                          onChange={e => setTrfDepMonths(Number(e.target.value))}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          <option value={48}>48개월 상각 · 4년</option>
                          <option value={60}>60개월 상각 · 5년 표준</option>
                          <option value={72}>72개월 상각 · 6년</option>
                          <option value={96}>96개월 상각 · 8년</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>잔존가치율 퍼센트</label>
                        <select
                          value={trfResidualRate}
                          onChange={e => setTrfResidualRate(Number(e.target.value))}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          <option value={0}>0% · 전액 상각</option>
                          <option value={10}>10% · 표준 잔존가치</option>
                          <option value={15}>15% · 고잔가 설정</option>
                          <option value={20}>20% · 단기순환 잔가</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>기준 월 렌탈료 원</label>
                        <input
                          type="number"
                          value={trfMonthlyFee}
                          onChange={e => setTrfMonthlyFee(Number(e.target.value))}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>전배 사유 및 비고</label>
                        <input
                          type="text"
                          value={trfMemo}
                          onChange={e => setTrfMemo(e.target.value)}
                          placeholder="예: 신규 장기렌탈 계약 투입을 위한 유통 완제품 계정 전배"
                          style={{ padding: '7px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>
                    </div>

                    {/* 출고 설치옵션 원가 자본화 선택 */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px', backgroundColor: 'var(--bg-app)' }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                        전배 시 장착할 출고 옵션 선택 · 선택 시 옵션 매입원가가 렌탈자산 취득원가에 합산 자본화됨
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '6px', maxHeight: '145px', overflowY: 'auto' }}>
                        {(optionMasters || []).map(opt => {
                          const checked = trfSelectedOptIds.includes(opt.id);
                          const optCost = opt.costPrice || Math.round((opt.dealerPrice || opt.unitPrice) * 0.7);
                          return (
                            <label
                              key={opt.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                padding: '6px 9px',
                                borderRadius: '6px',
                                border: checked ? '1.5px solid #6d28d9' : '1px solid var(--border-color)',
                                backgroundColor: checked ? '#f5f3ff' : 'var(--bg-card)',
                                cursor: 'pointer',
                                fontSize: '11.5px',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: checked ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setTrfSelectedOptIds(prev =>
                                      prev.includes(opt.id) ? prev.filter(x => x !== opt.id) : [...prev, opt.id]
                                    )
                                  }
                                />
                                {opt.name}
                              </span>
                              <span style={{ fontWeight: 800, color: '#6d28d9', fontFamily: 'monospace' }}>
                                +₩{optCost.toLocaleString()}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* 장부가 승계 검증 요약 바 */}
                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: '8px',
                        backgroundColor: '#f5f3ff',
                        border: '1px solid #c4b5fd',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6' }}>로트 입고 도착원가</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1e1b4b' }}>₩{lotBaseCost.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6' }}>장착옵션 자본화 가산액</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#6d28d9' }}>+₩{optCostSum.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6' }}>승계 렌탈자산 취득원가</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#4c1d95' }}>₩{inheritedAcqCost.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b21b6' }}>월 정액 감가상각비 · 잔존가액</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: '#3730a3' }}>
                            월 ₩{estMonthlyDep.toLocaleString()} / 잔존 ₩{residualVal.toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRunTradeToRental}
                        style={{
                          padding: '10px 20px',
                          fontSize: '13px',
                          fontWeight: 900,
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#6d28d9',
                          color: '#ffffff',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        렌탈 유형자산 전배 실행
                      </button>
                    </div>
                  </>
                )}

                {transferStudioTab === 'RENTAL_TO_TRADE' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 0.9fr 0.9fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>전배 대상 당사 임대가능 렌탈자산</label>
                        <select
                          value={selectedRentalAsset?.id || ''}
                          onChange={e => setRevAssetId(e.target.value)}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          {transferableRentalAssets.map(a => (
                            <option key={a.id} value={a.id}>
                              [{a.assetNo}] {a.manufacturer || '항차그룹'} {a.modelName} · 차대 {a.serialNo || '-'} · 취득원가 ₩{(a.acquisitionPrice || 0).toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>장부가 산정 기준 선택</label>
                        <select
                          value={revMethod}
                          onChange={e => setRevMethod(e.target.value as any)}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: '#0f766e' }}
                        >
                          <option value="DEPRECIATION_BOOK">정액법 감가상각 미상각잔액 기준</option>
                          <option value="REVENUE_DEDUCT_BOOK">누적 렌탈매출 차감 미회수원가 기준</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>리퍼비시 정비원가 가산액</label>
                        <input
                          type="number"
                          value={revRefurbCost}
                          onChange={e => setRevRefurbCost(Number(e.target.value))}
                          placeholder="0"
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>유통 입고창고</label>
                        <select
                          value={revWarehouse}
                          onChange={e => setRevWarehouse(e.target.value)}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 700, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        >
                          {WAREHOUSES.map(w => (
                            <option key={w} value={w}>{w}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>중고 대리점 공급단가</label>
                        <input
                          type="number"
                          value={effectiveDealerPrice}
                          onChange={e => setRevDealerPrice(Number(e.target.value))}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>중고 최종고객 판매단가</label>
                        <input
                          type="number"
                          value={effectiveStdPrice}
                          onChange={e => setRevStdPrice(Number(e.target.value))}
                          style={{ padding: '7px 10px', fontSize: '12.5px', fontWeight: 800, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>전배 사유 및 비고</label>
                        <input
                          type="text"
                          value={revMemo}
                          onChange={e => setRevMemo(e.target.value)}
                          placeholder="예: 장기대여 반납 후 리퍼비시 완료 중고 매각용 유통재고 전환"
                          style={{ padding: '7px 10px', fontSize: '12.5px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '14px 18px',
                        borderRadius: '8px',
                        backgroundColor: '#f0fdfa',
                        border: '1px solid #99f6e4',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '22px', flexWrap: 'wrap' }}>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>최초 취득원가</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#134e4a' }}>₩{rentalAcqPrice.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>
                            {revMethod === 'DEPRECIATION_BOOK' ? `감가상각 누계액 · ${depCalc.elapsedMonths}개월 경과` : '누적 렌탈매출 기여액 차감'}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#dc2626' }}>-₩{revDeduction.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>리퍼비시 정비 가산액</div>
                          <div style={{ fontSize: '16px', fontWeight: 900, color: '#0284c7' }}>+₩{Math.max(0, Number(revRefurbCost) || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f766e' }}>유통재고 승계 입고원가</div>
                          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f766e' }}>₩{revInheritedCost.toLocaleString()}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRunRentalToTrade}
                        style={{
                          padding: '10px 20px',
                          fontSize: '13px',
                          fontWeight: 900,
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        유통 재고자산 전배 실행
                      </button>
                    </div>
                  </>
                )}

                {transferStudioTab === 'HISTORY' && (
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800 }}>전배일자</th>
                          <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800 }}>전배방향</th>
                          <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 800 }}>차대번호 · 관리번호</th>
                          <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 800 }}>제조사 · 모델명</th>
                          <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 800 }}>장부가 산정방식</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800 }}>기초원가</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800 }}>상각·매출차감액</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800 }}>옵션·정비가산액</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800 }}>최종 승계장부가액</th>
                          <th style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800 }}>배치처</th>
                          <th style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 800 }}>비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accountTransferLogs.map(log => (
                          <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{log.transferDate}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '999px',
                                  fontSize: '11px',
                                  fontWeight: 800,
                                  backgroundColor: log.direction === 'TRADE_TO_RENTAL' ? '#f5f3ff' : '#f0fdfa',
                                  color: log.direction === 'TRADE_TO_RENTAL' ? '#6d28d9' : '#0f766e'
                                }}
                              >
                                {log.direction === 'TRADE_TO_RENTAL' ? '유통에서 렌탈전배' : '렌탈에서 유통전배'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 800, fontFamily: 'monospace' }}>
                              {log.serialNumber} · <span style={{ color: 'var(--primary)' }}>{log.assetNo}</span>
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{log.manufacturer} {log.modelName}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                              {log.valuationMethod === 'LANDED_PLUS_OPTION'
                                ? '도착원가 + 옵션원가 자본화'
                                : log.valuationMethod === 'DEPRECIATION_BOOK'
                                ? '정액법 감가상각 미상각잔액'
                                : '누적 렌탈매출 차감 미회수원가'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace' }}>₩{log.baseCostAmount.toLocaleString()}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#dc2626' }}>
                              {log.deductionAmount > 0 ? `-₩${log.deductionAmount.toLocaleString()}` : '-'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#0284c7' }}>
                              {log.additionCostAmount > 0 ? `+₩${log.additionCostAmount.toLocaleString()}` : '-'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, fontFamily: 'monospace', color: 'var(--text-main)' }}>
                              ₩{log.inheritedBookValue.toLocaleString()}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>{log.warehouseOrYard}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{log.memo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
export default TradeProductsPage;
