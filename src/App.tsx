import React from 'react';
import { AppShellProvider, useAppShell } from './core/AppShellContext';
import { ManualProvider } from './manual/ManualContext';
import { ManualOverlay } from './manual/ManualOverlay';
import { LoginView } from './components/LoginView';
import { ShellLayout } from './components/ShellLayout';
import { ApprovalInboxPage, DashboardPage } from './pages/PortalPages';
import {
  CatalogsPage,
  ExchangeRatesPage,
  PartnersPage,
  RentalItemMastersPage,
  TradeItemMastersPage,
} from './pages/MasterPages';
import { LogisticsCostsPage, PurchasesPage } from './pages/ProcurementPages';
import {
  QuotationsPage,
  TradeContractsPage,
  TradeFulfillmentPage,
  TradeInventoryPage,
  TradePerformancePage,
} from './pages/TradePages';
import {
  RentalAssetsPage,
  RentalContractsPage,
  RentalFulfillmentPage,
  RentalMaintenancePage,
  RentalPerformancePage,
} from './pages/RentalPages';
import {
  ApSettlementsPage,
  ArBillingCollectionPage,
  BankMatchingPage,
  FinancialStatementsPage,
  OperationManualPage,
  SystemSettingsPage,
} from './pages/FinanceSystemPages';
import { OrganizationHrPage } from './pages/OrganizationHrPages';
import type { FlPageId } from './types/domain';

function renderActivePage(pageId: FlPageId): React.ReactNode {
  switch (pageId) {
    case 'dashboard':
      return <DashboardPage />;
    case 'approval_inbox':
      return <ApprovalInboxPage />;
    case 'partners':
      return <PartnersPage />;
    case 'trade_item_masters':
      return <TradeItemMastersPage />;
    case 'rental_item_masters':
      return <RentalItemMastersPage />;
    case 'exchange_rates':
      return <ExchangeRatesPage />;
    case 'catalogs':
      return <CatalogsPage />;
    case 'purchases':
      return <PurchasesPage />;
    case 'logistics_costs':
      return <LogisticsCostsPage />;
    case 'quotations':
      return <QuotationsPage />;
    case 'trade_contracts':
      return <TradeContractsPage />;
    case 'trade_inventory':
      return <TradeInventoryPage />;
    case 'trade_fulfillment':
      return <TradeFulfillmentPage />;
    case 'trade_performance':
      return <TradePerformancePage />;
    case 'rental_contracts':
      return <RentalContractsPage />;
    case 'rental_assets':
      return <RentalAssetsPage />;
    case 'rental_fulfillment':
      return <RentalFulfillmentPage />;
    case 'rental_maintenance':
      return <RentalMaintenancePage />;
    case 'rental_performance':
      return <RentalPerformancePage />;
    case 'ar_billing_collection':
      return <ArBillingCollectionPage />;
    case 'ap_settlements':
      return <ApSettlementsPage />;
    case 'bank_matching':
      return <BankMatchingPage />;
    case 'financial_statements':
      return <FinancialStatementsPage />;
    case 'organization_hr':
      return <OrganizationHrPage />;
    case 'operation_manual':
      return <OperationManualPage />;
    case 'system_settings':
      return <SystemSettingsPage />;
    default:
      return <DashboardPage />;
  }
}

const AppRouter: React.FC = () => {
  const { isLoading, currentUser, activePage } = useAppShell();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--bg-app)',
          color: 'var(--text-secondary)',
          fontSize: '14px',
          fontWeight: 600,
        }}
      >
        전사 데이터베이스 불러오는 중
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  return (
    <>
      <ShellLayout>{renderActivePage(activePage)}</ShellLayout>
      <ManualOverlay />
    </>
  );
};

export const App: React.FC = () => {
  return (
    <AppShellProvider>
      <ManualProvider>
        <AppRouter />
      </ManualProvider>
    </AppShellProvider>
  );
};

export default App;
