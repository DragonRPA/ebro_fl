import React, { useState, useMemo } from 'react';
import { Calendar, CheckCircle2, Clock, Plus, Wrench, UserCheck } from 'lucide-react';
import { SEED_FL_CUSTOMERS, SEED_FL_SITES, SEED_FL_RENTAL_ASSETS } from '../data/flUnifiedSeedData';

interface PatrolScheduleRecord {
  id: string;
  patrolNo: string;
  scheduledDate: string;
  completedDate: string;
  mechanicName: string;
  vehicleNo: string;
  customerId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  siteAddress: string;
  assetId: string;
  assetNo: string;
  modelName: string;
  patrolCycleType: '월간 정기순회점검' | '250시간 정기점검' | '500시간 오일·필터교환' | '냉동·방폭 특화점검';
  hourMeterReading: number;
  checkedItems: string[];
  usedConsumablesSummary: string;
  resultNote: string;
  customerConfirmName: string;
  status: '방문예정' | '점검진행중' | '처리완료';
}

const PATROL_CHECK_ITEMS = [
  '마스트 리프트체인 장력 및 구리스 윤활',
  '유압작동유 레벨 및 실린더 누유 점검',
  '전륜·후륜 타이어 편마모 및 휠볼트 토크',
  '주차·주행 브레이크 제동력 및 오일 점검',
  '전조등·후방감지센서·안전경광등 작동 점검',
  '배터리 전압·충전단자 또는 엔진오일·필터 점검'
];

const INITIAL_PATROL_SCHEDULES: PatrolScheduleRecord[] = [
  {
    id: 'PTL-202610-001',
    patrolNo: 'PTL-202610-001',
    scheduledDate: '2026-10-15',
    completedDate: '2026-10-15',
    mechanicName: '김정비',
    vehicleNo: '경기82더 4411',
    customerId: 'CUST-FL-001',
    customerName: '한빛물류센터 주식회사',
    siteId: 'SITE-FL-001',
    siteName: '평택항만 제1물류센터 현장',
    siteAddress: '경기도 평택시 포승읍 평택항만길 210 제1보세창고동',
    assetId: 'AST-FL-001',
    assetNo: 'FL-001',
    modelName: '헬리 CPD25-G2 리튬전동 2.5톤',
    patrolCycleType: '월간 정기순회점검',
    hourMeterReading: 1420,
    checkedItems: [...PATROL_CHECK_ITEMS],
    usedConsumablesSummary: '고하중 리튬 구리스 1본 도포, 유압유 보충 0.5L',
    resultNote: '마스트 체인 장력 조정 및 구리스 윤활 완료 · 전장 및 배터리 상태 양호',
    customerConfirmName: '이평택 현장소장',
    status: '처리완료'
  },
  {
    id: 'PTL-202610-002',
    patrolNo: 'PTL-202610-002',
    scheduledDate: '2026-10-24',
    completedDate: '2026-10-24',
    mechanicName: '박기장',
    vehicleNo: '경남80루 1920',
    customerId: 'CUST-FL-002',
    customerName: '태양중공업 주식회사',
    siteId: 'SITE-FL-003',
    siteName: '창원 제1중공업 공장 현장',
    siteAddress: '경상남도 창원시 성산구 공단로 415 중량조립1공장',
    assetId: 'AST-FL-005',
    assetNo: 'FL-005',
    modelName: '두산밥캣 D50S-9 디젤 5.0톤',
    patrolCycleType: '500시간 오일·필터교환',
    hourMeterReading: 2510,
    checkedItems: [...PATROL_CHECK_ITEMS],
    usedConsumablesSummary: '디젤엔진오일 15W-40 1통, 3종 필터 정기점검 키트 1세트',
    resultNote: '500시간 주기 엔진오일 및 에어·오일·연료 필터 3종 교체 완료',
    customerConfirmName: '정창원 기전팀장',
    status: '처리완료'
  },
  {
    id: 'PTL-202611-003',
    patrolNo: 'PTL-202611-003',
    scheduledDate: new Date().toISOString().split('T')[0],
    completedDate: '-',
    mechanicName: '김정비',
    vehicleNo: '경기82더 4411',
    customerId: 'CUST-FL-004',
    customerName: '대한콜드체인 주식회사',
    siteId: 'SITE-FL-007',
    siteName: '용인 제1냉동냉장물류센터 현장',
    siteAddress: '경기도 용인시 처인구 백암면 물류단지로 88 냉동A동',
    assetId: 'AST-FL-007',
    assetNo: 'FL-007',
    modelName: '니치유 FB18PN 리치전동 1.8톤',
    patrolCycleType: '냉동·방폭 특화점검',
    hourMeterReading: 980,
    checkedItems: [
      '마스트 리프트체인 장력 및 구리스 윤활',
      '유압작동유 레벨 및 실린더 누유 점검',
      '전조등·후방감지센서·안전경광등 작동 점검'
    ],
    usedConsumablesSummary: '저온용 유압작동유 보충 및 배터리 증류수 1박스 투입 예정',
    resultNote: '영하 25도 냉동창고 투입 장비 결로 방지 히터 및 우레탄 로드휠 점검 진행중',
    customerConfirmName: '최용인 센터장',
    status: '점검진행중'
  },
  {
    id: 'PTL-202611-004',
    patrolNo: 'PTL-202611-004',
    scheduledDate: '2026-11-05',
    completedDate: '-',
    mechanicName: '김정비',
    vehicleNo: '경기82더 4411',
    customerId: 'CUST-FL-003',
    customerName: '주식회사 서해글로벌모터스',
    siteId: 'SITE-FL-005',
    siteName: '인천신항 자동차부품 물류기지 현장',
    siteAddress: '인천광역시 연수구 신항대로 140 제2물류동',
    assetId: 'AST-FL-003',
    assetNo: 'FL-003',
    modelName: '비와이디 ECB30 리튬전동 3.0톤',
    patrolCycleType: '250시간 정기점검',
    hourMeterReading: 760,
    checkedItems: [],
    usedConsumablesSummary: '고하중 리튬 구리스 도포 예정',
    resultNote: '방문예정 · 힌지드 클램프 유압라인 및 브레이크 집중 점검 예정',
    customerConfirmName: '강신항 물류과장',
    status: '방문예정'
  }
];

export const PatrolMaintenancePage: React.FC = () => {
  const [schedules, setSchedules] = useState<PatrolScheduleRecord[]>(INITIAL_PATROL_SCHEDULES);
  const [selectedId, setSelectedId] = useState<string>('PTL-202611-003');
  const [statusFilter, setStatusFilter] = useState<'ALL' | '방문예정' | '점검진행중' | '처리완료'>('ALL');
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // 신규 순회정비 일정 등록 상태
  const [newDate, setNewDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newMechanic, setNewMechanic] = useState<string>('김정비');
  const [newSiteId, setNewSiteId] = useState<string>('SITE-FL-001');
  const [newAssetId, setNewAssetId] = useState<string>('AST-FL-001');
  const [newCycleType, setNewCycleType] = useState<PatrolScheduleRecord['patrolCycleType']>('월간 정기순회점검');

  const filteredList = useMemo(() => {
    return schedules.filter(s => statusFilter === 'ALL' || s.status === statusFilter);
  }, [schedules, statusFilter]);

  const selectedRecord = useMemo(() => {
    return schedules.find(s => s.id === selectedId) || filteredList[0] || schedules[0];
  }, [schedules, selectedId, filteredList]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const toggleCheckItem = (item: string) => {
    if (!selectedRecord) return;
    setSchedules(prev => prev.map(s => {
      if (s.id !== selectedRecord.id) return s;
      const exists = s.checkedItems.includes(item);
      const next = exists ? s.checkedItems.filter(i => i !== item) : [...s.checkedItems, item];
      return { ...s, checkedItems: next };
    }));
  };

  const updateSelectedField = (field: keyof PatrolScheduleRecord, val: any) => {
    if (!selectedRecord) return;
    setSchedules(prev => prev.map(s => s.id === selectedRecord.id ? { ...s, [field]: val } : s));
  };

  const handleCompletePatrol = () => {
    if (!selectedRecord) return;
    const today = new Date().toISOString().split('T')[0];
    setSchedules(prev => prev.map(s => s.id === selectedRecord.id ? {
      ...s,
      checkedItems: s.checkedItems.length > 0 ? s.checkedItems : [...PATROL_CHECK_ITEMS],
      completedDate: today,
      status: '처리완료'
    } : s));
    showToast(`[${selectedRecord.patrolNo}] 순회정비 처리결과가 확정되어 자산 정비이력에 반영되었습니다.`);
  };

  const handleCreateSchedule = () => {
    const site = SEED_FL_SITES.find(s => s.id === newSiteId) || SEED_FL_SITES[0];
    const cust = SEED_FL_CUSTOMERS.find(c => c.id === site.customerId) || SEED_FL_CUSTOMERS[0];
    const ast = SEED_FL_RENTAL_ASSETS.find(a => a.id === newAssetId) || SEED_FL_RENTAL_ASSETS[0];
    const newId = `PTL-202611-00${schedules.length + 1}`;
    const newRec: PatrolScheduleRecord = {
      id: newId,
      patrolNo: newId,
      scheduledDate: newDate,
      completedDate: '-',
      mechanicName: newMechanic,
      vehicleNo: '경기82더 4411',
      customerId: cust.id,
      customerName: cust.name,
      siteId: site.id,
      siteName: site.name,
      siteAddress: site.address,
      assetId: ast.id,
      assetNo: ast.assetNo,
      modelName: ast.modelName,
      patrolCycleType: newCycleType,
      hourMeterReading: 1200,
      checkedItems: [],
      usedConsumablesSummary: '정기 순회점검 소모품 준비',
      resultNote: '순회정비 일정 등록 완료',
      customerConfirmName: site.contactName,
      status: '방문예정'
    };
    setSchedules(prev => [newRec, ...prev]);
    setSelectedId(newId);
    setShowAddForm(false);
    showToast(`신규 순회정비 일정 [${newId}]이 등록되었습니다.`);
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
            <Calendar size={18} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '16.5px', fontWeight: 800, color: 'var(--text-primary)' }}>
              순회정비관리 · 순회정비일정 등록, 조회 및 현장 점검 처리결과 관리
            </h2>
          </div>
          <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
            고객 현장에 대여 중인 렌탈 지게차의 정기 순회정비 일정을 등록·조회하고, 아워미터·소모품 교체·점검 처리결과를 기록합니다.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12.5px', fontWeight: 700 }}
          >
            <option value="ALL">전체 일정 ({schedules.length}건)</option>
            <option value="방문예정">방문예정</option>
            <option value="점검진행중">점검진행중</option>
            <option value="처리완료">처리완료</option>
          </select>

          <button
            type="button"
            onClick={() => setShowAddForm(prev => !prev)}
            className="btn btn-primary"
            style={{ padding: '7px 14px', fontSize: '12.5px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} />
            <span>순회정비 일정 등록</span>
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="card" style={{ padding: '14px 16px', border: '1.5px solid #2563eb' }}>
          <div style={{ fontSize: '13.5px', fontWeight: 800, marginBottom: '10px', color: '#1e40af' }}>신규 순회정비 일정 등록</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '10px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>방문예정일자</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>담당 순회정비사</label>
              <input type="text" value={newMechanic} onChange={e => setNewMechanic(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>방문 고객현장</label>
              <select value={newSiteId} onChange={e => setNewSiteId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {SEED_FL_SITES.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>대상 렌탈자산</label>
              <select value={newAssetId} onChange={e => setNewAssetId(e.target.value)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                {SEED_FL_RENTAL_ASSETS.map(a => (
                  <option key={a.id} value={a.id}>{a.assetNo} · {a.modelName}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700 }}>점검 주기 구분</label>
              <select value={newCycleType} onChange={e => setNewCycleType(e.target.value as any)} style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
                <option value="월간 정기순회점검">월간 정기순회점검</option>
                <option value="250시간 정기점검">250시간 정기점검</option>
                <option value="500시간 오일·필터교환">500시간 오일·필터교환</option>
                <option value="냉동·방폭 특화점검">냉동·방폭 특화점검</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button type="button" onClick={handleCreateSchedule} className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12px', fontWeight: 700 }}>일정 저장</button>
              <button type="button" onClick={() => setShowAddForm(false)} className="btn btn-secondary" style={{ padding: '7px 12px', fontSize: '12px' }}>취소</button>
            </div>
          </div>
        </div>
      )}

      {/* 좌우 마스터-디테일 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '12px', flex: 1, minHeight: 0 }}>
        {/* 좌측 일정 목록 */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--border-color)', fontWeight: 800, fontSize: '13.5px' }}>
            순회정비 일정 목록 ({filteredList.length}건)
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-app)', borderBottom: '2px solid var(--border-color)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>순회번호·예정일</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>고객사·방문현장</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>대상자산·점검구분</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>정비사</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>처리상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map(item => {
                  const active = selectedRecord?.id === item.id;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        backgroundColor: active ? 'rgba(37, 99, 235, 0.08)' : 'transparent'
                      }}
                    >
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: '#1e40af' }}>{item.patrolNo}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>예정: {item.scheduledDate}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 700 }}>{item.customerName}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{item.siteName}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800 }}>{item.assetNo} · {item.modelName}</div>
                        <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700 }}>{item.patrolCycleType}</div>
                      </td>
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{item.mechanicName}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 800,
                          backgroundColor:
                            item.status === '처리완료'
                              ? '#dcfce7'
                              : item.status === '점검진행중'
                              ? '#fef3c7'
                              : '#eff6ff',
                          color:
                            item.status === '처리완료'
                              ? '#166534'
                              : item.status === '점검진행중'
                              ? '#92400e'
                              : '#1d4ed8'
                        }}>
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 우측: 순회정비 처리결과 입력 및 조회 */}
        {selectedRecord && (
          <div className="card" style={{ padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '14.5px', fontWeight: 800 }}>
                  {selectedRecord.patrolNo} · {selectedRecord.assetNo} ({selectedRecord.modelName})
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {selectedRecord.customerName} · {selectedRecord.siteName} ({selectedRecord.siteAddress})
                </div>
              </div>
              <span style={{
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 800,
                backgroundColor: selectedRecord.status === '처리완료' ? '#dcfce7' : '#fef3c7',
                color: selectedRecord.status === '처리완료' ? '#166534' : '#92400e'
              }}>
                {selectedRecord.status}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>가동 아워미터 · 시간</label>
                <input
                  type="number"
                  value={selectedRecord.hourMeterReading}
                  onChange={e => updateSelectedField('hourMeterReading', Number(e.target.value) || 0)}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px', fontWeight: 700 }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>담당 정비사 · 정비차량</label>
                <input
                  type="text"
                  value={`${selectedRecord.mechanicName} · ${selectedRecord.vehicleNo}`}
                  onChange={e => updateSelectedField('mechanicName', e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>현장 확인자 성명</label>
                <input
                  type="text"
                  value={selectedRecord.customerConfirmName}
                  onChange={e => updateSelectedField('customerConfirmName', e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                />
              </div>
            </div>

            {/* 순회정비 체크리스트 */}
            <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, marginBottom: '8px' }}>
                <Wrench size={15} color="#2563eb" />
                <span>순회정비 표준 점검항목 체크리스트</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {PATROL_CHECK_ITEMS.map(item => {
                  const checked = selectedRecord.checkedItems.includes(item);
                  return (
                    <label
                      key={item}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: checked ? '1px solid #93c5fd' : '1px solid var(--border-color)',
                        backgroundColor: checked ? '#eff6ff' : 'var(--bg-card)',
                        fontSize: '11.5px',
                        fontWeight: checked ? 700 : 500,
                        cursor: 'pointer'
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleCheckItem(item)} />
                      <span>{item}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 투입 소모품 및 처리결과 소견 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>교체·보충 소모품 및 부품 내역</label>
                <input
                  type="text"
                  value={selectedRecord.usedConsumablesSummary}
                  onChange={e => updateSelectedField('usedConsumablesSummary', e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-secondary)' }}>순회정비 처리결과 종합 소견</label>
                <input
                  type="text"
                  value={selectedRecord.resultNote}
                  onChange={e => updateSelectedField('resultNote', e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '12px' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
              <button
                type="button"
                onClick={handleCompletePatrol}
                className="btn btn-primary"
                style={{ padding: '9px 18px', fontSize: '13px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={15} />
                <span>순회정비 처리결과 확정 및 자산이력 반영</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default PatrolMaintenancePage;
