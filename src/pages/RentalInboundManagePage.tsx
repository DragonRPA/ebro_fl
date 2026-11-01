import React, { useState, useMemo } from 'react';
import { PackagePlus, AlertTriangle, CheckCircle2, CreditCard, Plus, Wrench } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_CUSTOMERS, SEED_FL_SITES, SEED_FL_RENTAL_ASSETS, SEED_FL_CONTRACTS } from '../data/flUnifiedSeedData';

export interface ForkliftDefectSymptomMaster {
  id: string;
  code: string;
  category: string;
  symptomName: string;
  standardRepairCost: number;
  maintenanceScore: number;
  defaultResponsibility: '사용자 귀책 · 유상청구' | '자연마모 · 당사부담';
}

export const FORKLIFT_DEFECT_SYMPTOM_MASTERS: ForkliftDefectSymptomMaster[] = [
  {
    id: 'SYM-FL-001',
    code: 'DEF-FORK-01',
    category: '포크·어태치먼트',
    symptomName: '포크 암 휨 변형 및 팁 균열 파손',
    standardRepairCost: 420000,
    maintenanceScore: 25,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-002',
    code: 'DEF-MAST-01',
    category: '마스트·유압계통',
    symptomName: '사이드시프트 유압호스 절단 및 피팅 누유',
    standardRepairCost: 185000,
    maintenanceScore: 15,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-003',
    code: 'DEF-CAB-01',
    category: '캐빈·외관차체',
    symptomName: '전방 캐빈 안전강화유리 파손 및 프레임 찍힘',
    standardRepairCost: 350000,
    maintenanceScore: 20,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-004',
    code: 'DEF-TIRE-01',
    category: '타이어·주행부',
    symptomName: '전륜 솔리드타이어 측면 코드절상 파손',
    standardRepairCost: 310000,
    maintenanceScore: 20,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-005',
    code: 'DEF-ELEC-01',
    category: '전장·안전장치',
    symptomName: '후방감지센서 및 블루스팟 안전등 충돌 파손',
    standardRepairCost: 140000,
    maintenanceScore: 10,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-006',
    code: 'DEF-BAT-01',
    category: '배터리·충전기',
    symptomName: '충전 플러그 하우징 파손 및 케이블 피복 손상',
    standardRepairCost: 165000,
    maintenanceScore: 15,
    defaultResponsibility: '사용자 귀책 · 유상청구'
  },
  {
    id: 'SYM-FL-007',
    code: 'DEF-NORM-01',
    category: '정기점검·소모성',
    symptomName: '마스트 체인 장력 이완 및 일반 윤활 점검',
    standardRepairCost: 0,
    maintenanceScore: 5,
    defaultResponsibility: '자연마모 · 당사부담'
  }
];

interface RentalInboundRecord {
  id: string;
  inboundNo: string;
  inboundDate: string;
  contractId: string;
  contractNo: string;
  customerId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  assetId: string;
  assetNo: string;
  modelName: string;
  yardName: string;
  returnFreightCost: number;
  selectedSymptomIds: string[];
  inspectorNote: string;
  claimAmount: number;
  claimStatus: '불량없음·정상입고' | '불량판정·청구대기' | '고객청구생성완료';
  nextAssetStatus: '임대가능' | '수리중';
}

const INITIAL_RENTAL_INBOUNDS: RentalInboundRecord[] = [
  {
    id: 'RIN-202610-001',
    inboundNo: 'RIN-202610-001',
    inboundDate: '2026-10-22',
    contractId: 'CTR-R2607-002',
    contractNo: 'RNT-202607-002',
    customerId: 'CUST-FL-002',
    customerName: '태양중공업 주식회사',
    siteId: 'SITE-FL-004',
    siteName: '함안 철강구조물 야적장 현장',
    assetId: 'AST-FL-006',
    assetNo: 'FL-006',
    modelName: '두산밥캣 D35S-9 디젤 3.5톤',
    yardName: '평택 본사 주기장',
    returnFreightCost: 320000,
    selectedSymptomIds: ['SYM-FL-002', 'SYM-FL-005'],
    inspectorNote: '철강 자재 상하차 중 사이드시프트 유압호스 손상 및 후방감지센서 파손 확인 · 고객 유상청구 대상',
    claimAmount: 325000,
    claimStatus: '불량판정·청구대기',
    nextAssetStatus: '수리중'
  },
  {
    id: 'RIN-202610-002',
    inboundNo: 'RIN-202610-002',
    inboundDate: '2026-10-28',
    contractId: 'CTR-R2607-001',
    contractNo: 'RNT-202607-001',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    siteId: 'SITE-FL-002',
    siteName: '안성 스마트풀필먼트센터 현장',
    assetId: 'AST-FL-004',
    assetNo: 'FL-004',
    modelName: '비와이디 ECB25 리튬전동 2.5톤',
    yardName: '평택 본사 주기장',
    returnFreightCost: 180000,
    selectedSymptomIds: [],
    inspectorNote: '외관 및 유압·전장 이상 없음 · 세척 후 즉시 임대가능 전환',
    claimAmount: 0,
    claimStatus: '불량없음·정상입고',
    nextAssetStatus: '임대가능'
  },
  {
    id: 'RIN-202610-003',
    inboundNo: 'RIN-202610-003',
    inboundDate: '2026-10-30',
    contractId: 'CTR-R2607-003',
    contractNo: 'RNT-202607-003',
    customerId: 'CUST-FL-003',
    customerName: '주식회사 서해글로벌모터스',
    siteId: 'SITE-FL-006',
    siteName: '화성 전동화부품 조립공장 현장',
    assetId: 'AST-FL-008',
    assetNo: 'FL-008',
    modelName: '클라크 GTS30D 디젤 3.0톤',
    yardName: '평택 본사 주기장',
    returnFreightCost: 200000,
    selectedSymptomIds: ['SYM-FL-003'],
    inspectorNote: '전방 캐빈 강화유리 크랙 확인 · 사용자 귀책 수리비 청구서 생성 완료',
    claimAmount: 350000,
    claimStatus: '고객청구생성완료',
    nextAssetStatus: '수리중'
  }
];

export const RentalInboundManagePage: React.FC = () => {
  const { setActiveTab } = useApp();
  const [inbounds, setInbounds] = useState<RentalInboundRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ebro_fl_rental_inbounds_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_RENTAL_INBOUNDS;
  });
  const [selectedId, setSelectedId] = useState<string>('RIN-202610-001');
  const [showNewModal, setShowNewModal] = useState<boolean>(false);
  const [newContractId, setNewContractId] = useState<string>('CTR-R2607-001');
  const [newAssetId, setNewAssetId] = useState<string>('AST-FL-001');
  const [newYardName, setNewYardName] = useState<string>('평택 본사 주기장');
  const [newFreightCost, setNewFreightCost] = useState<number>(200000);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  React.useEffect(() => {
    try {
      localStorage.setItem('ebro_fl_rental_inbounds_v1', JSON.stringify(inbounds));
    } catch {}
  }, [inbounds]);

  const updateInbounds = (updater: (prev: RentalInboundRecord[]) => RentalInboundRecord[]) => {
    setInbounds(prev => updater(prev));
  };

  const selectedRecord = useMemo(() => {
    return inbounds.find(r => r.id === selectedId) || inbounds[0];
  }, [inbounds, selectedId]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const toggleSymptom = (symptom: ForkliftDefectSymptomMaster) => {
    if (!selectedRecord) return;
    if (selectedRecord.claimStatus === '고객청구생성완료') {
      showToast('이미 고객 수리비 청구 생성이 완료된 반납입고 건은 불량증상을 변경할 수 없습니다.');
      return;
    }
    updateInbounds(prev => prev.map(row => {
      if (row.id !== selectedRecord.id) return row;
      const exists = row.selectedSymptomIds.includes(symptom.id);
      const nextIds = exists
        ? row.selectedSymptomIds.filter(id => id !== symptom.id)
        : [...row.selectedSymptomIds, symptom.id];
      const nextClaimAmount = nextIds.reduce((sum, sid) => {
        const found = FORKLIFT_DEFECT_SYMPTOM_MASTERS.find(m => m.id === sid);
        return sum + (found?.standardRepairCost || 0);
      }, 0);
      return {
        ...row,
        selectedSymptomIds: nextIds,
        claimAmount: nextClaimAmount,
        claimStatus: nextClaimAmount > 0 ? '불량판정·청구대기' : '불량없음·정상입고',
        nextAssetStatus: nextIds.length > 0 ? '수리중' : '임대가능'
      };
    }));
  };

  const handleGenerateCustomerClaim = () => {
    if (!selectedRecord) return;
    if (selectedRecord.claimStatus === '고객청구생성완료') {
      showToast('이미 고객 수리비 청구 생성이 완료된 건입니다.');
      return;
    }
    const hasSymptoms = selectedRecord.selectedSymptomIds.length > 0;
    if (selectedRecord.claimAmount <= 0) {
      const nextStatus = hasSymptoms ? '수리중' : '임대가능';
      showToast(hasSymptoms
        ? '당사부담 경정비 항목이 선택되어 수리중 상태로 입고 확정되었습니다.'
        : '선택된 유상 불량증상이 없습니다. 불량없음 정상입고로 확정합니다.');
      updateInbounds(prev => prev.map(r => r.id === selectedRecord.id ? {
        ...r,
        claimAmount: 0,
        claimStatus: '불량없음·정상입고',
        nextAssetStatus: nextStatus
      } : r));
      return;
    }
    updateInbounds(prev => prev.map(r => r.id === selectedRecord.id ? {
      ...r,
      claimStatus: '고객청구생성완료',
      nextAssetStatus: '수리중'
    } : r));
    showToast(`${selectedRecord.customerName} 앞 입고 불량 수리비 청구 (₩${selectedRecord.claimAmount.toLocaleString('ko-KR')}) 생성 및 정비관리-렌탈 이관이 완료되었습니다.`);
  };

  const handleRegisterNewInbound = () => {
    const ctr = SEED_FL_CONTRACTS.find(c => c.id === newContractId) || SEED_FL_CONTRACTS[0];
    const ast = SEED_FL_RENTAL_ASSETS.find(a => a.id === newAssetId) || SEED_FL_RENTAL_ASSETS[0];
    const cust = SEED_FL_CUSTOMERS.find(c => c.id === ctr.customerId) || SEED_FL_CUSTOMERS[0];
    const site = SEED_FL_SITES.find(s => s.id === ctr.siteId) || SEED_FL_SITES[0];
    const newId = `RIN-202611-${String(inbounds.length + 1).padStart(3, '0')}`;
    const newRow: RentalInboundRecord = {
      id: newId,
      inboundNo: newId,
      inboundDate: new Date().toISOString().split('T')[0],
      contractId: ctr.id,
      contractNo: ctr.contractNo,
      customerId: cust.id,
      customerName: cust.name,
      siteId: site.id,
      siteName: site.name,
      assetId: ast.id,
      assetNo: ast.assetNo,
      modelName: ast.modelName,
      yardName: newYardName,
      returnFreightCost: Math.max(0, Number(newFreightCost) || 0),
      selectedSymptomIds: [],
      inspectorNote: '반납 입고 검수 진행 중',
      claimAmount: 0,
      claimStatus: '불량없음·정상입고',
      nextAssetStatus: '임대가능'
    };
    updateInbounds(prev => [newRow, ...prev]);
    setSelectedId(newId);
    setShowNewModal(false);
    showToast(`반납입고 건 [${newId}]이 등록되었습니다. 우측에서 불량증상 판정을 진행하세요.`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '10px 16px', borderRadius: '6px', backgroundColor: '#dcfce7', border: '1px solid #86efac', color: '#166534', fontSize: '12.5px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      {/* 상단 헤더 */}
      <div className="card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackagePlus size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
              입고관리-렌탈 · 렌탈자산 반납입고 등록, 불량증상 판단 및 사용자 수리비 청구
            </h2>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            현장 반납 렌탈자산의 입고 등록과 동시에 불량증상 마스터를 기반으로 파손 여부를 판정하고 사용자에게 수리비를 청구합니다.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('inspection_checklist_manage')}
            className="btn btn-secondary"
            style={{ padding: '7px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Wrench size={13} />
            <span>불량증상관리 마스터 보기</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(prev => !prev)}
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>신규 반납입고 등록</span>
          </button>
        </div>
      </div>

      {showNewModal && (
        <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb', backgroundColor: 'rgba(37, 99, 235, 0.03)' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>렌탈자산 반납입고 신규 등록</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>반납 대상 렌탈계약</label>
              <select value={newContractId} onChange={e => setNewContractId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {SEED_FL_CONTRACTS.filter(c => c.contractType === 'RENTAL').map(c => (
                  <option key={c.id} value={c.id}>{c.contractNo} · {(c as any).customerName || c.customerId}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>반납 자산번호</label>
              <select value={newAssetId} onChange={e => setNewAssetId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>입고 주기장</label>
              <input type="text" value={newYardName} onChange={e => setNewYardName(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>회수 운송비 · 원</label>
              <input type="number" min={0} value={newFreightCost} onChange={e => setNewFreightCost(Math.max(0, Number(e.target.value) || 0))} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleRegisterNewInbound} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 700 }}>반납입고 저장</button>
              <button type="button" onClick={() => setShowNewModal(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 본문 좌우 마스터-디테일 스튜디오 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>
        {/* 좌측: 반납입고 목록 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 800, fontSize: '13.5px' }}>
            렌탈자산 반납입고 및 불량판정 목록 ({inbounds.length}건)
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>입고번호·일자</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>고객사·반납현장</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>자산번호·모델</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>사용자 청구금액</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>판정·청구상태</th>
                </tr>
              </thead>
              <tbody>
                {inbounds.map(row => {
                  const active = selectedRecord?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        backgroundColor: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#1e40af' }}>{row.inboundNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.inboundDate} · {row.contractNo}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{row.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.siteName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800 }}>{row.assetNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{row.modelName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: row.claimAmount > 0 ? '#dc2626' : 'var(--text-secondary)' }}>
                        ₩{row.claimAmount.toLocaleString('ko-KR')}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor:
                            row.claimStatus === '고객청구생성완료'
                              ? '#dbeafe'
                              : row.claimStatus === '불량판정·청구대기'
                              ? '#fee2e2'
                              : '#dcfce7',
                          color:
                            row.claimStatus === '고객청구생성완료'
                              ? '#1e40af'
                              : row.claimStatus === '불량판정·청구대기'
                              ? '#991b1b'
                              : '#166534'
                        }}>
                          {row.claimStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 입고 시 불량증상 판단 및 사용자 청구 생성 패널 */}
        {selectedRecord && (
          <div className="card" style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedRecord.inboundNo} · {selectedRecord.assetNo} ({selectedRecord.modelName})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  반납 고객현장: <strong>{selectedRecord.customerName}</strong> · {selectedRecord.siteName}
                </div>
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                backgroundColor: selectedRecord.nextAssetStatus === '수리중' ? '#fef3c7' : '#dcfce7',
                color: selectedRecord.nextAssetStatus === '수리중' ? '#92400e' : '#166534'
              }}>
                입고 후 자산상태: {selectedRecord.nextAssetStatus}
              </span>
            </div>

            {/* 불량증상 마스터 체크리스트 */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800 }}>
                  <AlertTriangle size={15} color="#dc2626" />
                  <span>입고 시 불량증상 판단 (불량증상관리 마스터 연동)</span>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  체크 시 표준 수리청구 금액이 자동 합산됩니다
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {FORKLIFT_DEFECT_SYMPTOM_MASTERS.map(sym => {
                  const checked = selectedRecord.selectedSymptomIds.includes(sym.id);
                  return (
                    <label
                      key={sym.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '7px 10px',
                        borderRadius: '6px',
                        border: checked ? '1.5px solid #dc2626' : '1px solid var(--border-color)',
                        backgroundColor: checked ? 'rgba(220, 38, 38, 0.06)' : 'var(--bg-card)',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSymptom(sym)}
                        />
                        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>[{sym.category}]</span>
                        <span style={{ fontWeight: checked ? 800 : 600 }}>{sym.symptomName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{sym.defaultResponsibility}</span>
                        <strong style={{ color: sym.standardRepairCost > 0 ? '#dc2626' : '#059669' }}>
                          ₩{sym.standardRepairCost.toLocaleString('ko-KR')}
                        </strong>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 검수자 판정 소견 및 청구금액 조정 */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>입고 검수자 불량판정 소견</label>
                <input
                  type="text"
                  value={selectedRecord.inspectorNote}
                  onChange={e => updateInbounds(prev => prev.map(r => r.id === selectedRecord.id ? { ...r, inspectorNote: e.target.value } : r))}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#dc2626' }}>사용자 확정 청구금액 · 원</label>
                <input
                  type="number"
                  min={0}
                  disabled={selectedRecord.claimStatus === '고객청구생성완료'}
                  value={selectedRecord.claimAmount}
                  onChange={e => updateInbounds(prev => prev.map(r => r.id === selectedRecord.id ? { ...r, claimAmount: Math.max(0, Number(e.target.value) || 0) } : r))}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1.5px solid #dc2626', fontSize: '13px', fontWeight: 800, color: '#dc2626' }}
                />
              </div>
            </div>

            {/* 우하단 액션: 사용자에게 청구 생성 / 정상입고 확정 */}
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700 }}>
                선택 불량증상: <strong>{selectedRecord.selectedSymptomIds.length}건</strong> | 사용자 청구합계: <strong style={{ color: '#dc2626' }}>₩{selectedRecord.claimAmount.toLocaleString('ko-KR')}</strong>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('billing')}
                  className="btn btn-secondary"
                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 700 }}
                >
                  청구관리 이동
                </button>
                <button
                  type="button"
                  onClick={handleGenerateCustomerClaim}
                  className="btn btn-primary"
                  style={{ padding: '8px 16px', fontSize: '12.5px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {selectedRecord.claimAmount > 0 ? <CreditCard size={14} /> : <CheckCircle2 size={14} />}
                  <span>
                    {selectedRecord.claimAmount > 0
                      ? '불량증상 확정 및 사용자 수리비 청구 생성'
                      : '불량없음 · 정상 반납입고 확정'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default RentalInboundManagePage;
