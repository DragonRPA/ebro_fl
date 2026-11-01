import React, { useState, useMemo } from 'react';
import { useTrade } from '../../context/TradeContext';
import { useApp } from '../../context/AppContext';
import { ForkliftOptionGroupType, ForkliftOptionMaster } from '../../services/db';
import { FORKLIFT_OPTION_GROUPS } from '../../data/forkliftOptionMastersData';
import {
  SlidersHorizontal,
  Plus,
  Search,
  Edit2,
  Trash2,
  Download,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';

const DOMAIN_TYPE_OPTIONS: {
  value: ForkliftOptionMaster['domainType'];
  label: ForkliftOptionMaster['domainTypeLabel'];
  badgeBg: string;
  badgeColor: string;
}[] = [
  { value: 'PAID', label: '유상옵션', badgeBg: 'rgba(37, 99, 235, 0.1)', badgeColor: '#1d4ed8' },
  { value: 'ATTACHMENT', label: '부착물', badgeBg: 'rgba(124, 58, 237, 0.1)', badgeColor: '#6d28d9' },
  { value: 'SPEC', label: '현장요구사양', badgeBg: 'rgba(217, 119, 6, 0.12)', badgeColor: '#b45309' },
  { value: 'PROTECTION', label: '무상옵션', badgeBg: 'rgba(5, 150, 105, 0.12)', badgeColor: '#047857' }
];

export const ForkliftOptionMasterPage: React.FC = () => {
  const {
    optionMasters,
    addOptionMaster,
    updateOptionMaster,
    deleteOptionMaster,
    outbounds
  } = useTrade();
  const { showErrorModal } = useApp();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const showSuccessToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const [selectedGroup, setSelectedGroup] = useState<'ALL' | ForkliftOptionGroupType>('ALL');
  const [selectedDomainType, setSelectedDomainType] = useState<'ALL' | ForkliftOptionMaster['domainType']>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // 등록/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<ForkliftOptionMaster | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formGroup, setFormGroup] = useState<ForkliftOptionGroupType>('BACKREST');
  const [formDomainType, setFormDomainType] = useState<ForkliftOptionMaster['domainType']>('PAID');
  const [formName, setFormName] = useState('');
  const [formSubVariant, setFormSubVariant] = useState('');
  const [formSpecDetail, setFormSpecDetail] = useState('');
  const [formTonnage, setFormTonnage] = useState('2.0톤 ~ 3.5톤 공용');
  const [formUnit, setFormUnit] = useState('식');
  const [formCostPrice, setFormCostPrice] = useState<number>(0);
  const [formDealerPrice, setFormDealerPrice] = useState<number>(0);
  const [formUnitPrice, setFormUnitPrice] = useState<number>(0);
  const [formIsFreeDefault, setFormIsFreeDefault] = useState<boolean>(false);
  const [formInstallHours, setFormInstallHours] = useState<number>(1.5);
  const [formSortOrder, setFormSortOrder] = useState<number>(10);
  const [formMemo, setFormMemo] = useState('');

  // 출고 건수 및 옵션 누적 청구 집계
  const optionUsageStats = useMemo(() => {
    const map: Record<string, { count: number; totalBilled: number }> = {};
    outbounds.forEach(ob => {
      if (ob.status === 'CANCELLED') return;
      (ob.appliedOptions || []).forEach(app => {
        if (!map[app.optionId]) {
          map[app.optionId] = { count: 0, totalBilled: 0 };
        }
        map[app.optionId].count += app.qty;
        map[app.optionId].totalBilled += app.isFreeApplied ? 0 : app.supplyAmount;
      });
    });
    return map;
  }, [outbounds]);

  const filteredOptions = useMemo(() => {
    return optionMasters
      .filter(opt => {
        if (selectedGroup !== 'ALL' && opt.optionGroup !== selectedGroup) return false;
        if (selectedDomainType !== 'ALL' && opt.domainType !== selectedDomainType) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          return (
            opt.name.toLowerCase().includes(q) ||
            opt.optionCode.toLowerCase().includes(q) ||
            opt.subVariant.toLowerCase().includes(q) ||
            opt.specDetail.toLowerCase().includes(q) ||
            opt.applicableTonnage.toLowerCase().includes(q) ||
            opt.optionGroupLabel.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [optionMasters, selectedGroup, selectedDomainType, searchTerm]);

  const summaryStats = useMemo(() => {
    const totalCount = optionMasters.length;
    const paidCount = optionMasters.filter(o => !o.isFreeDefault).length;
    const freeCount = optionMasters.filter(o => o.isFreeDefault).length;
    const totalOutboundOptionRevenue = Object.values(optionUsageStats).reduce(
      (sum, item) => sum + item.totalBilled,
      0
    );
    return { totalCount, paidCount, freeCount, totalOutboundOptionRevenue };
  }, [optionMasters, optionUsageStats]);

  const openCreateModal = () => {
    setEditingOption(null);
    const nextSeq = optionMasters.length + 1;
    setFormCode(`OPT-FL-${String(nextSeq).padStart(3, '0')}`);
    setFormGroup(selectedGroup === 'ALL' ? 'BACKREST' : selectedGroup);
    setFormDomainType('PAID');
    setFormName('');
    setFormSubVariant('');
    setFormSpecDetail('');
    setFormTonnage('2.0톤 ~ 3.5톤 공용');
    setFormUnit('식');
    setFormCostPrice(200000);
    setFormDealerPrice(300000);
    setFormUnitPrice(380000);
    setFormIsFreeDefault(false);
    setFormInstallHours(1.5);
    setFormSortOrder(nextSeq);
    setFormMemo('');
    setIsModalOpen(true);
  };

  const openEditModal = (opt: ForkliftOptionMaster) => {
    setEditingOption(opt);
    setFormCode(opt.optionCode);
    setFormGroup(opt.optionGroup);
    setFormDomainType(opt.domainType);
    setFormName(opt.name);
    setFormSubVariant(opt.subVariant);
    setFormSpecDetail(opt.specDetail);
    setFormTonnage(opt.applicableTonnage);
    setFormUnit(opt.unit);
    setFormCostPrice(opt.costPrice);
    setFormDealerPrice(opt.dealerPrice);
    setFormUnitPrice(opt.unitPrice);
    setFormIsFreeDefault(opt.isFreeDefault);
    setFormInstallHours(opt.installLeadHours);
    setFormSortOrder(opt.sortOrder);
    setFormMemo(opt.memo || '');
    setIsModalOpen(true);
  };

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!formName.trim()) {
        showErrorModal('옵션 품목명을 입력해 주세요.');
        return;
      }
      const groupObj = FORKLIFT_OPTION_GROUPS.find(g => g.group === formGroup);
      const domainObj = DOMAIN_TYPE_OPTIONS.find(d => d.value === formDomainType);

      const payload: Omit<ForkliftOptionMaster, 'id' | 'createdAt' | 'updatedAt'> = {
        optionCode: formCode.trim() || `OPT-${Date.now().toString().slice(-4)}`,
        optionGroup: formGroup,
        optionGroupLabel: groupObj?.label || '백레스트 변경',
        domainType: formDomainType,
        domainTypeLabel: domainObj?.label || '유상옵션',
        name: formName.trim(),
        subVariant: formSubVariant.trim() || '표준 규격',
        specDetail: formSpecDetail.trim() || '-',
        applicableTonnage: formTonnage.trim() || '전 차종 공용',
        unit: formUnit.trim() || '식',
        costPrice: Math.max(0, Number(formCostPrice) || 0),
        dealerPrice: Math.max(0, Number(formDealerPrice) || 0),
        unitPrice: Math.max(0, Number(formUnitPrice) || 0),
        isFreeDefault: formIsFreeDefault,
        installLeadHours: Math.max(0, Number(formInstallHours) || 0),
        isActive: true,
        sortOrder: Number(formSortOrder) || 10,
        memo: formMemo.trim()
      };

      if (editingOption) {
        await updateOptionMaster(editingOption.id, payload);
        showSuccessToast(`[${payload.name}] 옵션 단가 및 사양이 수정되었습니다.`);
      } else {
        await addOptionMaster(payload);
        showSuccessToast(`[${payload.name}] 신규 지게차 옵션이 등록되었습니다.`);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      showErrorModal(err.message || '옵션 저장 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteOption = async (opt: ForkliftOptionMaster) => {
    if (!window.confirm(`[${opt.name}] 옵션을 마스터에서 삭제하시겠습니까?`)) return;
    try {
      await deleteOptionMaster(opt.id);
      showSuccessToast('옵션 항목이 삭제되었습니다.');
    } catch (err: any) {
      showErrorModal(err.message || '삭제 중 오류가 발생했습니다.');
    }
  };

  const handleQuickPriceChange = async (
    opt: ForkliftOptionMaster,
    field: 'costPrice' | 'dealerPrice' | 'unitPrice',
    value: number
  ) => {
    try {
      await updateOptionMaster(opt.id, { [field]: Math.max(0, value) });
      showSuccessToast(`[${opt.name}] 단가가 즉시 반영되었습니다.`);
    } catch (err: any) {
      showErrorModal(err.message || '단가 변경 실패');
    }
  };

  const handleExportExcel = () => {
    const rows = filteredOptions.map((o, idx) => ({
      순번: idx + 1,
      옵션코드: o.optionCode,
      옵션분류: o.optionGroupLabel,
      구분: o.domainTypeLabel,
      옵션품목명: o.name,
      세부구조및길이규격: o.subVariant,
      적용톤수: o.applicableTonnage,
      상세제원: o.specDetail,
      단위: o.unit,
      장착원가: o.costPrice,
      대리점공급단가: o.dealerPrice,
      최종고객표준청구단가: o.unitPrice,
      무상기본적용여부: o.isFreeDefault ? '무상기본' : '유상청구',
      표준장착시간: `${o.installLeadHours}시간`,
      출고장착누적수량: optionUsageStats[o.id]?.count || 0,
      출고누적청구합계: optionUsageStats[o.id]?.totalBilled || 0
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '지게차옵션단가표');
    XLSX.writeFile(wb, `지게차_옵션부착물_단가마스터_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '10px 18px',
            borderRadius: '6px',
            backgroundColor: '#059669',
            color: '#fff',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.18)'
          }}
        >
          {toastMsg}
        </div>
      )}
      {/* 상단 Z-패턴 헤더: 좌상단 타이틀·요약 / 우상단 파이프라인 액션 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--bg-secondary)',
          padding: '14px 18px',
          borderRadius: '10px',
          border: '1px solid var(--border-color)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#eff6ff',
              color: '#1d4ed8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #bfdbfe',
              flexShrink: 0
            }}
          >
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              지게차 옵션·부착물 단가관리
            </h2>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
              백레스트 변경 · 사이드시프트 · 문열림구조별 캐빈 · 에어컨 · 길이별 덧발 · 후방감지센서 · 경광등 · 무상 장비보호 단가 및 출고 청구 연동
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportExcel}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            <Download size={15} /> 엑셀 내보내기
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={openCreateModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            <Plus size={16} /> 옵션·단가 신규등록
          </button>
        </div>
      </div>

      {/* 상단 핵심 요약 지표 바 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))', gap: '10px' }}>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px 16px'
          }}
        >
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
            등록 지게차 옵션 총수
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
            {summaryStats.totalCount}종 <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#2563eb' }}>8대 분류</span>
          </div>
        </div>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px 16px'
          }}
        >
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
            유상 청구 옵션·부착물
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1d4ed8', marginTop: '4px' }}>
            {summaryStats.paidCount}종
          </div>
        </div>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px 16px'
          }}
        >
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
            무상 기본 장비보호 옵션
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
            {summaryStats.freeCount}종
          </div>
        </div>
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            padding: '12px 16px'
          }}
        >
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
            출고 반영 유상청구비용 누계
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed', marginTop: '4px' }}>
            ₩{summaryStats.totalOutboundOptionRevenue.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 좌상단 조회 스코핑 & 8대 옵션 분류 탭 */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setSelectedGroup('ALL')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: selectedGroup === 'ALL' ? '1px solid #2563eb' : '1px solid var(--border-color)',
              background: selectedGroup === 'ALL' ? '#2563eb' : 'var(--bg-tertiary)',
              color: selectedGroup === 'ALL' ? '#fff' : 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            전체 분류 ({optionMasters.length})
          </button>
          {FORKLIFT_OPTION_GROUPS.map(g => {
            const count = optionMasters.filter(o => o.optionGroup === g.group).length;
            const active = selectedGroup === g.group;
            return (
              <button
                key={g.group}
                type="button"
                onClick={() => setSelectedGroup(g.group)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: active ? '1px solid #2563eb' : '1px solid var(--border-color)',
                  background: active ? '#eff6ff' : 'var(--bg-tertiary)',
                  color: active ? '#1d4ed8' : 'var(--text-primary)',
                  fontWeight: active ? 800 : 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {g.label} ({count})
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '170px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              표준 도메인 구분
            </label>
            <select
              className="form-input"
              value={selectedDomainType}
              onChange={e => setSelectedDomainType(e.target.value as any)}
              style={{ height: '34px', padding: '0 10px', fontSize: '0.82rem' }}
            >
              <option value="ALL">전체 도메인 구분</option>
              {DOMAIN_TYPE_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '260px' }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              옵션명 · 문열림구조 · 덧발길이 · 제원 검색
            </label>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)'
                }}
              />
              <input
                type="text"
                className="form-input"
                placeholder="백레스트, 사이드시프트, 여닫이, 폴딩, 슬라이딩, 에어컨, 덧발 1800mm, 후방감지센서, 경광등 검색..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '32px', height: '34px', width: '100%', fontSize: '0.82rem' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 중앙 본문 고밀도 단가 테이블 (헌장 3.2: 핵심 액션 컬럼 최좌측 배치 + 줄바꿈 방지) */}
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-tertiary)', fontSize: '0.78rem' }}>
                <th style={{ whiteSpace: 'nowrap', width: '110px', textAlign: 'center' }}>단가조치</th>
                <th style={{ whiteSpace: 'nowrap' }}>옵션코드</th>
                <th style={{ whiteSpace: 'nowrap' }}>옵션분류</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>도메인구분</th>
                <th style={{ whiteSpace: 'nowrap' }}>옵션 품목명</th>
                <th style={{ whiteSpace: 'nowrap' }}>세부 구조 · 길이 규격</th>
                <th style={{ whiteSpace: 'nowrap' }}>적용 톤수</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>장착 원가</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>대리점 공급단가</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>표준 청구단가</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>청구방식</th>
                <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>출고반영</th>
                <th style={{ whiteSpace: 'nowrap' }}>기술 사양 상세</th>
              </tr>
            </thead>
            <tbody>
              {filteredOptions.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-secondary)' }}>
                    조회 조건에 일치하는 지게차 옵션 항목이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredOptions.map(opt => {
                  const domainMeta =
                    DOMAIN_TYPE_OPTIONS.find(d => d.value === opt.domainType) || DOMAIN_TYPE_OPTIONS[0];
                  const usage = optionUsageStats[opt.id];
                  return (
                    <tr key={opt.id} style={{ borderBottom: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center', padding: '6px 8px' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => openEditModal(opt)}
                            style={{ padding: '4px 8px', fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            <Edit2 size={12} style={{ marginRight: '3px' }} /> 단가수정
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => handleDeleteOption(opt)}
                            style={{ padding: '4px 6px', fontSize: '0.74rem', color: '#dc2626' }}
                            title="삭제"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: 700, color: '#334155' }}>
                        {opt.optionCode}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {opt.optionGroupLabel}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '999px',
                            fontSize: '0.73rem',
                            fontWeight: 700,
                            background: domainMeta.badgeBg,
                            color: domainMeta.badgeColor,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {opt.domainTypeLabel}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontWeight: 800, color: 'var(--text-primary)' }}>
                        {opt.name}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: '#1e40af', fontWeight: 700 }}>
                        {opt.subVariant}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                        {opt.applicableTonnage}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right', color: 'var(--text-secondary)' }}>
                        ₩{opt.costPrice.toLocaleString()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>
                        ₩{opt.dealerPrice.toLocaleString()}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <input
                          type="number"
                          step={10000}
                          defaultValue={opt.unitPrice}
                          onBlur={e => {
                            const nextVal = Number(e.target.value) || 0;
                            if (nextVal !== opt.unitPrice) {
                              handleQuickPriceChange(opt, 'unitPrice', nextVal);
                            }
                          }}
                          style={{
                            width: '105px',
                            textAlign: 'right',
                            padding: '3px 6px',
                            borderRadius: '5px',
                            border: '1px solid #cbd5e1',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            color: opt.isFreeDefault ? '#047857' : '#1d4ed8',
                            background: 'var(--bg-primary)'
                          }}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>
                        {opt.isFreeDefault ? (
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#047857',
                              fontSize: '0.73rem',
                              fontWeight: 700
                            }}
                          >
                            무상기본
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              background: 'rgba(37, 99, 235, 0.1)',
                              color: '#1d4ed8',
                              fontSize: '0.73rem',
                              fontWeight: 700
                            }}
                          >
                            출고청구추가
                          </span>
                        )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', textAlign: 'center', fontSize: '0.78rem' }}>
                        {usage ? (
                          <span style={{ fontWeight: 700, color: '#7c3aed' }}>
                            {usage.count}건 (₩{usage.totalBilled.toLocaleString()})
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>0건</span>
                        )}
                      </td>
                      <td
                        style={{
                          whiteSpace: 'nowrap',
                          maxWidth: '340px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: 'var(--text-secondary)',
                          fontSize: '0.77rem'
                        }}
                        title={opt.specDetail}
                      >
                        {opt.specDetail}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 우하단 Z-패턴 종결 요약 바 */}
        <div
          style={{
            padding: '12px 18px',
            background: 'var(--bg-tertiary)',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            fontSize: '0.82rem'
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
            조회된 지게차 옵션 마스터: <strong>{filteredOptions.length}종</strong> · 표 내 표준 청구단가 입력란 수정 시 출고 옵션 선택 단가에 즉시 반영됩니다.
          </div>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            유상옵션·부착물 평균 청구단가: ₩
            {Math.round(
              filteredOptions.filter(o => !o.isFreeDefault).reduce((s, o) => s + o.unitPrice, 0) /
                Math.max(1, filteredOptions.filter(o => !o.isFreeDefault).length)
            ).toLocaleString()}{' '}
            | 출고 청구 합산 누적액: <span style={{ color: '#7c3aed' }}>₩{summaryStats.totalOutboundOptionRevenue.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 옵션·단가 등록 및 수정 모달 (헌장 3.4: 레이블-입력 필드 상하 세로 스택) */}
      {isModalOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            padding: '20px'
          }}
        >
          <div
            className="modal-content"
            style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              width: '100%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '22px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800 }}>
                {editingOption ? '지게차 옵션·단가 수정' : '지게차 옵션·단가 신규등록'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveOption} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>옵션 코드</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formCode}
                    onChange={e => setFormCode(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>지게차 옵션 분류</label>
                  <select
                    className="form-input"
                    value={formGroup}
                    onChange={e => setFormGroup(e.target.value as ForkliftOptionGroupType)}
                  >
                    {FORKLIFT_OPTION_GROUPS.map(g => (
                      <option key={g.group} value={g.group}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>표준 도메인 구분</label>
                  <select
                    className="form-input"
                    value={formDomainType}
                    onChange={e => setFormDomainType(e.target.value as ForkliftOptionMaster['domainType'])}
                  >
                    {DOMAIN_TYPE_OPTIONS.map(d => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>옵션 품목명</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 강화유리 스틸 캐빈 · 양문 여닫이형"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    세부 구조 · 문열림방식 · 길이 규격
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 문열림: 좌우 180도 여닫이 / 길이 1,800mm"
                    value={formSubVariant}
                    onChange={e => setFormSubVariant(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>적용 가능 톤수·차종</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formTonnage}
                    onChange={e => setFormTonnage(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>단위</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>표준 장착시간</label>
                  <input
                    type="number"
                    step="0.5"
                    className="form-input"
                    value={formInstallHours}
                    onChange={e => setFormInstallHours(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>장착 원가 · 원</label>
                  <input
                    type="number"
                    step={10000}
                    className="form-input"
                    value={formCostPrice}
                    onChange={e => setFormCostPrice(Number(e.target.value))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap', color: '#0369a1' }}>
                    대리점 공급단가 · 원
                  </label>
                  <input
                    type="number"
                    step={10000}
                    className="form-input"
                    value={formDealerPrice}
                    onChange={e => setFormDealerPrice(Number(e.target.value))}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap', color: '#1d4ed8' }}>
                    최종고객 표준 청구단가 · 원
                  </label>
                  <input
                    type="number"
                    step={10000}
                    className="form-input"
                    value={formUnitPrice}
                    onChange={e => setFormUnitPrice(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>기술 제원 및 시공 상세</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="장착 부위, 유압/전장 사양, 안전 규격 등 입력"
                  value={formSpecDetail}
                  onChange={e => setFormSpecDetail(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
                <input
                  id="chk-free-default"
                  type="checkbox"
                  checked={formIsFreeDefault}
                  onChange={e => setFormIsFreeDefault(e.target.checked)}
                />
                <label htmlFor="chk-free-default" style={{ fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
                  출고 시 무상옵션 기본 적용 여부 · 체크 해제 시 출고 청구액에 단가 자동 합산
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  취소
                </button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 800 }}>
                  {editingOption ? '단가·옵션 저장' : '신규 옵션 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ForkliftOptionMasterPage;
