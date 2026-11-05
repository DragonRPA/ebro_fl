import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { useTrade } from '../context/TradeContext';
import { Search, Download, Eye, Layers, Edit2, Save, X, Wrench, RefreshCw, PlusCircle, ShoppingBag, CheckCircle2, AlertCircle, FileText } from 'lucide-react';
import { exportToExcel } from '../services/excel';
import { Asset, calculateAssetDepreciation, AssetInOutLog, Repair, isVirtualAsset } from '../services/db';
import { ASSET_STATUS_SSOT, getAssetStatusLabel, getAssetStatusBadgeClass } from '../config/asset_status_config';
import { canViewFinancials } from '../utils/privacyMasking';
import { SortableTh } from '../components/SortableTh';
import { useSortableData } from '../hooks/useSortableData';
import { createHangulMatcher } from '../utils/hangulSearch';
import { FL_TECHNICAL_ARCHIVE } from '../data/flTechnicalArchive';
import { MUJIN_OPTION_MASTERS } from '../data/mujinGlobalInitialData';

export const Assets: React.FC = () => {
  const { 
    assets, customers, sites, contracts, contractAssets, hasPermission, 
    saveAsset, showErrorModal, loadTablesForMenu, assetInOutLogs, repairs, 
    vendors, products, setActiveTab: setGlobalActiveTab, currentUser
  } = useApp();
  const { transferRentalAssetToTradeLot } = useTrade();

  // [아이디어 #4] 렌탈 유형자산에서 유통 중고상품 재고 전배 폼 상태
  const [showTransferToTradeForm, setShowTransferToTradeForm] = useState(false);
  const [trfMethod, setTrfMethod] = useState<'DEPRECIATION_BOOK' | 'REVENUE_DEDUCT_BOOK'>('DEPRECIATION_BOOK');
  const [trfRefurbCost, setTrfRefurbCost] = useState<number>(0);
  const [trfWarehouse, setTrfWarehouse] = useState<string>('A창고');
  const [trfMemoText, setTrfMemoText] = useState<string>('');

  const canEdit = hasPermission('asset', 'save');
  //  부서별 단가/재무 정보 접근 통제 (경영진, 관리부, 영업부만 열람 허용)
  const hasFinancialAccess = canViewFinancials(currentUser);

  // 토스트 알림 상태
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 검색 및 필터 상태 (즉시 반응형 로딩: 헌장 1.1 & 1.2)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [ownerFilter, setOwnerFilter] = useState('ALL');
  const [natureFilter, setNatureFilter] = useState<'ALL' | 'PHYSICAL' | 'VIRTUAL'>('ALL');
  const [yardFilter, setYardFilter] = useState('ALL');
  const [feetFilter, setFeetFilter] = useState('ALL');
  const [manufacturerFilter, setManufacturerFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('ALL');

  // 상세조회 Dossier 슬라이드오버 및 수정 상태
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Asset>>({});
  const [showHistoryToggle, setShowHistoryToggle] = useState(false);
  const [isSavingAsset, setIsSavingAsset] = useState(false);
  const [showAssetSpecModal, setShowAssetSpecModal] = useState(false);

  // ──  [초고속 O(1) 룩업 인덱싱 해시맵: 헌장 1.1] ──
  const customerMap = useMemo(() => new Map((customers || []).map(c => [c.id, c.name])), [customers]);
  const siteMap = useMemo(() => new Map((sites || []).map(s => [s.id, s.name])), [sites]);
  const vendorMap = useMemo(() => new Map((vendors || []).map(v => [v.id, v.name])), [vendors]);
  const productByModelMap = useMemo(() => {
    const map = new Map<string, any>();
    (products || []).forEach(p => {
      if (p.modelName) {
        map.set(p.modelName, p);
        map.set(p.modelName.replace(/[\s\-_]/g, '').toUpperCase(), p);
      }
      if (p.shortName) {
        map.set(p.shortName.replace(/[\s\-_]/g, '').toUpperCase(), p);
      }
    });
    return map;
  }, [products]);
  const productFeetMap = useMemo(() => {
    const map = new Map<string, string>();
    (products || []).forEach(p => {
      if (p.modelName) map.set(p.modelName, p.feet ? `${p.feet} ft` : '');
    });
    return map;
  }, [products]);
  const externalRepairByAssetIdMap = useMemo(() => {
    const map = new Map<string, Repair>();
    (repairs || []).forEach(r => {
      if (r.assetId && r.status === 'IN_PROGRESS' && r.maintenanceType === 'EXTERNAL' && !map.has(r.assetId)) {
        map.set(r.assetId, r);
      }
    });
    return map;
  }, [repairs]);

  // 계약번호 O(1) 사전 인덱싱 (기존 380만 번 반복 순회 제거)
  const contractMap = useMemo(() => {
    const map = new Map<string, { contractNo: string; contractId: string; status?: string }>();
    if (!contractAssets || !contracts) return map;
    const contractsById = new Map<string, any>((contracts || []).map(c => [c.id, c]));
    for (const ca of contractAssets) {
      if (!ca.assetId || ca.status === 'RETURNED') continue;
      const c = contractsById.get(ca.contractId);
      if (c) {
        // 우선순위 1: 현재 RENTED 상태인 계약자산이 가장 최우선 (실제 대여중)
        // 우선순위 2: ASSIGNED 상태
        // 우선순위 3: 계약 상태가 ACTIVE
        const existing = map.get(ca.assetId);
        
        let shouldUpdate = false;
        if (!existing) {
          shouldUpdate = true;
        } else {
          // 이미 값이 있다면 상태 우선순위 비교 (RENTED > ASSIGNED > 그외)
          if (ca.status === 'RENTED') {
            shouldUpdate = true;
          } else if (ca.status === 'ASSIGNED' && existing.status !== 'RENTED') {
            shouldUpdate = true;
          } else if (c.status === 'ACTIVE' && existing.status !== 'RENTED' && existing.status !== 'ASSIGNED') {
            shouldUpdate = true;
          }
        }
        
        if (shouldUpdate) {
          map.set(ca.assetId, { 
            contractNo: c.contractNo, 
            contractId: c.id,
            status: ca.status // for priority tracking
          });
        }
      }
    }
    return map;
  }, [contractAssets, contracts]);

  // 헬퍼: 외부 임차(전대) 자산 임차처명 (O(1) 즉각 조회)
  const getAssetRenterName = (a: Asset): string => {
    if (a.ownerType !== 'RENTED') return '-';
    if (a.renter) return a.renter;
    if (a.vendorId) return vendorMap.get(a.vendorId) || '-';
    return '-';
  };

  // 헬퍼: 당사자산 구입처(공급처) 명칭 (O(1) 즉각 조회)
  const getAssetSupplierName = (a: Asset): string => {
    if (a.ownerType !== 'OWNED') return '-';
    if (a.supplier) return a.supplier;
    if (a.vendorId) return vendorMap.get(a.vendorId) || '-';
    return '-';
  };

  // 헬퍼: 모델별 규격(피트) 조회 (O(1) 즉각 조회)
  const getAssetFeet = (a: Asset): string => {
    const feet = productFeetMap.get(a.modelName);
    if (feet) return feet;
    const m = a.modelName.match(/(\d{2})/);
    return m ? `${m[1]} ft` : '-';
  };

  // 헬퍼: 모델별 제조사 조회 (자산 manufacturer 미입력 시 제품정보 SSOT 자동 매칭)
  const getAssetManufacturer = (a: Asset): string => {
    const prod = productByModelMap.get(a.modelName) || (a.modelName ? productByModelMap.get(a.modelName.replace(/[\s\-_]/g, '').toUpperCase()) : undefined);
    if (prod?.manufacturer && String(prod.manufacturer).trim()) {
      return String(prod.manufacturer).trim();
    }
    return (a.manufacturer && String(a.manufacturer).trim()) || '-';
  };

  const getCustomerName = (id?: string) => {
    if (!id) return '-';
    return customerMap.get(id) || '-';
  };

  const getSiteName = (id?: string) => {
    if (!id) return '-';
    return siteMap.get(id) || '-';
  };

  // 활성 계약 정보 O(1) 룩업
  const getAssetContractInfo = (assetId?: string): { contractNo: string; contractId: string } | null => {
    if (!assetId) return null;
    return contractMap.get(assetId) || null;
  };

  // 임차처에 반납 완료된 외부 임차자산(RENTED_RETURNED 또는 actualRentReturnDate 존재)은 자산 관리 대장 조회 및 수량 집계에서 원천 제외
  const managedAssets = useMemo(
    () => assets.filter(a => !(a.status === 'RENTED_RETURNED' || (a.ownerType === 'RENTED' && Boolean(a.actualRentReturnDate)))),
    [assets]
  );

  // 고유 제조사 목록
  const uniqueManufacturers = useMemo(
    () => Array.from(new Set(managedAssets.map(a => getAssetManufacturer(a)).filter(m => Boolean(m) && m !== '-'))) as string[],
    [managedAssets, productByModelMap]
  );

  // 고유 주기장 목록
  const uniqueYards = useMemo(() => {
    const set = new Set<string>(['용인']);
    managedAssets.forEach(a => {
      const y = (a.yard && String(a.yard).trim()) || '용인';
      set.add(y);
    });
    return Array.from(set);
  }, [managedAssets]);

  // 고유 규격(피트) 목록 (숫자 오름차순 정렬)
  const uniqueFeetList = useMemo(() => {
    const set = new Set<string>();
    managedAssets.forEach(a => {
      const ft = getAssetFeet(a);
      if (ft && ft !== '-') set.add(ft);
    });
    return Array.from(set).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }, [managedAssets, productFeetMap]);

  // 자산 생애주기 통합 감사 이력 추출
  const getUnifiedAssetLogs = (asset: Asset): AssetInOutLog[] => {
    if (!asset) return [];
    const rawLogs = (assetInOutLogs || []).filter((l: AssetInOutLog) => l.assetId === asset.id || (l.assetNo && l.assetNo === asset.assetNo));
    const assetRepairs = (repairs || []).filter((r: Repair) => r.assetId === asset.id || (r.assetNo && r.assetNo === asset.assetNo));
    const existingRepairIds = new Set(rawLogs.map(l => l.repairId).filter(Boolean));

    const buildRepairMemo = (r: Repair): string => {
      const partsSummary =
        r.partsUsed && r.partsUsed.length > 0
          ? ` / 사용소모품: ${r.partsUsed.map(p => `${p.modelName} ${p.quantity}개`).join(', ')}`
          : '';
      return `${r.ticketNo || 'AS'} ${r.issueDescription || r.details || '정비점검'} ${r.actionTaken || '조치완료'}${partsSummary} (정비사: ${r.mechanicName || '-'})`;
    };

    // 레거시 assetInOutLogs(repairId 또는 memo 누락분)와 repairs 매칭 및 보강
    const normalizedRawLogs: AssetInOutLog[] = rawLogs.map(log => {
      if (log.type !== 'REPAIR') return log;
      if (log.repairId) {
        if (!log.memo) {
          const matchedR = assetRepairs.find(r => r.id === log.repairId);
          if (matchedR) return { ...log, memo: buildRepairMemo(matchedR) };
        }
        return log;
      }
      const matchedLegacyRepair = assetRepairs.find(r => {
        if (existingRepairIds.has(r.id)) return false;
        const rDate = r.visitDate || r.repairDate || r.requestDate || (r.createdAt ? r.createdAt.slice(0, 10) : '');
        return rDate === log.eventDate && (!log.siteName || !r.siteName || log.siteName === r.siteName);
      });
      if (matchedLegacyRepair) {
        existingRepairIds.add(matchedLegacyRepair.id);
        return {
          ...log,
          repairId: matchedLegacyRepair.id,
          memo: log.memo || buildRepairMemo(matchedLegacyRepair),
        };
      }
      return log;
    });

    const repairLogs: AssetInOutLog[] = assetRepairs
      .filter(r => !existingRepairIds.has(r.id))
      .map(r => ({
        id: `repair-log-${r.id}`,
        assetId: asset.id,
        assetNo: asset.assetNo,
        modelName: asset.modelName,
        type: 'REPAIR',
        eventDate: r.visitDate || r.repairDate || r.requestDate || (r.createdAt ? r.createdAt.slice(0, 10) : ''),
        customerId: r.customerId,
        customerName: r.customerName || (r as any).customer,
        siteId: r.siteId,
        siteName: r.siteName || (r as any).site,
        repairId: r.id,
        maintenanceScore: r.degradationScore || 0,
        memo: buildRepairMemo(r),
        createdAt: r.createdAt || new Date().toISOString()
      }));

    const unified = [...normalizedRawLogs, ...repairLogs];

    const hasAcquisition = unified.some(l => l.type === 'ACQUISITION');
    if (!hasAcquisition && asset.acquisitionDate) {
      unified.unshift({
        id: `acq-fallback-${asset.id}`,
        assetId: asset.id,
        assetNo: asset.assetNo,
        modelName: asset.modelName,
        type: 'ACQUISITION',
        eventDate: asset.acquisitionDate,
        memo: `자산 최초 취득 및 대장 등록 (취득일: ${asset.acquisitionDate} / 취득가: ${(asset.acquisitionPrice || 0).toLocaleString()}원 / 구입처: ${asset.supplier || '-'})`,
        createdAt: asset.createdAt || asset.acquisitionDate
      });
    }

    return unified.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
  };

  const handleExportAssetHistoryExcel = (asset: Asset) => {
    const assetLogs = getUnifiedAssetLogs(asset);
    if (assetLogs.length === 0) {
      showToast('해당 자산의 누적 이력 데이터가 존재하지 않습니다.', 'error');
      return;
    }
    const dataToExport = assetLogs.map((log: AssetInOutLog, idx: number) => ({
      '순번': idx + 1,
      '구분': log.type === 'ACQUISITION' ? '취득' : log.type === 'OUTBOUND' ? '출고' : log.type === 'INBOUND' ? '입고' : log.type === 'INBOUND_CANCEL' ? '입고취소' : log.type === 'DISPOSAL' ? '매각' : '정비',
      '입고고유번호': log.inboundNo || '-',
      '발생일자': log.eventDate,
      '관리번호': log.assetNo,
      '모델명': log.modelName,
      '거래처(고객사)': log.customerName || '-',
      '현장명': log.siteName || '-',
      '정비점수': log.maintenanceScore || 0,
      '특이사항/메모': log.memo || '-'
    }));

    exportToExcel(dataToExport, `자산이력_${asset.assetNo}_${new Date().toISOString().split('T')[0]}`);
    showToast(`자산 ${asset.assetNo} 이력 엑셀 파일이 다운로드되었습니다.`);
  };

  // KPI 통계 (단일 패스 O(N) 집계 — 당사/임차/가상 분리 및 실물자산 기준 가동률로 가상자산 왜곡 원천 차단)
  const kpiStats = useMemo(() => {
    const totalCount = managedAssets.length;
    let ownedCount = 0;
    let rentedCount = 0;
    let physicalCount = 0;
    let virtualCount = 0;
    let rentedOpCount = 0;
    let assignedCount = 0;
    let availableCount = 0;
    let repairingCount = 0;
    let returnedOrDisposedCount = 0;
    let totalBookValue = 0;

    // 당사 실물 (OWNED & !VIRTUAL)
    let ownedPhysicalTotal = 0;
    let ownedPhysicalActive = 0;
    let ownedPhysicalRented = 0;
    let ownedPhysicalAssigned = 0;
    let ownedPhysicalAvailable = 0;
    let ownedPhysicalRepairing = 0;
    let ownedPhysicalDisposed = 0;

    // 임차 실물 (RENTED & !VIRTUAL)
    let rentedPhysicalTotal = 0;
    let rentedPhysicalActive = 0;
    let rentedPhysicalRented = 0;
    let rentedPhysicalAssigned = 0;
    let rentedPhysicalAvailable = 0;
    let rentedPhysicalRepairing = 0;
    let rentedPhysicalReturned = 0;

    // 가상자산 (VIRTUAL)
    let virtualOperatingCount = 0;
    let virtualAvailableCount = 0;

    for (let i = 0; i < totalCount; i++) {
      const a = managedAssets[i];
      const isVirt = isVirtualAsset(a);
      const isReturnedOrDisposed = a.status === 'RENTED_RETURNED' || a.status === 'SOLD' || a.status === 'DISPOSED' || a.status === 'LOST' || Boolean(a.actualRentReturnDate);

      if (isVirt) {
        virtualCount++;
        if (!isReturnedOrDisposed) {
          if (a.status === 'RENTED' || a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') virtualOperatingCount++;
          else if (a.status === 'AVAILABLE') virtualAvailableCount++;
        }
      } else {
        physicalCount++;
        if (a.ownerType === 'OWNED') {
          ownedPhysicalTotal++;
          if (isReturnedOrDisposed) {
            ownedPhysicalDisposed++;
          } else {
            ownedPhysicalActive++;
            if (a.status === 'RENTED') ownedPhysicalRented++;
            else if (a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') ownedPhysicalAssigned++;
            else if (a.status === 'AVAILABLE') ownedPhysicalAvailable++;
            else if (a.status === 'REPAIRING') ownedPhysicalRepairing++;
          }
        } else {
          rentedPhysicalTotal++;
          if (isReturnedOrDisposed) {
            rentedPhysicalReturned++;
          } else {
            rentedPhysicalActive++;
            if (a.status === 'RENTED') rentedPhysicalRented++;
            else if (a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') rentedPhysicalAssigned++;
            else if (a.status === 'AVAILABLE') rentedPhysicalAvailable++;
            else if (a.status === 'REPAIRING') rentedPhysicalRepairing++;
          }
        }
      }

      if (a.ownerType === 'OWNED') {
        ownedCount++;
        const bv = a.bookValue ?? Math.max(0, (a.acquisitionPrice || 0) - (a.accumDepreciation || 0));
        if (bv > 0) totalBookValue += bv;
      } else if (a.ownerType === 'RENTED') {
        rentedCount++;
      }

      if (a.status === 'RENTED' && !isReturnedOrDisposed) rentedOpCount++;
      else if ((a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') && !isReturnedOrDisposed) assignedCount++;
      else if (a.status === 'AVAILABLE' && !isReturnedOrDisposed) availableCount++;
      else if (a.status === 'REPAIRING' && !isReturnedOrDisposed) repairingCount++;

      if (isReturnedOrDisposed) {
        returnedOrDisposedCount++;
      }
    }

    const ownedPhysicalOperating = ownedPhysicalRented + ownedPhysicalAssigned;
    const rentedPhysicalOperating = rentedPhysicalRented + rentedPhysicalAssigned;
    const physicalActiveCount = ownedPhysicalActive + rentedPhysicalActive;
    const physicalRentedOpCount = ownedPhysicalRented + rentedPhysicalRented;
    const physicalAssignedCount = ownedPhysicalAssigned + rentedPhysicalAssigned;
    const physicalOperatingCount = ownedPhysicalOperating + rentedPhysicalOperating;
    const physicalAvailableCount = ownedPhysicalAvailable + rentedPhysicalAvailable;
    const physicalRepairingCount = ownedPhysicalRepairing + rentedPhysicalRepairing;

    const opRate = physicalActiveCount > 0 ? Math.round((physicalOperatingCount / physicalActiveCount) * 100) : 0;
    const ownedPhysicalOpRate = ownedPhysicalActive > 0 ? Math.round((ownedPhysicalOperating / ownedPhysicalActive) * 100) : 0;
    const rentedPhysicalOpRate = rentedPhysicalActive > 0 ? Math.round((rentedPhysicalOperating / rentedPhysicalActive) * 100) : 0;

    return {
      totalCount,
      ownedCount,
      rentedCount,
      physicalCount,
      virtualCount,
      rentedOpCount,
      assignedCount,
      availableCount,
      repairingCount,
      returnedOrDisposedCount,
      ownedPhysicalTotal,
      ownedPhysicalActive,
      ownedPhysicalRented,
      ownedPhysicalAssigned,
      ownedPhysicalOperating,
      ownedPhysicalAvailable,
      ownedPhysicalRepairing,
      ownedPhysicalDisposed,
      rentedPhysicalTotal,
      rentedPhysicalActive,
      rentedPhysicalRented,
      rentedPhysicalAssigned,
      rentedPhysicalOperating,
      rentedPhysicalAvailable,
      rentedPhysicalRepairing,
      rentedPhysicalReturned,
      virtualOperatingCount,
      virtualAvailableCount,
      physicalActiveCount,
      physicalRentedOpCount,
      physicalAssignedCount,
      physicalOperatingCount,
      physicalAvailableCount,
      physicalRepairingCount,
      opRate,
      ownedPhysicalOpRate,
      rentedPhysicalOpRate,
      totalBookValue
    };
  }, [managedAssets]);

  //  [초고속 렌더링 청크 윈도우: 헌장 1.1] 초기 50건 우선 렌더링으로 10만 개 DOM 프리징 원천 방어
  const [visibleCount, setVisibleCount] = useState(50);

  // 반응형 필터링 및 정렬
  const filtered = useMemo(() => {
    setVisibleCount(50); // 필터 변경 시 50건으로 리셋
    const searchTokens = searchTerm.split(/[\s,\n\t]+/).map(t => t.trim().toLowerCase()).filter(Boolean);
    const tokenMatchers = searchTokens.map(token => ({
      token,
      matcher: createHangulMatcher(token)
    }));

    return managedAssets.filter(a => {
      const isReturned = Boolean(a.actualRentReturnDate) || a.status === 'RENTED_RETURNED';

      const matchesStatus = statusFilter === 'ALL' ? true :
                            statusFilter === 'RENTED_RETURNED' ? isReturned :
                            statusFilter === 'AVAILABLE' ? (a.status === 'AVAILABLE' && !isReturned) :
                            a.status === statusFilter;
      if (!matchesStatus) return false;

      if (ownerFilter !== 'ALL' && a.ownerType !== ownerFilter) return false;
      if (natureFilter !== 'ALL') {
        const isVirt = isVirtualAsset(a);
        if (natureFilter === 'VIRTUAL' && !isVirt) return false;
        if (natureFilter === 'PHYSICAL' && isVirt) return false;
      }
      const assetYard = (a.yard && String(a.yard).trim()) || '용인';
      if (yardFilter !== 'ALL' && assetYard !== yardFilter) return false;
      if (feetFilter !== 'ALL' && getAssetFeet(a) !== feetFilter) return false;
      const mfgName = getAssetManufacturer(a);
      if (manufacturerFilter !== 'ALL' && mfgName !== manufacturerFilter) return false;
      if (customerFilter !== 'ALL' && a.currentCustomerId !== customerFilter) return false;

      if (tokenMatchers.length === 0) return true;

      // [1] Bulk 다중 검색 (OR 조건): 엑셀 복붙 등에서 정확한 자산/시리얼 번호가 1개라도 일치하면 포함
      const assetNoLower = a.assetNo.toLowerCase();
      const serialNoLower = a.serialNo ? a.serialNo.toLowerCase() : '';
      const isExactOrMatch = tokenMatchers.some(({ token }) =>
        assetNoLower === token || (serialNoLower !== '' && serialNoLower === token)
      );
      if (isExactOrMatch) return true;

      // [2] 복합어 부분 검색 (AND 조건): 모든 토큰이 자산의 속성 어딘가에 각각 포함되어야 함
      const renterName = getAssetRenterName(a);
      const supplierName = getAssetSupplierName(a);
      const assetProduct = productByModelMap.get(a.modelName);

      return tokenMatchers.every(({ matcher }) =>
        matcher.test(a.assetNo) ||
        matcher.test(a.modelName) ||
        matcher.test(assetProduct?.shortName) ||
        matcher.test(a.serialNo) ||
        matcher.test(mfgName) ||
        matcher.test(assetYard) ||
        matcher.test(renterName) ||
        matcher.test(supplierName)
      );
    });
  }, [managedAssets, searchTerm, statusFilter, ownerFilter, natureFilter, yardFilter, feetFilter, manufacturerFilter, customerFilter, productByModelMap, productFeetMap, vendorMap]);

  //  필터링된 결과에 대한 요약 통계 (총 대수, 실물[당사+임차] + 가상 대수, 가상자산을 제외한 순수 실물자산 가동률 및 당사/임차별 가동상황)
  const filteredStats = useMemo(() => {
    const totalCount = filtered.length;
    let physicalCount = 0;
    let virtualCount = 0;

    // 당사 실물 (OWNED & !VIRTUAL)
    let ownedPhysicalTotal = 0;
    let ownedPhysicalActive = 0;
    let ownedPhysicalRented = 0;
    let ownedPhysicalAssigned = 0;
    let ownedPhysicalAvailable = 0;
    let ownedPhysicalRepairing = 0;
    let ownedPhysicalDisposed = 0;

    // 임차 실물 (RENTED & !VIRTUAL)
    let rentedPhysicalTotal = 0;
    let rentedPhysicalActive = 0;
    let rentedPhysicalRented = 0;
    let rentedPhysicalAssigned = 0;
    let rentedPhysicalAvailable = 0;
    let rentedPhysicalRepairing = 0;
    let rentedPhysicalReturned = 0;

    for (let i = 0; i < totalCount; i++) {
      const a = filtered[i];
      const isVirt = isVirtualAsset(a);
      const isReturnedOrDisposed = a.status === 'RENTED_RETURNED' || a.status === 'SOLD' || a.status === 'DISPOSED' || a.status === 'LOST' || Boolean(a.actualRentReturnDate);

      if (isVirt) {
        virtualCount++;
      } else {
        physicalCount++;
        if (a.ownerType === 'OWNED') {
          ownedPhysicalTotal++;
          if (isReturnedOrDisposed) {
            ownedPhysicalDisposed++;
          } else {
            ownedPhysicalActive++;
            if (a.status === 'RENTED') ownedPhysicalRented++;
            else if (a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') ownedPhysicalAssigned++;
            else if (a.status === 'AVAILABLE') ownedPhysicalAvailable++;
            else if (a.status === 'REPAIRING') ownedPhysicalRepairing++;
          }
        } else {
          rentedPhysicalTotal++;
          if (isReturnedOrDisposed) {
            rentedPhysicalReturned++;
          } else {
            rentedPhysicalActive++;
            if (a.status === 'RENTED') rentedPhysicalRented++;
            else if (a.status === 'ASSIGNED' || a.status === 'OUTBOUND_INSPECTION' || a.status === 'AWAITING_TRANSPORT') rentedPhysicalAssigned++;
            else if (a.status === 'AVAILABLE') rentedPhysicalAvailable++;
            else if (a.status === 'REPAIRING') rentedPhysicalRepairing++;
          }
        }
      }
    }

    const ownedPhysicalOperating = ownedPhysicalRented + ownedPhysicalAssigned;
    const rentedPhysicalOperating = rentedPhysicalRented + rentedPhysicalAssigned;
    const physicalActiveCount = ownedPhysicalActive + rentedPhysicalActive;
    const physicalRentedOpCount = ownedPhysicalRented + rentedPhysicalRented;
    const physicalAssignedCount = ownedPhysicalAssigned + rentedPhysicalAssigned;
    const physicalOperatingCount = ownedPhysicalOperating + rentedPhysicalOperating;
    const physicalAvailableCount = ownedPhysicalAvailable + rentedPhysicalAvailable;
    const physicalRepairingCount = ownedPhysicalRepairing + rentedPhysicalRepairing;

    const physicalOpRate = physicalActiveCount > 0
      ? Math.round((physicalOperatingCount / physicalActiveCount) * 100)
      : 0;
    const ownedPhysicalOpRate = ownedPhysicalActive > 0
      ? Math.round((ownedPhysicalOperating / ownedPhysicalActive) * 100)
      : 0;
    const rentedPhysicalOpRate = rentedPhysicalActive > 0
      ? Math.round((rentedPhysicalOperating / rentedPhysicalActive) * 100)
      : 0;

    return {
      totalCount,
      physicalCount,
      virtualCount,
      ownedPhysicalTotal,
      ownedPhysicalActive,
      ownedPhysicalRented,
      ownedPhysicalAssigned,
      ownedPhysicalOperating,
      ownedPhysicalAvailable,
      ownedPhysicalRepairing,
      ownedPhysicalDisposed,
      rentedPhysicalTotal,
      rentedPhysicalActive,
      rentedPhysicalRented,
      rentedPhysicalAssigned,
      rentedPhysicalOperating,
      rentedPhysicalAvailable,
      rentedPhysicalRepairing,
      rentedPhysicalReturned,
      physicalActiveCount,
      physicalOperatingCount,
      physicalRentedOpCount,
      physicalAssignedCount,
      physicalAvailableCount,
      physicalRepairingCount,
      physicalOpRate,
      ownedPhysicalOpRate,
      rentedPhysicalOpRate
    };
  }, [filtered]);

  const { items: sortedAssets, sortConfig, requestSort } = useSortableData<Asset>(
    filtered,
    { key: 'assetNo', direction: 'asc' },
    (a, key) => {
      switch (key) {
        case 'assetNo': return a.assetNo;
        case 'modelName': return a.modelName;
        case 'feet': return getAssetFeet(a);
        case 'manufacturer': return getAssetManufacturer(a);
        case 'serialNo': return a.serialNo || '';
        case 'manufacturingYear': return a.manufactureYear || 0;
        case 'ownerType': return a.ownerType;
        case 'assetNature': return isVirtualAsset(a) ? '가상' : '실물';
        case 'yard': return (a.yard && String(a.yard).trim()) || '용인';
        case 'status': return a.status;
        case 'currentCustomerId': return getCustomerName(a.currentCustomerId);
        case 'currentSiteId': return getSiteName(a.currentSiteId);
        case 'contractNo': return getAssetContractInfo(a.id)?.contractNo || '';
        case 'rentalPeriod': return a.contractStart || '';
        case 'billingDay': return a.billingDay || 0;
        case 'monthlyRentalFee': return a.monthlyRentalFee || 0;
        case 'renterName': return getAssetRenterName(a);
        case 'supplierName': return getAssetSupplierName(a);
        case 'acquisitionDate': return a.acquisitionDate || '';
        case 'acquisitionPrice': return a.acquisitionPrice || 0;
        case 'accumDepreciation': return a.accumDepreciation || 0;
        case 'bookValue': return a.bookValue || 0;
        case 'totalRevenue': return a.cumRentalFee || 0;
        case 'totalRepairCost': return a.cumRepairCost || 0;
        case 'netMargin': return (a.cumRentalFee || 0) - (a.cumRepairCost || 0);
        case 'penaltyScore': return a.maintenanceScore || 0;
        case 'memo': return a.memo || '';
        default: return (a as any)[key];
      }
    }
  );

  // 현재 뷰포트에 렌더링할 청크 데이터 (초기 50건 -> 스크롤 시 자동 확장)
  const visibleAssets = useMemo(() => {
    return sortedAssets.slice(0, visibleCount);
  }, [sortedAssets, visibleCount]);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 200) {
      if (visibleCount < sortedAssets.length) {
        setVisibleCount(prev => Math.min(prev + 50, sortedAssets.length));
      }
    }
  };

  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsEditing(false);
    setShowHistoryToggle(false);
    setEditForm({ ...asset });
  };

  const handleStartEdit = () => {
    if (selectedAsset) {
      setEditForm({ ...selectedAsset });
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditForm(selectedAsset ? { ...selectedAsset } : {});
  };

  const handleSaveEdit = async () => {
    if (!selectedAsset || !editForm || isSavingAsset) return;
    try {
      setIsSavingAsset(true);
      if (editForm.acquisitionPrice !== undefined && editForm.acquisitionPrice < 0) {
        showErrorModal('취득원가는 0원 이상이어야 합니다.');
        return;
      }
      if (editForm.depreciationMonths !== undefined && editForm.depreciationMonths < 0) {
        showErrorModal('내용연수는 0개월 이상이어야 합니다.');
        return;
      }
      if (editForm.residualValueRate !== undefined && (editForm.residualValueRate < 0 || editForm.residualValueRate > 100)) {
        showErrorModal('잔존가치율은 0% ~ 100% 사이여야 합니다.');
        return;
      }
      const normalizeYear = (raw?: string | number | null): string => {
        const trimmed = String(raw ?? '').trim();
        if (!trimmed) return '';
        const exactFourDigits = trimmed.match(/^(\d{4})\s*\.?$/);
        if (exactFourDigits) return `${exactFourDigits[1]}년`;
        if (/^\d{4}(?!\d)/.test(trimmed) && !trimmed.includes('년')) {
          return trimmed.replace(/^(\d{4})\s*[.\-/]?\s*/, '$1년 ').trim();
        }
        return trimmed;
      };
      const updated: Asset = {
        ...selectedAsset,
        ...editForm,
        manufactureYear: normalizeYear(editForm.manufactureYear ?? selectedAsset.manufactureYear)
      };
      await (saveAsset as any)(updated);
      setSelectedAsset(updated);
      setIsEditing(false);
      showToast(`자산 ${updated.assetNo} 정보가 저장되었습니다.`);
    } catch (err: any) {
      showErrorModal(`자산 정보 저장 실패: ${err?.message || err}`, '자산 저장 오류');
    } finally {
      setIsSavingAsset(false);
    }
  };

  const ef = (field: keyof Asset) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const val = e.target.type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value;
    setEditForm(prev => {
      const next: Partial<Asset> = { ...prev, [field]: val };
      if (field === 'modelName' && typeof val === 'string') {
        const matchedProd = productByModelMap.get(val) || productByModelMap.get(val.replace(/[\s\-_]/g, '').toUpperCase());
        if (matchedProd?.manufacturer) {
          next.manufacturer = matchedProd.manufacturer;
        }
      }
      if (field === 'manufactureYear' && typeof val === 'string') {
        const prevVal = prev.manufactureYear || '';
        const isDeletingYearSuffix = prevVal === `${val}년`;
        if (!isDeletingYearSuffix && /^\d{4}$/.test(val.trim())) {
          next.manufactureYear = `${val.trim()}년`;
        }
      }
      return next;
    });
  };

  // 모델 카탈로그 VDI 2198 제원을 임대 자산에 즉시 상속 적용하는 핸들러
  const applyModelSpecToAssetForm = (modelName?: string) => {
    const targetModel = modelName || editForm.modelName || selectedAsset?.modelName || '';
    const norm = targetModel.replace(/[\s\-_]/g, '').toUpperCase();
    const prod = productByModelMap.get(targetModel) || productByModelMap.get(norm);
    const arch: any = FL_TECHNICAL_ARCHIVE.find((x: any) =>
      (x.modelName || x.modelCode || '').replace(/[\s\-_]/g, '').toUpperCase() === norm ||
      (x.shortName || '').replace(/[\s\-_]/g, '').toUpperCase() === norm
    );
    const src: any = prod || arch;
    if (!src) {
      showToast('해당 모델명의 카탈로그 제원을 찾을 수 없습니다.', 'error');
      return;
    }
    const defaultMast = Array.isArray(src.mastSpecs) && src.mastSpecs.length > 0 ? src.mastSpecs[0] : null;
    const defaultBat = Array.isArray(src.batteryOptions) && src.batteryOptions.length > 0 ? src.batteryOptions[0] : null;
    setEditForm(prev => ({
      ...prev,
      manufacturer: src.manufacturer || src.manufacturerName || prev.manufacturer,
      seriesName: src.seriesName || prev.seriesName,
      equipmentClass: src.equipmentClass || prev.equipmentClass,
      powerType: src.powerType || prev.powerType,
      powerSource: src.powerSource || src.powerType || prev.powerSource,
      operatorType: src.operatorType || prev.operatorType,
      ratedCapacityKg: src.ratedCapacityKg ?? prev.ratedCapacityKg,
      loadCenterMm: src.loadCenterMm ?? prev.loadCenterMm,
      loadDistanceXMm: src.loadDistanceXMm ?? prev.loadDistanceXMm,
      wheelbaseMm: src.wheelbaseMm ?? prev.wheelbaseMm,
      serviceWeightKg: src.serviceWeightKg ?? prev.serviceWeightKg,
      axleLoadingLadenKg: src.axleLoadingLadenKg || prev.axleLoadingLadenKg,
      axleLoadingUnladenKg: src.axleLoadingUnladenKg || prev.axleLoadingUnladenKg,
      tireType: src.tireType || prev.tireType,
      tireSpecFrontRear: src.tireSpecFrontRear || prev.tireSpecFrontRear,
      wheelCountFrontRear: src.wheelCountFrontRear || prev.wheelCountFrontRear,
      treadFrontRearMm: src.treadFrontRearMm || prev.treadFrontRearMm,
      mastType: defaultMast?.mastType || src.mastType || prev.mastType,
      mastModelCode: defaultMast?.mastModelCode || defaultMast?.mastModel || src.mastModelCode || prev.mastModelCode,
      mastStageCount: src.mastStageCount ?? prev.mastStageCount,
      mastTiltDeg: defaultMast?.tiltAngleDeg || src.mastTiltDeg || prev.mastTiltDeg,
      mastLoweredH1Mm: defaultMast?.loweredHeightH1Mm ?? src.mastLoweredH1Mm ?? prev.mastLoweredH1Mm,
      freeLiftHeightMm: Number(String(defaultMast?.freeLiftH2Mm || defaultMast?.freeLiftWithBackrestH2Mm || src.freeLiftHeightMm || prev.freeLiftHeightMm || 150).replace(/[^0-9]/g, '')) || 150,
      standardLiftHeightMm: defaultMast?.liftHeightH3Mm ?? src.standardLiftHeightMm ?? prev.standardLiftHeightMm,
      maxOptionLiftHeightMm: src.maxOptionLiftHeightMm ?? prev.maxOptionLiftHeightMm,
      mastExtendedH4Mm: Number(String(defaultMast?.extendedHeightH4Mm || defaultMast?.extendedHeightWithBackrestH4Mm || src.mastExtendedH4Mm || prev.mastExtendedH4Mm || 4000).replace(/[^0-9]/g, '')) || 4000,
      overheadGuardHeightMm: src.overheadGuardHeightMm ?? prev.overheadGuardHeightMm,
      seatHeightH7Mm: src.seatHeightH7Mm ?? prev.seatHeightH7Mm,
      couplingHeightH10Mm: src.couplingHeightH10Mm || prev.couplingHeightH10Mm,
      overallLengthWithForkL1Mm: src.overallLengthWithForkL1Mm ?? prev.overallLengthWithForkL1Mm,
      overallLengthMm: src.overallLengthMm ?? prev.overallLengthMm,
      overallWidthMm: src.overallWidthMm ?? prev.overallWidthMm,
      overallWidthDualB2Mm: src.overallWidthDualB2Mm ?? prev.overallWidthDualB2Mm,
      forkDimensionsMm: src.forkDimensionsMm || prev.forkDimensionsMm,
      forkCarriageClass: src.forkCarriageClass || prev.forkCarriageClass,
      forkCarriageWidthB3Mm: src.forkCarriageWidthB3Mm ?? prev.forkCarriageWidthB3Mm,
      forkSpreadMinMaxB5Mm: src.forkSpreadMinMaxB5Mm || prev.forkSpreadMinMaxB5Mm,
      groundClearanceMastM1Mm: src.groundClearanceMastM1Mm ?? prev.groundClearanceMastM1Mm,
      groundClearanceCenterM2Mm: src.groundClearanceCenterM2Mm ?? prev.groundClearanceCenterM2Mm,
      aisleWidth1000x1200Mm: src.aisleWidth1000x1200Mm ?? prev.aisleWidth1000x1200Mm,
      aisleWidth800x1200Mm: src.aisleWidth800x1200Mm ?? prev.aisleWidth800x1200Mm,
      turningRadiusMm: src.turningRadiusMm ?? prev.turningRadiusMm,
      internalTurningRadiusB13Mm: src.internalTurningRadiusB13Mm ?? prev.internalTurningRadiusB13Mm,
      travelSpeedKmh: src.travelSpeedKmh || prev.travelSpeedKmh,
      liftingSpeedMms: src.liftingSpeedMms || prev.liftingSpeedMms,
      loweringSpeedMms: src.loweringSpeedMms || prev.loweringSpeedMms,
      drawbarPullN: src.drawbarPullN || prev.drawbarPullN,
      maxDrawbarPullN: src.maxDrawbarPullN || prev.maxDrawbarPullN,
      gradeabilityPercent: src.gradeabilityPercent || prev.gradeabilityPercent,
      maxGradeabilityPercent: src.maxGradeabilityPercent || prev.maxGradeabilityPercent,
      accelerationTime10mSec: src.accelerationTime10mSec || prev.accelerationTime10mSec,
      serviceBrake: src.serviceBrake || prev.serviceBrake,
      parkingBrake: src.parkingBrake || prev.parkingBrake,
      brakeType: src.brakeType || prev.brakeType,
      driveMotorKw: src.driveMotorKw ?? prev.driveMotorKw,
      liftMotorKw: src.liftMotorKw ?? prev.liftMotorKw,
      motorOrEngineDetail: src.motorOrEngineDetail || prev.motorOrEngineDetail,
      batteryVoltageCapacity: defaultBat ? (defaultBat.voltageCapacity || `${defaultBat.voltageV}V / ${defaultBat.capacityAh}Ah`) : (src.batteryVoltageCapacity || prev.batteryVoltageCapacity),
      batteryWeightKg: defaultBat ? String(defaultBat.weightKg) : (src.batteryWeightKg || prev.batteryWeightKg),
      powerSpecDetail: src.powerSpecDetail || prev.powerSpecDetail,
      chargerOrFuelDetail: defaultBat?.chargerSpec || defaultBat?.chargerOptions || src.chargerOrFuelDetail || prev.chargerOrFuelDetail,
      driveControlType: src.driveControlType || prev.driveControlType,
      controllerMaker: src.controllerMaker || prev.controllerMaker,
      operatingPressureMpa: src.operatingPressureMpa ?? prev.operatingPressureMpa,
      oilFlowLmin: src.oilFlowLmin || prev.oilFlowLmin,
      soundLevelDb: src.soundLevelDb ?? prev.soundLevelDb,
      hydraulicTankLiter: src.hydraulicTankLiter ?? prev.hydraulicTankLiter,
      waterproofRating: src.waterproofRating || prev.waterproofRating,
      warrantyMonths: src.warrantyMonths ?? prev.warrantyMonths,
      warrantyTerms: src.warrantyTerms || prev.warrantyTerms,
      vdiSpecs: src.vdiSpecs || prev.vdiSpecs,
      mastSpecs: src.mastSpecs || prev.mastSpecs,
      batteryOptions: src.batteryOptions || prev.batteryOptions,
      standardEquipments: src.standardEquipments || prev.standardEquipments,
      optionalEquipments: src.optionalEquipments || prev.optionalEquipments,
    }));
    showToast(`모델 [${targetModel}] VDI 2198 완제품 제원이 임대 자산에 상속 적용되었습니다.`);
  };

  // 임대 자산에 장착된 설치형옵션 (19종) 토글 핸들러
  const toggleAssetInstalledOption = (optMaster: typeof MUJIN_OPTION_MASTERS[number]) => {
    setEditForm(prev => {
      const currentApplied = Array.isArray(prev.appliedOptions) ? [...prev.appliedOptions] : [];
      const existsIdx = currentApplied.findIndex(o => o.optionCode === optMaster.optionCode || o.name === optMaster.optionName);
      let nextApplied;
      if (existsIdx >= 0) {
        nextApplied = currentApplied.filter((_, idx) => idx !== existsIdx);
      } else {
        nextApplied = [
          ...currentApplied,
          {
            optionId: optMaster.id,
            optionCode: optMaster.optionCode,
            name: optMaster.optionName,
            category: optMaster.category,
            quantity: 1,
            unitPrice: optMaster.defaultFee,
            monthlyFee: optMaster.monthlyFee,
            isFreeService: false,
          }
        ];
      }
      return {
        ...prev,
        appliedOptions: nextApplied,
        installedOptions: nextApplied.map(o => o.name),
      };
    });
  };

  const handleExport = () => {
    const data = filtered.map((a, idx) => {
      const ci = getAssetContractInfo(a.id);
      const isReturned = Boolean(a.actualRentReturnDate) || a.status === 'RENTED_RETURNED';
      const netProfit = (a.cumRentalFee || 0) - (a.cumRepairCost || 0);
      const accumDepn = a.ownerType === 'OWNED' ? (a.accumDepreciation || 0) : 0;
      const bookVal = a.ownerType === 'OWNED' ? (a.bookValue ?? Math.max(0, (a.acquisitionPrice || 0) - accumDepn)) : 0;

      // 기본 비재무 자산 속성 (전 부서 공통)
      const baseRow: Record<string, any> = {
        '순번': idx + 1,
        '관리번호': a.assetNo || '-',
        '모델명': a.modelName || '-',
        '규격(피트)': getAssetFeet(a),
        '제조사': getAssetManufacturer(a),
        '제조번호': a.serialNo || '-',
        '연식': a.manufactureYear || '-',
        '소유구분': a.ownerType === 'OWNED' ? '당사자산' : '외부임차',
        '자산구분': isVirtualAsset(a) ? '가상' : '실물',
        '주기장': (a.yard && String(a.yard).trim()) || '용인',
        '상태': isReturned ? '임차처 반납완료' : getAssetStatusLabel(a.status),
        '현재 고객사': getCustomerName(a.currentCustomerId),
        '현재 현장': getSiteName(a.currentSiteId),
        '계약번호': ci ? ci.contractNo : '-',
        '계약기간': a.contractStart ? `${a.contractStart.slice(0, 10)} ~ ${a.contractEnd?.slice(0, 10) || ''}` : '-',
        '계산서마감일': a.billingDay ? `${a.billingDay}일` : '-'
      };

      //  경영진, 관리부, 영업부 전용 단가/매출/이익/비용/취득가액 재무 필드
      if (hasFinancialAccess) {
        baseRow['월 렌탈료(원)'] = a.monthlyRentalFee || 0;
        baseRow['임차처'] = getAssetRenterName(a);
        baseRow['구입/공급처'] = getAssetSupplierName(a);
        baseRow['취득일자'] = a.acquisitionDate ? a.acquisitionDate.slice(0, 10) : (a.rentStart ? a.rentStart.slice(0, 10) : '-');
        baseRow['취득원가(원)'] = a.acquisitionPrice || 0;
        baseRow['감가상각누계액(원)'] = accumDepn;
        baseRow['장부가치(원)'] = bookVal;
        baseRow['누적렌탈수익(원)'] = a.cumRentalFee || 0;
        baseRow['누적수리비(원)'] = a.cumRepairCost || 0;
        baseRow['기여순익(원)'] = netProfit;
      }

      baseRow['정비점수'] = a.maintenanceScore || 0;
      baseRow['비고'] = a.memo || a.memo1 || '-';

      return baseRow;
    });
    exportToExcel(data, `전사자산목록_${new Date().toISOString().split('T')[0]}`, '자산목록');
    showToast(`전사 자산 목록 (${filtered.length}건) 엑셀이 다운로드되었습니다.`);
  };

  return (
    <div data-hs-observe="assets" style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100dvh - 85px)',
      maxHeight: 'calc(100dvh - 85px)',
      minHeight: 0,
      overflow: 'hidden',
      gap: '8px',
      position: 'relative'
    }}>
      
      {/* 알림 토스트 */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '24px',
          zIndex: 9999,
          padding: '10px 18px',
          borderRadius: '6px',
          backgroundColor: toastMessage.type === 'success' ? 'var(--success)' : 'var(--danger)',
          color: '#ffffff',
          fontWeight: 600,
          fontSize: '13px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ① 상단 헤더 & 파이프라인 (좌상단 Scope + 우상단 Pipeline) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px',
        paddingBottom: '4px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <h2 style={{ margin: 0, fontWeight: '700', fontSize: '17px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
            자산 관리 대장
 </h2>
        </div>

        {/* 우상단 파이프라인 버튼군 - 표준 횡배치: 조회 -> 엑셀다운로드 */}
        <div data-mid="asset-header-actions" className="toolbar-actions">
          <button
            className="btn-query"
            data-mid="btn-asset-search"
            onClick={() => showToast('조회되었습니다.', 'success')}
          >
            <Search size={13} /> 조회
 </button>
          <button
            className="btn-excel-download"
            data-mid="btn-asset-export"
            onClick={handleExport}
          >
            <Download size={13} /> 엑셀 다운로드
 </button>
        </div>
      </div>

      {/* ③ 필터 컨트롤 바 (Vertical Header-Label Layout: 헌장 3.4) */}
      <div data-mid="asset-filter-bar" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: '6px 10px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        {/* 좌측 통합 검색창 + 우측 정렬 컴팩트 필터 드롭다운군 */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '520px', minWidth: '200px' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', top: '6px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="관리번호, 모델명, 제조사, 제조번호, 주기장, 임차처"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '3px 8px 3px 24px',
                height: '25px',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-app)',
                color: 'var(--text-main)',
                fontSize: '11.5px'
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', flexWrap: 'wrap', marginLeft: 'auto', paddingLeft: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>규격(피트)</label>
              <select
                value={feetFilter}
                onChange={e => setFeetFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '76px' }}
              >
                <option value="ALL">전체 규격</option>
                {uniqueFeetList.map(ft => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>소유구분</label>
              <select
                value={ownerFilter}
                onChange={e => setOwnerFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '76px' }}
              >
                <option value="ALL">전체 소유</option>
                <option value="OWNED">당사자산</option>
                <option value="RENTED">임차자산</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>자산구분</label>
              <select
                value={natureFilter}
                onChange={e => setNatureFilter(e.target.value as 'ALL' | 'PHYSICAL' | 'VIRTUAL')}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '72px' }}
              >
                <option value="ALL">전체 구분</option>
                <option value="PHYSICAL">실물</option>
                <option value="VIRTUAL">가상</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>주기장</label>
              <select
                value={yardFilter}
                onChange={e => setYardFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '76px' }}
              >
                <option value="ALL">전체 주기장</option>
                {uniqueYards.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>장비 상태</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '92px' }}
              >
                <option value="ALL">전체 상태</option>
                {Object.values(ASSET_STATUS_SSOT).filter(st => st.code !== 'RENTED_RETURNED').map(st => (
                  <option key={st.code} value={st.code}>{st.label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>제조사</label>
              <select
                value={manufacturerFilter}
                onChange={e => setManufacturerFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '84px' }}
              >
                <option value="ALL">전체 제조사</option>
                {uniqueManufacturers.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flexShrink: 0 }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>현재 고객사</label>
              <select
                value={customerFilter}
                onChange={e => setCustomerFilter(e.target.value)}
                style={{ padding: '2px 5px', height: '25px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', fontSize: '11.5px', minWidth: '108px' }}
              >
                <option value="ALL">전체 고객사</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {(searchTerm || feetFilter !== 'ALL' || ownerFilter !== 'ALL' || natureFilter !== 'ALL' || yardFilter !== 'ALL' || statusFilter !== 'ALL' || manufacturerFilter !== 'ALL' || customerFilter !== 'ALL') && (
              <button
                onClick={() => { setSearchTerm(''); setFeetFilter('ALL'); setOwnerFilter('ALL'); setNatureFilter('ALL'); setYardFilter('ALL'); setStatusFilter('ALL'); setManufacturerFilter('ALL'); setCustomerFilter('ALL'); }}
                style={{
                  padding: '2px 7px',
                  height: '25px',
                  fontSize: '11px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={11} /> 초기화
 </button>
            )}
          </div>
        </div>
      </div>

      {/* ④ 고밀도 전사 자산 대장 그리드 (Body / Inspection: 헌장 3.6 유형 B) */}
      <div data-mid="asset-table-container" style={{
        flex: 1,
        backgroundColor: 'var(--bg-card)',
        borderRadius: '6px',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div
          className="table-wrapper"
          onScroll={handleTableScroll}
          style={{
            flex: 1,
            minHeight: 0,
            overflowX: 'auto',
            overflowY: 'auto',
            position: 'relative'
          }}
        >
          <table style={{ minWidth: '2400px', width: 'max-content', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11.5px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {/* 1. 상세 (고정) */}
                <th style={{ padding: '7px 8px', width: '50px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 12, backgroundColor: 'var(--bg-app)' }}>상세</th>
                {/* 2. 관리번호 (고정) */}
                <SortableTh sortKey="assetNo" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '90px', position: 'sticky', left: '50px', zIndex: 12, backgroundColor: 'var(--bg-app)' }}>관리번호</SortableTh>
                {/* 3. 모델명 */}
                <SortableTh sortKey="modelName" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '100px' }}>모델명</SortableTh>
                {/* 4. 규격/피트 */}
                <SortableTh sortKey="feet" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '75px' }}>규격(피트)</SortableTh>
                {/* 5. 제조사 */}
                <SortableTh sortKey="manufacturer" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '90px' }}>제조사</SortableTh>
                {/* 6. 제조번호 */}
                <SortableTh sortKey="serialNo" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '100px' }}>제조번호</SortableTh>
                {/* 7. 연식 */}
                <SortableTh sortKey="manufacturingYear" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '70px' }}>연식</SortableTh>
                {/* 8. 소유구분 */}
                <SortableTh sortKey="ownerType" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '70px' }}>소유</SortableTh>
                {/* 8-2. 자산구분 (실물/가상) */}
                <SortableTh sortKey="assetNature" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '64px' }}>구분</SortableTh>
                {/* 8-3. 주기장 */}
                <SortableTh sortKey="yard" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '75px' }}>주기장</SortableTh>
                {/* 9. 상태 */}
                <SortableTh sortKey="status" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '85px' }}>상태</SortableTh>
                {/* 10. 현재 고객사 */}
                <SortableTh sortKey="currentCustomerId" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '140px' }}>현재 고객사</SortableTh>
                {/* 11. 사용 현장 */}
                <SortableTh sortKey="currentSiteId" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '150px' }}>사용 현장</SortableTh>
                {/* 12. 계약번호 */}
                <SortableTh sortKey="contractNo" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '105px' }}>계약번호</SortableTh>
                {/* 13. 계약기간 */}
                <SortableTh sortKey="rentalPeriod" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '160px' }}>계약기간</SortableTh>
                {/* 14. 청구일 */}
                <SortableTh sortKey="billingDay" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '65px' }}>청구일</SortableTh>
                {/* 15. 월 렌탈료 (경영진/관리부/영업부) */}
                {hasFinancialAccess && (
                  <SortableTh sortKey="monthlyRentalFee" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '95px' }}>월 렌탈료</SortableTh>
                )}
                {/* 16. 임차처 */}
                <SortableTh sortKey="renterName" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '120px' }}>임차처</SortableTh>
                {/* 17. 구입/공급처 */}
                <SortableTh sortKey="supplierName" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '120px' }}>구입/공급처</SortableTh>
                {/* 18. 취득/개시일 */}
                <SortableTh sortKey="acquisitionDate" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '90px' }}>취득/개시일</SortableTh>
                {/* 19. 취득원가 ~ 24. 기여 순익 (경영진/관리부/영업부 전용) */}
                {hasFinancialAccess && (
                  <>
                    <SortableTh sortKey="acquisitionPrice" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '105px' }}>취득원가</SortableTh>
                    <SortableTh sortKey="accumDepreciation" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '105px' }}>감가누계액</SortableTh>
                    <SortableTh sortKey="bookValue" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '105px' }}>장부가치</SortableTh>
                    <SortableTh sortKey="totalRevenue" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '105px' }}>누적 렌탈수익</SortableTh>
                    <SortableTh sortKey="totalRepairCost" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '95px' }}>누적 수리비</SortableTh>
                    <SortableTh sortKey="netMargin" currentSort={sortConfig} onSort={requestSort} align="right" style={{ padding: '7px 8px', width: '105px' }}>기여 순익</SortableTh>
                  </>
                )}
                {/* 25. 정비점수 */}
                <SortableTh sortKey="penaltyScore" currentSort={sortConfig} onSort={requestSort} align="center" style={{ padding: '7px 8px', width: '70px' }}>정비점수</SortableTh>
                {/* 26. 비고 */}
                <SortableTh sortKey="memo" currentSort={sortConfig} onSort={requestSort} style={{ padding: '7px 8px', width: '140px' }}>비고</SortableTh>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={hasFinancialAccess ? 28 : 21} style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    조회 조건에 해당하는 자산이 없습니다.
 </td>
                </tr>
              ) : (
                visibleAssets.map((a, idx) => {
                  const ci = getAssetContractInfo(a.id);
                  const isReturned = Boolean(a.actualRentReturnDate) || a.status === 'RENTED_RETURNED';
                  const renterName = getAssetRenterName(a);
                  const supplierName = getAssetSupplierName(a);
                  const custName = getCustomerName(a.currentCustomerId);
                  const siteName = getSiteName(a.currentSiteId);
                  const netProfit = (a.cumRentalFee || 0) - (a.cumRepairCost || 0);
                  const accumDepn = a.ownerType === 'OWNED' ? (a.accumDepreciation || 0) : 0;
                  const bookVal = a.ownerType === 'OWNED' ? (a.bookValue ?? Math.max(0, (a.acquisitionPrice || 0) - accumDepn)) : 0;

                  return (
                    <tr
                      key={a.id}
                      onClick={() => handleSelectAsset(a)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s',
                        opacity: isReturned || a.status === 'SOLD' ? 0.75 : 1
                      }}
                      className="hover-row"
                    >
                      {/* 1. 상세 버튼 (고정) */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--bg-card)' }}>
                        <button
                          data-mid={idx === 0 ? "asset-detail-action" : undefined}
                          onClick={(e) => { e.stopPropagation(); handleSelectAsset(a); }}
                          style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            border: '1px solid var(--border-color)',
                            borderRadius: '3px',
                            backgroundColor: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--primary)',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          보기
 </button>
                      </td>

                      {/* 2. 관리번호 (고정) */}
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', position: 'sticky', left: '50px', zIndex: 2, backgroundColor: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span>{a.assetNo}</span>
                          {a.ownerType === 'RENTED' && (
                            <span className="badge badge-info" style={{ fontSize: '9.5px', padding: '1px 4px' }}>임차</span>
                          )}
                        </div>
                      </td>

                      {/* 3. 모델명 */}
                      <td style={{ padding: '6px 8px', color: 'var(--text-main)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.modelName}</td>

                      {/* 4. 규격(피트) */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        <span className="badge badge-secondary" style={{ fontSize: '10px' }}>{getAssetFeet(a)}</span>
                      </td>

                      {/* 5. 제조사 */}
                      <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{getAssetManufacturer(a)}</td>

                      {/* 6. 제조번호 */}
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {a.serialNo || '-'}
                      </td>

                      {/* 7. 연식 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {a.manufactureYear ? (/^\d{4}$/.test(String(a.manufactureYear).trim()) ? `${String(a.manufactureYear).trim()}년` : a.manufactureYear) : '-'}
                      </td>

                      {/* 8. 소유구분 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span className={`badge ${a.ownerType === 'OWNED' ? 'badge-success' : 'badge-info'}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                            {a.ownerType === 'OWNED' ? '당사' : '임차'}
                          </span>
                          {a.ownerType === 'RENTED' && a.antiEntrapmentOwnership === 'VENDOR' && (
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#dc2626', fontWeight: 700, border: '1px solid rgba(220, 38, 38, 0.25)', whiteSpace: 'nowrap' }}>
                              원사협착봉
 </span>
                          )}
                          {a.ownerType === 'RENTED' && a.antiEntrapmentOwnership === 'OURS' && (
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', fontWeight: 700, border: '1px solid rgba(37, 99, 235, 0.25)', whiteSpace: 'nowrap' }}>
                              당사협착봉
 </span>
                          )}
                        </div>
                      </td>

                      {/* 8-2. 자산구분 (실물/가상) */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isVirtualAsset(a) ? (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 700,
                              backgroundColor: 'rgba(139, 92, 246, 0.12)',
                              color: '#7c3aed',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            가상
 </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: 'rgba(15, 23, 42, 0.06)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-color)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            실물
 </span>
                        )}
                      </td>

                      {/* 8-3. 주기장 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        {(a.yard && String(a.yard).trim()) || '용인'}
                      </td>

                      {/* 9. FSM 운용 상태 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {isReturned ? (
                          <span className="badge badge-secondary" style={{ fontSize: '10px', padding: '1px 5px' }}>임차처 반납완료</span>
                        ) : a.status === 'SOLD' ? (
                          <span className="badge badge-danger" style={{ fontSize: '10px', padding: '1px 5px' }}>매각 처분완료</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                            <span className={`badge ${getAssetStatusBadgeClass(a.status)}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                              {getAssetStatusLabel(a.status)}
                            </span>
                            {a.status === 'REPAIRING' && (() => {
                              const extRep = externalRepairByAssetIdMap.get(a.id);
                              if (extRep) {
                                const vName = (extRep.vendorId ? vendorMap.get(extRep.vendorId) : undefined) || '외주처';
                                return (
                                  <span className="badge" style={{ fontSize: '9px', padding: '1px 4px', backgroundColor: 'var(--primary)', color: '#ffffff', whiteSpace: 'nowrap' }}>
                                    외주:{vName}
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </td>

                      {/* 10. 현재 고객사 */}
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        {custName !== '-' ? (
                          <strong style={{ color: 'var(--text-main)' }}>{custName}</strong>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>-</span>
                        )}
                      </td>

                      {/* 11. 사용 현장 */}
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                        {siteName !== '-' ? siteName : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>

                      {/* 12. 계약번호 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {ci ? <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{ci.contractNo}</span> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>

                      {/* 13. 계약기간 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {a.contractStart ? `${a.contractStart.slice(0, 10)} ~ ${a.contractEnd?.slice(0, 10) || ''}` : '-'}
                      </td>

                      {/* 14. 청구일 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {a.billingDay ? `${a.billingDay}일` : '-'}
                      </td>

                      {/* 15. 월 렌탈료 (경영진/관리부/영업부) */}
                      {hasFinancialAccess && (
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                          {a.monthlyRentalFee ? `₩${a.monthlyRentalFee.toLocaleString()}` : '-'}
                        </td>
                      )}

                      {/* 16. 임차처 - 임차자산 전용 */}
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        {renterName !== '-' ? renterName : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>

                      {/* 17. 구입/공급처 - 당사자산 전용 */}
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        {supplierName !== '-' ? supplierName : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </td>

                      {/* 18. 취득/개시일자 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {a.acquisitionDate ? a.acquisitionDate.slice(0, 10) : (a.rentStart ? a.rentStart.slice(0, 10) : '-')}
                      </td>

                      {/* 19. 취득원가 ~ 24. 기여 순익 (경영진/관리부/영업부 전용) */}
                      {hasFinancialAccess && (
                        <>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {a.ownerType === 'OWNED'
                              ? `₩${(a.acquisitionPrice || 0).toLocaleString()}`
                              : <span style={{ color: 'var(--text-muted)' }}>(임차자산)</span>}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {a.ownerType === 'OWNED'
                              ? <span style={{ color: 'var(--danger)' }}>₩{accumDepn.toLocaleString()}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {a.ownerType === 'OWNED'
                              ? <span style={{ color: 'var(--success)' }}>₩{bookVal.toLocaleString()}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            ₩{(a.cumRentalFee || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                            ₩{(a.cumRepairCost || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {netProfit >= 0 ? `+₩${netProfit.toLocaleString()}` : `-₩${Math.abs(netProfit).toLocaleString()}`}
                          </td>
                        </>
                      )}

                      {/* 25. 정비점수 */}
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span className={`badge ${(a.maintenanceScore || 0) === 0 ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '10px' }}>
                          {a.maintenanceScore || 0}점
 </span>
                      </td>

                      {/* 26. 비고 */}
                      <td style={{ padding: '6px 8px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-muted)' }} title={a.memo || a.memo1 || ''}>
                        {a.memo || a.memo1 || '-'}
                      </td>
                    </tr>
                  );
                })
              )}

              {/*  [청크 로딩 안내 & 전체 확장 행: 헌장 1.1] */}
              {visibleCount < filtered.length && (
                <tr style={{ backgroundColor: 'var(--bg-app)', borderTop: '2px dashed var(--border-color)' }}>
                  <td colSpan={hasFinancialAccess ? 28 : 21} style={{ padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        현재 <strong>{visibleAssets.length}</strong>대 표시 중 (전체 {filtered.length}대 중 잔여 {filtered.length - visibleAssets.length}대)
 </span>
                      <button
                        onClick={() => setVisibleCount(prev => Math.min(prev + 100, filtered.length))}
                        className="btn-secondary"
                        style={{ padding: '3px 10px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        +100대 더 보기
 </button>
                      <button
                        onClick={() => setVisibleCount(filtered.length)}
                        className="btn-primary"
                        style={{ padding: '3px 12px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        전체 {filtered.length}대 한 번에 펼치기
 </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ⑤ 우하단 Terminal Action: 전사 자산 회계 대차대조식 검증 바 (헌장 3.5) */}
        <div data-mid="asset-balance-bar" style={{
          padding: '8px 14px',
          backgroundColor: 'var(--bg-app)',
          borderTop: '1px solid var(--border-color)',
          boxShadow: '0 -2px 6px rgba(0,0,0,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          fontSize: '11.5px',
          borderRadius: '0 0 6px 6px',
          flexShrink: 0,
          zIndex: 15
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span>전사 등록자산: <strong style={{ color: 'var(--primary)' }}>{kpiStats.totalCount}대</strong> (실물 {kpiStats.physicalCount}대[당사 {kpiStats.ownedPhysicalTotal} + 임차 {kpiStats.rentedPhysicalTotal}(운용 {kpiStats.rentedPhysicalActive}·반납 {kpiStats.rentedPhysicalReturned})] + 가상 {kpiStats.virtualCount}대)</span>
            <span>|</span>
            <span>실물자산 가동률: <strong style={{ color: 'var(--success)' }}>{kpiStats.opRate}%</strong> [당사 {kpiStats.ownedPhysicalOpRate}% · 임차 {kpiStats.rentedPhysicalOpRate}%] (가동 {kpiStats.physicalOperatingCount}대[당사 {kpiStats.ownedPhysicalOperating}·임차 {kpiStats.rentedPhysicalOperating}] / 실물운용 {kpiStats.physicalActiveCount}대[당사 {kpiStats.ownedPhysicalActive}·임차 {kpiStats.rentedPhysicalActive}], 임대가능 {kpiStats.physicalAvailableCount}대[당사 {kpiStats.ownedPhysicalAvailable}·임차 {kpiStats.rentedPhysicalAvailable}])</span>
            <span>|</span>
            <span>당사자산 장부가 총액: <strong style={{ color: 'var(--primary)' }}>₩{kpiStats.totalBookValue.toLocaleString()}원</strong></span>
          </div>
        </div>
      </div>

      {/* ⑥ 서랍형 상세 Dossier 슬라이드오버 (헌장 3.6 마스터-디테일 스튜디오) */}
      {selectedAsset && (() => {
        const isReturned = Boolean(selectedAsset.actualRentReturnDate) || selectedAsset.status === 'RENTED_RETURNED';
        const renterName = getAssetRenterName(selectedAsset);
        const supplierName = getAssetSupplierName(selectedAsset);
        const depn = calculateAssetDepreciation(isEditing ? { ...selectedAsset, ...editForm } as Asset : selectedAsset);
        const netProfit = (selectedAsset.cumRentalFee || 0) - (selectedAsset.cumRepairCost || 0);

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '500px',
            maxWidth: '92vw',
            backgroundColor: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-color)',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.18)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideLeft 0.2s ease-in-out'
          }}>
            {/* 서랍 헤더 */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-app)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers className="text-primary" size={16} />
                <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)' }}>
                  {selectedAsset.assetNo} {isEditing ? '자산 정보 수정' : '자산 상세 명세서'}
                </span>
                {isReturned ? (
                  <span className="badge badge-secondary" style={{ fontSize: '10px' }}>반납완료</span>
                ) : (
                  <span className={`badge ${getAssetStatusBadgeClass(selectedAsset.status)}`} style={{ fontSize: '10px' }}>
                    {getAssetStatusLabel(selectedAsset.status)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {canEdit && !isEditing && selectedAsset.ownerType === 'OWNED' && selectedAsset.status === 'AVAILABLE' && (
                  <button
                    type="button"
                    onClick={() => setShowTransferToTradeForm(prev => !prev)}
                    style={{
                      padding: '3px 9px',
                      fontSize: '11px',
                      fontWeight: 800,
                      borderRadius: '4px',
                      border: '1px solid #0f766e',
                      backgroundColor: showTransferToTradeForm ? '#0f766e' : '#f0fdfa',
                      color: showTransferToTradeForm ? '#ffffff' : '#0f766e',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <RefreshCw size={11} /> 유통재고 전배
                  </button>
                )}
                {canEdit && !isEditing && (
                  <button
                    className="btn-primary"
                    data-mid='asset-edit-section' onClick={handleStartEdit}
                    style={{ padding: '3px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Edit2 size={12} /> 수정
                  </button>
                )}
                {isEditing && (
                  <>
                    <button data-hs-trigger="Save"
                      className="btn-success"
                      onClick={handleSaveEdit}
                      disabled={isSavingAsset}
                      style={{ padding: '3px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Save size={12} /> {isSavingAsset ? '저장중...' : '저장'}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={handleCancelEdit}
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      취소
 </button>
                  </>
                )}
                <button
                  onClick={() => { if (!isEditing) setSelectedAsset(null); }}
                  style={{ border: 'none', backgroundColor: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 서랍 본문 스크롤 영역 */}
            <div style={{ padding: '16px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12px' }}>
              {showTransferToTradeForm && selectedAsset.ownerType === 'OWNED' && selectedAsset.status === 'AVAILABLE' && (() => {
                const acqCost = selectedAsset.acquisitionPrice || 0;
                const accumDep = Math.round(depn.accumDepreciation || 0);
                const cumRev = Math.round(selectedAsset.cumRentalFee || 0);
                const deduction = trfMethod === 'DEPRECIATION_BOOK' ? accumDep : cumRev;
                const inheritedCost = Math.max(0, acqCost - deduction + Math.max(0, Number(trfRefurbCost) || 0));

                return (
                  <div style={{ padding: '12px', backgroundColor: '#f0fdfa', borderRadius: '6px', border: '1px solid #5eead4', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontWeight: 800, color: '#0f766e', fontSize: '12.5px' }}>
                      렌탈 유형자산에서 유통 중고상품 재고 전배 · 감가상각 장부가 승계
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={labelStyle}>장부가 산정방식</label>
                        <select
                          style={inputStyle}
                          value={trfMethod}
                          onChange={e => setTrfMethod(e.target.value as any)}
                        >
                          <option value="DEPRECIATION_BOOK">정액법 감가상각 미상각잔액 기준</option>
                          <option value="REVENUE_DEDUCT_BOOK">누적 렌탈매출 차감 미회수원가 기준</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={labelStyle}>유통 입고창고</label>
                        <select
                          style={inputStyle}
                          value={trfWarehouse}
                          onChange={e => setTrfWarehouse(e.target.value)}
                        >
                          <option value="A창고">A창고</option>
                          <option value="B창고">B창고</option>
                          <option value="부품창고">부품창고</option>
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={labelStyle}>리퍼비시 정비 가산원가</label>
                        <input
                          type="number"
                          style={inputStyle}
                          value={trfRefurbCost}
                          onChange={e => setTrfRefurbCost(Number(e.target.value))}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={labelStyle}>전배 사유</label>
                        <input
                          type="text"
                          style={inputStyle}
                          placeholder="중고 매각용 유통재고 전환"
                          value={trfMemoText}
                          onChange={e => setTrfMemoText(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px', backgroundColor: '#ffffff', borderRadius: '6px', border: '1px solid #99f6e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#0f766e', fontWeight: 700 }}>
                          취득 ₩{acqCost.toLocaleString()} - 차감 ₩{deduction.toLocaleString()} + 정비 ₩{Math.max(0, Number(trfRefurbCost) || 0).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 900, color: '#134e4a', marginTop: '2px' }}>
                          유통재고 승계 입고원가: ₩{inheritedCost.toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const today = new Date().toISOString().split('T')[0];
                            const log = await transferRentalAssetToTradeLot(selectedAsset.id, {
                              valuationMethod: trfMethod,
                              refurbishCostAmount: Number(trfRefurbCost) || 0,
                              overrideTransferCost: inheritedCost,
                              warehouseName: trfWarehouse,
                              dealerPrice: Math.round((inheritedCost * 1.15) / 10000) * 10000,
                              standardPrice: Math.round((inheritedCost * 1.25) / 10000) * 10000,
                              transferDate: today,
                              memo: trfMemoText || '렌탈자산 상세원장에서 유통 중고상품 재고로 전배'
                            });
                            showToast(`자산 [${log.assetNo}]가 유통 재고로 전배 완료되었습니다 · 승계장부가 ₩${log.inheritedBookValue.toLocaleString()}`);
                            setShowTransferToTradeForm(false);
                            setSelectedAsset(null);
                          } catch (err: any) {
                            showErrorModal(err?.message || '유통재고 전배 중 오류가 발생했습니다.');
                          }
                        }}
                        style={{
                          padding: '7px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          borderRadius: '5px',
                          border: 'none',
                          backgroundColor: '#0f766e',
                          color: '#ffffff',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        전배 확정 실행
                      </button>
                    </div>
                  </div>
                );
              })()}
              
              {/* 1. 기본 장비 물리 제원 */}
              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>1. 기본 장비 물리 제원</div>
                {isEditing ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><label style={labelStyle}>관리번호</label><input style={inputStyle} value={editForm.assetNo || ''} onChange={ef('assetNo')} /></div>
                    <div>
                      <label style={labelStyle}>모델명</label>
                      <input style={inputStyle} value={editForm.modelName || ''} onChange={ef('modelName')} />
                      {(() => { const mp = editForm.modelName ? productByModelMap.get(editForm.modelName) : undefined; return mp?.shortName ? <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>축약명: {mp.shortName}</div> : null; })()}
                    </div>
                    <div><label style={labelStyle}>제조번호</label><input style={inputStyle} value={editForm.serialNo || ''} onChange={ef('serialNo')} /></div>
                    <div><label style={labelStyle}>제조사</label><input style={inputStyle} value={editForm.manufacturer || ''} onChange={ef('manufacturer')} /></div>
                    <div><label style={labelStyle}>제조년도</label><input style={inputStyle} value={editForm.manufactureYear || ''} onChange={ef('manufactureYear')} /></div>
                    <div>
                      <label style={labelStyle}>소유구분</label>
                      <select style={inputStyle} value={editForm.ownerType || 'OWNED'} onChange={ef('ownerType')} disabled>
                        <option value="OWNED">당사자산</option>
                        <option value="RENTED">임차자산</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>자산구분</label>
                      <select
                        style={inputStyle}
                        value={editForm.assetNature || (isVirtualAsset(editForm) ? 'VIRTUAL' : 'PHYSICAL')}
                        onChange={ef('assetNature')}
                      >
                        <option value="PHYSICAL">실물</option>
                        <option value="VIRTUAL">가상</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>주기장</label>
                      <input
                        style={inputStyle}
                        value={editForm.yard ?? '용인'}
                        onChange={ef('yard')}
                        placeholder="예: 용인"
                      />
                    </div>
                    {editForm.ownerType === 'RENTED' && (
                      <div>
                        <label style={labelStyle}>협착방지봉 소유권</label>
                        <select style={inputStyle} value={editForm.antiEntrapmentOwnership || 'NONE'} onChange={ef('antiEntrapmentOwnership')}>
                          <option value="VENDOR">임차처 소유 (탈거 절대 금지)</option>
                          <option value="OURS">당사 소유 (원사 반납 전 회수)</option>
                          <option value="NONE">미장착 (없음)</option>
                        </select>
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>상태 (자동 변경)</label>
                      <select style={inputStyle} value={editForm.status || 'AVAILABLE'} onChange={ef('status')} disabled>
                        {Object.values(ASSET_STATUS_SSOT).map(st => (
                          <option key={st.code} value={st.code}>{st.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>관리번호:</span> <strong>{selectedAsset.assetNo}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>모델명:</span> <strong>{selectedAsset.modelName}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>제조사:</span> {getAssetManufacturer(selectedAsset)}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>제조번호:</span> {selectedAsset.serialNo || '-'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>연식:</span> {selectedAsset.manufactureYear ? (/^\d{4}$/.test(String(selectedAsset.manufactureYear).trim()) ? `${String(selectedAsset.manufactureYear).trim()}년` : selectedAsset.manufactureYear) : '-'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>소유구분:</span> {selectedAsset.ownerType === 'OWNED' ? '당사자산' : `임차자산 (${selectedAsset.renter || '임차처'})`}</div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>자산구분:</span>{' '}
                      <strong style={{ color: isVirtualAsset(selectedAsset) ? '#7c3aed' : 'var(--text-main)' }}>
                        {isVirtualAsset(selectedAsset) ? '가상' : '실물'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>주기장:</span>{' '}
                      <strong>{(selectedAsset.yard && String(selectedAsset.yard).trim()) || '용인'}</strong>
                    </div>
                    {selectedAsset.ownerType === 'RENTED' && (
                      <div style={{ gridColumn: 'span 2', marginTop: '2px', padding: '6px 8px', borderRadius: '4px', backgroundColor: selectedAsset.antiEntrapmentOwnership === 'VENDOR' ? 'rgba(220, 38, 38, 0.1)' : selectedAsset.antiEntrapmentOwnership === 'OURS' ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-app)', border: `1px solid ${selectedAsset.antiEntrapmentOwnership === 'VENDOR' ? 'rgba(220, 38, 38, 0.3)' : selectedAsset.antiEntrapmentOwnership === 'OURS' ? 'rgba(37, 99, 235, 0.3)' : 'var(--border-color)'}` }}>
                        <span style={{ color: 'var(--text-secondary)' }}>협착방지봉:</span>{' '}
                        {selectedAsset.antiEntrapmentOwnership === 'VENDOR' ? (
                          <strong style={{ color: '#dc2626' }}>임차처 소유 (주기장 입고 시 탈거 절대 금지 / 원형 보존)</strong>
                        ) : selectedAsset.antiEntrapmentOwnership === 'OURS' ? (
                          <strong style={{ color: '#2563eb' }}>당사 소유 (임차처 반납 전 탈거 회수)</strong>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>미장착 (없음)</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 1-2. 지게차 완제품 VDI 2198 상세 제원 및 마스트·배터리·설치형옵션 구성 */}
              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                    1-2. 지게차 완제품 VDI 2198 제원 및 설치형옵션 구성
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isEditing ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => applyModelSpecToAssetForm(editForm.modelName)}
                        style={{ padding: '2px 8px', fontSize: '10.5px', color: 'var(--primary)', borderColor: 'var(--primary)' }}
                      >
                        모델 카탈로그 제원 자동 상속
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowAssetSpecModal(true)}
                        style={{ padding: '2px 8px', fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={11} /> 완제품 제원표 보기
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* 마스트 및 배터리 카탈로그 프리셋 선택기 */}
                    {(() => {
                      const norm = (editForm.modelName || selectedAsset.modelName || '').replace(/[\s\-_]/g, '').toUpperCase();
                      const prod = productByModelMap.get(editForm.modelName || '') || productByModelMap.get(norm);
                      const arch: any = FL_TECHNICAL_ARCHIVE.find((x: any) => (x.modelName || x.modelCode || '').replace(/[\s\-_]/g, '').toUpperCase() === norm || (x.shortName || '').replace(/[\s\-_]/g, '').toUpperCase() === norm);
                      const mastList = editForm.mastSpecs || prod?.mastSpecs || arch?.mastSpecs || [];
                      const batList = editForm.batteryOptions || prod?.batteryOptions || arch?.batteryOptions || [];
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', padding: '6px 8px', backgroundColor: 'var(--bg-card)', borderRadius: '4px', border: '1px dashed var(--border-color)' }}>
                          <div>
                            <label style={{ ...labelStyle, color: 'var(--primary)' }}>카탈로그 마스트 단수·높이 선택</label>
                            <select
                              style={inputStyle}
                              value={editForm.mastModelCode || ''}
                              onChange={e => {
                                const m = mastList.find((x: any) => (x.mastModelCode || x.mastModel) === e.target.value);
                                if (m) {
                                  setEditForm(prev => ({
                                    ...prev,
                                    mastType: m.mastType,
                                    mastModelCode: m.mastModelCode || m.mastModel,
                                    standardLiftHeightMm: m.liftHeightH3Mm,
                                    mastLoweredH1Mm: m.loweredHeightH1Mm,
                                    freeLiftHeightMm: Number(String(m.freeLiftH2Mm || m.freeLiftWithBackrestH2Mm || 150).replace(/[^0-9]/g, '')) || 150,
                                    mastExtendedH4Mm: Number(String(m.extendedHeightH4Mm || m.extendedHeightWithBackrestH4Mm || 4000).replace(/[^0-9]/g, '')) || 4000,
                                    mastTiltDeg: m.tiltAngleDeg,
                                  }));
                                }
                              }}
                            >
                              <option value="">-- 장착 마스트 규격 직접 입력 또는 선택 --</option>
                              {mastList.map((m: any, idx: number) => {
                                const code = m.mastModelCode || m.mastModel;
                                return (
                                  <option key={idx} value={code}>
                                    {m.mastType} [{code}] · 인상고 {m.liftHeightH3Mm}mm / 전고 {m.loweredHeightH1Mm}mm
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                          <div>
                            <label style={{ ...labelStyle, color: 'var(--primary)' }}>카탈로그 배터리·전원 사양 선택</label>
                            <select
                              style={inputStyle}
                              defaultValue=""
                              onChange={e => {
                                const b = batList.find((x: any) => (x.optionCode || x.batteryModel) === e.target.value);
                                if (b) {
                                  setEditForm(prev => ({
                                    ...prev,
                                    batteryVoltageCapacity: b.voltageCapacity || `${b.voltageV}V / ${b.capacityAh}Ah`,
                                    batteryWeightKg: String(b.weightKg),
                                    chargerOrFuelDetail: b.chargerSpec || b.chargerOptions,
                                  }));
                                }
                              }}
                            >
                              <option value="">-- 장착 배터리 사양 직접 입력 또는 선택 --</option>
                              {batList.map((b: any, idx: number) => {
                                const code = b.optionCode || b.batteryModel;
                                return (
                                  <option key={idx} value={code}>
                                    [{code}] {b.batteryType || '리튬'} {b.voltageCapacity || `${b.voltageV}V/${b.capacityAh}Ah`} · {b.weightKg}kg
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        </div>
                      );
                    })()}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>정격하중 kg · 1.5</label><input type="number" style={inputStyle} value={editForm.ratedCapacityKg ?? ''} onChange={ef('ratedCapacityKg')} /></div>
                      <div><label style={labelStyle}>하중중심 mm · 1.6</label><input type="number" style={inputStyle} value={editForm.loadCenterMm ?? ''} onChange={ef('loadCenterMm')} /></div>
                      <div><label style={labelStyle}>장착 마스트 구분 · 4.1</label><input style={inputStyle} placeholder="예: 2단 표준 마스트 / 3단 풀프리 TF" value={editForm.mastType || ''} onChange={ef('mastType')} /></div>
                      <div><label style={labelStyle}>마스트 모델코드</label><input style={inputStyle} placeholder="예: M300 / ZM470" value={editForm.mastModelCode || ''} onChange={ef('mastModelCode')} /></div>
                      <div><label style={labelStyle}>장착 인상고 h3 mm · 4.4</label><input type="number" style={inputStyle} value={editForm.standardLiftHeightMm ?? ''} onChange={ef('standardLiftHeightMm')} /></div>
                      <div><label style={labelStyle}>마스트 전고 h1 mm · 4.2</label><input type="number" style={inputStyle} value={editForm.mastLoweredH1Mm ?? ''} onChange={ef('mastLoweredH1Mm')} /></div>
                      <div><label style={labelStyle}>자유인상고 h2 mm · 4.3</label><input type="number" style={inputStyle} value={editForm.freeLiftHeightMm ?? ''} onChange={ef('freeLiftHeightMm')} /></div>
                      <div><label style={labelStyle}>최대 신장높이 h4 mm · 4.5</label><input type="number" style={inputStyle} value={editForm.mastExtendedH4Mm ?? ''} onChange={ef('mastExtendedH4Mm')} /></div>
                      <div><label style={labelStyle}>장착 포크 규격 s·e·l · 4.22</label><input style={inputStyle} placeholder="예: 40 × 122 × 1,070 mm" value={editForm.forkDimensionsMm || ''} onChange={ef('forkDimensionsMm')} /></div>
                      <div><label style={labelStyle}>캐리지 등급 · 4.23</label><input style={inputStyle} placeholder="예: ISO 2328 2A" value={editForm.forkCarriageClass || ''} onChange={ef('forkCarriageClass')} /></div>
                      <div><label style={labelStyle}>장착 배터리 전압·용량 · 6.4</label><input style={inputStyle} placeholder="예: 80V / 271Ah" value={editForm.batteryVoltageCapacity || ''} onChange={ef('batteryVoltageCapacity')} /></div>
                      <div><label style={labelStyle}>배터리 중량 kg · 6.5</label><input style={inputStyle} placeholder="예: 215" value={editForm.batteryWeightKg || ''} onChange={ef('batteryWeightKg')} /></div>
                      <div><label style={labelStyle}>장비 자중 kg · 2.1</label><input type="number" style={inputStyle} value={editForm.serviceWeightKg ?? ''} onChange={ef('serviceWeightKg')} /></div>
                      <div><label style={labelStyle}>타이어 규격 전·후 · 3.2</label><input style={inputStyle} value={editForm.tireSpecFrontRear || ''} onChange={ef('tireSpecFrontRear')} /></div>
                    </div>

                    {/* 임대 자산 장착 설치형옵션 (19종 마스터 연동) */}
                    <div style={{ marginTop: '4px', padding: '8px', backgroundColor: 'var(--bg-card)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--primary)', marginBottom: '6px' }}>
                        ■ 임대 장비 장착 설치형옵션 선택 · 총 19종 마스터 연동
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', maxHeight: '190px', overflowY: 'auto' }}>
                        {MUJIN_OPTION_MASTERS.map(opt => {
                          const checked = (editForm.appliedOptions || []).some(o => o.optionCode === opt.optionCode || o.name === opt.optionName) ||
                            (editForm.installedOptions || []).includes(opt.optionName);
                          return (
                            <label
                              key={opt.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '4px',
                                padding: '4px 6px',
                                borderRadius: '4px',
                                border: `1px solid ${checked ? 'var(--primary)' : 'var(--border-color)'}`,
                                backgroundColor: checked ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-app)',
                                cursor: 'pointer',
                                fontSize: '11px'
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleAssetInstalledOption(opt)}
                                />
                                <span style={{ fontWeight: checked ? 700 : 500 }}>{opt.optionName}</span>
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '10px', flexShrink: 0 }}>
                                월 {(opt.monthlyFee / 10000).toFixed(0)}만
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11.5px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      <div><span style={{ color: 'var(--text-secondary)' }}>시리즈 · 동력:</span> <strong>{selectedAsset.seriesName || selectedAsset.powerSource || '-'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>정격하중 · 중심:</span> <strong style={{ color: 'var(--primary)' }}>{selectedAsset.ratedCapacityKg ? `${selectedAsset.ratedCapacityKg.toLocaleString()} kg` : '-'} / {selectedAsset.loadCenterMm || 500} mm</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>장착 마스트:</span> <strong>{selectedAsset.mastType || '-'} {selectedAsset.mastModelCode ? `[${selectedAsset.mastModelCode}]` : ''}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>장착 인상고 h3:</span> <strong>{selectedAsset.standardLiftHeightMm ? `${selectedAsset.standardLiftHeightMm.toLocaleString()} mm` : '-'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>전고 h1 / 최대 h4:</span> {selectedAsset.mastLoweredH1Mm || '-'} / {selectedAsset.mastExtendedH4Mm || '-'} mm</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>자유인상고 h2:</span> {selectedAsset.freeLiftHeightMm ? `${selectedAsset.freeLiftHeightMm} mm` : '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>장착 포크 규격:</span> <strong>{selectedAsset.forkDimensionsMm || '-'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>캐리지 · 회전반경:</span> {selectedAsset.forkCarriageClass || '-'} / {selectedAsset.turningRadiusMm ? `${selectedAsset.turningRadiusMm} mm` : '-'}</div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>장착 배터리:</span> <strong style={{ color: '#059669' }}>{selectedAsset.batteryVoltageCapacity || selectedAsset.powerSpecDetail || '-'}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>장비 자중 · 타이어:</span> {selectedAsset.serviceWeightKg ? `${selectedAsset.serviceWeightKg.toLocaleString()} kg` : '-'} / {selectedAsset.tireType || '-'}</div>
                    </div>

                    {/* 장착된 설치형옵션 배지 노출 */}
                    {(() => {
                      const instList = Array.isArray(selectedAsset.installedOptions)
                        ? selectedAsset.installedOptions
                        : String(selectedAsset.installedOptions || '').split(/[·,]/).map(s => s.trim()).filter(Boolean);
                      const count = selectedAsset.appliedOptions?.length || instList.length;
                      return (
                        <div style={{ padding: '8px', borderRadius: '4px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                            <span>장착 설치형옵션 구성 ({count}건)</span>
                            {selectedAsset.appliedOptions && selectedAsset.appliedOptions.length > 0 && (
                              <span style={{ color: 'var(--primary)' }}>
                                월 옵션가 합계: +₩{selectedAsset.appliedOptions.reduce((acc, o) => acc + (o.isFreeService ? 0 : (o.monthlyFee || 0) * (o.quantity || 1)), 0).toLocaleString()}
                              </span>
                            )}
                          </div>
                          {(selectedAsset.appliedOptions && selectedAsset.appliedOptions.length > 0) ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {selectedAsset.appliedOptions.map((opt, idx) => (
                                <span key={idx} className="badge badge-primary" style={{ fontSize: '10.5px', padding: '2px 7px' }}>
                                  {opt.name} {opt.monthlyFee ? `· 월 ₩${opt.monthlyFee.toLocaleString()}` : ''}
                                </span>
                              ))}
                            </div>
                          ) : instList.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                              {instList.map((optName: string, idx: number) => (
                                <span key={idx} className="badge badge-primary" style={{ fontSize: '10.5px', padding: '2px 7px' }}>
                                  {optName}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>장착된 설치형옵션이 없습니다.</div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* 2. 현재 운용 / 임대 현황 */}
              <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>2. 현재 운용 / 임대 현황</div>
                {isEditing ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div><label style={labelStyle}>월 렌탈료 (원)</label><input type="number" style={inputStyle} value={editForm.monthlyRentalFee ?? ''} onChange={ef('monthlyRentalFee')} /></div>
                    <div><label style={labelStyle}>일 렌탈료 (원)</label><input type="number" style={inputStyle} value={editForm.dailyRentalFee ?? ''} onChange={ef('dailyRentalFee')} /></div>
                    <div><label style={labelStyle}>계산서 마감일 (일)</label><input type="number" style={inputStyle} value={editForm.billingDay ?? ''} onChange={ef('billingDay')} /></div>
                    <div><label style={labelStyle}>계약 시작일</label><input type="date" style={inputStyle} value={editForm.contractStart || ''} onChange={ef('contractStart')} /></div>
                    <div><label style={labelStyle}>계약 종료일</label><input type="date" style={inputStyle} value={editForm.contractEnd || ''} onChange={ef('contractEnd')} /></div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>계약번호:</span> {(() => { const ci = getAssetContractInfo(selectedAsset.id); return ci ? <strong style={{ color: 'var(--primary)' }}>{ci.contractNo}</strong> : '-'; })()}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>현재 고객사:</span> <strong>{getCustomerName(selectedAsset.currentCustomerId)}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>사용 현장:</span> {getSiteName(selectedAsset.currentSiteId)}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>계산서 마감일:</span> {selectedAsset.billingDay ? `매달 ${selectedAsset.billingDay}일` : '-'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>월 렌탈료:</span> <strong>₩{(selectedAsset.monthlyRentalFee || 0).toLocaleString()}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>일 렌탈료:</span> <strong>₩{(selectedAsset.dailyRentalFee || Math.floor((selectedAsset.monthlyRentalFee || 0) / 30)).toLocaleString()}</strong></div>
                    <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text-secondary)' }}>계약 기간:</span> {selectedAsset.contractStart ? `${selectedAsset.contractStart} ~ ${selectedAsset.contractEnd}` : '-'}</div>
                  </div>
                )}
              </div>

              {/* 3. 소유 속성별 자산 및 재무 정보 */}
              {(isEditing ? editForm.ownerType === 'OWNED' : selectedAsset.ownerType === 'OWNED') ? (
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                    3. 당사자산 {hasFinancialAccess ? '감가상각 / 장부가치' : '취득 및 운용 정보'}
                  </div>
                  {isEditing ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div><label style={labelStyle}>취득일자</label><input type="date" style={inputStyle} value={editForm.acquisitionDate || ''} onChange={ef('acquisitionDate')} /></div>
                      {hasFinancialAccess && (
                        <div><label style={labelStyle}>취득원가 (원)</label><input type="number" min={0} style={inputStyle} value={editForm.acquisitionPrice ?? ''} onChange={ef('acquisitionPrice')} /></div>
                      )}
                      <div><label style={labelStyle}>구입처 (공급자)</label><input style={inputStyle} value={editForm.supplier || ''} onChange={ef('supplier')} /></div>
                      <div><label style={labelStyle}>내용연수(개월)</label><input type="number" min={0} style={inputStyle} value={editForm.depreciationMonths ?? ''} onChange={ef('depreciationMonths')} /></div>
                      {hasFinancialAccess && (
                        <div><label style={labelStyle}>잔존가치율 (%)</label><input type="number" min={0} max={100} style={inputStyle} value={editForm.residualValueRate ?? ''} onChange={ef('residualValueRate')} /></div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                      <div><span style={{ color: 'var(--text-secondary)' }}>취득일자:</span> {selectedAsset.acquisitionDate || '-'}</div>
                      {hasFinancialAccess && (
                        <div><span style={{ color: 'var(--text-secondary)' }}>취득원가:</span> <strong>₩{(selectedAsset.acquisitionPrice || 0).toLocaleString()}</strong></div>
                      )}
                      <div><span style={{ color: 'var(--text-secondary)' }}>구입처:</span> <strong>{supplierName}</strong></div>
                      <div><span style={{ color: 'var(--text-secondary)' }}>내용연수:</span> {selectedAsset.depreciationMonths ? `${selectedAsset.depreciationMonths}개월 (경과: ${depn.elapsedMonths}개월)` : '-'}</div>
                      {hasFinancialAccess && (
                        <>
                          <div><span style={{ color: 'var(--text-secondary)' }}>감가누계액:</span> <strong style={{ color: 'var(--danger)' }}>₩{depn.accumDepreciation.toLocaleString()}</strong></div>
                          <div><span style={{ color: 'var(--text-secondary)' }}>미상각 장부가:</span> <strong style={{ color: 'var(--success)' }}>₩{depn.bookValue.toLocaleString()}</strong></div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>3. 임차 약정 조건</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>임차처:</span> <strong>{renterName}</strong></div>
                    {hasFinancialAccess && (
                      <div><span style={{ color: 'var(--text-secondary)' }}>월 임차료:</span> <strong style={{ color: 'var(--danger)' }}>₩{(selectedAsset.monthlyRentFee || 0).toLocaleString()}</strong></div>
                    )}
                    <div><span style={{ color: 'var(--text-secondary)' }}>임차 시작일:</span> {selectedAsset.rentStart || '-'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>임차 만료예정:</span> {selectedAsset.rentEnd || '-'}</div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>임차처 반납일:</span> {selectedAsset.actualRentReturnDate ? <span style={{ color: 'var(--success)', fontWeight: 600 }}>{selectedAsset.actualRentReturnDate} (반납)</span> : '미반납'}</div>
                    <div>
                      <span style={{ color: 'var(--text-secondary)' }}>협착방지봉:</span>{' '}
                      {selectedAsset.antiEntrapmentOwnership === 'VENDOR' ? (
                        <strong style={{ color: '#dc2626' }}>임차처 소유 (탈거 금지)</strong>
                      ) : selectedAsset.antiEntrapmentOwnership === 'OURS' ? (
                        <strong style={{ color: '#2563eb' }}>당사 소유 (회수 대상)</strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>미장착</span>
                      )}
                    </div>
                    {hasFinancialAccess && (
                      <div><span style={{ color: 'var(--text-secondary)' }}>일 임차료:</span> ₩{(selectedAsset.dailyRentFee || Math.floor((selectedAsset.monthlyRentFee || 0) / 30)).toLocaleString()}</div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. 자산 손익 및 공헌이익 (경영진, 관리부, 영업부 전용) */}
              {hasFinancialAccess && (
                <div style={{ padding: '10px 12px', backgroundColor: 'var(--bg-app)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>4. 누적 손익 및 공헌이익</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11.5px' }}>
                    <div><span style={{ color: 'var(--text-secondary)' }}>누적 렌탈수익:</span> <strong style={{ color: 'var(--primary)' }}>₩{(selectedAsset.cumRentalFee || 0).toLocaleString()}</strong></div>
                    <div><span style={{ color: 'var(--text-secondary)' }}>누적 수리비:</span> <strong style={{ color: 'var(--danger)' }}>₩{(selectedAsset.cumRepairCost || 0).toLocaleString()}</strong></div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>기여 순이익:</span>{' '}
                      <strong style={{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '13px' }}>
                        {netProfit >= 0 ? `+₩${netProfit.toLocaleString()}` : `-₩${Math.abs(netProfit).toLocaleString()}`}
                      </strong>
                    </div>
                  </div>
                </div>
              )}

              {/* 5. 정비 및 검수 이력 현황 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>5. 정비 및 감사 이력 현황</div>
                  <button
                    type="button"
                    className="btn-secondary"
                    data-mid='btn-export-asset-history' onClick={() => handleExportAssetHistoryExcel(selectedAsset)}
                    style={{ padding: '2px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <Download size={11} /> 이력 엑셀
 </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-app)', padding: '8px 10px', borderRadius: '4px', fontSize: '11.5px' }}>
                  <span>정비필요점수: <strong>{selectedAsset.maintenanceScore || 0}점</strong></span>
                  <span>|</span>
                  <span>누적 수리: <strong>{repairs.filter((r: Repair) => r.assetId === selectedAsset.id).length}회</strong></span>
                </div>

                {/* 이력 타임라인 */}
                <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(() => {
                    const unifiedLogs = getUnifiedAssetLogs(selectedAsset);
                    if (unifiedLogs.length === 0) {
                      return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>기록된 이력이 없습니다.</div>;
                    }
                    return unifiedLogs.map((log: AssetInOutLog, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-app)',
                          border: '1px solid var(--border-color)',
                          fontSize: '11px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className={`badge ${log.type === 'ACQUISITION' ? 'badge-info' : log.type === 'OUTBOUND' ? 'badge-primary' : log.type === 'INBOUND' ? 'badge-success' : log.type === 'DISPOSAL' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '9.5px' }}>
                            {log.type === 'ACQUISITION' ? '취득' : log.type === 'OUTBOUND' ? '출고' : log.type === 'INBOUND' ? '입고' : log.type === 'INBOUND_CANCEL' ? '입고취소' : log.type === 'DISPOSAL' ? '매각' : '정비'}
                          </span>
                          <span style={{ color: 'var(--text-muted)' }}>{log.eventDate}</span>
                        </div>
                        <div style={{ color: 'var(--text-main)', marginTop: '2px' }}>{log.memo || '이상 무'}</div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>

            {/* 서랍 푸터 */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedAsset(null)}
                style={{ padding: '5px 14px', fontSize: '12px' }}
              >
                닫기
 </button>
            </div>
          </div>
        );
      })()}

      {/* ⑦ 임대용 FL 완제품 VDI 2198 제원표 모달 */}
      {showAssetSpecModal && selectedAsset && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1150,
          padding: '20px'
        }}>
          <div className="card" style={{
            width: '100%', maxWidth: '860px', maxHeight: '90vh', overflowY: 'auto',
            backgroundColor: 'var(--bg-card)', color: 'var(--text-main)', padding: '20px', borderRadius: '8px', boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
                [{selectedAsset.assetNo} · {selectedAsset.modelName}] 임대용 지게차 완제품 VDI 2198 제원표
              </h3>
              <button
                type="button"
                onClick={() => setShowAssetSpecModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '14px', textAlign: 'center' }}>
              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>정격하중 · 하중중심</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--primary)', marginTop: '3px' }}>
                  {(selectedAsset.ratedCapacityKg || 2500).toLocaleString()} kg / {selectedAsset.loadCenterMm || 500} mm
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>장착 마스트 · 인상고</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginTop: '3px' }}>
                  {selectedAsset.mastModelCode || selectedAsset.mastType || '표준 2단'} · {(selectedAsset.standardLiftHeightMm || 3000).toLocaleString()} mm
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>장착 배터리 · 전원</div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#059669', marginTop: '3px' }}>
                  {selectedAsset.batteryVoltageCapacity || selectedAsset.powerSource || '-'}
                </div>
              </div>
              <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 700 }}>장착 포크 · 자중</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', marginTop: '3px' }}>
                  {selectedAsset.forkDimensionsMm || '-'} / {(selectedAsset.serviceWeightKg || 0).toLocaleString()} kg
                </div>
              </div>
            </div>

            {/* 설치형옵션 장착 현황 */}
            <div style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--primary)' }}>
                ■ 해당 임대 장비에 장착된 설치형옵션 내역 ({selectedAsset.appliedOptions?.length || selectedAsset.installedOptions?.length || 0}건)
              </div>
              {(selectedAsset.appliedOptions && selectedAsset.appliedOptions.length > 0) ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid var(--border-color)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left', borderRight: '1px solid var(--border-color)' }}>옵션코드</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', borderRight: '1px solid var(--border-color)' }}>분류</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', borderRight: '1px solid var(--border-color)' }}>설치형옵션명</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right', borderRight: '1px solid var(--border-color)' }}>월 렌탈 가산단가</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right' }}>1회성 유상청구단가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAsset.appliedOptions.map((opt, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 700, color: 'var(--primary)', borderRight: '1px solid var(--border-color)' }}>{opt.optionCode || '-'}</td>
                        <td style={{ padding: '4px 8px', borderRight: '1px solid var(--border-color)' }}>{opt.category || '-'}</td>
                        <td style={{ padding: '4px 8px', fontWeight: 700, borderRight: '1px solid var(--border-color)' }}>{opt.name}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, borderRight: '1px solid var(--border-color)' }}>₩{(opt.monthlyFee || 0).toLocaleString()}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right' }}>₩{(opt.unitPrice || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>장착된 설치형옵션이 없습니다.</div>
              )}
            </div>

            {Array.isArray(selectedAsset.vdiSpecs) && selectedAsset.vdiSpecs.length > 0 && (
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px', color: 'var(--text-main)' }}>
                  ■ VDI 2198 / ISO 5053 국제표준 전 항목 제원표 (총 {selectedAsset.vdiSpecs.length}개 항목)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid var(--border-color)' }}>
                  <thead>
                    <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ padding: '4px 8px', textAlign: 'left', width: '56px', borderRight: '1px solid var(--border-color)' }}>코드</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', width: '74px', borderRight: '1px solid var(--border-color)' }}>분류</th>
                      <th style={{ padding: '4px 8px', textAlign: 'left', borderRight: '1px solid var(--border-color)' }}>제원 항목명</th>
                      <th style={{ padding: '4px 8px', textAlign: 'center', width: '64px', borderRight: '1px solid var(--border-color)' }}>단위</th>
                      <th style={{ padding: '4px 8px', textAlign: 'right', width: '180px' }}>장비 사양값</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAsset.vdiSpecs.map((row: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 700, borderRight: '1px solid var(--border-color)', color: 'var(--primary)' }}>{row.code}</td>
                        <td style={{ padding: '4px 8px', borderRight: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>{row.section}</td>
                        <td style={{ padding: '4px 8px', borderRight: '1px solid var(--border-color)' }}>{row.labelKo}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'center', borderRight: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>{row.unit || '-'}</td>
                        <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700 }}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowAssetSpecModal(false)}
                style={{ padding: '5px 14px', fontSize: '12px' }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// 헬퍼 스타일
const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  fontWeight: '600',
  display: 'block',
  marginBottom: '3px',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '5px 8px',
  fontSize: '12px',
  borderRadius: '4px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-app)',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
};
