import React, { useState, useMemo } from 'react';
import { Truck, FileCheck, CheckSquare, Send, PackageCheck, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SEED_FL_CUSTOMERS, SEED_FL_SITES, SEED_FL_RENTAL_ASSETS, SEED_FL_CONTRACTS } from '../data/flUnifiedSeedData';

interface RentalOutboundRecord {
  id: string;
  outboundNo: string;
  outboundDate: string;
  contractId: string;
  contractNo: string;
  customerId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  siteAddress: string;
  assetId: string;
  assetNo: string;
  modelName: string;
  serialNo: string;
  monthlyRentalFee: number;
  installedOptions: string;
  deliveredDocs: string[];
  docSentAt: string;
  docRecipientEmail: string;
  transportVehicleType: string;
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
  freightCost: number;
  freightPaidBy: '당사부담' | '고객청구';
  status: '출고대기·검수중' | '출고완료·대여중';
}

const REQUIRED_RENTAL_DELIVERY_DOCS = [
  '지게차 운전·정비 취급설명서',
  '안전인증서 · 형식승인서 사본',
  '안전검사 · 자체검사기록부',
  '지게차 작업계획서 표준양식',
  '장비 임대차계약서 및 출고인수증'
];

const INITIAL_RENTAL_OUTBOUNDS: RentalOutboundRecord[] = [
  {
    id: 'ROUT-202607-001',
    outboundNo: 'ROUT-202607-001',
    outboundDate: '2026-07-01',
    contractId: 'CTR-R2607-001',
    contractNo: 'RNT-202607-001',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    siteId: 'SITE-FL-001',
    siteName: '평택항만 제1물류센터 현장',
    siteAddress: '경기도 평택시 포승읍 평택항만길 210 제1보세창고동',
    assetId: 'AST-FL-001',
    assetNo: 'FL-001',
    modelName: '헬리 CPD25-G2 리튬전동 2.5톤',
    serialNo: 'HL25G2-240101',
    monthlyRentalFee: 950000,
    installedOptions: '사이드시프트, 후방감지센서, 블루스팟 안전등, 포크 스폰지 무상옵션',
    deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
    docSentAt: '2026-07-01 09:30',
    docRecipientEmail: '77.victor.lee@gmail.com',
    transportVehicleType: '5톤 셀프로더',
    vehicleNo: '경기88바 3102',
    driverName: '박운송',
    driverPhone: '010-5511-3102',
    freightCost: 220000,
    freightPaidBy: '고객청구',
    status: '출고완료·대여중'
  },
  {
    id: 'ROUT-202607-002',
    outboundNo: 'ROUT-202607-002',
    outboundDate: '2026-07-15',
    contractId: 'CTR-R2607-002',
    contractNo: 'RNT-202607-002',
    customerId: 'CUST-FL-002',
    customerName: '태양중공업 주식회사',
    siteId: 'SITE-FL-003',
    siteName: '창원 제1중공업 공장 현장',
    siteAddress: '경상남도 창원시 성산구 공단로 415 중량조립1공장',
    assetId: 'AST-FL-005',
    assetNo: 'FL-005',
    modelName: '두산밥캣 D50S-9 디젤 5.0톤',
    serialNo: 'DB50S9-230805',
    monthlyRentalFee: 1850000,
    installedOptions: '풀캐빈 에어컨·히터, 중량 단조덧발 2100mm, 4채널 카메라',
    deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
    docSentAt: '2026-07-15 10:15',
    docRecipientEmail: '77.victor.lee@gmail.com',
    transportVehicleType: '8톤 셀프로더',
    vehicleNo: '경남92아 7410',
    driverName: '최화물',
    driverPhone: '010-6622-7410',
    freightCost: 350000,
    freightPaidBy: '고객청구',
    status: '출고완료·대여중'
  },
  {
    id: 'ROUT-202608-003',
    outboundNo: 'ROUT-202608-003',
    outboundDate: '2026-08-01',
    contractId: 'CTR-R2607-003',
    contractNo: 'RNT-202607-003',
    customerId: 'CUST-FL-003',
    customerName: '주식회사 서해글로벌모터스',
    siteId: 'SITE-FL-005',
    siteName: '인천신항 자동차부품 물류기지 현장',
    siteAddress: '인천광역시 연수구 신항대로 140 제2물류동',
    assetId: 'AST-FL-003',
    assetNo: 'FL-003',
    modelName: '비와이디 ECB30 리튬전동 3.0톤',
    serialNo: 'BYD30C-240303',
    monthlyRentalFee: 1150000,
    installedOptions: '힌지드 포크베일 클램프, 후방감지센서, 논마킹 타이어',
    deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
    docSentAt: '2026-08-01 08:50',
    docRecipientEmail: '77.victor.lee@gmail.com',
    transportVehicleType: '5톤 셀프로더',
    vehicleNo: '인천81사 2044',
    driverName: '정배차',
    driverPhone: '010-7733-2044',
    freightCost: 200000,
    freightPaidBy: '당사부담',
    status: '출고완료·대여중'
  },
  {
    id: 'ROUT-202611-004',
    outboundNo: 'ROUT-202611-004',
    outboundDate: new Date().toISOString().split('T')[0],
    contractId: 'CTR-R2607-001',
    contractNo: 'RNT-202607-001',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    siteId: 'SITE-FL-001',
    siteName: '평택항만 제1물류센터 현장',
    siteAddress: '경기도 평택시 포승읍 평택항만길 210 제1보세창고동',
    assetId: 'AST-FL-002',
    assetNo: 'FL-002',
    modelName: '헬리 CPD25-G2 리튬전동 2.5톤',
    serialNo: 'HL25G2-240102',
    monthlyRentalFee: 950000,
    installedOptions: '사이드시프트, 단조덧발 1500mm, LED 작업등, 레드존 안전등',
    deliveredDocs: ['지게차 운전·정비 취급설명서', '안전인증서 · 형식승인서 사본', '안전검사 · 자체검사기록부'],
    docSentAt: '발송 대기',
    docRecipientEmail: '77.victor.lee@gmail.com',
    transportVehicleType: '5톤 셀프로더',
    vehicleNo: '경기88바 3102',
    driverName: '박운송',
    driverPhone: '010-5511-3102',
    freightCost: 220000,
    freightPaidBy: '고객청구',
    status: '출고대기·검수중'
  }
];

export const RentalOutboundManagePage: React.FC = () => {
  const { assets, contracts } = useApp();
  const [outbounds, setOutbounds] = useState<RentalOutboundRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ebro_fl_rental_outbounds_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_RENTAL_OUTBOUNDS;
  });
  const [selectedId, setSelectedId] = useState<string>('ROUT-202611-004');
  const [statusFilter, setStatusFilter] = useState<'ALL' | '출고대기·검수중' | '출고완료·대여중'>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  React.useEffect(() => {
    try {
      localStorage.setItem('ebro_fl_rental_outbounds_v1', JSON.stringify(outbounds));
    } catch {}
  }, [outbounds]);

  const updateOutbounds = (updater: (prev: RentalOutboundRecord[]) => RentalOutboundRecord[]) => {
    setOutbounds(prev => updater(prev));
  };

  // 신규 렌탈 출고 등록 모달/폼 상태
  const [showNewForm, setShowNewForm] = useState<boolean>(false);
  const [newContractId, setNewContractId] = useState<string>('CTR-R2607-001');
  const [newAssetId, setNewAssetId] = useState<string>('AST-FL-004');
  const [newVehicleType, setNewVehicleType] = useState<string>('5톤 셀프로더');
  const [newVehicleNo, setNewVehicleNo] = useState<string>('경기85아 9912');
  const [newDriverName, setNewDriverName] = useState<string>('김셀프');
  const [newDriverPhone, setNewDriverPhone] = useState<string>('010-8821-9912');
  const [newFreightCost, setNewFreightCost] = useState<number>(220000);
  const [newFreightPaidBy, setNewFreightPaidBy] = useState<'당사부담' | '고객청구'>('고객청구');

  const rentalContracts = useMemo(() => {
    const raw = contracts && contracts.length > 0 ? contracts : SEED_FL_CONTRACTS;
    return raw.filter((c: any) => !c.contractType || c.contractType === 'RENTAL');
  }, [contracts]);

  const availableAssets = useMemo(() => {
    const raw = assets && assets.length > 0 ? assets : SEED_FL_RENTAL_ASSETS;
    const avail = raw.filter((a: any) => !a.status || a.status === 'AVAILABLE' || a.status === 'ASSIGNED');
    return avail.length > 0 ? avail : raw;
  }, [assets]);

  const filteredOutbounds = useMemo(() => {
    return outbounds.filter(o => statusFilter === 'ALL' || o.status === statusFilter);
  }, [outbounds, statusFilter]);

  const selectedRecord = useMemo(() => {
    return outbounds.find(o => o.id === selectedId) || filteredOutbounds[0] || outbounds[0];
  }, [outbounds, selectedId, filteredOutbounds]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  const toggleDeliveredDoc = (docName: string) => {
    if (!selectedRecord) return;
    updateOutbounds(prev => prev.map(o => {
      if (o.id !== selectedRecord.id) return o;
      const exists = o.deliveredDocs.includes(docName);
      const nextDocs = exists
        ? o.deliveredDocs.filter(d => d !== docName)
        : [...o.deliveredDocs, docName];
      return { ...o, deliveredDocs: nextDocs };
    }));
  };

  const updateSelectedField = (field: keyof RentalOutboundRecord, value: any) => {
    if (!selectedRecord) return;
    updateOutbounds(prev => prev.map(o => o.id === selectedRecord.id ? { ...o, [field]: value } : o));
  };

  const handleSendDeliveryDocs = () => {
    if (!selectedRecord) return;
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    updateOutbounds(prev => prev.map(o => o.id === selectedRecord.id ? {
      ...o,
      deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
      docSentAt: nowStr
    } : o));
    showToast(`${selectedRecord.customerName} (${selectedRecord.docRecipientEmail}) 앞 납품 필수문서 5종 발송 및 교부 기록이 완료되었습니다.`);
  };

  const handleApproveRentalOutbound = () => {
    if (!selectedRecord) return;
    if (selectedRecord.deliveredDocs.length < REQUIRED_RENTAL_DELIVERY_DOCS.length) {
      showToast(`법정 필수 납품문서 5종 중 ${REQUIRED_RENTAL_DELIVERY_DOCS.length - selectedRecord.deliveredDocs.length}종이 누락되었습니다. [납품문서 패키지 이메일 전달] 또는 전체 문서 체크 후 승인하세요.`);
      return;
    }
    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');
    updateOutbounds(prev => prev.map(o => o.id === selectedRecord.id ? {
      ...o,
      deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
      docSentAt: o.docSentAt === '발송 대기' ? nowStr : o.docSentAt,
      status: '출고완료·대여중'
    } : o));
    showToast(`자산번호 [${selectedRecord.assetNo}] 출고검수 승인 완료 · 자산 상태가 [대여중]으로 전환되었습니다.`);
  };

  const handleCreateOutbound = () => {
    const ctr: any = rentalContracts.find((c: any) => c.id === newContractId) || SEED_FL_CONTRACTS[0];
    const ast: any = availableAssets.find((a: any) => a.id === newAssetId) || SEED_FL_RENTAL_ASSETS[1];
    const cust = SEED_FL_CUSTOMERS.find(c => c.id === ctr.customerId) || SEED_FL_CUSTOMERS[0];
    const site = SEED_FL_SITES.find(s => s.id === ctr.siteId) || SEED_FL_SITES[0];
    const newId = `ROUT-202611-${String(outbounds.length + 1).padStart(3, '0')}`;
    const newRow: RentalOutboundRecord = {
      id: newId,
      outboundNo: newId,
      outboundDate: new Date().toISOString().split('T')[0],
      contractId: ctr.id,
      contractNo: ctr.contractNo,
      customerId: cust.id,
      customerName: cust.name,
      siteId: site.id,
      siteName: site.name,
      siteAddress: site.address,
      assetId: ast.id,
      assetNo: ast.assetNo,
      modelName: ast.modelName,
      serialNo: ast.serialNo || 'HL-2026-009',
      monthlyRentalFee: ast.monthlyRentalFee || 950000,
      installedOptions: site.paidOptions || '사이드시프트, 후방감지센서, 안전경광등',
      deliveredDocs: [...REQUIRED_RENTAL_DELIVERY_DOCS],
      docSentAt: '발송 대기',
      docRecipientEmail: cust.repEmail,
      transportVehicleType: newVehicleType,
      vehicleNo: newVehicleNo,
      driverName: newDriverName,
      driverPhone: newDriverPhone,
      freightCost: Math.max(0, Number(newFreightCost) || 0),
      freightPaidBy: newFreightPaidBy,
      status: '출고대기·검수중'
    };
    updateOutbounds(prev => [newRow, ...prev]);
    setSelectedId(newId);
    setShowNewForm(false);
    showToast(`신규 렌탈 출고 건 [${newId}]이 등록되었습니다.`);
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
            <Truck size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
              출고관리-렌탈 · 렌탈계약 출고처리, 납품문서 전달 및 배송비용 관리
            </h2>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            고객 현장별 렌탈계약에 대한 지게차 할당·검수, 법정 납품문서 전달, 운송차량 배송이력·비용 입력 및 출고완료 시 자산 대여중 전환을 원스톱 처리합니다.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', fontWeight: 700 }}
          >
            <option value="ALL">전체 렌탈출고 ({outbounds.length}건)</option>
            <option value="출고대기·검수중">출고대기·검수중</option>
            <option value="출고완료·대여중">출고완료·대여중</option>
          </select>

          <button
            type="button"
            onClick={() => setShowNewForm(prev => !prev)}
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
          >
            <Plus size={14} />
            <span>신규 렌탈출고 등록</span>
          </button>
        </div>
      </div>

      {/* 신규 출고 등록 인라인 패널 */}
      {showNewForm && (
        <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb', backgroundColor: 'rgba(37, 99, 235, 0.03)' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>신규 렌탈계약 출고 등록</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(130px, 1fr))', gap: '10px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>대상 렌탈계약</label>
              <select value={newContractId} onChange={e => setNewContractId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {rentalContracts.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.contractNo} · {c.customerName}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>할당 렌탈자산</label>
              <select value={newAssetId} onChange={e => setNewAssetId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {availableAssets.map((a: any) => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>운송차량 번호</label>
              <input type="text" value={newVehicleNo} onChange={e => setNewVehicleNo(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>운송기사 성명</label>
              <input type="text" value={newDriverName} onChange={e => setNewDriverName(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>운송비용 · 원</label>
              <input type="number" min={0} value={newFreightCost} onChange={e => setNewFreightCost(Math.max(0, Number(e.target.value) || 0))} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleCreateOutbound} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 700 }}>등록 저장</button>
              <button type="button" onClick={() => setShowNewForm(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* 본문 좌우 마스터-디테일 스튜디오 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>
        {/* 좌측: 렌탈 출고 목록 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 800, fontSize: '13.5px' }}>
            렌탈계약 출고 처리 목록 ({filteredOutbounds.length}건)
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>출고번호·일자</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>고객사·현장명</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>자산번호·모델</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>운송비용</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>출고상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutbounds.map(o => {
                  const active = selectedRecord?.id === o.id;
                  return (
                    <tr
                      key={o.id}
                      onClick={() => setSelectedId(o.id)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        backgroundColor: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#1e40af' }}>{o.outboundNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{o.outboundDate} · {o.contractNo}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{o.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{o.siteName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800 }}>{o.assetNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{o.modelName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>₩{o.freightCost.toLocaleString('ko-KR')}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{o.freightPaidBy}</div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor: o.status === '출고완료·대여중' ? '#dcfce7' : '#fef3c7',
                          color: o.status === '출고완료·대여중' ? '#166534' : '#92400e'
                        }}>
                          {o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 선택 출고 건 상세 도시에 (납품문서 전달 + 배송이력·비용 + 출고승인) */}
        {selectedRecord && (
          <div className="card" style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {selectedRecord.outboundNo} · {selectedRecord.customerName} ({selectedRecord.siteName})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  체결자산: <strong>{selectedRecord.assetNo}</strong> ({selectedRecord.modelName} · 제조번호 {selectedRecord.serialNo})
                </div>
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                backgroundColor: selectedRecord.status === '출고완료·대여중' ? '#dcfce7' : '#fef3c7',
                color: selectedRecord.status === '출고완료·대여중' ? '#166534' : '#92400e'
              }}>
                {selectedRecord.status}
              </span>
            </div>

            {/* 1. 장착 옵션 및 현장 주소 */}
            <div style={{ padding: '10px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-color)', fontSize: '12px' }}>
              <div style={{ marginBottom: '4px' }}><strong>납품 현장 주소:</strong> {selectedRecord.siteAddress}</div>
              <div><strong>장착 유상·무상옵션:</strong> {selectedRecord.installedOptions}</div>
            </div>

            {/* 2. 납품 시 필요한 문서 전달 체크리스트 */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800 }}>
                  <FileCheck size={15} color="#2563eb" />
                  <span>납품 시 필요한 문서 전달 체크 및 발송</span>
                </div>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  발송상태: {selectedRecord.docSentAt}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                {REQUIRED_RENTAL_DELIVERY_DOCS.map(doc => {
                  const checked = selectedRecord.deliveredDocs.includes(doc);
                  return (
                    <label
                      key={doc}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: checked ? '1px solid #93c5fd' : '1px solid var(--border-color)',
                        backgroundColor: checked ? '#eff6ff' : 'var(--bg-card)',
                        fontSize: '12px',
                        fontWeight: checked ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDeliveredDoc(doc)}
                      />
                      <span>{doc}</span>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  수신 이메일: <strong>{selectedRecord.docRecipientEmail}</strong>
                </span>
                <button
                  type="button"
                  onClick={handleSendDeliveryDocs}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  <Send size={13} />
                  <span>납품문서 패키지 이메일 전달</span>
                </button>
              </div>
            </div>

            {/* 3. 배송 이력과 비용 입력 */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, marginBottom: '10px' }}>
                <Truck size={15} color="#059669" />
                <span>배송 이력과 운송비용 입력</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>운송차량 종류</label>
                  <input
                    type="text"
                    value={selectedRecord.transportVehicleType}
                    onChange={e => updateSelectedField('transportVehicleType', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>차량번호</label>
                  <input
                    type="text"
                    value={selectedRecord.vehicleNo}
                    onChange={e => updateSelectedField('vehicleNo', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>기사명 · 연락처 ({selectedRecord.driverPhone})</label>
                  <input
                    type="text"
                    value={selectedRecord.driverName}
                    onChange={e => updateSelectedField('driverName', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>출고일자</label>
                  <input
                    type="date"
                    value={selectedRecord.outboundDate}
                    onChange={e => updateSelectedField('outboundDate', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>배송 운송비용 · 원</label>
                  <input
                    type="number"
                    min={0}
                    value={selectedRecord.freightCost}
                    onChange={e => updateSelectedField('freightCost', Math.max(0, Number(e.target.value) || 0))}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>운송비 부담 주체</label>
                  <select
                    value={selectedRecord.freightPaidBy}
                    onChange={e => updateSelectedField('freightPaidBy', e.target.value)}
                    style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                  >
                    <option value="고객청구">고객청구</option>
                    <option value="당사부담">당사부담</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 4. 최종 출고 검수 승인 및 대여중 전환 버튼 */}
            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={handleApproveRentalOutbound}
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <PackageCheck size={15} />
                <span>
                  {selectedRecord.status === '출고완료·대여중'
                    ? '배송이력·문서전달 내역 저장'
                    : '출고검수 승인 완료 · 자산 대여중 전환'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default RentalOutboundManagePage;
