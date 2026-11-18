import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppShellProvider, useAppShell } from './core/AppShellContext';
import { PageActivityProvider } from './core/PageActivityContext';
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
  CashCalendarPage,
  FinancialStatementsPage,
  OperationManualPage,
  PermissionSettingsPage,
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
    case 'cash_calendar':
      return <CashCalendarPage />;
    case 'financial_statements':
      return <FinancialStatementsPage />;
    case 'organization_hr':
      return <OrganizationHrPage />;
    case 'operation_manual':
      return <OperationManualPage />;
    case 'permission_settings':
      return <PermissionSettingsPage />;
    case 'system_settings':
      return <SystemSettingsPage />;
    default:
      return <DashboardPage />;
  }
}

interface ScrollSnapshot {
  el: HTMLElement;
  top: number;
  left: number;
}

const ActiveHostSynchronizer: React.FC<{
  activePage: FlPageId;
  slotRef: React.RefObject<HTMLDivElement | null>;
  hostMapRef: React.RefObject<Map<FlPageId, HTMLDivElement>>;
  mountedPageRef: React.RefObject<FlPageId | null>;
  windowScrollMapRef: React.RefObject<Map<FlPageId, number>>;
  innerScrollMapRef: React.RefObject<Map<FlPageId, ScrollSnapshot[]>>;
  getOrCreateHost: (pid: FlPageId) => HTMLDivElement;
}> = ({
  activePage,
  slotRef,
  hostMapRef,
  mountedPageRef,
  windowScrollMapRef,
  innerScrollMapRef,
  getOrCreateHost,
}) => {
  useLayoutEffect(() => {
    const slotEl = slotRef.current;
    if (!slotEl) return;

    const prevPage = mountedPageRef.current;
    if (prevPage && prevPage !== activePage) {
      windowScrollMapRef.current.set(prevPage, window.scrollY);
      const prevHost = hostMapRef.current.get(prevPage);
      if (prevHost) {
        const snapshots: ScrollSnapshot[] = [];
        const walker = document.createTreeWalker(prevHost, NodeFilter.SHOW_ELEMENT);
        let node = walker.nextNode();
        while (node) {
          if (node instanceof HTMLElement && (node.scrollTop > 0 || node.scrollLeft > 0)) {
            snapshots.push({ el: node, top: node.scrollTop, left: node.scrollLeft });
          }
          node = walker.nextNode();
        }
        innerScrollMapRef.current.set(prevPage, snapshots);
        if (prevHost.parentNode === slotEl) {
          slotEl.removeChild(prevHost);
        }
      }
    }

    const nextHost = getOrCreateHost(activePage);
    for (const child of Array.from(slotEl.childNodes)) {
      if (child !== nextHost) {
        slotEl.removeChild(child);
      }
    }
    if (nextHost.parentNode !== slotEl) {
      slotEl.appendChild(nextHost);
    }

    if (prevPage !== activePage) {
      const innerSnapshots = innerScrollMapRef.current.get(activePage);
      if (innerSnapshots) {
        for (const item of innerSnapshots) {
          if (nextHost.contains(item.el)) {
            item.el.scrollTop = item.top;
            item.el.scrollLeft = item.left;
          }
        }
      }
      const targetWinScroll = windowScrollMapRef.current.get(activePage) ?? 0;
      window.scrollTo(0, targetWinScroll);
    }

    mountedPageRef.current = activePage;
  }, [
    activePage,
    getOrCreateHost,
    hostMapRef,
    innerScrollMapRef,
    mountedPageRef,
    slotRef,
    windowScrollMapRef,
  ]);

  return null;
};

const KeepAlivePageOutlet: React.FC<{
  activePage: FlPageId;
  canViewPage: (pageId: FlPageId) => boolean;
}> = ({ activePage, canViewPage }) => {
  const [visitedPages, setVisitedPages] = useState<FlPageId[]>(() => [activePage]);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const hostMapRef = useRef<Map<FlPageId, HTMLDivElement>>(new Map());
  const mountedPageRef = useRef<FlPageId | null>(null);
  const windowScrollMapRef = useRef<Map<FlPageId, number>>(new Map());
  const innerScrollMapRef = useRef<Map<FlPageId, ScrollSnapshot[]>>(new Map());

  const getOrCreateHost = React.useCallback((pid: FlPageId): HTMLDivElement => {
    let host = hostMapRef.current.get(pid);
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-keepalive-page', pid);
      host.style.cssText =
        'display: flex; flex-direction: column; gap: var(--space-page-gap); min-width: 0;';
      hostMapRef.current.set(pid, host);
    }
    return host;
  }, []);

  const pagesToRender = useMemo(() => {
    const base = visitedPages.filter((p) => canViewPage(p));
    if (canViewPage(activePage) && !base.includes(activePage)) {
      return [...base, activePage];
    }
    return base;
  }, [visitedPages, activePage, canViewPage]);

  useEffect(() => {
    setVisitedPages((prev) => {
      const filtered = prev.filter((p) => canViewPage(p));
      const next =
        canViewPage(activePage) && !filtered.includes(activePage)
          ? [...filtered, activePage]
          : filtered;
      if (next.length === prev.length && next.every((v, idx) => v === prev[idx])) {
        return prev;
      }
      return next;
    });

    for (const pid of Array.from(hostMapRef.current.keys())) {
      if (!canViewPage(pid)) {
        const hostEl = hostMapRef.current.get(pid);
        if (hostEl && hostEl.parentNode) {
          hostEl.parentNode.removeChild(hostEl);
        }
        hostMapRef.current.delete(pid);
        windowScrollMapRef.current.delete(pid);
        innerScrollMapRef.current.delete(pid);
        if (mountedPageRef.current === pid) {
          mountedPageRef.current = null;
        }
      }
    }
  }, [activePage, canViewPage]);

  useEffect(() => {
    const onScroll = () => {
      if (mountedPageRef.current === activePage) {
        windowScrollMapRef.current.set(activePage, window.scrollY);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [activePage]);

  return (
    <>
      <div
        ref={slotRef}
        data-keepalive-slot="true"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-page-gap)',
          minWidth: 0,
        }}
      />
      <ActiveHostSynchronizer
        activePage={activePage}
        slotRef={slotRef}
        hostMapRef={hostMapRef}
        mountedPageRef={mountedPageRef}
        windowScrollMapRef={windowScrollMapRef}
        innerScrollMapRef={innerScrollMapRef}
        getOrCreateHost={getOrCreateHost}
      />
      {pagesToRender.map((pid) =>
        createPortal(
          <PageActivityProvider active={pid === activePage}>
            {renderActivePage(pid)}
          </PageActivityProvider>,
          getOrCreateHost(pid),
          pid
        )
      )}
    </>
  );
};

const AppRouter: React.FC = () => {
  const { isLoading, currentUser, activePage, canViewPage } = useAppShell();

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
      <ShellLayout>
        <KeepAlivePageOutlet
          key={currentUser.id}
          activePage={activePage}
          canViewPage={canViewPage}
        />
      </ShellLayout>
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
