import React, { useState } from 'react';
import { TrendingUp, BookOpen } from 'lucide-react';
import { TradeProfitabilityPage } from './distribution/TradeProfitabilityPage';
import { SalesJournalPage } from './SalesJournalPage';

export const SalesPerformanceReportPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'PROFITABILITY' | 'SALES_JOURNAL'>('PROFITABILITY');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            실적관리-유통
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('PROFITABILITY')}
            className={`segmented-tab-item ${subTab === 'PROFITABILITY' ? 'active' : ''}`}
          >
            <TrendingUp size={14} />
            <span>유통 매입·매출·이익률 집계</span>
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
        {subTab === 'SALES_JOURNAL' && <SalesJournalPage />}
      </div>
    </div>
  );
};
export default SalesPerformanceReportPage;
