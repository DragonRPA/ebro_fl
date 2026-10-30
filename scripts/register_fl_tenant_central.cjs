// scripts/register_fl_tenant_central.cjs
// 중앙 플랫폼 DB (nyfashwbdcepncpdwpdb.supabase.co)에 eBro FL 데모 테넌트 등록 스크립트

const { createClient } = require('@supabase/supabase-js');

const CENTRAL_SUPABASE_URL = 'https://nyfashwbdcepncpdwpdb.supabase.co';
const CENTRAL_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55ZmFzaHdiZGNlcG5jcGR3cGRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExOTUwMjgsImV4cCI6MjEwNjc3MTAyOH0.xw2XKKzjPj_HjQzPJDMKkkbaO7htojYioIMGt4l8VLM';

const client = createClient(CENTRAL_SUPABASE_URL, CENTRAL_SUPABASE_ANON_KEY);

const flTenantRecord = {
  id: 'tenant-ebro-fl',
  tenantCode: 'EBRO_FL',
  subdomain: 'fl-demo',
  displayName: 'eBroFL 렌탈',
  corporateName: '주식회사 이브로지게차렌탈',
  tradeName: 'eBroFL 렌탈',
  businessNumber: '108-86-99999',
  corporateRegistrationNumber: '110111-7777777',
  representativeName: '이정용',
  openingDate: '2026-01-01',
  businessAddress: '경기도 평택시 포승읍 평택항만길 100',
  headOfficeAddress: '경기도 평택시 포승읍 평택항만길 100',
  businessCategory: '사업지원 및 임대서비스업 / 도소매업',
  businessItem: '지게차 임대·매매·부품 및 정비업',
  tel: '031-681-8899',
  fax: '031-681-8898',
  salesPhone: '010-3344-5566',
  taxEmail: 'fl-demo@ebro.run',
  taxOffice: '평택세무서장',
  websiteUrl: 'https://fl-demo.ebro.run',
  ciUrl: '/favicon.svg',
  logoUrl: '/favicon.svg',
  stampImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAadJREFUaEPtmWFOwzAMhW/uA+4/90HACUgIEoc0ad26/lhq1STN19hOqN9SJfFjO/4e3pI3S5F3fFw8bFp97dZz8/G2abfB2wZ7D6/J+69bWJ6L52P7mHy+Xz8+Lx+fr6v6Xv5m9fP69Vrfy//2Wl/L217ra/s5t4/J91+vybE9bHl9TNu3vVbeXsszW/k59pq2r3up1+TYHk2Ove61/e01ObaHLa+PyWvbq63PseW5eE2OpvXl1XNl9dxyZe7/7M9V33t7eW/sPbfvjXXeW8u5+PzcXq7P5er293v7b8u5+O/rZ/bZ+97bf1vXz+yzz/f+3FauXN6eKz/n8q51/cw+++zzvT+3lSuXt+fKz7m8a10/s88++3zvz23lyuXtufJzLu9a18/ss88++3zvz23lyuXtufJzLu9a18/ss88++3zvz23lyuXtufJzLu9a18/ss88++3zvz23lyuXtufJzLu9a/wdzK+i+0EagAAAAABJRU5ErkJggg==',
  stampBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAadJREFUaEPtmWFOwzAMhW/uA+4/90HACUgIEoc0ad26/lhq1STN19hOqN9SJfFjO/4e3pI3S5F3fFw8bFp97dZz8/G2abfB2wZ7D6/J+69bWJ6L52P7mHy+Xz8+Lx+fr6v6Xv5m9fP69Vrfy//2Wl/L217ra/s5t4/J91+vybE9bHl9TNu3vVbeXsszW/k59pq2r3up1+TYHk2Ove61/e01ObaHLa+PyWvbq63PseW5eE2OpvXl1XNl9dxyZe7/7M9V33t7eW/sPbfvjXXeW8u5+PzcXq7P5er293v7b8u5+O/rZ/bZ+97bf1vXz+yzz/f+3FauXN6eKz/n8q51/cw+++zzvT+3lSuXt+fKz7m8a10/s88++3zvz23lyuXtufJzLu9a18/ss88++3zvz23lyuXtufJzLu9a18/ss88++3zvz23lyuXtufJzLu9a/wdzK+i+0EagAAAAABJRU5ErkJggg==',
  status: 'ACTIVE',
  isDefault: false,
  allowCustomBillingStatement: true,
  solutionType: 'FL',
  targetRepo: 'DragonRPA/ebro_fl',
  subscription: {
    memo: '공식 지게차 렌탈 및 매매 데모 시연 전용 테넌트',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: '2029-12-31',
    maxUsers: 0,
    maxAssets: 0,
    autoRenew: true,
    billingCycle: 'YEARLY',
    monthlyFee: 0,
    gracePeriodDays: 30,
    licenseKey: 'EBR-DEMO-FL-20291231-LIVE'
  },
  features: {
    telegramBot: true,
    customDomain: 'fl-demo.ebro.run',
    kakaoContract: true,
    agentAiEnabled: true,
    autoTaxInvoice: true,
    voiceAssistance: true,
    callRecordingStt: true,
    allowContractTradeOutbound: true,
    specialFeatures: [
      'tab:truck_dispatch:audit_settle',
      'btn:truck_dispatch:bulk_approve',
      'btn:courier_dispatch:direct_dispatch',
      'btn:contracts:trade_outbound'
    ],
    officialMailConfig: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      isDevMode: false,
      updatedAt: new Date().toISOString(),
      googleEmail: '77.victor.lee@gmail.com',
      smtpProvider: 'GMAIL',
      gmailAppPassword: 'hqqgtwtsjimvqmeb'
    },
    privacyOfficer: {
      name: '이정용',
      email: 'fl-demo@ebro.run',
      phone: '010-3344-5566',
      position: '대표이사 / 개인정보보호책임자',
      department: '경영지원본부'
    }
  },
  bankAccounts: [
    {
      bankName: '우리은행',
      isDefault: true,
      accountHolder: '주식회사 이브로지게차렌탈',
      accountNumber: '1002-123-777777'
    }
  ],
  yards: [
    {
      id: 'yard-fl-01',
      yardCode: 'YARD-FL-01',
      name: 'eBroFL 평택 메인 주기장',
      isDefault: true,
      address: '경기도 평택시 포승읍 평택항만길 100',
      addressDetail: 'A창고 및 주기장',
      operatingCapacity: 300,
      managerName: '야드운영팀',
      managerPhone: '031-681-8899',
      tel: '031-681-8899',
      operatingHours: '08:00 ~ 18:00',
      memo: '지게차 및 수입 부품 메인 주기장',
      createdAt: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'yard-fl-02',
      yardCode: 'YARD-FL-02',
      name: 'eBroFL 화성 예비 주기장',
      isDefault: false,
      address: '경기도 화성시 남양읍 시청로 160번길 20',
      addressDetail: 'B창고 예비 주기장',
      operatingCapacity: 150,
      managerName: '정비운영팀',
      managerPhone: '031-355-8899',
      tel: '031-355-8899',
      operatingHours: '08:00 ~ 18:00',
      memo: '예비 창고 및 중정비 센터',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ],
  workplaces: [
    {
      id: 'wp-fl-01',
      workplaceCode: 'HQ-FL',
      name: '평택 본점',
      isHeadquarter: true,
      businessNumber: '108-86-99999',
      subBizNumber: '0000',
      address: '경기도 평택시 포승읍 평택항만길 100',
      addressDetail: '본관 2층',
      tel: '031-681-8899',
      fax: '031-681-8898',
      managerName: '이정용',
      managerPhone: '010-3344-5566',
      managerEmail: 'fl-demo@ebro.run',
      memo: 'eBro FL 지게차 렌탈·유통 본사 및 관제센터',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ],
  allowedPages: [],
  hiddenPages: [],
  tenantSupabaseUrl: 'https://mluhhrbcogvsalkchrdp.supabase.co',
  tenantSupabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sdWhocmJjb2d2c2Fsa2NocmRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzM0MjM1MywiZXhwIjoyMTA4OTE4MzUzfQ.9DTI60YlVeKxPLvvGAZOq8cZF8onrU1NCrfBNB-Fvyo',
  systemName: 'e-Bro FL ERP',
  businessTypes: [
    {
      bizType: '사업지원 및 임대서비스업',
      bizItem: '지게차 및 물류장비 임대업'
    },
    {
      bizType: '도매 및 소매업',
      bizItem: '지게차·건설기계 매매 및 수입 부품 유통업'
    }
  ],
  isUnitTaxation: false,
  certificateIssueDate: '2026-01-01',
  email: 'fl-demo@ebro.run',
  mainYardAddress: '경기도 평택시 포승읍 평택항만길 100',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: new Date().toISOString()
};

async function main() {
  console.log('Inserting/Upserting fl-demo tenant into centralSupabase (nyfashwbdcepncpdwpdb)...');
  const { data, error } = await client
    .from('tenants')
    .upsert(flTenantRecord, { onConflict: 'id' })
    .select('id, tenantCode, displayName, subdomain, solutionType, tenantSupabaseUrl');

  if (error) {
    console.error('❌ Failed to insert FL tenant:', error);
    process.exit(1);
  }

  console.log('✅ Successfully registered FL demo tenant in central platform DB:');
  console.log(data);
}

main();
