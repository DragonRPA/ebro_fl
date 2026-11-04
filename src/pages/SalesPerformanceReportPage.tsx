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
          <TrendingUp size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            실적관리
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('PROFITABILITY')}
            className={`segmented-tab-item ${subTab === 'PROFITABILITY' ? 'active' : ''}`}
          >
            <TrendingUp size={14} />
            <span>매출·원가·이익률 분석</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PREDEFINED_REPORTS')}
            className={`segmented-tab-item ${subTab === 'PREDEFINED_REPORTS' ? 'active' : ''}`}
          >
            <FileSpreadsheet size={14} />
            <span>정기 보고자료</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('SALES_JOURNAL')}
            className={`segmented-tab-item ${subTab === 'SALES_JOURNAL' ? 'active' : ''}`}
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
