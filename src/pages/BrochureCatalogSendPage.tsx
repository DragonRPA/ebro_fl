import React, { useState } from 'react';
import { BookOpen, Send, FileSpreadsheet } from 'lucide-react';
import { SEED_FL_CUSTOMERS } from '../data/flUnifiedSeedData';
import { ForkliftDocArchivePage } from './distribution/ForkliftDocArchivePage';
import { CompatiblePartsCatalogOrderPage } from './distribution/CompatiblePartsCatalogOrderPage';

export const BrochureCatalogSendPage: React.FC = () => {
  const [subTab, setSubTab] = useState<'BROCHURE_ARCHIVE' | 'PARTS_CATALOG'>('BROCHURE_ARCHIVE');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(SEED_FL_CUSTOMERS[0].id);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const selectedCustomer = SEED_FL_CUSTOMERS.find(c => c.id === selectedCustomerId) || SEED_FL_CUSTOMERS[0];

  const handleSendPackage = () => {
    setToastMsg(`${selectedCustomer.name} 앞 제품 브로셔 및 카타로그 패키지 발송이 완료되었습니다.`);
    setTimeout(() => setToastMsg(null), 3200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', height: '100%' }}>
      {toastMsg && (
        <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--primary-color)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 700 }}>
          {toastMsg}
        </div>
      )}

      <div style={{ padding: '6px 12px', borderRadius: '6px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            브로셔·카타로그 관리
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              style={{ height: '28px', padding: '0 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 700 }}
            >
              {SEED_FL_CUSTOMERS.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.bizRegNo})</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSendPackage}
              className="btn btn-primary"
              style={{ height: '28px', padding: '0 10px', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
            >
              <Send size={12} />
              <span>선택 고객사 발송</span>
            </button>
          </div>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('BROCHURE_ARCHIVE')}
            className={`segmented-tab-item ${subTab === 'BROCHURE_ARCHIVE' ? 'active' : ''}`}
          >
            <BookOpen size={13} />
            <span>지게차 브로셔·제원표</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('PARTS_CATALOG')}
            className={`segmented-tab-item ${subTab === 'PARTS_CATALOG' ? 'active' : ''}`}
          >
            <FileSpreadsheet size={13} />
            <span>호환부품 카타로그</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'BROCHURE_ARCHIVE' ? <ForkliftDocArchivePage /> : <CompatiblePartsCatalogOrderPage />}
      </div>
    </div>
  );
};
export default BrochureCatalogSendPage;
