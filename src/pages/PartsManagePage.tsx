import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Boxes,
  History,
  Plus,
  Search,
  ArrowRight,
  FileSpreadsheet,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Layers
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_RENTAL_ASSETS } from '../data/flUnifiedSeedData';
import { MUJIN_PARTS_INVENTORY } from '../data/mujinGlobalInitialData';
import { CompatiblePartsCatalogOrderPage } from './distribution/CompatiblePartsCatalogOrderPage';
import { exportToExcel } from '../services/excel';

export interface PartInventoryItem {
  id: string;
  skuCode: string;
  partName: string;
  category: string;
  brand?: string;
  manufacturer?: string;
  isHandled?: boolean;
  inventoryType?: string;
  currency?: string;
  compatibleModels: string;
  spec: string;
  baseYm?: string;
  inboundDate?: string;
  inboundYm?: string;
  agingMonths?: number;
  initialQty?: number;
  initialAmount?: number;
  totalQty: number;
  saleStockQty: number;
  repairStockQty: number;
  minStockQty: number;
  purchaseUnitCost: number;
  exactUnitCost?: number;
  stockBalanceAmount?: number;
  saleUnitPrice: number;
  location: string;
  serialNo?: string;
  imageFile?: string;
  imageUrl?: string;
  imageFileName?: string;
  imageSource?: string;
  imageStatus?: string;
  createdDate?: string;
}

export interface PartMasterItem {
  id: string;
  skuCode: string;
  partName: string;
  manufacturer: string;
  brand: string;
  category: string;
  compatibleModels: string;
  spec: string;
  isHandled: boolean;
  purchaseUnitCost: number;
  saleUnitPrice: number;
  minStockQty: number;
  location: string;
  imageFile?: string;
  imageUrl?: string;
  imageFileName?: string;
  createdDate?: string;
}

export interface ReusablePartImageOption {
  imageUrl: string;
  imageFile: string;
  imageFileName: string;
  skuCode: string;
  partName: string;
  manufacturer: string;
  category: string;
}

export interface AssetPartUsageHistoryRecord {
  id: string;
  usedDate: string;
  repairTicketNo: string;
  assetId: string;
  assetNo: string;
  modelName: string;
  partId: string;
  skuCode: string;
  partName: string;
  usedQty: number;
  unitCost: number;
  totalPartCost: number;
  mechanicName: string;
  repairSummary: string;
}

export interface MonthlyBackcalculatedPart extends PartInventoryItem {
  calcElapsedMonths: number;
  calcAgingBucket: number;
  calcStockQty: number;
  calcStockBalanceAmount: number;
  calcSaleStockQty: number;
  calcRepairStockQty: number;
  isReceivedAsOfTarget: boolean;
}

export const PART_MANUFACTURER_LABELS: Record<string, string> = {
  HANGCHA: '항차',
  HELI: '헬리',
  BYD: '비와이디',
  DOOSAN: '두산밥캣',
  CLARK: '클라크',
  TOYOTA: '도요타'
};

export function getPartManufacturerLabel(code?: string): string {
  if (!code) return '항차';
  return PART_MANUFACTURER_LABELS[code.toUpperCase()] || code;
}

export function computeElapsedMonths(inboundYm: string | undefined, targetYm: string): number {
  const safeInbound = (inboundYm || '2026-04').replace('.', '-').slice(0, 7);
  const safeTarget = (targetYm || '2026-04').replace('.', '-').slice(0, 7);
  const [iyStr, imStr] = safeInbound.split('-');
  const [tyStr, tmStr] = safeTarget.split('-');
  const iy = parseInt(iyStr, 10) || 2026;
  const im = parseInt(imStr, 10) || 4;
  const ty = parseInt(tyStr, 10) || 2026;
  const tm = parseInt(tmStr, 10) || 4;
  return (ty - iy) * 12 + (tm - im);
}

export function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [yStr, mStr] = (ym || '2026-04').split('-');
  let y = parseInt(yStr, 10) || 2026;
  let m = (parseInt(mStr, 10) || 4) + deltaMonths;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

const INITIAL_PARTS_INVENTORY: PartInventoryItem[] = (MUJIN_PARTS_INVENTORY as PartInventoryItem[]).map(p => ({
  ...p,
  manufacturer: p.brand || 'HANGCHA',
  isHandled: true
}));

// 부품 마스터 전용 미취급 제조사 기준 부품 시드 (제조사별 조회 및 취급여부 결정 검증용)
const UNHANDLED_MANUFACTURER_MASTER_PARTS: PartMasterItem[] = [
  {
    id: 'PM-UNH-001',
    skuCode: 'HC-XE35-220105-00',
    partName: '마스트 틸트실린더 오버홀 씰키트 3.5톤용',
    manufacturer: 'HANGCHA',
    brand: 'HANGCHA',
    category: '유압·실린더·씰부품',
    compatibleModels: '항차 XE 시리즈 3.5톤 리튬전동지게차',
    spec: '로드경 45mm · 피스톤경 90mm 고압 우레탄 씰 세트',
    isHandled: false,
    purchaseUnitCost: 68000,
    saleUnitPrice: 95000,
    minStockQty: 3,
    location: '주기장 부품동 M-01',
    imageFile: INITIAL_PARTS_INVENTORY[2]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[2]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[2]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-002',
    skuCode: 'HC-CQD20-410080-00',
    partName: '리치트럭 팬터그래프 시저스 암 부싱 키트',
    manufacturer: 'HANGCHA',
    brand: 'HANGCHA',
    category: '구동·베어링·하체부품',
    compatibleModels: '항차 CQD 1.8~2.5톤 좌승식·입승식 리치트럭',
    spec: '고강도 청동 합금 오일리스 부싱 4개입 1세트',
    isHandled: false,
    purchaseUnitCost: 54000,
    saleUnitPrice: 78000,
    minStockQty: 4,
    location: '주기장 부품동 M-02',
    imageFile: INITIAL_PARTS_INVENTORY[3]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[3]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[3]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-003',
    skuCode: 'HL-K3-80V-BMS-09',
    partName: '헬리 K3 80V 리튬인산철 슬레이브 BMS 모듈',
    manufacturer: 'HELI',
    brand: 'HELI',
    category: '배터리·충전·전원부품',
    compatibleModels: '헬리 CPD25-GB2Li · CPD30-GB2Li 리튬전동지게차',
    spec: '80V CAN 통신 셀 밸런싱 제어 보드',
    isHandled: false,
    purchaseUnitCost: 340000,
    saleUnitPrice: 460000,
    minStockQty: 2,
    location: '주기장 부품동 M-03',
    imageFile: INITIAL_PARTS_INVENTORY[9]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[9]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[9]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-004',
    skuCode: 'HL-H2000-510300-A',
    partName: '헬리 디젤 3.0톤 조향 실린더 타이로드 엔드 어셈블리',
    manufacturer: 'HELI',
    brand: 'HELI',
    category: '구동·베어링·하체부품',
    compatibleModels: '헬리 CPCD25 · CPCD30 디젤지게차',
    spec: '좌·우 한 조 · 핀경 28mm 단조강 링크',
    isHandled: false,
    purchaseUnitCost: 82000,
    saleUnitPrice: 118000,
    minStockQty: 4,
    location: '주기장 부품동 M-04',
    imageFile: INITIAL_PARTS_INVENTORY[4]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[4]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[4]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-005',
    skuCode: 'BYD-ECB25-INV-80V',
    partName: '비와이디 80V 주행 인버터 파워모듈 어셈블리',
    manufacturer: 'BYD',
    brand: 'BYD',
    category: '전장·제어부품',
    compatibleModels: '비와이디 ECB25 · ECB30 · ECB35 전동지게차',
    spec: '80V 450A IGBT 수냉식 방열 인버터 유닛',
    isHandled: false,
    purchaseUnitCost: 920000,
    saleUnitPrice: 1250000,
    minStockQty: 1,
    location: '주기장 부품동 M-05',
    imageFile: INITIAL_PARTS_INVENTORY[10]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[10]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[10]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-006',
    skuCode: 'BYD-REMA-320A-F',
    partName: '비와이디 급속충전기용 REMA 320A 암놈 충전소켓',
    manufacturer: 'BYD',
    brand: 'BYD',
    category: '배터리·충전·전원부품',
    compatibleModels: '비와이디 80V 리튬인산철 급속충전기 전 기종',
    spec: 'DC 80V 320A 파일럿 접점 내장 고전류 커넥터',
    isHandled: false,
    purchaseUnitCost: 145000,
    saleUnitPrice: 198000,
    minStockQty: 2,
    location: '주기장 부품동 M-06',
    imageFile: INITIAL_PARTS_INVENTORY[11]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[11]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[11]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-007',
    skuCode: 'DS-D30S7-BRK-DISC',
    partName: '두산밥캣 습식 디스크 브레이크 마찰 디스크 세트',
    manufacturer: 'DOOSAN',
    brand: 'DOOSAN',
    category: '유압·실린더·씰부품',
    compatibleModels: '두산밥캣 D25S-7 · D30S-7 · D33S-7 디젤지게차',
    spec: '외경 224mm · 내치 32T 소결합금 마찰판 6매 + 스틸플레이트 6매',
    isHandled: true,
    purchaseUnitCost: 215000,
    saleUnitPrice: 295000,
    minStockQty: 3,
    location: '주기장 부품동 D-01',
    imageFile: INITIAL_PARTS_INVENTORY[1]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[1]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[1]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-008',
    skuCode: 'DS-B25X7-MAST-BRG',
    partName: '두산밥캣 마스트 메인 가이드 롤러 베어링 2.5톤용',
    manufacturer: 'DOOSAN',
    brand: 'DOOSAN',
    category: '구동·베어링·하체부품',
    compatibleModels: '두산밥캣 B25X-7 · D25S-7 마스트 캐리지',
    spec: '외경 119.5mm × 내경 45mm × 폭 32mm 고하중 마스트 베어링',
    isHandled: false,
    purchaseUnitCost: 42000,
    saleUnitPrice: 62000,
    minStockQty: 8,
    location: '주기장 부품동 D-02',
    imageFile: INITIAL_PARTS_INVENTORY[2]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[2]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[2]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-009',
    skuCode: 'CLK-GTS25-HYD-PUMP',
    partName: '클라크 GTS25 메인 유압 기어펌프 어셈블리',
    manufacturer: 'CLARK',
    brand: 'CLARK',
    category: '유압·실린더·씰부품',
    compatibleModels: '클라크 GTS20 · GTS25 · GTS30 디젤·LPG 지게차',
    spec: '토출량 64cc/rev · 스플라인 13T 고압 주철 유압펌프',
    isHandled: true,
    purchaseUnitCost: 380000,
    saleUnitPrice: 520000,
    minStockQty: 2,
    location: '주기장 부품동 C-01',
    imageFile: INITIAL_PARTS_INVENTORY[12]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[12]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[12]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-010',
    skuCode: 'CLK-EPX25-ENC-64P',
    partName: '클라크 EPX 전동지게차 AC 주행모터 엔코더 센서',
    manufacturer: 'CLARK',
    brand: 'CLARK',
    category: '전장·제어부품',
    compatibleModels: '클라크 EPX20i · EPX25i · EPX30i 전동지게차',
    spec: '64펄스 듀얼 채널 회전속도 감지 베어링 엔코더',
    isHandled: false,
    purchaseUnitCost: 95000,
    saleUnitPrice: 138000,
    minStockQty: 3,
    location: '주기장 부품동 C-02',
    imageFile: INITIAL_PARTS_INVENTORY[14]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[14]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[14]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-011',
    skuCode: 'TYT-8FB25-SAS-SNS',
    partName: '도요타 8FB 시리즈 SAS 스윙락 요레이트 각도센서',
    manufacturer: 'TOYOTA',
    brand: 'TOYOTA',
    category: '전장·제어부품',
    compatibleModels: '도요타 8FB15 · 8FB20 · 8FB25 · 8FB30 전동지게차',
    spec: '후차축 스윙 잠금 제어용 정밀 자세감지 센서',
    isHandled: true,
    purchaseUnitCost: 260000,
    saleUnitPrice: 360000,
    minStockQty: 2,
    location: '주기장 부품동 T-01',
    imageFile: INITIAL_PARTS_INVENTORY[15]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[15]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[15]?.imageFileName || '',
    createdDate: '2026-05-15'
  },
  {
    id: 'PM-UNH-012',
    skuCode: 'TYT-7FBR15-PU-WHL',
    partName: '도요타 입승식 리치트럭 우레탄 드라이브 휠 어셈블리',
    manufacturer: 'TOYOTA',
    brand: 'TOYOTA',
    category: '구동·베어링·하체부품',
    compatibleModels: '도요타 7FBR15 · 7FBR18 · 8FBR15 리치트럭',
    spec: '외경 330mm × 폭 145mm 고경도 폴리우레탄 구동바퀴',
    isHandled: false,
    purchaseUnitCost: 195000,
    saleUnitPrice: 275000,
    minStockQty: 4,
    location: '주기장 부품동 T-02',
    imageFile: INITIAL_PARTS_INVENTORY[16]?.imageFile || '',
    imageUrl: INITIAL_PARTS_INVENTORY[16]?.imageUrl || '',
    imageFileName: INITIAL_PARTS_INVENTORY[16]?.imageFileName || '',
    createdDate: '2026-05-15'
  }
];

export const INITIAL_PART_MASTER_LIST: PartMasterItem[] = [
  ...INITIAL_PARTS_INVENTORY.map(p => ({
    id: p.id,
    skuCode: p.skuCode,
    partName: p.partName,
    manufacturer: p.brand || 'HANGCHA',
    brand: p.brand || 'HANGCHA',
    category: p.category,
    compatibleModels: p.compatibleModels,
    spec: p.spec,
    isHandled: true,
    purchaseUnitCost: p.purchaseUnitCost,
    saleUnitPrice: p.saleUnitPrice,
    minStockQty: p.minStockQty,
    location: p.location || '주기장',
    imageFile: p.imageFile,
    imageUrl: p.imageUrl,
    imageFileName: p.imageFileName,
    createdDate: p.createdDate || '2026-05-13'
  })),
  ...UNHANDLED_MANUFACTURER_MASTER_PARTS
];

// 257개 R2 이미지 재사용 보관함 추출 (부품마스터·부품관리-유통·부품관리-렌탈 공통 재사용)
export const REUSABLE_PART_IMAGE_LIBRARY: ReusablePartImageOption[] = (() => {
  const seen = new Set<string>();
  const list: ReusablePartImageOption[] = [];
  for (const p of INITIAL_PARTS_INVENTORY) {
    if (!p.imageUrl || seen.has(p.imageUrl)) continue;
    seen.add(p.imageUrl);
    list.push({
      imageUrl: p.imageUrl,
      imageFile: p.imageFile || p.imageFileName || '',
      imageFileName: p.imageFileName || p.imageFile || '',
      skuCode: p.skuCode,
      partName: p.partName,
      manufacturer: p.brand || 'HANGCHA',
      category: p.category
    });
  }
  return list;
})();

export const INITIAL_ASSET_PART_USAGE_HISTORY: AssetPartUsageHistoryRecord[] = [];

const PARTS_RENTAL_STORAGE_KEY = 'ebro_fl_parts_inv_v4_mujin_r2_images';
const PARTS_TRADE_STORAGE_KEY = 'ebro_fl_parts_trade_inv_v1_mujin_r2_images';
const PART_MASTER_STORAGE_KEY = 'ebro_fl_part_master_v1_ssot';
const PARTS_USAGE_STORAGE_KEY = 'ebro_fl_parts_usage_v2_mujin';
const PARTS_TRADE_USAGE_STORAGE_KEY = 'ebro_fl_parts_trade_usage_v1_mujin';

export function loadPartMasterList(): PartMasterItem[] {
  try {
    const saved = localStorage.getItem(PART_MASTER_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_PART_MASTER_LIST;
}

export function savePartMasterList(items: PartMasterItem[]): void {
  try {
    localStorage.setItem(PART_MASTER_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export function loadPartsInventory(mode: 'RENTAL' | 'TRADE' = 'RENTAL'): PartInventoryItem[] {
  const storageKey = mode === 'TRADE' ? PARTS_TRADE_STORAGE_KEY : PARTS_RENTAL_STORAGE_KEY;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0 && !parsed.some(p => String(p.id || '').startsWith('PRT-FL-'))) {
        return parsed;
      }
    }
  } catch {}
  return INITIAL_PARTS_INVENTORY.map(item => ({ ...item }));
}

export function savePartsInventory(items: PartInventoryItem[], mode: 'RENTAL' | 'TRADE' = 'RENTAL'): void {
  const storageKey = mode === 'TRADE' ? PARTS_TRADE_STORAGE_KEY : PARTS_RENTAL_STORAGE_KEY;
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export function loadPartUsageHistory(mode: 'RENTAL' | 'TRADE' = 'RENTAL'): AssetPartUsageHistoryRecord[] {
  const storageKey = mode === 'TRADE' ? PARTS_TRADE_USAGE_STORAGE_KEY : PARTS_USAGE_STORAGE_KEY;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return INITIAL_ASSET_PART_USAGE_HISTORY;
}

export function savePartUsageHistory(records: AssetPartUsageHistoryRecord[], mode: 'RENTAL' | 'TRADE' = 'RENTAL'): void {
  const storageKey = mode === 'TRADE' ? PARTS_TRADE_USAGE_STORAGE_KEY : PARTS_USAGE_STORAGE_KEY;
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
    window.dispatchEvent(new CustomEvent('ebro:parts_updated'));
  } catch {}
}

export interface PartsManagePageProps {
  mode?: 'RENTAL' | 'TRADE';
}

export const PartsManagePage: React.FC<PartsManagePageProps> = ({ mode = 'RENTAL' }) => {
  const { setActiveTab } = useApp();
  const isTradeMode = mode === 'TRADE';
  const [subTab, setSubTab] = useState<'INVENTORY' | 'MASTER' | 'ASSET_HISTORY' | 'CATALOG'>('INVENTORY');
  const [parts, setParts] = useState<PartInventoryItem[]>(() => loadPartsInventory(mode));
  const [partMasterList, setPartMasterList] = useState<PartMasterItem[]>(loadPartMasterList);
  const [usageHistory, setUsageHistory] = useState<AssetPartUsageHistoryRecord[]>(() => loadPartUsageHistory(mode));

  // 재고 원장 조회 필터
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [handlingFilter, setHandlingFilter] = useState<'ALL' | 'HANDLED' | 'UNHANDLED'>('HANDLED');
  const [targetYm, setTargetYm] = useState<string>('2026-04');
  const [selectedAgingBucket, setSelectedAgingBucket] = useState<number | 'ALL'>('ALL');
  const [assetFilter, setAssetFilter] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [previewPartImage, setPreviewPartImage] = useState<{
    skuCode: string;
    partName: string;
    brand?: string;
    category: string;
    compatibleModels: string;
    imageUrl?: string;
    imageFile?: string;
    imageFileName?: string;
  } | null>(null);

  // 부품 마스터 전용 필터 및 등록 폼 상태
  const [masterManufacturerFilter, setMasterManufacturerFilter] = useState<string>('ALL');
  const [masterCategoryFilter, setMasterCategoryFilter] = useState<string>('ALL');
  const [masterHandlingFilter, setMasterHandlingFilter] = useState<'ALL' | 'HANDLED' | 'UNHANDLED'>('ALL');
  const [masterSearchTerm, setMasterSearchTerm] = useState<string>('');
  const [showMasterRegisterModal, setShowMasterRegisterModal] = useState<boolean>(false);
  const [showReusableImagePicker, setShowReusableImagePicker] = useState<boolean>(false);
  const [imagePickerSearch, setImagePickerSearch] = useState<string>('');

  const [newMasterSku, setNewMasterSku] = useState<string>('');
  const [newMasterName, setNewMasterName] = useState<string>('');
  const [newMasterManufacturer, setNewMasterManufacturer] = useState<string>('HANGCHA');
  const [newMasterCategory, setNewMasterCategory] = useState<string>('전장·제어부품');
  const [newMasterCompatibleModels, setNewMasterCompatibleModels] = useState<string>('항차 XE 시리즈 2.5~3.5톤 리튬전동지게차');
  const [newMasterSpec, setNewMasterSpec] = useState<string>('');
  const [newMasterPurchaseCost, setNewMasterPurchaseCost] = useState<number>(45000);
  const [newMasterSalePrice, setNewMasterSalePrice] = useState<number>(65000);
  const [newMasterMinStock, setNewMasterMinStock] = useState<number>(3);
  const [newMasterLocation, setNewMasterLocation] = useState<string>('주기장 부품동');
  const [newMasterIsHandled, setNewMasterIsHandled] = useState<boolean>(true);
  const [newMasterImageUrl, setNewMasterImageUrl] = useState<string>(REUSABLE_PART_IMAGE_LIBRARY[0]?.imageUrl || '');
  const [newMasterImageFile, setNewMasterImageFile] = useState<string>(REUSABLE_PART_IMAGE_LIBRARY[0]?.imageFile || '');

  React.useEffect(() => {
    setParts(loadPartsInventory(mode));
    setUsageHistory(loadPartUsageHistory(mode));
    setPartMasterList(loadPartMasterList());
  }, [mode]);

  React.useEffect(() => {
    try {
      const invKey = mode === 'TRADE' ? PARTS_TRADE_STORAGE_KEY : PARTS_RENTAL_STORAGE_KEY;
      if (!localStorage.getItem(invKey)) {
        localStorage.setItem(invKey, JSON.stringify(loadPartsInventory(mode)));
      }
      if (!localStorage.getItem(PART_MASTER_STORAGE_KEY)) {
        localStorage.setItem(PART_MASTER_STORAGE_KEY, JSON.stringify(loadPartMasterList()));
      }
    } catch {}
    const sync = () => {
      setParts(loadPartsInventory(mode));
      setUsageHistory(loadPartUsageHistory(mode));
      setPartMasterList(loadPartMasterList());
    };
    window.addEventListener('ebro:parts_updated', sync);
    return () => window.removeEventListener('ebro:parts_updated', sync);
  }, [mode]);

  const [showInboundForm, setShowInboundForm] = useState<boolean>(false);
  const [targetPartId, setTargetPartId] = useState<string>(INITIAL_PARTS_INVENTORY[0]?.id || '');
  const [inboundPurpose, setInboundPurpose] = useState<'REPAIR' | 'SALE'>(isTradeMode ? 'SALE' : 'REPAIR');
  const [inboundQty, setInboundQty] = useState<number>(5);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // 부품 마스터 취급여부 맵 (품번 기준)
  const masterHandledMap = useMemo(() => {
    const map = new Map<string, PartMasterItem>();
    for (const m of partMasterList) {
      map.set(m.skuCode, m);
      map.set(m.id, m);
    }
    return map;
  }, [partMasterList]);

  // 재사용 가능한 이미지 보관함 (초기 257개 + 마스터에 추가 등록된 이미지 포함)
  const reusableImageLibrary = useMemo<ReusablePartImageOption[]>(() => {
    const seen = new Set<string>();
    const list: ReusablePartImageOption[] = [];
    for (const item of [...REUSABLE_PART_IMAGE_LIBRARY, ...partMasterList]) {
      if (!item.imageUrl || seen.has(item.imageUrl)) continue;
      seen.add(item.imageUrl);
      list.push({
        imageUrl: item.imageUrl,
        imageFile: item.imageFile || item.imageFileName || '',
        imageFileName: item.imageFileName || item.imageFile || '',
        skuCode: item.skuCode,
        partName: item.partName,
        manufacturer: item.manufacturer || (item as any).brand || 'HANGCHA',
        category: item.category
      });
    }
    return list;
  }, [partMasterList]);

  const filteredReusableImages = useMemo(() => {
    const q = imagePickerSearch.trim().toLowerCase();
    if (!q) return reusableImageLibrary;
    return reusableImageLibrary.filter(
      img =>
        img.skuCode.toLowerCase().includes(q) ||
        img.partName.toLowerCase().includes(q) ||
        img.category.toLowerCase().includes(q) ||
        img.imageFile.toLowerCase().includes(q)
    );
  }, [reusableImageLibrary, imagePickerSearch]);

  // 부품별 당월 이후 사용수량 맵 (역산용)
  const usedQtyUpToTargetMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usageHistory) {
      const uYm = (u.usedDate || '').slice(0, 7);
      if (uYm && uYm <= targetYm) {
        map.set(u.partId, (map.get(u.partId) || 0) + (u.usedQty || 0));
      }
    }
    return map;
  }, [usageHistory, targetYm]);

  // 1개월 단위 경과월수 및 재고잔량·재고잔액 동적 역산
  const backcalculatedParts = useMemo<MonthlyBackcalculatedPart[]>(() => {
    return parts.map(p => {
      const masterMatch = masterHandledMap.get(p.skuCode) || masterHandledMap.get(p.id);
      const isHandled = masterMatch ? masterMatch.isHandled : (p.isHandled !== false);
      const effectiveImageUrl = masterMatch?.imageUrl || p.imageUrl;
      const effectiveImageFile = masterMatch?.imageFile || p.imageFile;
      const inboundYm = p.inboundYm || (p.inboundDate ? p.inboundDate.slice(0, 7) : '2026-04');
      const elapsed = computeElapsedMonths(inboundYm, targetYm);
      if (elapsed < 0) {
        return {
          ...p,
          isHandled,
          imageUrl: effectiveImageUrl,
          imageFile: effectiveImageFile,
          calcElapsedMonths: elapsed,
          calcAgingBucket: -1,
          calcStockQty: 0,
          calcStockBalanceAmount: 0,
          calcSaleStockQty: 0,
          calcRepairStockQty: 0,
          isReceivedAsOfTarget: false
        };
      }

      const bucket = Math.min(24, elapsed);
      const initQty = p.initialQty ?? p.totalQty;
      const initAmt = p.initialAmount ?? p.stockBalanceAmount ?? (initQty * p.purchaseUnitCost);
      const usedUpToTarget = usedQtyUpToTargetMap.get(p.id) || 0;
      const extraAddedQty = Math.max(0, p.totalQty - initQty);
      const calcQty = Math.max(0, initQty + extraAddedQty - usedUpToTarget);

      let calcAmt = 0;
      if (calcQty === p.totalQty && p.stockBalanceAmount !== undefined && extraAddedQty === 0) {
        calcAmt = p.stockBalanceAmount;
      } else if (calcQty === initQty && extraAddedQty === 0) {
        calcAmt = initAmt;
      } else if (initQty > 0) {
        const exactUnit = p.exactUnitCost ?? (initAmt / initQty);
        calcAmt = Math.round(calcQty * exactUnit);
      } else {
        calcAmt = calcQty * p.purchaseUnitCost;
      }

      const saleRatio = p.totalQty > 0 ? p.saleStockQty / p.totalQty : 0.6;
      const calcSale = calcQty === p.totalQty ? p.saleStockQty : Math.round(calcQty * saleRatio);
      const calcRepair = Math.max(0, calcQty - calcSale);

      return {
        ...p,
        isHandled,
        imageUrl: effectiveImageUrl,
        imageFile: effectiveImageFile,
        calcElapsedMonths: elapsed,
        calcAgingBucket: bucket,
        calcStockQty: calcQty,
        calcStockBalanceAmount: calcAmt,
        calcSaleStockQty: calcSale,
        calcRepairStockQty: calcRepair,
        isReceivedAsOfTarget: true
      };
    });
  }, [parts, targetYm, usedQtyUpToTargetMap, masterHandledMap]);

  // 0개월 ~ 23개월, 24개월이상 총 25개 경과월 버킷별 집계 매트릭스
  const agingBucketsSummary = useMemo(() => {
    const buckets = Array.from({ length: 25 }, (_, i) => ({
      bucket: i,
      label: i === 24 ? '24개월이상' : `${i}개월`,
      itemCount: 0,
      stockQty: 0,
      stockAmount: 0
    }));
    let unreceivedCount = 0;
    let totalActiveKinds = 0;
    let totalStockQty = 0;
    let totalStockAmount = 0;
    let totalSaleQty = 0;
    let totalRepairQty = 0;

    for (const bp of backcalculatedParts) {
      if (handlingFilter === 'HANDLED' && bp.isHandled === false) continue;
      if (handlingFilter === 'UNHANDLED' && bp.isHandled !== false) continue;
      if (!bp.isReceivedAsOfTarget || bp.calcStockQty <= 0) {
        if (!bp.isReceivedAsOfTarget) unreceivedCount += 1;
        continue;
      }
      const b = bp.calcAgingBucket;
      if (b >= 0 && b <= 24) {
        buckets[b].itemCount += 1;
        buckets[b].stockQty += bp.calcStockQty;
        buckets[b].stockAmount += bp.calcStockBalanceAmount;
      }
      totalActiveKinds += 1;
      totalStockQty += bp.calcStockQty;
      totalStockAmount += bp.calcStockBalanceAmount;
      totalSaleQty += bp.calcSaleStockQty;
      totalRepairQty += bp.calcRepairStockQty;
    }

    return {
      buckets,
      unreceivedCount,
      totalActiveKinds,
      totalStockQty,
      totalStockAmount,
      totalSaleQty,
      totalRepairQty
    };
  }, [backcalculatedParts, handlingFilter]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of partMasterList) {
      if (p.category) set.add(p.category);
    }
    for (const p of parts) {
      if (p.category) set.add(p.category);
    }
    return Array.from(set);
  }, [parts, partMasterList]);

  const filteredParts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return backcalculatedParts.filter(p => {
      if (!p.isReceivedAsOfTarget) return false;
      if (handlingFilter === 'HANDLED' && p.isHandled === false) return false;
      if (handlingFilter === 'UNHANDLED' && p.isHandled !== false) return false;
      if (brandFilter !== 'ALL' && (p.brand || 'HANGCHA') !== brandFilter) return false;
      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false;
      if (selectedAgingBucket !== 'ALL' && p.calcAgingBucket !== selectedAgingBucket) return false;
      if (!q) return true;
      return (
        p.partName.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q) ||
        p.compatibleModels.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.serialNo || '').toLowerCase().includes(q)
      );
    });
  }, [backcalculatedParts, handlingFilter, brandFilter, categoryFilter, selectedAgingBucket, searchTerm]);

  const filteredTotals = useMemo(() => {
    return filteredParts.reduce(
      (acc, p) => {
        acc.qty += p.calcStockQty;
        acc.amount += p.calcStockBalanceAmount;
        acc.saleQty += p.calcSaleStockQty;
        acc.repairQty += p.calcRepairStockQty;
        return acc;
      },
      { qty: 0, amount: 0, saleQty: 0, repairQty: 0 }
    );
  }, [filteredParts]);

  // 부품 마스터 제조사별 필터링 및 집계
  const manufacturerCounts = useMemo(() => {
    const counts: Record<string, { total: number; handled: number; unhandled: number }> = {
      ALL: { total: 0, handled: 0, unhandled: 0 }
    };
    for (const code of Object.keys(PART_MANUFACTURER_LABELS)) {
      counts[code] = { total: 0, handled: 0, unhandled: 0 };
    }
    for (const item of partMasterList) {
      const mCode = (item.manufacturer || item.brand || 'HANGCHA').toUpperCase();
      if (!counts[mCode]) counts[mCode] = { total: 0, handled: 0, unhandled: 0 };
      counts.ALL.total += 1;
      counts[mCode].total += 1;
      if (item.isHandled) {
        counts.ALL.handled += 1;
        counts[mCode].handled += 1;
      } else {
        counts.ALL.unhandled += 1;
        counts[mCode].unhandled += 1;
      }
    }
    return counts;
  }, [partMasterList]);

  const filteredMasterParts = useMemo(() => {
    const q = masterSearchTerm.trim().toLowerCase();
    return partMasterList.filter(item => {
      const mCode = (item.manufacturer || item.brand || 'HANGCHA').toUpperCase();
      if (masterManufacturerFilter !== 'ALL' && mCode !== masterManufacturerFilter) return false;
      if (masterCategoryFilter !== 'ALL' && item.category !== masterCategoryFilter) return false;
      if (masterHandlingFilter === 'HANDLED' && !item.isHandled) return false;
      if (masterHandlingFilter === 'UNHANDLED' && item.isHandled) return false;
      if (!q) return true;
      return (
        item.skuCode.toLowerCase().includes(q) ||
        item.partName.toLowerCase().includes(q) ||
        item.compatibleModels.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        getPartManufacturerLabel(mCode).toLowerCase().includes(q)
      );
    });
  }, [partMasterList, masterManufacturerFilter, masterCategoryFilter, masterHandlingFilter, masterSearchTerm]);

  const handleToggleMasterHandled = (masterItem: PartMasterItem) => {
    const nextHandled = !masterItem.isHandled;
    const nextMasterList = partMasterList.map(m =>
      m.id === masterItem.id ? { ...m, isHandled: nextHandled } : m
    );
    setPartMasterList(nextMasterList);
    savePartMasterList(nextMasterList);

    // 취급으로 전환된 부품이 재고 원장에 아직 없으면 재고 0개 항목으로 양쪽(유통/렌탈) 원장에 자동 편입
    if (nextHandled) {
      for (const targetMode of ['RENTAL', 'TRADE'] as const) {
        const currentInv = loadPartsInventory(targetMode);
        const exists = currentInv.some(p => p.skuCode === masterItem.skuCode || p.id === masterItem.id);
        if (!exists) {
          const newInvItem: PartInventoryItem = {
            id: masterItem.id,
            skuCode: masterItem.skuCode,
            partName: masterItem.partName,
            category: masterItem.category,
            brand: masterItem.manufacturer,
            manufacturer: masterItem.manufacturer,
            isHandled: true,
            inventoryType: '상품',
            currency: 'KRW',
            compatibleModels: masterItem.compatibleModels,
            spec: masterItem.spec,
            baseYm: '2026-04',
            inboundDate: '2026-04-01',
            inboundYm: '2026-04',
            agingMonths: 0,
            initialQty: 0,
            initialAmount: 0,
            totalQty: 0,
            saleStockQty: 0,
            repairStockQty: 0,
            minStockQty: masterItem.minStockQty,
            purchaseUnitCost: masterItem.purchaseUnitCost,
            exactUnitCost: masterItem.purchaseUnitCost,
            stockBalanceAmount: 0,
            saleUnitPrice: masterItem.saleUnitPrice,
            location: masterItem.location || '주기장',
            imageFile: masterItem.imageFile,
            imageUrl: masterItem.imageUrl,
            imageFileName: masterItem.imageFileName,
            createdDate: masterItem.createdDate || '2026-05-15'
          };
          savePartsInventory([newInvItem, ...currentInv], targetMode);
        }
      }
      setParts(loadPartsInventory(mode));
    }

    showToast(
      `부품 마스터 [${masterItem.skuCode}] ${masterItem.partName} 취급여부가 [${nextHandled ? '취급' : '미취급'}]으로 변경되었습니다.`
    );
  };

  const handleRegisterMasterPart = () => {
    const cleanSku = newMasterSku.trim();
    const cleanName = newMasterName.trim();
    if (!cleanSku || !cleanName) {
      showToast('부품 품번과 부품명을 입력하십시오.');
      return;
    }
    if (partMasterList.some(m => m.skuCode.toLowerCase() === cleanSku.toLowerCase())) {
      showToast(`이미 부품 마스터에 등록된 품번(${cleanSku})입니다.`);
      return;
    }

    const createdId = `PM-REG-${Date.now()}`;
    const newMaster: PartMasterItem = {
      id: createdId,
      skuCode: cleanSku,
      partName: cleanName,
      manufacturer: newMasterManufacturer,
      brand: newMasterManufacturer,
      category: newMasterCategory,
      compatibleModels: newMasterCompatibleModels.trim() || `${getPartManufacturerLabel(newMasterManufacturer)} 지게차 공용`,
      spec: newMasterSpec.trim() || `${cleanSku}_${cleanName}`,
      isHandled: newMasterIsHandled,
      purchaseUnitCost: Math.max(0, Number(newMasterPurchaseCost) || 0),
      saleUnitPrice: Math.max(0, Number(newMasterSalePrice) || 0),
      minStockQty: Math.max(1, Number(newMasterMinStock) || 1),
      location: newMasterLocation.trim() || '주기장 부품동',
      imageUrl: newMasterImageUrl.trim() || undefined,
      imageFile: newMasterImageFile.trim() || undefined,
      imageFileName: newMasterImageFile.trim() || undefined,
      createdDate: '2026-04-15'
    };

    const nextMasterList = [newMaster, ...partMasterList];
    setPartMasterList(nextMasterList);
    savePartMasterList(nextMasterList);

    if (newMasterIsHandled) {
      const newInv: PartInventoryItem = {
        id: createdId,
        skuCode: newMaster.skuCode,
        partName: newMaster.partName,
        category: newMaster.category,
        brand: newMaster.manufacturer,
        manufacturer: newMaster.manufacturer,
        isHandled: true,
        inventoryType: '상품',
        currency: 'KRW',
        compatibleModels: newMaster.compatibleModels,
        spec: newMaster.spec,
        baseYm: '2026-04',
        inboundDate: '2026-04-01',
        inboundYm: '2026-04',
        agingMonths: 0,
        initialQty: 0,
        initialAmount: 0,
        totalQty: 0,
        saleStockQty: 0,
        repairStockQty: 0,
        minStockQty: newMaster.minStockQty,
        purchaseUnitCost: newMaster.purchaseUnitCost,
        exactUnitCost: newMaster.purchaseUnitCost,
        stockBalanceAmount: 0,
        saleUnitPrice: newMaster.saleUnitPrice,
        location: newMaster.location,
        imageUrl: newMaster.imageUrl,
        imageFile: newMaster.imageFile,
        imageFileName: newMaster.imageFileName,
        createdDate: '2026-04-15'
      };
      for (const targetMode of ['RENTAL', 'TRADE'] as const) {
        const curInv = loadPartsInventory(targetMode);
        savePartsInventory([newInv, ...curInv], targetMode);
      }
      setParts(loadPartsInventory(mode));
    }

    setNewMasterSku('');
    setNewMasterName('');
    setNewMasterSpec('');
    setShowMasterRegisterModal(false);
    showToast(
      `부품 마스터 등록 완료 · [${getPartManufacturerLabel(newMaster.manufacturer)}] ${newMaster.skuCode} (${newMaster.isHandled ? '취급' : '미취급'})`
    );
  };

  const filteredUsageHistory = useMemo(() => {
    return usageHistory.filter(u => {
      if (assetFilter !== 'ALL' && u.assetId !== assetFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        return (
          u.assetNo.toLowerCase().includes(q) ||
          u.partName.toLowerCase().includes(q) ||
          u.skuCode.toLowerCase().includes(q) ||
          u.repairSummary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [usageHistory, assetFilter, searchTerm]);

  const handleInboundSubmit = () => {
    const safeQty = Math.max(1, Math.floor(Number(inboundQty) || 1));
    setParts(prev => {
      const next = prev.map(p => {
        if (p.id !== targetPartId) return p;
        const addSale = inboundPurpose === 'SALE' ? safeQty : 0;
        const addRepair = inboundPurpose === 'REPAIR' ? safeQty : 0;
        const addedQty = addSale + addRepair;
        const addedAmt = Math.round(addedQty * (p.exactUnitCost || p.purchaseUnitCost));
        return {
          ...p,
          saleStockQty: p.saleStockQty + addSale,
          repairStockQty: p.repairStockQty + addRepair,
          totalQty: p.totalQty + addedQty,
          stockBalanceAmount: (p.stockBalanceAmount ?? p.totalQty * p.purchaseUnitCost) + addedAmt
        };
      });
      savePartsInventory(next, mode);
      return next;
    });
    setShowInboundForm(false);
    showToast(`부품 입고 등록 완료 · ${inboundPurpose === 'REPAIR' ? '렌탈자산 정비용' : '유통 판매용'} 재고 ${safeQty}개가 반영되었습니다.`);
  };

  // 원본 39컬럼 양식 그대로 엑셀 다운로드 (기준년월 역산 기준)
  const handleExportAgingExcel = () => {
    const excelRows = filteredParts.map((p, idx) => {
      const rowObj: Record<string, any> = {
        '순번': idx + 1,
        '기준년월': targetYm.replace('-', '.'),
        '최초입고일': p.inboundDate || '2026-04-01',
        '경과월수': p.calcAgingBucket,
        '품번': p.skuCode,
        '자재 내역': `${p.skuCode}_${p.partName}`,
        '제품종류': p.category,
        '호환모델': p.compatibleModels,
        '취급여부': p.isHandled === false ? '미취급' : '취급',
        '총재고': p.calcStockQty,
        '보관장소': p.location || '주기장',
        '공급업체명': p.brand || 'HANGCHA',
        '재고구분': p.inventoryType || '상품',
        '통화': p.currency || 'KRW',
        '총금액': p.calcStockBalanceAmount
      };
      for (let m = 0; m < 24; m++) {
        rowObj[`${m}개월금액`] = p.calcAgingBucket === m ? p.calcStockBalanceAmount : 0;
      }
      rowObj['24개월이상금액'] = p.calcAgingBucket === 24 ? p.calcStockBalanceAmount : 0;
      rowObj['시리얼번호'] = p.serialNo || '';
      rowObj['생성일'] = p.createdDate || '2026-05-13';
      rowObj['이미지파일'] = p.imageFile || '';
      rowObj['이미지출처'] = p.imageUrl || '';
      return rowObj;
    });

    exportToExcel(
      excelRows,
      `무진글로벌_${isTradeMode ? '부품관리유통' : '부품관리렌탈'}_경과월역산_${targetYm}`,
      'Data'
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: '12.5px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      {/* 상단 헤더 및 탭 스위치 */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
              {isTradeMode
                ? '부품관리-유통 · 부품재고리스트 및 부품 마스터 원장'
                : '부품관리-렌탈 · 부품재고리스트 및 부품 마스터 원장'}
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSubTab('INVENTORY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'INVENTORY' ? 'var(--primary)' : 'transparent',
              color: subTab === 'INVENTORY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Boxes size={14} />
            <span>부품 통합 재고 · 월별 경과 집계</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('MASTER')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'MASTER' ? '#0f766e' : 'transparent',
              color: subTab === 'MASTER' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <Layers size={14} />
            <span>부품 마스터 · 제조사별 조회·등록·취급여부</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('ASSET_HISTORY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'ASSET_HISTORY' ? '#059669' : 'transparent',
              color: subTab === 'ASSET_HISTORY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <History size={14} />
            <span>{isTradeMode ? '유통 부품 출고·사용이력 원장' : '렌탈자산별 부품사용이력 원장'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('CATALOG')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'CATALOG' ? '#7c3aed' : 'transparent',
              color: subTab === 'CATALOG' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FileSpreadsheet size={14} />
            <span>호환부품 카탈로그 · 주문서</span>
          </button>
        </div>
      </div>

      {subTab === 'CATALOG' ? (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <CompatiblePartsCatalogOrderPage />
        </div>
      ) : subTab === 'MASTER' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
          {/* 제조사 기준 조회 및 등록 컨트롤 바 */}
          <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  제조사 기준 부품 마스터 조회
                </span>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setMasterManufacturerFilter('ALL')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: masterManufacturerFilter === 'ALL' ? '2px solid #0f766e' : '1px solid var(--border-color)',
                      backgroundColor: masterManufacturerFilter === 'ALL' ? '#f0fdf4' : 'var(--bg-app)',
                      color: masterManufacturerFilter === 'ALL' ? '#0f766e' : 'var(--text-primary)',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    전체 제조사 {manufacturerCounts.ALL.total}종 · 취급 {manufacturerCounts.ALL.handled} / 미취급 {manufacturerCounts.ALL.unhandled}
                  </button>
                  {Object.entries(PART_MANUFACTURER_LABELS).map(([code, label]) => {
                    const stat = manufacturerCounts[code] || { total: 0, handled: 0, unhandled: 0 };
                    const active = masterManufacturerFilter === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setMasterManufacturerFilter(active ? 'ALL' : code)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: active ? '2px solid #0f766e' : '1px solid var(--border-color)',
                          backgroundColor: active ? '#f0fdf4' : '#ffffff',
                          color: active ? '#0f766e' : 'var(--text-primary)',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {label} {stat.total}종 · 취급 {stat.handled} / 미취급 {stat.unhandled}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowReusableImagePicker(true)}
                  className="btn btn-secondary"
                  style={{ padding: '7px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                >
                  <ImageIcon size={14} />
                  <span>부품 이미지 보관함 ({reusableImageLibrary.length}건 재사용)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowMasterRegisterModal(prev => !prev)}
                  className="btn btn-primary"
                  style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} />
                  <span>부품 마스터 신규 등록</span>
                </button>
              </div>
            </div>

            {/* 마스터 상세 필터 행 (상하 스택 레이블 준수) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사 선택</label>
                  <select
                    value={masterManufacturerFilter}
                    onChange={e => setMasterManufacturerFilter(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 제조사</option>
                    {Object.entries(PART_MANUFACTURER_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>취급여부 구분</label>
                  <select
                    value={masterHandlingFilter}
                    onChange={e => setMasterHandlingFilter(e.target.value as any)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 · 취급 및 미취급</option>
                    <option value="HANDLED">취급 부품만 보기</option>
                    <option value="UNHANDLED">미취급 부품만 보기</option>
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제품종류 · 계통분류</label>
                  <select
                    value={masterCategoryFilter}
                    onChange={e => setMasterCategoryFilter(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 제품종류</option>
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>마스터 품번 · 부품명 · 모델 검색</label>
                  <div style={{ position: 'relative', width: '260px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      value={masterSearchTerm}
                      onChange={e => setMasterSearchTerm(e.target.value)}
                      placeholder="품번, 부품명, 제조사, 호환모델 검색"
                      style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 부품 마스터 신규 등록 폼 (이미지 파일 재사용 연동) */}
          {showMasterRegisterModal && (
            <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #0f766e', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f766e' }}>
                  부품 마스터 신규 등록 · 제조사 기준 등록 및 취급여부 결정
                </span>
                <button
                  type="button"
                  onClick={() => setShowReusableImagePicker(true)}
                  className="btn btn-secondary"
                  style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <ImageIcon size={13} />
                  <span>보관함에서 이미지 파일 재사용 선택</span>
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>제조사</label>
                  <select
                    value={newMasterManufacturer}
                    onChange={e => setNewMasterManufacturer(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  >
                    {Object.entries(PART_MANUFACTURER_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>부품 품번</label>
                  <input
                    type="text"
                    value={newMasterSku}
                    onChange={e => setNewMasterSku(e.target.value)}
                    placeholder="예: N163-220055-000"
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>부품명</label>
                  <input
                    type="text"
                    value={newMasterName}
                    onChange={e => setNewMasterName(e.target.value)}
                    placeholder="예: 마스트 메인 롤러 베어링"
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>제품종류 · 계통</label>
                  <select
                    value={newMasterCategory}
                    onChange={e => setNewMasterCategory(e.target.value)}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  >
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>적용 지게차 모델</label>
                  <input
                    type="text"
                    value={newMasterCompatibleModels}
                    onChange={e => setNewMasterCompatibleModels(e.target.value)}
                    placeholder="적용 모델명 입력"
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>기준 매입단가</label>
                  <input
                    type="number"
                    min={0}
                    value={newMasterPurchaseCost}
                    onChange={e => setNewMasterPurchaseCost(Math.max(0, Number(e.target.value) || 0))}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>기준 판매단가</label>
                  <input
                    type="number"
                    min={0}
                    value={newMasterSalePrice}
                    onChange={e => setNewMasterSalePrice(Math.max(0, Number(e.target.value) || 0))}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>취급여부 결정</label>
                  <select
                    value={newMasterIsHandled ? 'HANDLED' : 'UNHANDLED'}
                    onChange={e => setNewMasterIsHandled(e.target.value === 'HANDLED')}
                    style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', fontWeight: 700 }}
                  >
                    <option value="HANDLED">취급 부품</option>
                    <option value="UNHANDLED">미취급 부품</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                  {newMasterImageUrl && (
                    <img
                      src={newMasterImageUrl}
                      alt="선택된 부품 이미지"
                      style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: '#fff' }}
                    />
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      재사용 이미지 URL 또는 신규 이미지 경로 (재사용 파일명: {newMasterImageFile || '미지정'})
                    </label>
                    <input
                      type="text"
                      value={newMasterImageUrl}
                      onChange={e => setNewMasterImageUrl(e.target.value)}
                      placeholder="보관함에서 이미지를 선택하거나 이미지 URL을 입력하십시오"
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={handleRegisterMasterPart}
                    className="btn btn-primary"
                    style={{ padding: '7px 16px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    마스터 등록 확정
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMasterRegisterModal(false)}
                    className="btn btn-secondary"
                    style={{ padding: '7px 12px', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 부품 마스터 테이블 */}
          <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>취급여부 결정</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>순번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>제조사</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>부품 이미지</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품 품번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>제품종류 · 계통</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>적용 지게차 모델</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>기준 매입단가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>기준 판매단가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>안전재고 기준</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>보관위치</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMasterParts.map((m, idx) => {
                    const mLabel = getPartManufacturerLabel(m.manufacturer || m.brand);
                    return (
                      <tr
                        key={m.id}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          height: '40px',
                          backgroundColor: m.isHandled ? 'transparent' : 'rgba(241, 245, 249, 0.65)'
                        }}
                      >
                        <td style={{ padding: '5px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => handleToggleMasterHandled(m)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              border: m.isHandled ? '1px solid #16a34a' : '1px solid #94a3b8',
                              backgroundColor: m.isHandled ? '#dcfce7' : '#f1f5f9',
                              color: m.isHandled ? '#166534' : '#475569',
                              fontSize: '11.5px',
                              fontWeight: 800,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {m.isHandled ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            <span>{m.isHandled ? '취급' : '미취급'}</span>
                          </button>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 800, color: '#0f766e', whiteSpace: 'nowrap' }}>{mLabel}</td>
                        <td style={{ padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {m.imageUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewPartImage({
                                  skuCode: m.skuCode,
                                  partName: m.partName,
                                  brand: mLabel,
                                  category: m.category,
                                  compatibleModels: m.compatibleModels,
                                  imageUrl: m.imageUrl,
                                  imageFile: m.imageFile,
                                  imageFileName: m.imageFileName
                                })
                              }
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                cursor: 'pointer'
                              }}
                            >
                              <img
                                src={m.imageUrl}
                                alt={m.partName}
                                loading="lazy"
                                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '3px' }}
                              />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>원본보기</span>
                            </button>
                          ) : (
                            <span style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, backgroundColor: '#f1f5f9', color: '#64748b' }}>
                              이미지 미등록
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{m.skuCode}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{m.partName}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{m.category}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{m.compatibleModels}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{m.purchaseUnitCost.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>₩{m.saleUnitPrice.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>{m.minStockQty}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 우하단 부품 마스터 집계 바 */}
            <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-app)', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                부품 마스터 조회 결과 {filteredMasterParts.length.toLocaleString('ko-KR')}종 · 재사용 가능 이미지 {reusableImageLibrary.length.toLocaleString('ko-KR')}건
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                <span>전체 등록 마스터: <strong>{manufacturerCounts.ALL.total.toLocaleString('ko-KR')}종</strong></span>
                <span>취급 부품: <strong style={{ color: '#166534' }}>{manufacturerCounts.ALL.handled.toLocaleString('ko-KR')}종</strong></span>
                <span>미취급 부품: <strong style={{ color: '#64748b' }}>{manufacturerCounts.ALL.unhandled.toLocaleString('ko-KR')}종</strong></span>
              </div>
            </div>
          </div>
        </div>
      ) : subTab === 'INVENTORY' ? (
        <>
          {/* 1개월 단위 경과월수별 재고잔량 · 재고잔액 역산 매트릭스 바 */}
          <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  입고연월 기준 1개월 단위 경과별 재고잔량 · 재고잔액 재집계
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-app)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <button
                    type="button"
                    onClick={() => setTargetYm(prev => shiftYearMonth(prev, -1))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
                    title="이전 1개월"
                  >
                    <ChevronLeft size={14} /> 1개월 전
                  </button>
                  <input
                    type="month"
                    value={targetYm}
                    onChange={e => setTargetYm(e.target.value || '2026-04')}
                    style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '12.5px', fontWeight: 800 }}
                  />
                  <button
                    type="button"
                    onClick={() => setTargetYm(prev => shiftYearMonth(prev, 1))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: '12px', color: 'var(--text-primary)' }}
                    title="다음 1개월"
                  >
                    1개월 후 <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTargetYm('2026-04');
                      setSelectedAgingBucket('ALL');
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '3px 8px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    기준월 2026-04 복원
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>경과월 구간:</span>
                  <select
                    value={selectedAgingBucket}
                    onChange={e => setSelectedAgingBucket(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    <option value="ALL">전체 경과월 구간</option>
                    {agingBucketsSummary.buckets.map(b => (
                      <option key={b.bucket} value={b.bucket}>{b.label} 경과 ({b.itemCount}종)</option>
                    ))}
                  </select>
                </div>
                {selectedAgingBucket !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedAgingBucket('ALL')}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                  >
                    경과월 필터 해제
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportAgingExcel}
                  className="btn-excel-download"
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
                >
                  <Download size={13} /> 39컬럼 경과월 재고잔액 엑셀 내보내기
                </button>
              </div>
            </div>
          </div>

          {/* 필터 및 검색 컨트롤 바 */}
          <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사 · 브랜드</label>
                <select
                  value={brandFilter}
                  onChange={e => setBrandFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 제조사</option>
                  {Object.entries(PART_MANUFACTURER_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제품종류 · 계통분류</label>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                >
                  <option value="ALL">전체 제품종류</option>
                  {categoryOptions.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>마스터 취급여부</label>
                <select
                  value={handlingFilter}
                  onChange={e => setHandlingFilter(e.target.value as any)}
                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', whiteSpace: 'nowrap' }}
                >
                  <option value="HANDLED">취급 부품만</option>
                  <option value="ALL">전체 · 미취급 포함</option>
                  <option value="UNHANDLED">미취급 부품만</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>품번 · 품명 · 모델 검색</label>
                <div style={{ position: 'relative', width: '260px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="품번, 부품명, 호환 지게차 모델 검색"
                    style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setSubTab('MASTER')}
                className="btn btn-secondary"
                style={{ padding: '7px 12px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <Layers size={14} />
                <span>부품 마스터 취급설정</span>
              </button>
              <button
                type="button"
                onClick={() => setShowInboundForm(prev => !prev)}
                className="btn btn-primary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <Plus size={14} />
                <span>부품 구매입고 등록</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab(isTradeMode ? 'trade_outbound_inspection' : 'repairs')}
                className="btn btn-secondary"
                style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                <span>{isTradeMode ? '출고관리-유통으로 이동' : '정비관리-렌탈에서 부품 사용 등록'}</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {showInboundForm && (
            <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>부품 입고 등록</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '10px', alignItems: 'end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>입고 부품 선택 (취급 부품)</label>
                  <select value={targetPartId} onChange={e => setTargetPartId(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                    {parts.filter(p => p.isHandled !== false).map(p => (
                      <option key={p.id} value={p.id}>[{getPartManufacturerLabel(p.brand)}] {p.skuCode} · {p.partName}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>보유 용도 구분</label>
                  <select value={inboundPurpose} onChange={e => setInboundPurpose(e.target.value as any)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}>
                    <option value="SALE">유통 판매용 재고</option>
                    <option value="REPAIR">렌탈자산 정비용 재고</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11.5px', fontWeight: 700 }}>입고 수량</label>
                  <input type="number" min={1} value={inboundQty} onChange={e => setInboundQty(Math.max(1, Number(e.target.value) || 1))} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }} />
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button type="button" onClick={handleInboundSubmit} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>입고 확정</button>
                  <button type="button" onClick={() => setShowInboundForm(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12.5px', whiteSpace: 'nowrap' }}>취소</button>
                </div>
              </div>
            </div>
          )}

          {/* 부품 재고 대장 테이블 */}
          <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>순번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>취급여부</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>부품 이미지</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품 품번</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>부품명</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>제조사</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>제품종류 · 계통</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>적용 지게차 모델</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>최초입고일</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>입고연월</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>경과월수</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>유통판매용</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>렌탈정비용</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>재고수량</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>매입단가</th>
                    <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>재고잔액</th>
                    <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>시리얼번호</th>
                    <th style={{ padding: '9px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>보관위치</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredParts.map((p, idx) => {
                    const brandLabel = getPartManufacturerLabel(p.brand);
                    const agingLabel = p.calcAgingBucket === 24 ? '24개월이상' : `${p.calcAgingBucket}개월`;
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)', height: '39px' }}>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{idx + 1}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: p.isHandled === false ? '#f1f5f9' : '#dcfce7',
                              color: p.isHandled === false ? '#64748b' : '#166534'
                            }}
                          >
                            {p.isHandled === false ? '미취급' : '취급'}
                          </span>
                        </td>
                        <td style={{ padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {p.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewPartImage(p)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                cursor: 'pointer'
                              }}
                              title={`${p.skuCode} · ${p.partName} 원본 사진 보기`}
                            >
                              <img
                                src={p.imageUrl}
                                alt={p.partName}
                                loading="lazy"
                                style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '3px' }}
                              />
                              <span style={{ fontSize: '11px', fontWeight: 700, color: '#0369a1' }}>원본보기</span>
                            </button>
                          ) : (
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#f1f5f9',
                                color: '#64748b'
                              }}
                            >
                              이미지 획득 불가
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{p.skuCode}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 800, whiteSpace: 'nowrap' }}>{p.partName}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>{brandLabel}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{p.category}</td>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.compatibleModels}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.inboundDate || '2026-04-01'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.inboundYm || '2026-04'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 800,
                              backgroundColor: p.calcAgingBucket >= 12 ? '#fef3c7' : '#dcfce7',
                              color: p.calcAgingBucket >= 12 ? '#b45309' : '#166534'
                            }}
                          >
                            {agingLabel}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#1d4ed8', whiteSpace: 'nowrap' }}>{p.calcSaleStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>{p.calcRepairStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, whiteSpace: 'nowrap' }}>{p.calcStockQty.toLocaleString('ko-KR')}개</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{p.purchaseUnitCost.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 900, color: '#7c3aed', whiteSpace: 'nowrap' }}>₩{p.calcStockBalanceAmount.toLocaleString('ko-KR')}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{p.serialNo || '-'}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{p.location}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 우하단 대차대조 합계 검증 바 (헌장 3.5 Z-Pattern 4단계) */}
            <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-app)', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                기준년월 {targetYm} · 조회 품목 {filteredParts.length.toLocaleString('ko-KR')}종
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                <span>유통판매용: <strong style={{ color: '#1d4ed8' }}>{filteredTotals.saleQty.toLocaleString('ko-KR')}개</strong></span>
                <span>렌탈정비용: <strong style={{ color: '#059669' }}>{filteredTotals.repairQty.toLocaleString('ko-KR')}개</strong></span>
                <span>재고수량 합계: <strong style={{ color: 'var(--primary)' }}>{filteredTotals.qty.toLocaleString('ko-KR')}개</strong></span>
                <span>재고잔액 합계: <strong style={{ color: '#7c3aed' }}>₩{filteredTotals.amount.toLocaleString('ko-KR')}</strong></span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="card" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800, whiteSpace: 'nowrap' }}>
                {isTradeMode ? '유통 부품 출고·사용이력 원장' : '렌탈자산 정비 부품사용이력 원장'}
              </span>
              <select
                value={assetFilter}
                onChange={e => setAssetFilter(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
              >
                <option value="ALL">전체 대상 장비</option>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab(isTradeMode ? 'trade_outbound_inspection' : 'repairs')}
              className="btn btn-primary"
              style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <span>{isTradeMode ? '출고관리-유통으로 이동' : '정비관리-렌탈에서 신규 정비·부품차감 입력'}</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>사용일자</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>전표번호</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>자산번호·모델명</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>투입 부품 품번·품명</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>사용수량</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>부품단가</th>
                  <th style={{ padding: '9px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>부품원가 합계</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>담당자</th>
                  <th style={{ padding: '9px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>이력 기록 내역</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsageHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '32px 10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      등록된 부품 사용 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredUsageHistory.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)', height: '40px' }}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{u.usedDate}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{u.repairTicketNo}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <strong>{u.assetNo}</strong> · {u.modelName}
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>[{u.skuCode}]</span> <strong>{u.partName}</strong>
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, whiteSpace: 'nowrap' }}>{u.usedQty}개</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>₩{u.unitCost.toLocaleString('ko-KR')}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 800, color: '#d97706', whiteSpace: 'nowrap' }}>₩{u.totalPartCost.toLocaleString('ko-KR')}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{u.mechanicName}</td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{u.repairSummary}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 우하단 대차대조 합계 검증 바 */}
          <div style={{ padding: '10px 16px', backgroundColor: 'var(--bg-app)', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              부품 출고·사용 이력: 총 {filteredUsageHistory.length.toLocaleString('ko-KR')}건
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '13px', fontWeight: 800, whiteSpace: 'nowrap' }}>
              <span>사용수량 합계: <strong style={{ color: 'var(--primary)' }}>{filteredUsageHistory.reduce((s, u) => s + u.usedQty, 0).toLocaleString('ko-KR')}개</strong></span>
              <span>부품원가 합계: <strong style={{ color: '#d97706' }}>₩{filteredUsageHistory.reduce((s, u) => s + u.totalPartCost, 0).toLocaleString('ko-KR')}</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* 부품 이미지 파일 재사용 선택 모달 */}
      {showReusableImagePicker && (
        <div
          onClick={() => setShowReusableImagePicker(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1350
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              width: '860px',
              maxWidth: '95vw',
              maxHeight: '85vh',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  부품 이미지 파일 재사용 보관함 · 총 {reusableImageLibrary.length}건
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  부품관리-유통 · 부품관리-렌탈 · 부품 마스터에서 모든 부품 이미지 파일을 공유 및 재사용합니다.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReusableImagePicker(false)}
                className="btn btn-secondary"
                style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 700 }}
              >
                닫기
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>이미지 보관함 품번 · 부품명 · 파일명 검색</label>
              <input
                type="text"
                value={imagePickerSearch}
                onChange={e => setImagePickerSearch(e.target.value)}
                placeholder="품번, 부품명, 계통분류 검색"
                style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0 }}>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>선택</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>미리보기</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>제조사</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>원본 품번</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>원본 부품명</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>이미지 파일명</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReusableImages.slice(0, 120).map((img, i) => (
                    <tr key={`${img.skuCode}-${i}`} style={{ borderBottom: '1px solid var(--border-color)', height: '42px' }}>
                      <td style={{ padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => {
                            setNewMasterImageUrl(img.imageUrl);
                            setNewMasterImageFile(img.imageFileName || img.imageFile);
                            setShowReusableImagePicker(false);
                            setShowMasterRegisterModal(true);
                            showToast(`이미지 재사용 선택 완료 · ${img.imageFileName || img.skuCode}`);
                          }}
                          className="btn btn-primary"
                          style={{ padding: '4px 10px', fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}
                        >
                          이 이미지 재사용
                        </button>
                      </td>
                      <td style={{ padding: '4px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <img
                          src={img.imageUrl}
                          alt={img.partName}
                          loading="lazy"
                          style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}
                        />
                      </td>
                      <td style={{ padding: '4px 10px', textAlign: 'center', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {getPartManufacturerLabel(img.manufacturer)}
                      </td>
                      <td style={{ padding: '4px 10px', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>{img.skuCode}</td>
                      <td style={{ padding: '4px 10px', fontWeight: 700, whiteSpace: 'nowrap' }}>{img.partName}</td>
                      <td style={{ padding: '4px 10px', color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{img.imageFileName || img.imageFile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {previewPartImage && (
        <div
          onClick={() => setPreviewPartImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1300
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--bg-card)',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              width: '540px',
              maxWidth: '94vw',
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  [{previewPartImage.skuCode}] {previewPartImage.partName}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {getPartManufacturerLabel(previewPartImage.brand)} · {previewPartImage.category} · {previewPartImage.compatibleModels}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPartImage(null)}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', fontWeight: 700 }}
              >
                닫기
              </button>
            </div>

            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px'
              }}
            >
              <img
                src={previewPartImage.imageUrl}
                alt={previewPartImage.partName}
                style={{ maxWidth: '100%', maxHeight: '380px', objectFit: 'contain' }}
              />
            </div>

            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
              <span>파일명: {previewPartImage.imageFileName || previewPartImage.imageFile}</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (previewPartImage.imageUrl) {
                      setNewMasterImageUrl(previewPartImage.imageUrl);
                      setNewMasterImageFile(previewPartImage.imageFileName || previewPartImage.imageFile || '');
                      setPreviewPartImage(null);
                      setSubTab('MASTER');
                      setShowMasterRegisterModal(true);
                      showToast('선택한 부품 이미지가 신규 부품 마스터 등록 폼에 재사용 연결되었습니다.');
                    }
                  }}
                  style={{ border: 'none', background: 'transparent', color: '#0f766e', fontWeight: 800, cursor: 'pointer', fontSize: '11.5px', padding: 0 }}
                >
                  신규 부품 등록에 이 이미지 재사용
                </button>
                <a
                  href={previewPartImage.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}
                >
                  새 창에서 원본 열기
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default PartsManagePage;
