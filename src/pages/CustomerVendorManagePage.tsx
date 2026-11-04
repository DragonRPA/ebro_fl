import React, { useState } from 'react';
import { Users, Building2 } from 'lucide-react';
import { Customers } from './Customers';
import { Vendors } from './Vendors';

export const CustomerVendorManagePage: React.FC = () => {
  const [subTab, setSubTab] = useState<'CUSTOMERS' | 'VENDORS'>('CUSTOMERS');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
      <div className="card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={17} color="var(--primary-color)" />
          <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
            고객·매입처 관리
          </span>
        </div>

        <div className="segmented-tab-group">
          <button
            type="button"
            onClick={() => setSubTab('CUSTOMERS')}
            className={`segmented-tab-item ${subTab === 'CUSTOMERS' ? 'active' : ''}`}
          >
            <Users size={14} />
            <span>고객사·고객현장 관리</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('VENDORS')}
            className={`segmented-tab-item ${subTab === 'VENDORS' ? 'active' : ''}`}
          >
            <Building2 size={14} />
            <span>매입처·임차처 관리</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {subTab === 'CUSTOMERS' && <Customers />}
        {subTab === 'VENDORS' && <Vendors />}
      </div>
    </div>
  );
};
export default CustomerVendorManagePage;
