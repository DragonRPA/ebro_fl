import React, { useState } from 'react';
import { TrendingUp, FileSpreadsheet, BookOpen } from 'lucide-react';
import { TradeProfitabilityPage } from './distribution/TradeProfitabilityPage';
import { RegularReportsPage } from './RegularReportsPage';
import { SalesJournalPage } from './SalesJournalPage';

export const SalesPerformanceReportPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'PROFITABILITY' | 'PREDEFINED_REPORTS' | 'SALES_JOURNAL'>('PROFITABILITY');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} color="#2563eb" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            실적관리 · 사전 정의된 영업실적 및 경영 보고자료 생산
          </span>
        </div>

        <div style={{ display: 'flex', gap: '6px', backgroundColor: 'var(--bg-app)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            onClick={() => setSubTab('PROFITABILITY')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'PROFITABILITY' ? 'var(--primary)' : 'transparent',
              color: subTab === 'PROFITABILITY' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <TrendingUp size={14} />
            <span>영업실적 · 매출총이익 보고서</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PREDEFINED_REPORTS')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'PREDEFINED_REPORTS' ? '#059669' : 'transparent',
              color: subTab === 'PREDEFINED_REPORTS' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <FileSpreadsheet size={14} />
            <span>사전 정의 정기 보고자료 생산</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('SALES_JOURNAL')}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 800,
              backgroundColor: subTab === 'SALES_JOURNAL' ? '#d97706' : 'transparent',
              color: subTab === 'SALES_JOURNAL' ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap'
            }}
          >
            <BookOpen size={14} />
            <span>영업활동 일지</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'PROFITABILITY' && <TradeProfitabilityPage />}
        {subTab === 'PREDEFINED_REPORTS' && <RegularReportsPage />}
        {subTab === 'SALES_JOURNAL' && <SalesJournalPage />}
      </div>
    </div>
  );
};
export default SalesPerformanceReportPage;
