# eBroFL 전사 코드 파일 및 파일별 기능 명세서 (SSOT)

> **대상 프로젝트**: `fl-bero` (`ebro_fl` v2.2 — 지게차 수입·유통·렌탈·재무회계 통합 ERP)
> **역할**: 전사 소스코드 전체 파일 목록, 기능 명세, AST 의존성(`Imports`/`Fan-In`), DB 테이블 매핑, 기능 대칭 쌍 및 최적화 지표 단일 진실의 원천(SSOT)
> **생성·검증 엔진**: `scripts/generate_code_file_spec.cjs` + `scripts/code_file_descriptions.cjs`
> **조회·동기화 명령**: `npm run spec:query -- <검색어>` · `npm run spec:sync` · `npm run spec:verify`

---

## 제1장. 명세 개요 · 통계 요약 · 계층 목차

### 1.1 전체 코드베이스 정량 요약

| 항목 | 집계 수치 | 설명 |
|:---|---:|:---|
| 총 활성 코드 파일 수 | 413개 | 빌드 산출물(dist), 외부 모델, node_modules 제외 전수 스캔 |
| 총 소스 라인 / 용량 | 169,563줄 / 6.84 MB | AST 및 다중 언어 파서 기준 실측 |
| 초대형 모듈 (GOD_FILE) | 11개 | 1,500줄 이상 또는 80KB 초과 분할 우선 대상 |
| 대형 모듈 (LARGE_FILE) | 17개 | 800줄~1,499줄 비대화 주의 대상 |
| src/ 비데이터 대형 모듈 (SRC_LARGE_FILE) | 1개 | src/ 하위(src/data 정적 데이터 제외) 800줄 이상 모듈 |
| 고결합 핵심 허브 (HIGH_COUPLING_HUB) | 9개 | 역참조(Fan-In) 8개 이상 공유 모듈 |
| 정적 라우트 임포트 (EAGER_ROUTE_IMPORT) | 0개 | App.tsx 내 React.lazy 미적용 페이지 모듈 |
| 동적 코드 스플리팅 호스트 | 18개 | 내부 동적 임포트 59건 · 외부 동적 패키지 임포트 6건 |
| 중량 패키지 정적 임포트 (HEAVY_STATIC_LIB) | 0개 | src/ 하위 xlsx·exceljs·pdf 런타임 정적 결합 모듈 |
| 정적 런타임 순환 참조 (CIRCULAR_DEP) | 0개 | src/ 정적 런타임 의존성 SCC 순환 탐지 대상 |
| 미참조 후보 (ORPHAN_CANDIDATE) | 0개 | src/ 하위 비엔트리·비테스트 파일 중 Fan-In 0건 |
| 유통↔렌탈 기능 대칭 도메인 | 2쌍 | 단일 반응형 셸(별도 모바일 트리 없음 · 유통/렌탈 대칭 모듈) |

### 1.2 CLI 사용 및 에이전트 활용 절차

1. **수정 전 영향도 조회**: `npm run spec:query -- <파일명|메뉴ID|심볼|테이블>` 실행으로 수정 대상, 역참조(`importedBy`) 목록 및 DB 테이블 즉시 특정.
2. **수정 후 명세 동기화**: 파일 추가·분할·삭제·역할 변경 직후 `scripts/code_file_descriptions.cjs` 보완 후 `npm run spec:sync` 실행.
3. **무결성 검증 게이트**: 커밋 또는 완료 보고 전 `npm run spec:verify` 실행(`exit code 0` 필수).

### 1.3 계층별 파일 수 및 문서 목차

| 계층 코드 | 계층명 | 파일 수 | 시작 라인 |
|:---|:---|---:|:---|
| L00_RADAR | 제2장. 코드 수정 · 최적화 레이더 | - | L53 |
| L01_ROOT_BUILD | 제3장. 루트 엔트리 · 빌드 · 설정 · 마스터 스키마 (L01) | 20개 | L139 |
| L02_APP_SHELL | 제4장. 프론트엔드 앱 셸 · 전역 스타일 (L02) | 5개 | L164 |
| L03_CORE_SHELL | 제5장. 코어 상태 컨텍스트 · 액션 게이트웨이 · 멀티테넌트 DB 프록시 (L03) | 8개 | L174 |
| L04_TYPES_DATA_MANUAL | 제6장. 전사 도메인 타입 · 정적 제원/카탈로그 데이터 · 인앱 매뉴얼 레지스트리 (L04) | 14개 | L187 |
| L05_PAGES | 제7장. 정규 28개 메뉴 도메인 페이지 스위트 (L05) | 39개 | L206 |
| L06_COMPONENTS | 제8장. 공통 UI 프리미티브 · 레이아웃 셸 · 도메인 탭/모달 (L06) | 11개 | L250 |
| L07_SERVICES_UTILS | 제9장. 도메인/재무제표 엔진 · 문서/OCR/국세청/에이전트 서비스 · 보안/검색 유틸리티 (L07) | 20개 | L266 |
| L08_BACKEND_SQL_TEMPLATES | 제10장. 백엔드 서버리스 API · Edge Functions · SQL · 인쇄 양식 (L08) | 26개 | L291 |
| L09_NATIVE_AGENTS_TOOLS | 제11장. 데스크톱 에이전트 · Python AI 코어 · 브라우저 확장 · 개발자 도구 (L09) | 51개 | L322 |
| L10_TESTS_SCRIPTS | 제12장. 테스트(E2E·WTT·RWTT·보존법칙) · 마이그레이션 · DevOps 스크립트 (L10) | 219개 | L378 |

---

## 제2장. 코드 수정 · 최적화 레이더

### 2.1 비대 모듈 분할 우선 후보 (`GOD_FILE` 상위 35개)

| 순위 | 파일 경로 | 줄수 | 용량(KB) | Fan-In | 메뉴ID / 구분 | 핵심 기능 요약 |
|---:|:---|---:|---:|---:|:---|:---|
| 1 | `src/data/flBackupProductSpecs.ts` | 37,439 | 1203.7 | 1 | L04_TYPES_DATA_MANUAL | 백업 원장(fl_backup_products·fl_backup_assets) 복원 42종 지게차 VDI 2198·마스트·배터리·옵션 제원 데이터셋 |
| 2 | `scripts/migrate_run.cjs` | 6,101 | 219.0 | 0 | L10_TESTS_SCRIPTS | CLI 초기 DB 마이그레이션 번들 실행 스크립트(CommonJS 번들) |
| 3 | `agent/eBroAgent.js` | 6,065 | 254.8 | 0 | L09_NATIVE_AGENTS_TOOLS | 로컬 비즈니스 코어 엔진(포트 5175 REST, PDF 무인인쇄, SMTP 메일, R2 미러링, 문서고) |
| 4 | `agent/studioEngine.js` | 3,146 | 112.3 | 1 | L09_NATIVE_AGENTS_TOOLS | 데스크톱 독립 스튜디오 및 자연어 업무 지시 큐 처리 엔진 |
| 5 | `대시보드.html` | 2,346 | 174.7 | 0 | L01_ROOT_BUILD | 루트 보관용 네이버 밴드 3대 원천 데이터 분석 대시보드 HTML |
| 6 | `public/대시보드.html` | 2,346 | 174.1 | 0 | L01_ROOT_BUILD | 배포 정적 경로용 네이버 밴드 3대 원천 데이터 분석 대시보드 HTML |
| 7 | `src/data/accountingStandardsData.ts` | 2,214 | 204.6 | 2 | L04_TYPES_DATA_MANUAL | 중소기업회계기준 본문 조문·장절 목차 및 실무 해설서·사례 정적 데이터셋 |
| 8 | `scripts/seed_full_organic_fl_data.cjs` | 2,026 | 92.7 | 0 | L10_TESTS_SCRIPTS | eBroFL 전 도메인(매입·통관·수주·출고·렌탈·리스·정비·청구·수납) 유기적 실무 데이터셋 적재 및 대차 0원 검증 스크립트 |
| 9 | `src/data/compatiblePartsCatalogData.ts` | 1,998 | 102.1 | 2 | L04_TYPES_DATA_MANUAL | 지게차 호환부품 벤치마크 분석, 카탈로그 주문 전환 전략 및 24종 호환부품 마스터 데이터셋 |
| 10 | `scripts/RUN_IN_SUPABASE_ALL_SPECS.sql` | 1,939 | 89.8 | 0 | L10_TESTS_SCRIPTS | products 테이블 13대 규격 컬럼 신설 및 53종 모델 제원 일괄 업서트 SQL |
| 11 | `scripts/generate7StepManuals.cjs` | 1,011 | 141.5 | 0 | L10_TESTS_SCRIPTS | 전사 50+ 메뉴 매뉴얼을 7단계 심층 비즈니스 워크플로우 형식으로 생성·갱신하는 빌더 |

### 2.2 고결합 핵심 허브 (`HIGH_COUPLING_HUB` — 수정 시 역참조 연쇄 검증 필수)

| 순위 | 파일 경로 | Fan-In (피참조 수) | Outbound | 줄수 | 주요 Export | 핵심 역할 |
|---:|:---|---:|---:|---:|:---|:---|
| 1 | `src/types/domain.ts` | 66 | 3 | 5 | `-` | 1단어 1뜻 전사 단일 도메인 타입(domainCoreTypes·domainLedgerTypes·domainFormatters) 통합 배럴 SSOT |
| 2 | `src/components/UiPrimitives.tsx` | 44 | 4 | 755 | `controlInputStyle, CommaNumberInputProps, CommaNumberInput, controlTextareaStyle, actionBtnStyle` | 공통 UI 프리미티브(VerticalField, 250행 점진 윈도잉·3단 정렬·동적 XLSX DataGrid, Memo StatusBadge, ConservationBar, ModalDialog) |
| 3 | `src/core/AppShellContext.tsx` | 43 | 6 | 788 | `FlDatasets, ToastItem, AppShellContextValue, AppShellProvider, useAppShell` | 세션 기반 비로그인·본적재 분리 부트스트랩, 에이전트 상태 디듀플리케이션, O(1) 화면권한 맵 및 메모이즈드 셸 컨텍스트 |
| 4 | `src/core/supabase.ts` | 28 | 1 | 233 | `DEFAULT_TENANT_ID, getActiveFlTenantId, setActiveFlTenantId, flSupabase, centralSupabase` | fl_* 자동 접두사 및 활성 tenant_id 행 격리 프록시(flSupabase), 페이지네이션 전수 로더, 키 캐시 행 변환 및 변이 래퍼 |
| 5 | `src/services/domainMath.ts` | 26 | 2 | 509 | `todayIso, currentYm, addDaysIso, getDaysInMonth, getMonthBounds` | 날짜·월경계 연산, 선입선출 정렬, 월별 감가상각, 금융리스 상환표 및 일할 렌탈 청구 계산 순수 엔진 |
| 6 | `src/components/SearchableSelect.tsx` | 12 | 4 | 373 | `SearchableSelectOption, toPartnerSelectOptions, toItemMasterSelectOptions, SearchableSelectProps, SearchableSelect` | 사전 초성 인덱싱, O(1) 선택 조회, 키보드 탐색 및 거래처·품목 옵션 매핑 검색형 드롭다운 공통 컴포넌트 |
| 7 | `src/core/ActionCommandGateway.tsx` | 11 | 3 | 110 | `CommitActionButtonProps, CommitActionButton` | 결재 티어 판별 후 즉시 실행 또는 결재 상신을 분기하는 CommitActionButton UI 컴포넌트 |
| 8 | `src/services/domainProcurementLeaseEngine.ts` | 11 | 4 | 414 | `settleApPayable, createFinanceLeaseWithAsset, payLeaseInstallment, recordBillingCollection, recordLogisticsDispatch` | 외화 매입채무 결제, 금융리스 상환, 수납, 물류배차 및 매입입고 엔진 재노출(Barrel) |
| 9 | `src/services/domainFulfillmentEngine.ts` | 9 | 4 | 588 | `allocateNextFulfillmentNos, executeAccountTransfer, completeFulfillment, executeRentalExchange` | 출고채번, 계정대체, 유통·렌탈 입출고 실행완료, 렌탈 교환(EXCHANGE) 및 사후정비 엔진 재노출(Barrel) |

### 2.3 유통 ↔ 렌탈 기능 대칭 쌍 매핑 (단일 반응형 셸 기준)

> 참고: `eBroFL` v2는 별도 `src/mobile/` 트리 없이 `ShellLayout.tsx`와 `UiPrimitives.tsx` 기반 단일 반응형 셸로 PC·모바일 화면을 통합 운용합니다.

| 번호 | 업무 도메인 | 유통 구현 파일 | 렌탈 대응 파일 |
|---:|:---|:---|:---|
| 1 | 품목 마스터 (유통 ↔ 렌탈) | `src/pages/master/ItemMastersPages.tsx (trade_item_masters)` | `src/pages/master/ItemMastersPages.tsx (rental_item_masters)` |
| 2 | 계약 · 입출고 · 실적 (유통 ↔ 렌탈) | `src/pages/trade/TradeContractsPage.tsx (trade_contracts)`<br>`src/pages/trade/TradeFulfillmentPage.tsx (trade_fulfillment)`<br>`src/pages/trade/TradePerformancePage.tsx (trade_performance)` | `src/pages/rental/RentalContractsPage.tsx (rental_contracts)`<br>`src/pages/rental/RentalFulfillmentPage.tsx (rental_fulfillment)`<br>`src/pages/rental/RentalPerformancePage.tsx (rental_performance)` |

### 2.4 정적 라우트 임포트(`EAGER_ROUTE_IMPORT`) 및 미참조 후보(`ORPHAN_CANDIDATE`)

#### 2.4.1 `App.tsx` 정적 임포트 페이지 (`React.lazy()` 코드 스플리팅 전환 후보)

- 해당 없음 (전 페이지 지연 로딩 적용 완료)

#### 2.4.2 `src/` 하위 미참조 후보 (`ORPHAN_CANDIDATE` — Fan-In 0건 점검 대상)

- 해당 없음

### 2.5 동적 코드 스플리팅 및 중량 라이브러리 격리 현황

#### 2.5.1 동적 청크 분리 호스트 모듈 (내부 Lazy · 외부 온디맨드 패키지)

| 파일 경로 | 총 Out | 내부 동적 | 외부 동적 패키지 | 핵심 역할 |
|:---|---:|---:|:---|:---|
| `src/App.tsx` | 34 | 30 | - | 메인 앱 루트, 지연로딩 28개 메뉴·로그인·셸·매뉴얼 게이트 라우터 및 KeepAlive LRU(최대 8화면) 호스트 |
| `scripts/verify_v2_conservation.cjs` | 5 | 5 | `vite` | 원격 PostgreSQL 실데이터 기준 eBroFL v2 재무제표·재고·정비·리스 종단 보존 법칙 일괄 검증 스크립트 |
| `src/pages/master/CatalogsPage.tsx` | 9 | 4 | - | 비동기 제원 아카이브 로딩 기반 기종 목록, 상세 제원 호스트 및 지연로딩 비교·부품·패키지 통합 카탈로그 페이지 |
| `src/core/actionGatewayEngine.ts` | 7 | 4 | - | O(1) 결재정책 맵 기반 useActionGateway 훅 및 동적 도메인 엔진 분기 실행(executeApprovedPayload) 코어 |
| `vite.config.ts` | 4 | 4 | - | Vite 8 Oxc·Rolldown 불변 벤더청크(vendor-react·vendor-supabase) 분리 빌드(포트 5174, 소스맵·콘솔 제거) 및 로컬 R2·국세청·환율·OCR·팝빌 미들웨어 설정 |
| `scripts/seed_full_organic_fl_data.cjs` | 3 | 3 | - | eBroFL 전 도메인(매입·통관·수주·출고·렌탈·리스·정비·청구·수납) 유기적 실무 데이터셋 적재 및 대차 0원 검증 스크립트 |
| `scripts/verify_full_organic_erp.cjs` | 3 | 3 | - | 전 원장 실데이터 기반 domainEngine 및 financialStatementEngine 대차·현금 0원 보존 법칙 검증 스크립트 |
| `src/components/UiPrimitives.tsx` | 4 | 0 | `xlsx` | 공통 UI 프리미티브(VerticalField, 250행 점진 윈도잉·3단 정렬·동적 XLSX DataGrid, Memo StatusBadge, ConservationBar, ModalDialog) |
| `src/services/documentService.ts` | 3 | 0 | `exceljs` | 동적 ExcelJS 기반 견적서·계약서·거래명세서 생성, 직인 합성 및 로컬 에이전트 PDF 변환·이메일 발송 서비스 |
| `src/services/catalogSpecDocumentService.ts` | 3 | 0 | `pdf-lib` | 제원 카탈로그 단건·비교표·호환부품·패키지 견적 Excel(ExcelJS) 및 PDF(pdf-lib) 문서 생성 전용 서비스 |
| `src/pages/hr/hrHelpers.ts` | 4 | 0 | `exceljs` | 조직도 트리 정렬, 주민번호 마스킹, 스캔 첨부 및 동적 ExcelJS 임직원 내보내기 헬퍼 |
| `src/pages/master/CatalogSubTabs.tsx` | 7 | 1 | - | 제원 카탈로그 멀티 기종 VDI 2198 비교표 및 클릭 시점 동적 비교표 엑셀·PDF 내보내기 지연로딩 탭 컴포넌트 |
| `src/pages/master/CatalogSpecDetailPanel.tsx` | 6 | 1 | - | 선택 지게차 모델 VDI 2198·마스트·배터리·안전점검 조회 및 클릭 시점 동적 Excel·PDF 출력 상세 패널 컴포넌트 |
| `src/components/AccountingStandardsTab.tsx` | 4 | 1 | - | 중소기업회계기준 정적 데이터셋 동적 지연 로딩, 통합 검색 상태 관리 및 좌우 패인 호스트 뷰어 컴포넌트 |
| `src/components/LoginView.tsx` | 4 | 1 | - | 아이디·비밀번호 로그인 폼, 로컬 에이전트 설치·업데이트 제어 및 지연로딩 개인정보 처리방침 열람 화면 |
| `src/services/businessLicenseOcrService.ts` | 2 | 0 | `pdfjs-dist` | 사업자등록증·통장사본 이미지 및 동적 PDF 렌더링 Vision OCR 추출 및 Cloudflare R2 증빙 업로드 서비스 |
| `src/pages/finance/FinancialStatementsPage.tsx` | 6 | 1 | - | 재무상태표·손익계산서·현금흐름표·리스명세 및 지연로딩 중소기업회계기준 조회 페이지 |
| `src/manual/ManualContext.tsx` | 5 | 1 | - | 화면별 인앱 매뉴얼 오버레이·통합 검색 상태, manualRegistry 동적 지연 로딩 및 테넌트별 주석 저장 컨텍스트 |

#### 2.5.2 잔여 중량 패키지 정적 결합 모듈 (`HEAVY_STATIC_LIB`)

- 해당 없음 (전 런타임 화면·모달 동적 격리 완료)

#### 2.5.3 정적 런타임 순환 참조 (`CIRCULAR_DEP`)

- 해당 없음 (정적 런타임 순환 참조 0건)

---

## 제3장. 루트 엔트리 · 빌드 · 설정 · 마스터 스키마 (L01) — 20개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `.oxlintrc.json` | 24줄 (0.5KB) | - | `-` | Out:0 / In:0 | Oxlint 정적 검사 규칙(React Hooks·컴포넌트 export 허용 목록) 설정 |
| `대시보드.html` | 2,346줄 (174.7KB) | GOD_FILE | `-` | Out:0 / In:0 | 루트 보관용 네이버 밴드 3대 원천 데이터 분석 대시보드 HTML |
| `central_memories_table.sql` | 31줄 (1.5KB) | - | `-` | Out:0 / In:0 · DB:awp_shared_memories,it_shared_memories | 중앙 DB 공유 기억 테이블(awp_shared_memories) DDL 및 인덱스 생성 스크립트 |
| `create_agent_registry.sql` | 20줄 (0.9KB) | - | `-` | Out:0 / In:0 · DB:agent_registry | 로컬 에이전트 상태 등록 테이블(agent_registry) DDL 정의 |
| `index.html` | 36줄 (1.7KB) | - | `-` | Out:1 / In:0 | eBroFL 웹 애플리케이션 루트 진입 HTML 및 메타데이터 정의 |
| `kill-agent.bat` | 21줄 (0.8KB) | - | `-` | Out:0 / In:0 | 윈도우 로컬 사이드카 에이전트(eBroAgent) 프로세스 일괄 종료 배치 파일 |
| `manual_schema.sql` | 2줄 (0.6KB) | - | `-` | Out:0 / In:0 · DB:system_manuals | 테넌트별 메뉴 매뉴얼 링크 테이블(system_manuals) DDL 정의 |
| `package.json` | 64줄 (2.2KB) | - | `-` | Out:0 / In:0 | ebro_fl 패키지 의존성 및 빌드·Oxlint 무경고검사·한국어UI검사·명세동기화 CLI 스크립트 정의 |
| `playwright.config.ts` | 21줄 (0.4KB) | - | `default` | Out:0 / In:0 | Playwright E2E 및 RWTT 순차 실행 환경(workers=1, baseURL) 설정 |
| `public/대시보드.html` | 2,346줄 (174.1KB) | GOD_FILE | `-` | Out:0 / In:0 | 배포 정적 경로용 네이버 밴드 3대 원천 데이터 분석 대시보드 HTML |
| `public/manifest.json` | 35줄 (0.8KB) | - | `-` | Out:0 / In:0 | PWA 앱 이름, 아이콘, 시작 URL(?mode=mobile) 및 테마 메타 매니페스트 |
| `public/sw.js` | 86줄 (2.5KB) | - | `-` | Out:0 / In:0 | PWA 서비스 워커(구버전 캐시 정리, 푸시 알림 및 오프라인 페치 핸들러) |
| `run_test.bat` | 26줄 (0.8KB) | - | `-` | Out:0 / In:0 | 로컬 개발 테스트 환경 의존성 확인 및 Vite 서버 실행 배치 파일 |
| `schema.sql` | 836줄 (35.4KB) | LARGE_FILE | `-` | Out:0 / In:0 · DB:fl_ap_payables,fl_approval_policies,fl_approval_requests,fl_asset_events(+27) | eBroFL 전사 30개 fl_* 정규화 운영 테이블, 멀티테넌트 복합 유니크 제약 및 RLS 통합 마스터 DDL |
| `setup_memories_table.sql` | 18줄 (0.7KB) | - | `-` | Out:0 / In:0 · DB:tenant_memories | 테넌트별 메모리 저장 테이블(tenant_memories) DDL 정의 |
| `tsconfig.app.json` | 27줄 (0.7KB) | - | `-` | Out:0 / In:0 | 프론트엔드 앱(src/) 대상 TypeScript 컴파일러 옵션 설정 |
| `tsconfig.json` | 8줄 (0.1KB) | - | `-` | Out:0 / In:0 | TypeScript Project References(tsconfig.app, tsconfig.node) 루트 참조 설정 |
| `tsconfig.node.json` | 24줄 (0.6KB) | - | `-` | Out:0 / In:0 | Vite 설정 등 Node 환경 스크립트 대상 TypeScript 컴파일러 옵션 설정 |
| `vercel.json` | 60줄 (1.8KB) | - | `-` | Out:0 / In:0 | Vercel 호스팅 라우팅, HTML 무캐시 헤더 및 서버리스 함수 설정 |
| `vite.config.ts` | 333줄 (12.4KB) | - | `default` | Out:4(동적4) / In:0 | Vite 8 Oxc·Rolldown 불변 벤더청크(vendor-react·vendor-supabase) 분리 빌드(포트 5174, 소스맵·콘솔 제거) 및 로컬 R2·국세청·환율·OCR·팝빌 미들웨어 설정 |

## 제4장. 프론트엔드 앱 셸 · 전역 스타일 (L02) — 5개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/App.tsx` | 464줄 (14.9KB) | - | `App, default` | Out:34(동적30) / In:1 | 메인 앱 루트, 지연로딩 28개 메뉴·로그인·셸·매뉴얼 게이트 라우터 및 KeepAlive LRU(최대 8화면) 호스트 |
| `src/index.css` | 766줄 (22.1KB) | - | `-` | Out:2 / In:1 | 버튼·엔터프라이즈 폼·세로 스택·테이블 nowrap·모달 전역 컴포넌트 스타일시트(themeTokens.css 임포트) |
| `src/main.tsx` | 104줄 (2.7KB) | - | `-` | Out:2 / In:1 | React 앱 마운트, 캐시버스팅 쿼리 정리 및 전역 미처리 Promise 거부 예외 포획 핸들러 등록 |
| `src/styles/themeTokens.css` | 601줄 (18.5KB) | - | `-` | Out:0 / In:1 | 전사 라이트·다크 CSS 변수, 타이포그래피, 반응형 및 고밀도 데이터 그리드 토큰 정의 스타일시트 |
| `src/tailwind_polyfill.css` | 492줄 (26.5KB) | - | `-` | Out:0 / In:1 | 단일 라이트 모드 CSS 변수 매핑 및 레이아웃·그리드·간격 유틸리티 폴리필 스타일시트 |

## 제5장. 코어 상태 컨텍스트 · 액션 게이트웨이 · 멀티테넌트 DB 프록시 (L03) — 8개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/core/ActionCommandGateway.tsx` | 110줄 (3.0KB) | HIGH_COUPLING_HUB | `CommitActionButtonProps, CommitActionButton` | Out:3 / In:11 | 결재 티어 판별 후 즉시 실행 또는 결재 상신을 분기하는 CommitActionButton UI 컴포넌트 |
| `src/core/actionGatewayEngine.ts` | 485줄 (18.0KB) | - | `isActionPayloadRentalRelated, isApprovalRequestRentalRelated, useActionGateway, executeApprovedPayload` | Out:7(동적4) / In:2 · DB:fl_approval_policies,fl_approval_requests,fl_billings,fl_contracts(+1) | O(1) 결재정책 맵 기반 useActionGateway 훅 및 동적 도메인 엔진 분기 실행(executeApprovedPayload) 코어 |
| `src/core/AppShellContext.tsx` | 788줄 (26.3KB) | HIGH_COUPLING_HUB | `FlDatasets, ToastItem, AppShellContextValue, AppShellProvider, useAppShell` | Out:6 / In:43 · DB:core_tenants,fl_hr_histories,fl_users | 세션 기반 비로그인·본적재 분리 부트스트랩, 에이전트 상태 디듀플리케이션, O(1) 화면권한 맵 및 메모이즈드 셸 컨텍스트 |
| `src/core/flDatasetLoader.ts` | 625줄 (21.6KB) | - | `SESSION_STORAGE_KEY, TENANT_OVERRIDE_STORAGE_KEY, getTenantSessionStorageKey, FlDatasets, EMPTY_DATASETS, DEFAULT_TENANT_PROFILE 외 3` | Out:4 / In:1 · DB:core_tenants,fl_ap_payables,fl_approval_policies,fl_approval_requests(+27) | FL 테넌트 스코프 프로필 조회, 로그인전 사용자 경량 로더 및 30개 테이블 단일 병렬 스냅샷 조립 로더 모듈 |
| `src/core/PageActivityContext.tsx` | 15줄 (0.4KB) | - | `PageActivityProvider, usePageActive` | Out:0 / In:3 | KeepAlive 페이지 활성 여부에 따른 비활성 화면 이벤트 차단 컨텍스트 |
| `src/core/r2TenantContext.ts` | 30줄 (0.8KB) | - | `ActiveR2TenantContext, setR2TenantContext, getR2TenantContext` | Out:2 / In:2 | Cloudflare R2 업로드 대상 활성 테넌트 컨텍스트 저장·조회 경량 모듈 |
| `src/core/supabase.ts` | 233줄 (8.1KB) | HIGH_COUPLING_HUB | `DEFAULT_TENANT_ID, getActiveFlTenantId, setActiveFlTenantId, flSupabase, centralSupabase, registerErrorModalHandler 외 7` | Out:1 / In:28 | fl_* 자동 접두사 및 활성 tenant_id 행 격리 프록시(flSupabase), 페이지네이션 전수 로더, 키 캐시 행 변환 및 변이 래퍼 |
| `src/lib/supabasePrefixProxy.ts` | 204줄 (6.8KB) | - | `DRAGONRPA_HUB_SUPABASE, resolvePrefixedTableName, rewriteDdlStatementsWithPrefix, resolveHubUrlAndKey, createPrefixedSupabaseClient` | Out:0 / In:1 | 다중 테넌트 논리 테이블 접두사(fl_·core_) 자동 변환 및 DDL 접두사 재작성 Supabase 프록시 클라이언트 |

## 제6장. 전사 도메인 타입 · 정적 제원/카탈로그 데이터 · 인앱 매뉴얼 레지스트리 (L04) — 14개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/data/accountingStandardsData.ts` | 2,214줄 (204.6KB) | GOD_FILE | `StandardArticle, CommentaryCase, CommentaryReference, CommentarySection, ACCOUNTING_STANDARDS_META, STANDARD_CHAPTERS 외 3` | Out:0 / In:2 | 중소기업회계기준 본문 조문·장절 목차 및 실무 해설서·사례 정적 데이터셋 |
| `src/data/compatiblePartsCatalogData.ts` | 1,998줄 (102.1KB) | GOD_FILE | `BenchmarkPartsCompany, CatalogToOrderStrategyPhase, PartDimensionSpec, PartCategoryType, PartDiagramSvgType, CompatiblePartCatalogItem 외 10` | Out:0 / In:2 | 지게차 호환부품 벤치마크 분석, 카탈로그 주문 전환 전략 및 24종 호환부품 마스터 데이터셋 |
| `src/data/flBackupProductSpecs.ts` | 37,439줄 (1203.7KB) | GOD_FILE | `ECB30C_BACKUP_SPEC, HELI_CPD25_GB2LI_BACKUP_SPEC, HANGCHA_CPD25_XEY2_BACKUP_SPEC, FL_BACKUP_PRODUCT_SPECS` | Out:1 / In:1 | 백업 원장(fl_backup_products·fl_backup_assets) 복원 42종 지게차 VDI 2198·마스트·배터리·옵션 제원 데이터셋 |
| `src/data/flTechnicalArchive.ts` | 767줄 (38.3KB) | - | `FL_TECHNICAL_ARCHIVE` | Out:2 / In:1 | 8대 지게차 제조사 공식 기술제원, 카탈로그·운전정비 매뉴얼 메타데이터 및 아카이브 데이터셋(flTechnicalTypes 타입 분리) |
| `src/data/flTechnicalTypes.ts` | 236줄 (11.9KB) | - | `FlArchivedDocument, FlCompatiblePartSpec, FlVdiSpecItem, FlMastSpecRow, FlBatteryOptionRow, FlModelTechnicalSpec 외 2` | Out:0 / In:7 | VDI 2198 기술제원(FlModelTechnicalSpec), 백업 상세 제원, 표준 가격·패키지 마스터 순수 타입 정의 모듈 |
| `src/manual/ManualContext.tsx` | 197줄 (6.7KB) | - | `CustomManualAnnotation, ManualProvider, useManual` | Out:5(동적1) / In:4 · DB:core_manual_annotations | 화면별 인앱 매뉴얼 오버레이·통합 검색 상태, manualRegistry 동적 지연 로딩 및 테넌트별 주석 저장 컨텍스트 |
| `src/manual/manualNonRentalOverrides.ts` | 159줄 (9.4KB) | - | `ManualStepDef, ManualProcessDef, ManualAnchorDef, ScreenManualEntry, NON_RENTAL_MANUAL_OVERRIDES` | Out:1 / In:1 | 매뉴얼 엔트리 타입 인터페이스 및 비렌탈 테넌트 전용 화면 매뉴얼 오버라이드 사전 정의 모듈 |
| `src/manual/ManualOverlay.tsx` | 603줄 (23.8KB) | - | `ManualOverlay` | Out:3 / In:1 | data-manual-id DOM 좌표 추적 번호 배지, 단계별 조작 절차 안내 패널 및 매뉴얼 통합 검색 모달 오버레이 |
| `src/manual/manualPageTitles.ts` | 37줄 (1.4KB) | - | `FL_PAGE_TITLES, getPageTitleForTenant` | Out:1 / In:3 | 28개 메뉴 키별 국문 타이틀 매핑 테이블 및 비렌탈 업종별 타이틀 치환 경량 헬퍼 모듈 |
| `src/manual/manualRegistry.ts` | 685줄 (49.9KB) | - | `ManualAnchorDef, ManualProcessDef, ManualStepDef, ScreenManualEntry, FL_MANUAL_REGISTRY, ALL_MANUAL_ENTRIES 외 2` | Out:2 / In:3 | 전사 28개 메뉴 화면 영역·조작 절차 레지스트리 및 테넌트별 매뉴얼 조회 엔트리 SSOT |
| `src/types/domain.ts` | 5줄 (0.2KB) | HIGH_COUPLING_HUB | `-` | Out:3 / In:66 | 1단어 1뜻 전사 단일 도메인 타입(domainCoreTypes·domainLedgerTypes·domainFormatters) 통합 배럴 SSOT |
| `src/types/domainCoreTypes.ts` | 651줄 (19.1KB) | - | `TierLevel, TIER_LABELS, FlPageId, MenuGroupDef, FL_MENU_GROUPS, ALL_FL_PAGE_IDS 외 46` | Out:0 / In:3 | 테넌트 프로필·28개 메뉴 정의·티어 결재권한·거래처·품목·환율 핵심 도메인 타입 및 필터 SSOT 모듈 |
| `src/types/domainFormatters.ts` | 573줄 (17.8KB) | - | `ALL_PARTNER_ROLES, RENTAL_ONLY_PARTNER_ROLES, getPartnerRolesForTenant, EMPLOYMENT_STATUS_LABELS, normalizePaymentMethod, cycleToMonthOffset 외 46` | Out:2 / In:1 | 결제·국세청·한국어 상태/통화 포매터, 비렌탈 테넌트 도메인 필터, 거래처 기본결제 및 결재범위 판별 순수 헬퍼 모듈 |
| `src/types/domainLedgerTypes.ts` | 488줄 (12.2KB) | - | `FlPurchase, FlPurchaseLine, FlLogisticsDispatch, FlApPayable, FlInventoryUnit, FlStockMovement 외 14` | Out:1 / In:2 | 매입·물류배차·채무·재고단위·수불·견적·계약·입출고·정비·청구·수납·금융리스 원장 도메인 타입 모듈 |

## 제7장. 정규 28개 메뉴 도메인 페이지 스위트 (L05) — 39개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/pages/finance/ApSettlementsPage.tsx` | 290줄 (12.6KB) | ap_settlements (매입 비용 정산) / load:lazy | `ApSettlementsPage` | Out:7 / In:1 | 매입채무·물류비·외주정비비·금융리스 원리금 지급 정산 페이지 |
| `src/pages/finance/ArBillingCollectionPage.tsx` | 1,084줄 (39.6KB) | ar_billing_collection (청구 수납 관리) / load:lazy / LARGE_FILE | `ArBillingCollectionPage` | Out:11 / In:1 · DB:fl_billings | 일할·유통 청구 생성, 팝빌 전자세금계산서 발행, 거래명세서 발송 및 수납 관리 페이지 |
| `src/pages/finance/BankMatchingPage.tsx` | 378줄 (14.2KB) | bank_matching (통장 입출금 대사) / load:lazy | `BankMatchingPage` | Out:7 / In:1 · DB:fl_bank_transactions | 통장 입출금 거래내역과 청구·매입채무 1:1 대사 및 제외 관리 페이지 |
| `src/pages/finance/CashCalendarPage.tsx` | 381줄 (14.4KB) | cash_calendar (자금 일정 캘린더) / load:lazy | `CashCalendarPage` | Out:5 / In:1 | 매출 납기일 및 매입·리스 지급일 기준 일별 자금 입출금 캘린더 페이지 |
| `src/pages/finance/financeHelpers.ts` | 45줄 (1.5KB) | subview:finance (비렌탈 매입채무 파생 집계 헬퍼) | `buildNonRentalPayables` | Out:1 / In:3 | 비렌탈 테넌트 격리 기준 유효 매입채무 필터링 공통 헬퍼 |
| `src/pages/finance/FinancialStatementsPage.tsx` | 321줄 (12.3KB) | financial_statements (재무제표 조회) / load:lazy | `FinancialStatementsPage` | Out:6(동적1) / In:1 | 재무상태표·손익계산서·현금흐름표·리스명세 및 지연로딩 중소기업회계기준 조회 페이지 |
| `src/pages/finance/OperationManualPage.tsx` | 181줄 (6.9KB) | operation_manual (업무 매뉴얼) / load:lazy | `OperationManualPage` | Out:5 / In:1 | 화면별 기본기능·조작순서·전사 매뉴얼 통합 검색 열람 페이지 |
| `src/pages/finance/PermissionSettingsPage.tsx` | 731줄 (25.8KB) | permission_settings (권한 설정) / load:lazy | `PermissionSettingsPage` | Out:6 / In:1 · DB:fl_approval_policies,fl_user_permissions | 7단계 티어 결재선 정책 및 O(1) 권한 맵 기반 티어별·개인별 메뉴 접근 권한·계정 관리 페이지 |
| `src/pages/finance/SystemSettingsPage.tsx` | 246줄 (9.2KB) | system_settings (시스템 설정) / load:lazy | `SystemSettingsPage` | Out:4 / In:1 · DB:fl_document_templates | 테넌트 기업정보, 법인직인 도장 및 견적·계약·거래명세서 양식 파일 설정 페이지 |
| `src/pages/hr/HrDepartmentTreePanel.tsx` | 409줄 (13.2KB) | subview:organization_hr (부서 계층 트리 사이드바 · 부서 현황 패널) | `HrDepartmentTreePanelProps, HrDepartmentTreePanel, HrDepartmentOrgPanelProps, HrDepartmentOrgPanel` | Out:3 / In:1 | 부서 계층 트리 사이드바, 부서별 인원 집계 및 부서 현황 그리드 패널 컴포넌트 |
| `src/pages/hr/HrEmployeeDetailModal.tsx` | 733줄 (35.9KB) | subview:organization_hr (임직원 상세 인사·급여·발령 모달) | `HrEmployeeDetailModalProps, HrEmployeeDetailModal` | Out:5 / In:1 | 임직원 상세 인사·급여·연차·비밀번호·발령이력 관리 모달 컴포넌트 |
| `src/pages/hr/hrHelpers.ts` | 546줄 (15.9KB) | subview:organization_hr (조직도 트리·마스킹·엑셀 내보내기 헬퍼) | `DeptNode, buildDeptTreeOrder, collectDescendantDeptIds, statusBadgeTone, statusLabel, PAYROLL_BANK_OPTIONS 외 15` | Out:4 / In:4 · 동적패키지:exceljs | 조직도 트리 정렬, 주민번호 마스킹, 스캔 첨부 및 동적 ExcelJS 임직원 내보내기 헬퍼 |
| `src/pages/hr/HrNewAndDeptModals.tsx` | 522줄 (18.3KB) | subview:organization_hr (임직원 신규등록 · 부서 등록수정 모달) | `HrNewEmployeeModalProps, HrNewEmployeeModal, HrDepartmentModalProps, HrDepartmentModal` | Out:3 / In:1 | 임직원 신규 입사등록 및 부서 신설·수정 모달 컴포넌트 |
| `src/pages/hr/OrganizationHrPage.tsx` | 736줄 (25.8KB) | organization_hr (조직 인사 관리) / load:lazy | `OrganizationHrPage` | Out:8 / In:1 | 임직원 인사 원장 조회, 상세 모달 호스트 및 엑셀 일괄 출력 페이지 |
| `src/pages/master/CatalogPartsAndPackagesTabs.tsx` | 397줄 (15.0KB) | subview:catalogs (호환부품 · 배포패키지 · 문서미리보기 하위 탭) | `CatalogPreviewDoc, CatalogPartsTab, CatalogPackagesTab, CatalogPreviewDocModal` | Out:6 / In:3 · DB:fl_catalog_packages | 제원 카탈로그 호환부품 조회, 배포 패키지 저장 및 PDF 문서 미리보기 모달 지연로딩 하위 탭 컴포넌트 |
| `src/pages/master/CatalogsPage.tsx` | 545줄 (23.3KB) | catalogs (제원 카탈로그) / load:lazy | `CatalogsPage` | Out:9(동적4) / In:1 | 비동기 제원 아카이브 로딩 기반 기종 목록, 상세 제원 호스트 및 지연로딩 비교·부품·패키지 통합 카탈로그 페이지 |
| `src/pages/master/CatalogSpecDetailPanel.tsx` | 495줄 (22.6KB) | subview:catalogs (모델별 VDI 2198 · 마스트 · 배터리 상세 제원 패널) | `CatalogSpecDetailPanelProps, CatalogSpecDetailPanel` | Out:6(동적1) / In:1 | 선택 지게차 모델 VDI 2198·마스트·배터리·안전점검 조회 및 클릭 시점 동적 Excel·PDF 출력 상세 패널 컴포넌트 |
| `src/pages/master/CatalogSubTabs.tsx` | 523줄 (23.2KB) | subview:catalogs (모델 제원 비교 하위 탭) | `CatalogCompareTab` | Out:7(동적1) / In:1 | 제원 카탈로그 멀티 기종 VDI 2198 비교표 및 클릭 시점 동적 비교표 엑셀·PDF 내보내기 지연로딩 탭 컴포넌트 |
| `src/pages/master/ExchangeRateChartPanel.tsx` | 593줄 (21.9KB) | subview:exchange_rates (고시환율 현황 · SVG 추이 차트 패널) | `ForeignCurrencyCode, LiveRateEntry, FxChartPoint, FxChartStats, ExchangeRateMarketPanelProps, ExchangeRateMarketPanel 외 2` | Out:3 / In:1 | 통화별 고시환율 현황 카드, SVG 다중 라인 추이 차트 및 일자별 환율 변동 비교 패널 컴포넌트 |
| `src/pages/master/ExchangeRatesPage.tsx` | 604줄 (21.2KB) | exchange_rates (환율 관리) / load:lazy | `ExchangeRatesPage` | Out:8 / In:1 · DB:fl_exchange_rates | 고시환율 API 조회, 3개월 동기화, 외화 환산 기준 원장 관리 및 차트 호스트 페이지 |
| `src/pages/master/ItemMastersPages.tsx` | 648줄 (24.0KB) | trade_item_masters (유통 품목 관리), rental_item_masters (렌탈 품목 관리) / load:lazy | `TradeItemMastersPage, RentalItemMastersPage` | Out:5 / In:1 · DB:fl_item_masters | 유통 품목(판매가·부품) 및 렌탈 품목(임대기종·월일 단가·상각기준) 마스터 관리 페이지 |
| `src/pages/master/PartnerEditorPanel.tsx` | 645줄 (21.5KB) | subview:partners (거래처 상세 등록·수정 · 증빙 OCR 업로드 패널) | `PartnerNotifyToastFn, PartnerDocActions, PartnerEditorPanelProps, PartnerEditorPanel` | Out:5 / In:1 | 거래처 기본정보, 외화 결제계좌, 여신·결제조건, OCR 증빙 업로드·사업장 상세 에디터 패널 컴포넌트 |
| `src/pages/master/PartnersPage.tsx` | 747줄 (25.2KB) | partners (거래처 관리) / load:lazy | `PartnersPage` | Out:8 / In:1 · DB:fl_partner_sites,fl_partners | 통합 거래처(매출처·매입처·금융사·운송사) 조회, 국세청 휴폐업 일괄 조회 및 상세 에디터 호스트 페이지 |
| `src/pages/master/PartnerSubComponents.tsx` | 778줄 (21.9KB) | subview:partners (거래처 결제조건 · 증빙모달 하위 컴포넌트) | `PartnerPaymentTermsRow, PartnerDocViewerPane, PartnerDocDropButton, PartnerSiteDraft, PartnerSitesSection, PartnerBizCertModal 외 1` | Out:2 / In:2 | 거래처 결제조건 행, 사업자등록증·통장사본 뷰어 및 사업장·증빙 모달 하위 컴포넌트 |
| `src/pages/portal/ApprovalInboxPage.tsx` | 463줄 (17.6KB) | approval_inbox (결재함) / load:lazy | `ApprovalInboxPage` | Out:4 / In:1 | 7단계 티어 전자결재 대기·승인·반려·이력 조회 결재함 페이지 |
| `src/pages/portal/DashboardPage.tsx` | 231줄 (7.7KB) | dashboard (업무 대시보드) / load:lazy | `DashboardPage` | Out:4 / In:1 | 직무별 결재 대기·출고 의뢰·미수·만기 ToDo 피드 업무 대시보드 페이지 |
| `src/pages/procurement/LogisticsCostsPage.tsx` | 495줄 (18.7KB) | logistics_costs (물류비 관리) / load:lazy | `LogisticsCostsPage` | Out:6 / In:1 | 배차 운송비 기록, 부담 주체 구분 및 물류 채무 정산 관리 페이지 |
| `src/pages/procurement/PurchaseInboundFormPanel.tsx` | 590줄 (21.3KB) | subview:purchases (수입·내수 매입 입고 · 부대비용 배분 입력 패널) | `PurchaseInboundFormPanel` | Out:8 / In:1 | 발주·공급사 연동 수입·내수 매입 입고 입력, 환율 적용, 부대비용 배부 및 결재 상신 패널 컴포넌트 |
| `src/pages/procurement/PurchasesPage.tsx` | 418줄 (13.7KB) | purchases (매입 통관 관리) / load:lazy | `PurchasesPage` | Out:5 / In:1 | 수입·내수 매입 통관 원장 조회, 원가 배분 상세 모달 및 입고 입력 패널 호스트 페이지 |
| `src/pages/rental/RentalAssetsPage.tsx` | 628줄 (25.2KB) | rental_assets (렌탈 자산 관리) / load:lazy | `RentalAssetsPage` | Out:9 / In:1 · DB:fl_inventory_units | 자사·금융리스·전대 렌탈 자산 등록, 월 감가상각 반영 및 계정대체 페이지 |
| `src/pages/rental/RentalContractsPage.tsx` | 593줄 (22.2KB) | rental_contracts (렌탈 계약 관리) / load:lazy | `RentalContractsPage` | Out:11 / In:1 · DB:fl_contract_lines,fl_contracts,fl_fulfillments | 렌탈 계약 등록, 임대차계약서 발송 및 출고·회수 의뢰 페이지 |
| `src/pages/rental/RentalFulfillmentPage.tsx` | 392줄 (15.2KB) | rental_fulfillment (렌탈 입출고 관리) / load:lazy | `RentalFulfillmentPage` | Out:6 / In:1 | O(1) 계약·품목·자산 맵 기반 렌탈 출고·교환(EXCHANGE)·회수 실행완료 및 일수 정산 관리 페이지 |
| `src/pages/rental/RentalMaintenancePage.tsx` | 295줄 (12.3KB) | rental_maintenance (렌탈 정비 관리) / load:lazy | `RentalMaintenancePage` | Out:6 / In:1 | 주기장·현장·순회정비 기록, 부품·공임 원가 및 가동시간 이력 페이지 |
| `src/pages/rental/RentalPerformancePage.tsx` | 185줄 (6.6KB) | rental_performance (렌탈 실적 조회) / load:lazy | `RentalPerformancePage` | Out:3 / In:1 | 월별 일할 렌탈 매출, 감가상각비·정비원가 차감 실적 집계 페이지 |
| `src/pages/trade/QuotationsPage.tsx` | 723줄 (26.2KB) | quotations (견적 관리) / load:lazy | `QuotationsPage` | Out:9 / In:1 · DB:fl_contract_lines,fl_contracts,fl_quotations | 유통·렌탈 견적 작성, 견적서 문서 발송 및 계약 전환 페이지 |
| `src/pages/trade/TradeContractsPage.tsx` | 732줄 (27.0KB) | trade_contracts (유통 계약 관리) / load:lazy | `TradeContractsPage` | Out:11 / In:1 · DB:fl_contract_lines,fl_contracts,fl_fulfillments | 유통 수주 계약 등록, 공급계약서 발송 및 출고 의뢰 생성 페이지 |
| `src/pages/trade/TradeFulfillmentPage.tsx` | 758줄 (31.0KB) | trade_fulfillment (유통 출고 관리) / load:lazy | `TradeFulfillmentPage` | Out:8 / In:1 | O(1) 계약·품목·재고 인덱싱 기반 유통 출고 실행완료, 공급사 정비 중개 및 반품 환불·교환 사후처리 페이지 |
| `src/pages/trade/TradeInventoryPage.tsx` | 690줄 (25.0KB) | trade_inventory (유통 재고 조회) / load:lazy | `TradeInventoryPage` | Out:9 / In:1 · DB:fl_inventory_units | 시리얼·로트 유통 재고 선입선출, 경과일수, 보증기간 조회 및 계정대체 페이지 |
| `src/pages/trade/TradePerformancePage.tsx` | 584줄 (21.4KB) | trade_performance (유통 실적 조회) / load:lazy | `TradePerformancePage` | Out:4 / In:1 | 유통 매출·매출원가·반품차감 순수익 기간별 실적 집계 페이지 |

## 제8장. 공통 UI 프리미티브 · 레이아웃 셸 · 도메인 탭/모달 (L06) — 11개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/components/AccountingStandardsPanes.tsx` | 731줄 (29.6KB) | subview:financial_statements (중소기업회계기준 조문 · 해설 좌우 스크롤 패인) | `matchesArticle, matchesCommentary, AccountingChapterOption, StandardArticlesPaneProps, CommentarySectionsPaneProps, StandardArticlesPane 외 1` | Out:1 / In:1 | 중소기업회계기준 조문(좌)·해설(우) 독립 스크롤, 키워드 하이라이트 및 양방향 교차점프 패인 컴포넌트 |
| `src/components/AccountingStandardsTab.css` | 199줄 (9.6KB) | - | `-` | Out:0 / In:1 | 중소기업회계기준 뷰어 탭(.acc-std-root) 범위 지정 레이아웃·타이포그래피 스타일시트 |
| `src/components/AccountingStandardsTab.tsx` | 466줄 (17.6KB) | subview:financial_statements (중소기업회계기준·해설 뷰어 탭) | `AccountingStandardsTab` | Out:4(동적1) / In:1 | 중소기업회계기준 정적 데이터셋 동적 지연 로딩, 통합 검색 상태 관리 및 좌우 패인 호스트 뷰어 컴포넌트 |
| `src/components/DocumentActionBar.tsx` | 372줄 (12.6KB) | - | `DocumentActionBar` | Out:3 / In:4 | 견적서·계약서·거래명세서 엑셀 다운로드, 로컬 에이전트 편집 및 에이전트 PDF 변환 이메일 발송 모달 액션 바 컴포넌트 |
| `src/components/LoginView.tsx` | 447줄 (15.1KB) | - | `LoginView` | Out:4(동적1) / In:1 | 아이디·비밀번호 로그인 폼, 로컬 에이전트 설치·업데이트 제어 및 지연로딩 개인정보 처리방침 열람 화면 |
| `src/components/PopbillTaxInvoiceModal.tsx` | 336줄 (12.9KB) | - | `PopbillTaxInvoiceModal` | Out:3 / In:1 | 청구 원장 기반 팝빌 전자세금계산서 공급받는자·품목 확인 및 즉시 발행 모달 컴포넌트 |
| `src/components/PrivacyPolicyModal.tsx` | 362줄 (15.2KB) | - | `PrivacyPolicyModal` | Out:1 / In:1 | 테넌트별 개인정보 처리방침 열람 및 보호책임자 지정·편집 저장 모달 |
| `src/components/SearchableSelect.tsx` | 373줄 (11.8KB) | HIGH_COUPLING_HUB | `SearchableSelectOption, toPartnerSelectOptions, toItemMasterSelectOptions, SearchableSelectProps, SearchableSelect` | Out:4 / In:12 | 사전 초성 인덱싱, O(1) 선택 조회, 키보드 탐색 및 거래처·품목 옵션 매핑 검색형 드롭다운 공통 컴포넌트 |
| `src/components/ShellLayout.tsx` | 750줄 (27.0KB) | - | `ShellLayout` | Out:6 / In:1 | 좌측 그룹 사이드바, 상단 헤더(뒤로/앞으로·테넌트·기상·에이전트·매뉴얼), 전역 오류 모달·토스트 및 내 정보 수정 셸 레이아웃 |
| `src/components/UiPrimitives.tsx` | 755줄 (25.8KB) | HIGH_COUPLING_HUB | `controlInputStyle, CommaNumberInputProps, CommaNumberInput, controlTextareaStyle, actionBtnStyle, VerticalFieldProps 외 12` | Out:4 / In:44 · 동적패키지:xlsx | 공통 UI 프리미티브(VerticalField, 250행 점진 윈도잉·3단 정렬·동적 XLSX DataGrid, Memo StatusBadge, ConservationBar, ModalDialog) |
| `src/components/WeatherWidget.tsx` | 551줄 (19.8KB) | - | `WeatherWidget` | Out:1 / In:1 | 15분 세션 캐시·요청 취소 지원 전국 주요 권역 기상 데이터 조회 헤더 위젯 및 주간 예보·지역 선택 모달 |

## 제9장. 도메인/재무제표 엔진 · 문서/OCR/국세청/에이전트 서비스 · 보안/검색 유틸리티 (L07) — 20개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `src/services/agentService.ts` | 444줄 (14.7KB) | - | `openAgentStudio, syncTenantPolicyToAgent, triggerAgentCloudflareSync, pingLocalAgentHealth, startGlobalAgentHealthMonitor, checkLocalAgentHealth 외 8` | Out:2 / In:3 | 에이전트 정책 동기화, 2-Strike 헬스 모니터, 자가 업데이트, 로컬 DB 백업 제어 및 전송코어 재노출 서비스 |
| `src/services/agentTransportCore.ts` | 526줄 (20.6KB) | - | `EXPECTED_AGENT_VERSION, EXPECTED_CORE_HASH, DEFAULT_GITHUB_RELEASE_BASE_URL, DEFAULT_CF_R2_BASE_URL, AGENT_INSTALLER_BASE_URL, AGENT_EXE_URL 외 35` | Out:0 / In:2 | 로컬 에이전트(포트 5175) 루프백·확장프록시 전송 계층, 설치 URL 생성 및 전역 상태 버스 코어 모듈 |
| `src/services/businessLicenseOcrService.ts` | 375줄 (12.4KB) | - | `setR2TenantContext, BusinessLicenseOcrResult, uploadBusinessLicenseImageToR2, formatBizRegNo, uploadBankbookImageToR2, BankbookOcrResult 외 2` | Out:2 / In:1 · 동적패키지:pdfjs-dist | 사업자등록증·통장사본 이미지 및 동적 PDF 렌더링 Vision OCR 추출 및 Cloudflare R2 증빙 업로드 서비스 |
| `src/services/catalogSpecDocumentService.ts` | 637줄 (23.6KB) | - | `generateModelSpecExcel, generateCompareSpecsExcel, downloadPdfFile, generateCompareSpecsPdf, generateModelSpecPdf` | Out:3 / In:2 · 동적패키지:pdf-lib | 제원 카탈로그 단건·비교표·호환부품·패키지 견적 Excel(ExcelJS) 및 PDF(pdf-lib) 문서 생성 전용 서비스 |
| `src/services/documentService.ts` | 675줄 (24.4KB) | - | `loadExcelJs, generateQuotationExcel, generateContractExcel, generateTransactionStatementExcel, downloadExcelFile, openExcelInAgent 외 2` | Out:3 / In:7 · 동적패키지:exceljs | 동적 ExcelJS 기반 견적서·계약서·거래명세서 생성, 직인 합성 및 로컬 에이전트 PDF 변환·이메일 발송 서비스 |
| `src/services/domainAftercareMaintEngine.ts` | 300줄 (10.3KB) | - | `recordTradeAftercare, recordRentalMaintenance` | Out:3 / In:1 · DB:fl_ap_payables,fl_asset_events,fl_inventory_units,fl_rental_maintenances(+2) | 유통 사후처리(정비중개·반품환불·반품교환) 및 렌탈 정비 원가·재고차감·이력 기록 전용 엔진 |
| `src/services/domainEngine.ts` | 6줄 (0.2KB) | - | `-` | Out:5 / In:3 | 분할된 도메인·재무수학·조달·입출고·인사·부트스트랩 서브엔진 통합 재노출(Barrel) 파사드 |
| `src/services/domainFulfillmentEngine.ts` | 588줄 (19.8KB) | HIGH_COUPLING_HUB | `allocateNextFulfillmentNos, executeAccountTransfer, completeFulfillment, executeRentalExchange` | Out:4 / In:9 · DB:fl_asset_events,fl_contract_lines,fl_contracts,fl_fulfillments(+2) | 출고채번, 계정대체, 유통·렌탈 입출고 실행완료, 렌탈 교환(EXCHANGE) 및 사후정비 엔진 재노출(Barrel) |
| `src/services/domainHrAdminEngine.ts` | 735줄 (26.4KB) | - | `SaveDepartmentInput, saveDepartment, CreateEmployeeUserInput, createEmployeeUser, UpdateEmployeeHrInput, updateEmployeeHrRecord 외 4` | Out:3 / In:7 · DB:fl_bank_transactions,fl_departments,fl_exchange_rates,fl_hr_histories(+1) | 부서 조직 저장, 임직원 등록·인사발령·비밀번호 초기화, 고시환율 업서트 및 거래처명 일괄 동기화 엔진 |
| `src/services/domainMath.ts` | 509줄 (17.0KB) | HIGH_COUPLING_HUB | `todayIso, currentYm, addDaysIso, getDaysInMonth, getMonthBounds, diffDaysInclusive 외 6` | Out:2 / In:26 | 날짜·월경계 연산, 선입선출 정렬, 월별 감가상각, 금융리스 상환표 및 일할 렌탈 청구 계산 순수 엔진 |
| `src/services/domainProcurementInboundEngine.ts` | 457줄 (15.6KB) | - | `syncRentalAssetsDepreciationInDb, CreatePurchaseInput, allocateSequentialUnitCodes, allocateNextContractNo, confirmPurchaseInbound` | Out:3 / In:1 · DB:fl_ap_payables,fl_asset_events,fl_contracts,fl_inventory_units(+3) | 수입·내수 매입 입고 원가배분·매입채무·재고 생성, 순차 채번 및 감가상각 일괄 동기화 전용 엔진 |
| `src/services/domainProcurementLeaseEngine.ts` | 414줄 (13.4KB) | HIGH_COUPLING_HUB | `settleApPayable, createFinanceLeaseWithAsset, payLeaseInstallment, recordBillingCollection, recordLogisticsDispatch` | Out:4 / In:11 · DB:fl_ap_payables,fl_asset_events,fl_bank_transactions,fl_billings(+5) | 외화 매입채무 결제, 금융리스 상환, 수납, 물류배차 및 매입입고 엔진 재노출(Barrel) |
| `src/services/financialStatementEngine.ts` | 582줄 (20.5KB) | - | `generateFinancialStatements` | Out:3 / In:4 | 전 원장 복식부기 분개 생성기(비렌탈 격리 지원) 및 재무제표 포매터 재노출(Barrel) 엔진 |
| `src/services/financialStatementFormatter.ts` | 402줄 (15.1KB) | - | `JournalPosting, StatementLineItem, AssetScheduleRow, LeaseScheduleSummaryRow, FinancialStatementsReport, FinancialDatasetInput 외 3` | Out:1 / In:1 | 복식부기 분개 집계 기반 재무상태표·손익계산서·현금흐름표·리스명세 조립 및 대차 차액 0원 검증 포매터 |
| `src/services/ntsBusinessService.ts` | 212줄 (6.3KB) | - | `PartnerNtsCheckItem, formatNtsYmd, validateBizRegNoChecksum, parseRawNtsItem, queryBatchPartnerNtsStatus, querySinglePartnerNtsStatus` | Out:1 / In:2 | 국세청 사업자등록번호 체크섬 검증 및 휴폐업·과세유형 단건/다건(100건 청크) 상태조회 클라이언트 서비스 |
| `src/services/popbillTaxInvoiceService.ts` | 463줄 (14.6KB) | - | `PopbillLiveStatus, PopbillLineDraft, PopbillIssueDraft, PopbillIssueResult, formatPopbillStatusLabel, generatePopbillMgtKey 외 10` | Out:2 / In:2 · DB:fl_billings | 팝빌 전자세금계산서 연동 상태 조회, 단건/일괄 발행, 국세청 즉시전송, 상태 동기화, 포털/뷰어 열기 및 DB 저장 서비스 |
| `src/services/tenantBootstrapService.ts` | 250줄 (8.1KB) | - | `clearBootstrappedTenantCache, ensureFlTenantBootstrapped` | Out:3 / In:2 · DB:fl_approval_policies,fl_departments,fl_document_templates,fl_users | 신규 테넌트 기본 부서·결재정책·관리자 계정 멱등 부트스트랩 초기화 및 세션 캐시 서비스 |
| `src/utils/cryptoVault.ts` | 598줄 (20.7KB) | - | `hashPassword, verifyPassword, encryptSecret, decryptSecret, ESSENTIAL_STORAGE_KEYS, purgeStorageQuotaOverflow 외 16` | Out:0 / In:7 | SHA-256 비밀번호 해싱·검증, 로컬스토리지 암복호화, 세션 서명 검증 및 개인정보 필드 암복호화 볼트 |
| `src/utils/fxRateUtils.ts` | 75줄 (2.1KB) | - | `FX_CURRENCIES, FX_PERIOD_OPTIONS, DEFAULT_FX_RATES, formatFxRate, resolveManagedRateForDate` | Out:1 / In:3 | 주요 4대 통화(USD·CNY·EUR·JPY) 기본환율 상수, 환율 포매터 및 기준일자 환율 조회 유틸리티 |
| `src/utils/hangulSearch.ts` | 159줄 (4.9KB) | - | `isChosungChar, decomposeCompoundConsonants, extractChosung, KoreanSearchIndex, buildKoreanSearchIndex, matchesIndexedKoreanQuery 외 1` | Out:0 / In:5 | 한국어 초성·복합자모 분해, 사전 검색 인덱스 빌더 및 무의존성 부분·초성 매칭 검색 유틸리티 |

## 제10장. 백엔드 서버리스 API · Edge Functions · SQL · 인쇄 양식 (L08) — 26개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `api/call-draft-ai.ts` | 253줄 (10.4KB) | - | `handler` | Out:0 / In:0 | Groq Whisper STT 및 LLaMA 3.3 기반 통화 녹취 출고 초안 추출 Vercel 서버리스 API |
| `api/developer-device.ts` | 27줄 (0.8KB) | - | `handler` | Out:0 / In:0 | 요청 클라이언트 호스트·네트워크 인터페이스 조회 Vercel 서버리스 API |
| `api/exchange-rate.ts` | 223줄 (8.3KB) | - | `handler` | Out:0 / In:1 | 해외수입 원가 산출용 통화별(CNY·USD·JPY·EUR) 기준환율·전신환매도율·관세참고환율 조회 Vercel 서버리스 API |
| `api/gemini-stt.ts` | 11줄 (0.4KB) | - | `handler` | Out:0 / In:0 | 과금 방지를 위해 비활성화된 레거시 Gemini STT 스텁 엔드포인트 |
| `api/groq-stt.ts` | 91줄 (3.5KB) | - | `handler` | Out:0 / In:0 | Groq LPU Whisper(whisper-large-v3-turbo) 음성인식 Vercel 서버리스 API |
| `api/manual-ai-indexer.ts` | 80줄 (3.3KB) | - | `handler` | Out:0 / In:0 | Groq LLaMA 3.3 기반 장비 기술문서 메타데이터 자동 색인 Vercel 서버리스 API |
| `api/nts-status.ts` | 135줄 (4.7KB) | - | `NtsBusinessStatusItem, validateBizRegNoChecksum, handler` | Out:0 / In:1 | 국세청 공공데이터포털 사업자 휴폐업 상태조회 프록시 Vercel 서버리스 API |
| `api/nts-validate.ts` | 200줄 (7.0KB) | - | `NtsValidateInputItem, NtsValidateOutputItem, handler` | Out:0 / In:0 | 국세청 사업자등록정보 진위확인(상호·대표자·개업일 1:1 대조) Vercel 서버리스 API |
| `api/popbill-taxinvoice.ts` | 908줄 (33.0KB) | LARGE_FILE | `handler` | Out:0 / In:1 | 테넌트관리센터 활성 여부 검증 및 테넌트별 팝빌 설정 기반 전자세금계산서 발행·국세청전송·상태조회·포털 연동 Vercel 서버리스 API |
| `api/popbill.d.ts` | 5줄 (0.1KB) | - | `default` | Out:0 / In:0 | popbill CommonJS SDK 모듈용 TypeScript 선언 파일 |
| `api/r2.ts` | 576줄 (19.2KB) | - | `config, handler` | Out:0 / In:0 | Cloudflare R2 S3 호환 멀티테넌트 파일 목록·업로드·다운로드·삭제 Vercel 서버리스 API |
| `api/sales-journal-ai.ts` | 126줄 (6.5KB) | - | `handler` | Out:0 / In:0 | Groq LLaMA 3.3 기반 영업일지 상담 원문 4단계 구조화 추출 Vercel 서버리스 API |
| `api/send-email.ts` | 212줄 (8.0KB) | - | `config, handler` | Out:0 / In:0 | Nodemailer Gmail SMTP 기반 첨부파일 포함 공식 이메일 발송 Vercel 서버리스 API |
| `api/vision-ocr.ts` | 390줄 (17.6KB) | - | `VisionTaskType, handler` | Out:0 / In:1 | Groq Vision AI 기반 사업자등록증·명함·계기판·주유영수증·통장사본 판독 서버리스 API |
| `sql/call_pipeline_tables.sql` | 139줄 (6.1KB) | - | `-` | Out:0 / In:0 · DB:call_uploads,draft_dispatch_orders | 통화 녹음 업로드(call_uploads) 파이프라인 테이블 및 RLS DDL 스크립트 |
| `sql/patch_291_drop_google_drive_columns.sql` | 15줄 (0.9KB) | - | `-` | Out:0 / In:0 · DB:google_configs | Cloudflare R2 전환에 따른 구 구글 드라이브 미사용 컬럼 제거 DDL 패치 |
| `sql/work_status_and_releases.sql` | 46줄 (1.8KB) | - | `-` | Out:0 / In:0 · DB:apk_releases,user_work_status | 영업사원 출퇴근 상태(user_work_status) 및 APK 배포 테이블 DDL 스크립트 |
| `supabase/functions/cleanup-expired-recordings/index.ts` | 58줄 (2.0KB) | - | `-` | Out:0 / In:0 · DB:call_uploads | 24시간 경과 통화 음성 파일 자동 삭제 크론용 Supabase Edge Function |
| `supabase/functions/process-call-recording/index.ts` | 260줄 (9.5KB) | - | `-` | Out:0 / In:0 · DB:call_uploads,draft_dispatch_orders | 통화 녹음 업로드 트리거 STT 변환 및 LLM 필드 추출 Supabase Edge Function |
| `supabase/migrations/20261012_hindsight_4_tier_memory.sql` | 156줄 (11.0KB) | - | `-` | Out:0 / In:0 · DB:hindsight_experiences,hindsight_mental_models,hindsight_observations,hindsight_world_facts | Hindsight 4계층 메모리(pgvector HNSW 인덱스·JSONB·RLS) DB 마이그레이션 DDL |
| `supabase/migrations/20261119_fl_billings_popbill_columns.sql` | 7줄 (0.4KB) | - | `-` | Out:0 / In:0 · DB:fl_billings | fl_billings 테이블 팝빌 전자세금계산서 관리번호·상태·채널·영수청구·이메일·국세청전송일시 확장 DDL |
| `templates/거래명세서_양식.html` | 139줄 (8.9KB) | - | `-` | Out:0 / In:0 | 표준 거래명세서 인쇄 및 PDF 생성용 HTML 마스터 템플릿 |
| `templates/고소작업대_안전점검결과서_양식.html` | 175줄 (8.3KB) | - | `-` | Out:0 / In:0 | 고소작업대 안전점검결과서 인쇄용 HTML 마스터 템플릿 |
| `templates/고소작업대_임대차계약서_양식.html` | 158줄 (8.9KB) | - | `-` | Out:0 / In:0 | 고소작업대 임대차계약서 인쇄용 HTML 마스터 템플릿 |
| `templates/렌탈견적서_양식.html` | 125줄 (8.2KB) | - | `-` | Out:0 / In:0 | 고소작업대 렌탈견적서 인쇄용 HTML 마스터 템플릿 |
| `templates/반입전_CHECK_LIST_양식.html` | 165줄 (14.8KB) | - | `-` | Out:0 / In:0 | 장비 현장 반입 전 체크리스트 인쇄용 HTML 마스터 템플릿 |

## 제11장. 데스크톱 에이전트 · Python AI 코어 · 브라우저 확장 · 개발자 도구 (L09) — 51개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `agent/등록-원클릭실행.bat` | 64줄 (2.9KB) | - | `-` | Out:0 / In:0 | ebro:// 커스텀 프로토콜 및 로컬 에이전트 일괄 등록 배치 파일 |
| `agent/agent.js` | 1,444줄 (65.1KB) | LARGE_FILE | `-` | Out:0 / In:0 | 초기 버전 로컬 사이드카 에이전트 스냅샷(호환 보관용) |
| `agent/BroAgent.js` | 1,456줄 (66.3KB) | LARGE_FILE | `-` | Out:0 / In:0 | 구버전 로컬 사이드카 에이전트 스냅샷(호환 보관용) |
| `agent/build-agent.ps1` | 129줄 (7.2KB) | - | `-` | Out:0 / In:0 | 로컬 에이전트 코어 암호화, Node SEA 실행파일 빌드 및 코드서명 일괄 스크립트 |
| `agent/build-tenants.cjs` | 53줄 (1.8KB) | - | `-` | Out:0 / In:0 | Inno Setup(ISCC) 기반 테넌트별 맞춤형 에이전트 인스톨러 일괄 빌드 스크립트 |
| `agent/build-tenants.ps1` | 70줄 (2.4KB) | - | `-` | Out:0 / In:0 | 테넌트별 맞춤형 에이전트 인스톨러 빌드 PowerShell 스크립트(구버전 경로 참조) |
| `agent/certs/create-codesign-cert.ps1` | 63줄 (3.5KB) | - | `-` | Out:0 / In:0 | 사내 자체 루트·코드서명 인증서(PFX/CER) 생성 및 로컬 신뢰 저장소 등록 스크립트 |
| `agent/certs/sign-exe.ps1` | 10줄 (0.5KB) | - | `-` | Out:0 / In:0 | 생성된 코드서명 인증서로 eBroAgent.exe에 디지털 서명을 적용하는 스크립트 |
| `agent/eBroAgent.js` | 6,065줄 (254.8KB) | GOD_FILE | `-` | Out:2 / In:0 | 로컬 비즈니스 코어 엔진(포트 5175 REST, PDF 무인인쇄, SMTP 메일, R2 미러링, 문서고) |
| `agent/eBroHost.js` | 126줄 (4.7KB) | - | `-` | Out:0 / In:0 | 불변 윈도우 런타임 호스트(core/engine.dat AES-256-GCM 메모리 복호화·VM 실행) |
| `agent/encrypt_core.cjs` | 258줄 (12.4KB) | - | `-` | Out:0 / In:0 | eBroAgent 코어 번들링, AES-256-GCM 암호화 및 버전·해시 SSOT 자동 동기화 스크립트 |
| `agent/kill-agent.bat` | 24줄 (1.0KB) | - | `-` | Out:0 / In:0 | 실행 중인 로컬 에이전트 및 트레이 프로세스 강제 종료 배치 파일 |
| `agent/make-tray.cjs` | 214줄 (7.6KB) | - | `-` | Out:0 / In:0 | trayIcon.ps1 시스템 트레이 워커 스크립트 생성기 |
| `agent/package.json` | 24줄 (0.5KB) | - | `-` | Out:0 / In:0 | 로컬 에이전트(eBroHost) 의존성 및 pkg/빌드 스크립트 메타데이터 |
| `agent/sea-config.json` | 6줄 (0.1KB) | - | `-` | Out:0 / In:0 | Node.js Single Executable Application(SEA) blob 생성 설정 파일 |
| `agent/sign-agent.ps1` | 76줄 (3.2KB) | - | `-` | Out:0 / In:0 | 지정된 에이전트 바이너리(exe)에 코드서명 날인을 수행하는 PowerShell 스크립트 |
| `agent/start-agent.bat` | 21줄 (0.5KB) | - | `-` | Out:0 / In:0 | C:\eBroAgent 경로에서 로컬 에이전트를 백그라운드 기동하는 배치 파일 |
| `agent/studioEngine.js` | 3,146줄 (112.3KB) | GOD_FILE | `handleStudioRequest, launchStudioWindow, addTask, checkOllamaStatus, broadcastStudioLog, getAgentPolicy 외 8` | Out:1 / In:1 | 데스크톱 독립 스튜디오 및 자연어 업무 지시 큐 처리 엔진 |
| `agent/sync_local.ps1` | 84줄 (3.1KB) | - | `-` | Out:0 / In:0 | 빌드된 에이전트·암호화 코어·트레이 파일을 C:\eBroAgent에 즉시 동기화하는 스크립트 |
| `agent/telegramEngine.js` | 424줄 (17.3KB) | - | `loadTelegramConfig, saveTelegramConfig, getTelegramConfig, isTelegramRunning, startTelegramBot, stopTelegramBot 외 2` | Out:0 / In:1 | Node 에이전트 내장 텔레그램 Long Polling 원격 자연어 제어 엔진 |
| `agent/trayIcon.ps1` | 420줄 (15.7KB) | - | `-` | Out:0 / In:1 | 윈도우 시스템 트레이 아이콘, EcoQoS 절전 방지(우선순위 격상) 및 헬스 상태 워커 |
| `ebro-agent-core/ai_brain.py` | 651줄 (30.1KB) | - | `get_menu_context_prompt, extract_domain_workflow, normalize_menu_id, class AiBrain` | Out:0 / In:7 | Ollama 로컬 LLM(Qwen) 및 결정론적 시맨틱 파서 듀얼 업무지시 추론 엔진 |
| `ebro-agent-core/audit_logger.py` | 66줄 (2.2KB) | - | `init_db, log_event` | Out:0 / In:3 | SQLite(ebro_audit.db) 기반 에이전트 실행 이력 무누락 감사 로거 |
| `ebro-agent-core/drg_registry.py` | 80줄 (3.3KB) | - | `class DrgRegistry` | Out:0 / In:0 | 로컬 .drg 매뉴얼 패키지 로드 및 메뉴 지식 레지스트리 관리 모듈 |
| `ebro-agent-core/fsm_engine.py` | 135줄 (5.5KB) | - | `class FsmEngine` | Out:3 / In:1 | 에이전트 작업 실행 라이프사이클(INIT->PARSE->CHECK->ACTION->VERIFY->DONE) FSM 엔진 |
| `ebro-agent-core/playbooks/prompts_t1.py` | 157줄 (6.1KB) | - | `load_spec, type_table, required_keys, expected_missing, canonical_output, build_system_prompt 외 2` | Out:0 / In:0 | T1 텔레그램 업무지시 슬롯 추출 프롬프트 및 JSON 출력 검증기 |
| `ebro-agent-core/playbooks/prompts_t2.py` | 220줄 (9.3KB) | - | `build_system_prompt, build_user_message, parse_user_message, validate_output` | Out:0 / In:0 | T2 웹 화면 도구 호출(navigate/click/input) 프롬프트 및 출력 검증기 |
| `ebro-agent-core/playbooks/prompts_t3.py` | 91줄 (3.3KB) | - | `load_spec, workflows, canonical_output, build_system_prompt, build_user_message, validate_output` | Out:0 / In:0 | T3 통화 녹취 7개 핵심 필드 추출 프롬프트 및 출력 검증기 |
| `ebro-agent-core/playbooks/prompts_t4.py` | 98줄 (3.5KB) | - | `build_system_prompt, build_user_message, validate_output` | Out:0 / In:0 | T4 밴드 출고 요청 17개 필드 JSON 변환 프롬프트 및 출력 검증기 |
| `ebro-agent-core/playbooks/prompts_t5.py` | 103줄 (4.4KB) | - | `build_system_prompt, build_user_message, validate_output` | Out:0 / In:0 | T5 메뉴 사용법 안내 menuId 닫힌집합 분류 프롬프트 및 출력 검증기 |
| `ebro-agent-core/safety_guard.py` | 109줄 (4.0KB) | - | `class SafetyGuard` | Out:0 / In:3 | 읽기 전용 자동 승인 및 쓰기·상태변경 휴먼인더루프 승인 게이트 가드 |
| `ebro-agent-core/server.py` | 270줄 (10.4KB) | - | `class BrowserCommunicator, ws_handler, cors_middleware, handle_status, handle_get_config, handle_update_config 외 3` | Out:5 / In:0 | 독립 데스크톱 AI 에이전트 코어 메인 서버(WebSocket 9001 및 HTTP API) |
| `ebro-agent-core/start_agent.bat` | 21줄 (0.7KB) | - | `-` | Out:0 / In:0 | ebro-agent-core Python 서버(포트 9001) 실행 배치 파일 |
| `ebro-agent-core/stt_engine.py` | 67줄 (2.3KB) | - | `class SttEngine` | Out:0 / In:2 | RTX GPU 가속 faster-whisper 기반 로컬 음성 녹취 텍스트 변환 엔진 |
| `ebro-agent-core/telegram_bot.py` | 757줄 (37.1KB) | - | `class TelegramRemoteAgent` | Out:2 / In:5 | 텔레그램 Long Polling 원격 업무 지시 수신, FIFO 큐, 인라인 키보드 응답 봇 |
| `ebro-agent-core/test_agent.py` | 110줄 (4.2KB) | - | `test_ai_brain_parsing, test_safety_guard, test_audit_logger, main` | Out:3 / In:0 | PC 에이전트 코어 FSM 및 AI 브레인 기본 정합성 테스트 스위트 |
| `ebro-agent-core/test_exact_user_flow.py` | 159줄 (7.2KB) | - | `simulate_flow` | Out:2 / In:0 | 텔레그램 연속 발화 오타 교정 및 슬롯 결합 사용자 흐름 시뮬레이션 테스트 |
| `ebro-agent-core/test_personalization.py` | 58줄 (3.0KB) | - | `test_personalization` | Out:1 / In:0 | 텔레그램 사용자 호칭·봇애칭 개인화 및 트리거 단위 테스트 |
| `ebro-agent-core/test_queue_and_buttons.py` | 125줄 (4.9KB) | - | `class MockFsmEngine, run_tests` | Out:1 / In:0 | 비동기 FIFO 작업 큐 및 텔레그램 동적 선택지 버튼 퍼널 단위 테스트 |
| `ebro-agent-core/test_telegram_buttons.py` | 61줄 (2.4KB) | - | `run_tests` | Out:2 / In:0 | 텔레그램 대화형 메뉴 및 공식 메일 발송 인텐트 파싱 단위 테스트 |
| `ebro-agent-core/test_voice_pipeline.py` | 67줄 (2.8KB) | - | `run_test` | Out:2 / In:0 | 통화 녹음 STT 및 ERP 업무 자동화 종단 파이프라인 검증 테스트 |
| `ebro-web-agent/background.js` | 393줄 (12.3KB) | - | `-` | Out:0 / In:0 | 크롬 확장 백그라운드 서비스 워커(ws://127.0.0.1:9001 연결 및 탭 명령 라우팅) |
| `ebro-web-agent/content.css` | 82줄 (2.2KB) | - | `-` | Out:0 / In:0 | 브라우저 확장 Set-of-Mark(SoM) 번호표 오버레이 스타일시트 |
| `ebro-web-agent/content.js` | 1,012줄 (38.8KB) | LARGE_FILE | `-` | Out:0 / In:0 | 브라우저 DOM 간소화, data-agent-id 주입, SoM 오버레이 및 React 19 호환 클릭·입력 실행기 |
| `ebro-web-agent/manifest.json` | 53줄 (1.2KB) | - | `-` | Out:0 / In:0 | eBro Web Agent 크롬 확장 프로그램 Manifest V3 설정 파일 |
| `ebro-web-agent/popup.css` | 356줄 (6.5KB) | - | `-` | Out:0 / In:0 | 브라우저 확장 팝업 다크 UI 스타일시트 |
| `ebro-web-agent/popup.html` | 129줄 (5.2KB) | - | `-` | Out:0 / In:0 | 브라우저 확장 팝업 상태 및 설정 제어 UI HTML |
| `ebro-web-agent/popup.js` | 308줄 (12.2KB) | - | `-` | Out:0 / In:0 | 브라우저 확장 팝업 PC 에이전트 연결 상태, BYOK 설정 및 명령 트리거 컨트롤러 |
| `tools/build.bat` | 36줄 (1.3KB) | - | `-` | Out:1 / In:0 | C# .NET 컴파일러(csc)를 이용한 개발자 PC 등록기(eBroDevPCRegister.exe) 빌드 배치 파일 |
| `tools/eBroDevPCRegister.cs` | 547줄 (27.0KB) | - | `-` | Out:0 / In:1 | 물리 PC MAC 주소·하드웨어 지문 추출 및 중앙 DB 개발자 단말기 등록 WinForms 도구 |
| `tools/register_developer_pc.cjs` | 157줄 (6.2KB) | - | `-` | Out:0 / In:0 | 크로스플랫폼 Node.js 기반 개발자 PC MAC 추출 및 중앙 DB 단말기 등록 스크립트 |

## 제12장. 테스트(E2E·WTT·RWTT·보존법칙) · 마이그레이션 · DevOps 스크립트 (L10) — 219개 파일

| 파일 경로 | 규모 | 메뉴ID·구분 | 주요 Export | 의존(Out/In)·DB테이블 | 핵심 기능 및 책임 명세 |
|:---|---:|:---|:---|:---|:---|
| `scripts/add_department_functional_tags.cjs` | 38줄 (1.2KB) | - | `-` | Out:0 / In:0 · DB:departments | departments 테이블에 functional_tags 컬럼을 추가하는 DDL 패치 스크립트 |
| `scripts/add_tenant_id_ALL.sql` | 78줄 (3.2KB) | - | `-` | Out:0 / In:0 | 전 비즈니스 테이블에 tenant_id 컬럼을 멱등성 있게 추가하는 일괄 DDL |
| `scripts/add_tenant_id_columns.cjs` | 155줄 (4.5KB) | - | `-` | Out:0 / In:0 | 테넌트 격리용 tenant_id 컬럼 일괄 추가 자동화 스크립트 |
| `scripts/add_tenant_page_columns.cjs` | 27줄 (1.4KB) | - | `-` | Out:0 / In:0 | 테넌트 설정 테이블 페이지/기능 관련 컬럼 보강 DDL 실행 스크립트 |
| `scripts/analyze_backup_products.cjs` | 16줄 (0.8KB) | - | `-` | Out:0 / In:0 | 로컬 DB 백업 JSON 내 제품 제원 및 문서 URL 보유 현황 분석 스크립트 |
| `scripts/apply_flat_paper_and_zero_shadow.cjs` | 42줄 (1.4KB) | - | `-` | Out:0 / In:0 | UI 종이질감 배경색 톤 통일 및 박스 그림자 일괄 제거 치환 스크립트 |
| `scripts/apply_paper_color.cjs` | 188줄 (7.0KB) | - | `-` | Out:0 / In:0 | CSS 파일 배경색을 종이질감(#fbf9f5) 톤으로 일괄 보정하는 스크립트 |
| `scripts/audit_eq_doc_models.cjs` | 218줄 (7.4KB) | - | `-` | Out:0 / In:0 · DB:products | Cloudflare R2 장비 기술문서 폴더와 DB 제품 모델명 대사 감사 스크립트 |
| `scripts/audit_manual_alignment.ts` | 140줄 (5.2KB) | - | `-` | Out:0 / In:0 | 메뉴 매뉴얼 데이터와 실제 UI 파일 간 정합성 감사 스크립트 |
| `scripts/audit_manual_colors.cjs` | 113줄 (4.5KB) | - | `-` | Out:0 / In:0 | 매뉴얼 오버레이 UI 5색 고시인성 팔레트 적용 여부 감사 스크립트 |
| `scripts/audit_ui_colors.cjs` | 109줄 (4.1KB) | - | `-` | Out:0 / In:0 | 라이트·다크 모드 5색 표준 컬러 토큰 준수 여부 전수 감사 스크립트 |
| `scripts/audit.cjs` | 75줄 (2.9KB) | - | `-` | Out:0 / In:0 | 프로젝트 코드 규칙 및 위반 항목을 audit_report.md로 추출하는 감사 스크립트(CJS) |
| `scripts/audit.js` | 83줄 (3.3KB) | - | `-` | Out:0 / In:0 | 프로젝트 코드 규칙 위반 항목 감사 스크립트(ESM) |
| `scripts/audit.ts` | 88줄 (3.5KB) | - | `-` | Out:0 / In:0 | 프로젝트 코드 규칙 위반 항목 감사 스크립트(TS) |
| `scripts/auto_purge_all_vercel.cjs` | 85줄 (3.3KB) | - | `-` | Out:0 / In:0 | 다수 Vercel 프로젝트별 보존 슬롯 상한 초과 배포 자동 삭제 스크립트 |
| `scripts/auto_purge_vercel.cjs` | 215줄 (7.5KB) | - | `-` | Out:0 / In:0 | 단일 Vercel 프로젝트(ebro_fl 기본) 구 배포 슬롯 자동 정리 스크립트(CJS) |
| `scripts/auto_purge_vercel.js` | 22줄 (0.9KB) | - | `autoPurgeVercelDeployments` | Out:0 / In:0 | Vercel 최근 배포 슬롯 상한 초과분 및 Error 슬롯 정리 유틸리티(ESM) |
| `scripts/backup_all_49_tables.cjs` | 122줄 (4.1KB) | - | `-` | Out:0 / In:0 | schema.sql 기준 49개 전체 운영 테이블 JSON 일괄 백업 스크립트 |
| `scripts/backup_db.cjs` | 104줄 (3.5KB) | - | `-` | Out:0 / In:0 | 운영 Supabase 전체 테이블 데이터 타임스탬프 JSON 백업 스크립트 |
| `scripts/backup_fl_golden_snapshot.cjs` | 101줄 (3.2KB) | - | `-` | Out:0 / In:0 | eBroFL 원격 PostgreSQL 전체 fl_* 테이블 데이터 골든 스냅샷 JSON 백업 스크립트 |
| `scripts/backup_permissions.mjs` | 120줄 (4.1KB) | - | `-` | Out:0 / In:0 | permissions·users·departments 마스터 JSON 추출 백업 스크립트 |
| `scripts/band_fulltext_scraper.js` | 289줄 (12.4KB) | - | `-` | Out:0 / In:0 | 네이버 밴드 출고 게시글 상세 본문 자동 수집기 |
| `scripts/build_agent_giyeonlift.cjs` | 153줄 (6.8KB) | - | `-` | Out:0 / In:0 | 기연리프트 전용 eBroAgent 암호화·EXE 빌드·서명·인스톨러 자동 파이프라인 |
| `scripts/build_agent_giyeun.cjs` | 125줄 (5.9KB) | - | `-` | Out:0 / In:0 | 구 경로 기반 기연리프트 eBroAgent 빌드·인스톨러 파이프라인 스크립트 |
| `scripts/build_android_apk.cjs` | 772줄 (30.2KB) | - | `-` | Out:0 / In:0 | aapt2·javac·d8·zipalign·apksigner 기반 CallTransfer Android APK 빌드 파이프라인 |
| `scripts/capture_option_as_billing_screens_v2.cjs` | 77줄 (3.2KB) | - | `-` | Out:0 / In:0 | 옵션 유상 AS 청구 화면 Playwright 캡처 검증 스크립트(v2) |
| `scripts/capture_option_as_billing_screens_v3.cjs` | 63줄 (2.5KB) | - | `-` | Out:0 / In:0 | 옵션 유상 AS 청구 화면 Playwright 캡처 검증 스크립트(v3) |
| `scripts/capture_option_as_billing_screens.cjs` | 80줄 (3.5KB) | - | `-` | Out:0 / In:0 | 옵션 유상 AS 청구 화면 Playwright 캡처 검증 스크립트(v1) |
| `scripts/check_5_models_keys.cjs` | 44줄 (1.2KB) | - | `-` | Out:0 / In:0 | Cloudflare R2 버킷 내 주요 5개 모델 문서 키 목록 조회 스크립트 |
| `scripts/check_counts.cjs` | 57줄 (1.9KB) | - | `-` | Out:0 / In:0 | 운영 Supabase 주요 테이블별 레코드 건수 즉시 점검 스크립트 |
| `scripts/check_db_bucket.cjs` | 66줄 (2.4KB) | - | `-` | Out:0 / In:0 · DB:products,tenant_configs | tenant_configs 및 products 테이블 내 스토리지 버킷 설정 점검 스크립트 |
| `scripts/check_excel.cjs` | 10줄 (0.4KB) | - | `-` | Out:0 / In:0 | 초기 DB 현황 원본 엑셀 파일 존재 여부 및 바이트 크기 확인 스크립트 |
| `scripts/check_stt_usage.cjs` | 104줄 (3.8KB) | - | `-` | Out:0 / In:0 | Groq Cloud Whisper STT API 상태 및 RateLimit 잔여량 점검 스크립트 |
| `scripts/check-korean-ui.cjs` | 453줄 (16.0KB) | - | `-` | Out:0 / In:0 | 전사 UI 순수 한국어 표기(괄호 영문·이모지·금지 헤더 0건) 빌드 전 정적 검증 게이트 |
| `scripts/clone_prod_to_demo_db.cjs` | 387줄 (14.5KB) | - | `-` | Out:0 / In:0 | 기연리프트 운영 DB 스키마·데이터를 데모 Supabase DB로 복제하는 스크립트 |
| `scripts/code_file_descriptions.cjs` | 520줄 (62.2KB) | - | `PC_MOBILE_PAIRS, TRADE_RENTAL_PAIRS, MENU_ID_BY_FILE, FILE_DESCRIPTIONS` | Out:0 / In:1 | eBroFL 전사 코드 파일별 기능 명세 사전, 메뉴 매핑 및 기능 대칭 쌍 단일 원본(SSOT) |
| `scripts/create_agent_and_customization_tables.cjs` | 119줄 (4.2KB) | - | `-` | Out:0 / In:0 · DB:agent_heartbeats | 에이전트 하트비트·작업큐·테넌트 커스터마이징 테이블 생성 DDL 실행 스크립트 |
| `scripts/create_approval_tables.cjs` | 136줄 (6.9KB) | - | `-` | Out:0 / In:0 | 전자결재 규칙·요청·이력 테이블 생성 DDL 일괄 실행 스크립트 |
| `scripts/create_income_statements_table.cjs` | 73줄 (2.7KB) | - | `-` | Out:0 / In:0 · DB:monthly_income_statements | 월간 손익계산서 테이블(monthly_income_statements) 생성 DDL 실행 스크립트 |
| `scripts/create_manual_table.cjs` | 54줄 (2.2KB) | - | `-` | Out:0 / In:0 | system_manuals 테이블 생성 DDL RPC 실행 스크립트 |
| `scripts/deep_audit_ui_elements.cjs` | 103줄 (3.6KB) | - | `-` | Out:0 / In:0 | 전 페이지 UI 제목·Z-패턴·표준 요소 준수 심층 감사 스크립트 |
| `scripts/devops/central_patch.sql` | 48줄 (3.3KB) | - | `-` | Out:0 / In:0 · DB:equipment_manuals,manual_annotations,tenants | 중앙 플랫폼 DB(tenants 컬럼 등) 스키마 보강 DDL 패치 스크립트 |
| `scripts/devops/central_schema.sql` | 219줄 (10.7KB) | - | `-` | Out:0 / In:0 · DB:apk_releases,developer_authorized_devices,equipment_manuals,legal_notice_templates(+3) | 중앙 플랫폼 DB(ebro-platform-core) 전체 테이블 및 RLS 스키마 DDL |
| `scripts/devops/create_central_developer_devices.sql` | 35줄 (1.9KB) | - | `-` | Out:0 / In:0 · DB:developer_authorized_devices | 중앙 DB 개발자 물리 단말기 인가 대장(developer_authorized_devices) DDL |
| `scripts/devops/drop_tenant_developer_devices.sql` | 7줄 (0.5KB) | - | `-` | Out:0 / In:0 | 개별 테넌트 DB에서 구 개발자 단말기 테이블 제거 DDL 패치 |
| `scripts/devops/migrate_data_to_central.cjs` | 80줄 (2.9KB) | - | `-` | Out:0 / In:0 | 기존 운영 DB의 테넌트·매뉴얼 기준 데이터를 중앙 DB로 이관하는 스크립트 |
| `scripts/devops/migrate_dev_devices_to_central.cjs` | 125줄 (4.6KB) | - | `-` | Out:0 / In:0 · DB:developer_authorized_devices,tenants | 개발자 인가 단말기 레코드를 중앙 플랫폼 DB로 이관하는 스크립트 |
| `scripts/devops/seed_system_manuals_to_central.cjs` | 114줄 (4.6KB) | - | `-` | Out:0 / In:0 · DB:core_system_manuals | allMenuManuals 및 modalManuals 매뉴얼 SSOT를 중앙 DB에 적재하는 시드 스크립트 |
| `scripts/devops/sync_tenant_schemas.cjs` | 64줄 (2.6KB) | - | `-` | Out:0 / In:0 · DB:tenants | 전 테넌트 Supabase 프로젝트 스키마 배포 상태 및 헬스체크 자동화 CLI |
| `scripts/diagnose_ca.cjs` | 46줄 (1.9KB) | - | `-` | Out:0 / In:0 · DB:contract_assets,contracts | contract_assets와 contracts 테이블 외래키·데이터 상태 진단 스크립트 |
| `scripts/diagnose_grouping.cjs` | 98줄 (3.6KB) | - | `-` | Out:0 / In:0 | 초기 엑셀 202608 시트 계약 그룹핑 조합 분포 진단 스크립트 |
| `scripts/diagnose_migration.cjs` | 70줄 (3.1KB) | - | `-` | Out:0 / In:0 | 초기 엑셀 마이그레이션 파싱 건수 사전 드라이런 진단 스크립트 |
| `scripts/diagnose_pull.cjs` | 74줄 (3.5KB) | - | `-` | Out:0 / In:0 | Supabase 전체 테이블 fetch pull 응답 정상 여부 진단 스크립트 |
| `scripts/diagnose_systemwide_operations.cjs` | 326줄 (14.1KB) | - | `-` | Out:0 / In:0 | Playwright 기반 전사 메뉴 렌더링 및 작동 오류 전수 진단 스크립트 |
| `scripts/disable_rls.sql` | 44줄 (2.3KB) | - | `-` | Out:0 / In:0 · DB:announcement_reads,announcements,asset_inout_logs,assets(+34) | 개발·초기 테스트용 주요 테이블 RLS 임시 비활성화 SQL 스크립트 |
| `scripts/do_commit_12.bat` | 4줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.12 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_13.bat` | 4줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.13 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_14.bat` | 4줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.14 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_15.bat` | 4줄 (0.1KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.15 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_16.bat` | 4줄 (0.1KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.16 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_17.bat` | 4줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.17 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit_18.bat` | 4줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 v0.7.0.Build.18 커밋·푸시 기록용 배치 파일 |
| `scripts/do_commit.bat` | 5줄 (0.2KB) | - | `-` | Out:0 / In:0 | 구 Git 일괄 커밋·푸시 배치 파일(v1.9.5) |
| `scripts/execute_full_initial_ingest.cjs` | 1,106줄 (41.6KB) | LARGE_FILE | `-` | Out:0 / In:0 | 초기 엑셀 원장 파싱 후 운영 Supabase 전체 데이터 초기화·적재 실행 스크립트 |
| `scripts/execute_live_backup.cjs` | 134줄 (3.9KB) | - | `-` | Out:0 / In:0 | 1,000건 제한 페이지네이션 돌파 전 테이블 Supabase 백업 스크립트 |
| `scripts/execute_migration_via_rpc.cjs` | 205줄 (10.4KB) | - | `-` | Out:0 / In:0 | dev_exec_ddl RPC 호출 기반 SQL 마이그레이션 일괄 적용 스크립트 |
| `scripts/execute_real_wtt_dispatch_live.cjs` | 904줄 (41.0KB) | LARGE_FILE | `-` | Out:0 / In:0 · DB:contract_assets,contract_history,contracts,customer_sites(+3) | 30개 출고 요청 시나리오 실제 Supabase DB 파이프라인 관통 실행 스크립트 |
| `scripts/export_permissions_json.cjs` | 136줄 (4.4KB) | - | `-` | Out:0 / In:0 | Supabase 권한·사용자·부서 데이터를 JSON 마스터 백업 파일로 내보내는 스크립트 |
| `scripts/extract_menus.cjs` | 20줄 (0.7KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 내 특정 메뉴 매뉴얼 블록 추출 확인 스크립트 |
| `scripts/find_mismatches.cjs` | 42줄 (1.3KB) | - | `-` | Out:0 / In:0 | 소스 내 하드코딩 색상·스타일 불일치 항목 탐지 및 저장 스크립트 |
| `scripts/fix_all_color_mismatches_2.cjs` | 64줄 (2.8KB) | - | `-` | Out:0 / In:0 | BankMatching·Contracts·ApprovalInbox 색상 불일치 치환 패치 스크립트(2차) |
| `scripts/fix_all_color_mismatches_3.cjs` | 85줄 (3.5KB) | - | `-` | Out:0 / In:0 | Contracts·TenantManagement·ApprovalInbox 색상 불일치 치환 패치 스크립트(3차) |
| `scripts/fix_all_color_mismatches.cjs` | 143줄 (8.7KB) | - | `-` | Out:0 / In:0 | 프론트엔드 컴포넌트 색상 토큰 불일치 일괄 치환 패치 스크립트(1차) |
| `scripts/fix_approval_rls.cjs` | 48줄 (1.7KB) | - | `-` | Out:0 / In:0 | 결재 관련 테이블 RLS 권한 오류 보정 DDL 실행 스크립트 |
| `scripts/fix_asset_status.cjs` | 30줄 (1.0KB) | - | `-` | Out:0 / In:0 | 소스코드 내 구 자산 상태 표기 일괄 치환 패치 스크립트 |
| `scripts/fix_compliance.cjs` | 37줄 (1.2KB) | - | `-` | Out:0 / In:0 | 소스코드 내 금지 형용사·부사 수식어 일괄 제거 패치 스크립트(CJS) |
| `scripts/fix_compliance.js` | 37줄 (1.2KB) | - | `-` | Out:0 / In:0 | 소스코드 내 금지 형용사·부사 수식어 일괄 제거 패치 스크립트(ESM) |
| `scripts/fix_db_await.cjs` | 39줄 (1.3KB) | - | `-` | Out:0 / In:0 | 비동기 DB CUD 호출 await 누락 일괄 보정 스크립트 |
| `scripts/fix_exchange_audit.cjs` | 41줄 (1.5KB) | - | `-` | Out:0 / In:0 | 교환(EXCHANGE) 이력 추적 감사 로그 일괄 보완 패치 스크립트 |
| `scripts/fix_label_layout.cjs` | 30줄 (1.1KB) | - | `-` | Out:0 / In:0 | 레이블-입력창 상하 세로 스택 레이아웃 일괄 치환 패치 스크립트 |
| `scripts/fix_receivable_anchor.cjs` | 19줄 (0.6KB) | - | `-` | Out:0 / In:0 | Receivables 페이지 우하단 대차대조 검증 바 고정 패치 스크립트 |
| `scripts/fix_receivable_regex.cjs` | 13줄 (0.5KB) | - | `-` | Out:0 / In:0 | Receivables 페이지 하단 액션 바 마크업 정규식 보정 스크립트 |
| `scripts/fix_table_cells.cjs` | 43줄 (1.5KB) | - | `-` | Out:0 / In:0 | 테이블 셀 white-space: nowrap 스타일 일괄 보정 스크립트 |
| `scripts/fix_table_wrap.cjs` | 16줄 (0.6KB) | - | `-` | Out:0 / In:0 | App.css 테이블 셀 줄바꿈 방지 전역 CSS 규칙 추가 스크립트 |
| `scripts/force_delete.cjs` | 81줄 (2.6KB) | - | `-` | Out:0 / In:0 | Supabase 잔여 테스트·레거시 테이블 레코드 FK 역순 강제 삭제 스크립트 |
| `scripts/format_wtt_table.cjs` | 51줄 (1.9KB) | - | `-` | Out:0 / In:0 | wtt_100_report.json 결과를 마크다운 표(wtt_100_table.md)로 변환하는 스크립트 |
| `scripts/generate_ai_training_data.cjs` | 147줄 (6.1KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 기반 AI 파인튜닝 및 지식 베이스 JSONL 데이터셋 생성 스크립트 |
| `scripts/generate_code_file_spec.cjs` | 1,084줄 (42.4KB) | LARGE_FILE | `-` | Out:1 / In:0 | TypeScript AST 기반 전사 코드 파일 명세서·의존성 매니페스트 생성, 정합성 검증 및 영향도 조회 CLI 엔진 |
| `scripts/generate_eq_doc_report.cjs` | 15줄 (0.6KB) | - | `-` | Out:0 / In:0 | R2 Eq_doc 버킷과 DB 모델명 대사 결과를 콘솔 보고서로 출력하는 스크립트 |
| `scripts/generate_recon_test_excel.cjs` | 173줄 (5.6KB) | - | `-` | Out:0 / In:0 | 배차 운송료 월말 대사 테스트용 경기화물·엘제이운송 거래명세서 엑셀 생성 스크립트 |
| `scripts/generate7StepManuals.cjs` | 1,011줄 (141.5KB) | GOD_FILE | `-` | Out:0 / In:0 | 전사 50+ 메뉴 매뉴얼을 7단계 심층 비즈니스 워크플로우 형식으로 생성·갱신하는 빌더 |
| `scripts/inject_safe_mids.cjs` | 120줄 (4.7KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 주석의 data-mid 셀렉터 일괄 검증·주입 스크립트 |
| `scripts/inject_wtt_data_final.cjs` | 732줄 (30.5KB) | - | `-` | Out:0 / In:0 | 7개월치 WTT 전체 도메인 엔티티 무결성 시드 주입 스크립트(V3) |
| `scripts/inject_wtt_data_supabase_v2.cjs` | 750줄 (32.5KB) | - | `-` | Out:0 / In:0 | 정합성 강화 WTT 7개월 엔티티 Supabase 주입 스크립트(V2) |
| `scripts/inject_wtt_data_supabase.cjs` | 825줄 (36.6KB) | LARGE_FILE | `-` | Out:0 / In:0 | 타임스탬프 인과율 포함 WTT 7개월 엔티티 Supabase 주입 스크립트(V1) |
| `scripts/insert_agents_tab.cjs` | 148줄 (10.4KB) | - | `-` | Out:0 / In:0 | TenantManagementPage.tsx 내 에이전트 관리 탭 JSX 삽입 보조 스크립트 |
| `scripts/inspect_contract_asset_links.cjs` | 129줄 (4.5KB) | - | `-` | Out:0 / In:0 · DB:assets,contract_assets,contracts | 계약·체결자산·자산 마스터 간 연결 정합성 불일치 진단 스크립트 |
| `scripts/inspect_upload_button.cjs` | 79줄 (2.9KB) | - | `-` | Out:0 / In:0 | Playwright 기반 업로드 버튼 DOM 속성·레이블 검증 스크립트 |
| `scripts/merge_dev_uploader.cjs` | 25줄 (1.3KB) | - | `-` | Out:0 / In:0 | dev_uploader 메뉴 매뉴얼 패치 병합 스크립트(1차) |
| `scripts/merge_dev_uploader2.cjs` | 25줄 (1.3KB) | - | `-` | Out:0 / In:0 | dev_uploader 메뉴 매뉴얼 패치 병합 스크립트(2차) |
| `scripts/merge_manual_patches.cjs` | 47줄 (2.0KB) | - | `-` | Out:0 / In:0 | manual_patches 폴더의 개별 매뉴얼 패치를 allMenuManuals.ts에 병합하는 스크립트(1차) |
| `scripts/merge_manual_patches2.cjs` | 47줄 (2.0KB) | - | `-` | Out:0 / In:0 | manual_patches 폴더의 개별 매뉴얼 패치를 allMenuManuals.ts에 병합하는 스크립트(2차) |
| `scripts/migrate_batch_20260919.sql` | 230줄 (11.4KB) | - | `-` | Out:0 / In:0 · DB:apk_releases,billings,call_uploads,consumable_logs(+6) | 2026-09-19 기준 일괄 테이블·컬럼 멱등 DDL 마이그레이션 SQL |
| `scripts/migrate_fl_multitenant_isolation.cjs` | 134줄 (5.7KB) | - | `-` | Out:0 / In:0 | fl_* 운영 테이블 전역 유니크 제약의 tenant_id 복합 유니크 전환 및 인덱스 일괄 마이그레이션 스크립트 |
| `scripts/migrate_hr_v2.cjs` | 320줄 (12.9KB) | - | `-` | Out:0 / In:0 · DB:core_tenants | eBroFL 조직·인사·부서 기능태그 v2 스키마 정규화 및 중앙 테넌트 허용페이지 동기화 스크립트 |
| `scripts/migrate_partner_nts_status.cjs` | 152줄 (5.0KB) | - | `-` | Out:0 / In:0 | fl_partners 거래처 국세청 사업자 휴폐업·과세유형 상태 컬럼 보강 및 일괄 조회 갱신 스크립트 |
| `scripts/migrate_partner_payment_bankbook.cjs` | 244줄 (10.1KB) | - | `-` | Out:0 / In:0 | fl_partners 및 fl_contracts 결제주기·결제일·통장사본 컬럼 추가 및 제약조건 정규화 스크립트 |
| `scripts/migrate_r2_bucket.cjs` | 112줄 (4.2KB) | - | `-` | Out:0 / In:0 | Cloudflare R2 버킷 간 오브젝트(kiyeun-storage -> giyeon-storage) 일괄 복사 스크립트 |
| `scripts/migrate_run.cjs` | 6,101줄 (219.0KB) | GOD_FILE | `-` | Out:0 / In:0 · DB:departments,users | CLI 초기 DB 마이그레이션 번들 실행 스크립트(CommonJS 번들) |
| `scripts/migrate_run.ts` | 241줄 (8.6KB) | - | `-` | Out:0 / In:0 | migrationEngine 기반 초기 엑셀 파싱 및 Supabase 업서트 CLI 스크립트(TS) |
| `scripts/migrate_supabase_schema.cjs` | 107줄 (4.2KB) | - | `-` | Out:0 / In:0 | schema.sql DDL에 fl_ 접두사 및 RLS 정책을 적용하여 원격 Supabase DB로 이관하는 스크립트 |
| `scripts/migrate_v2_schema.cjs` | 1,049줄 (53.0KB) | LARGE_FILE | `-` | Out:0 / In:0 | eBroFL v2.0 30개 정규화 테이블 구축, 마스터·장비·금융리스 초기 데이터 적재 스크립트 |
| `scripts/modify_inspection.cjs` | 26줄 (1.5KB) | - | `-` | Out:0 / In:0 | inspection_checklist_manage.tsx 레이아웃 영역 마크업 패치 스크립트 |
| `scripts/patch_dev_uploader.cjs` | 35줄 (1.0KB) | - | `-` | Out:0 / In:0 | DevDataUploader.tsx 최상단 data-subview 속성 패치 스크립트 |
| `scripts/patch_manual_permission.cjs` | 108줄 (3.8KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 내 권한 관리 메뉴 매뉴얼 버전·주석 갱신 패치 스크립트 |
| `scripts/patch_payment_reversal.sql` | 17줄 (1.0KB) | - | `-` | Out:0 / In:0 · DB:payment_deposit_links,payments | payments 테이블 수납 역분개(reversalOf) 컬럼 추가 멱등 DDL |
| `scripts/patch_permission.cjs` | 46줄 (2.0KB) | - | `-` | Out:0 / In:0 | users_permissions.tsx data-subview 컨테이너 패치 스크립트 |
| `scripts/patch_receivables.cjs` | 56줄 (2.2KB) | - | `-` | Out:0 / In:0 | Receivables.tsx data-subview 컨테이너 패치 스크립트 |
| `scripts/patch_rls_policies.sql` | 76줄 (3.1KB) | - | `-` | Out:0 / In:0 | 클라이언트 권한 매트릭스 연동 전 테이블 PostgreSQL RLS 정책 멱등 DDL |
| `scripts/patch_schema_tenant.py` | 76줄 (3.1KB) | - | `-` | Out:0 / In:0 | schema.sql 주요 비즈니스 테이블에 tenant_id 컬럼을 삽입하는 패치 스크립트(1차) |
| `scripts/patch_schema_tenant2.py` | 48줄 (1.6KB) | - | `-` | Out:0 / In:0 | schema.sql 잔여 테이블에 tenant_id 컬럼을 삽입하는 패치 스크립트(2차) |
| `scripts/patch_v1_128_schema.sql` | 54줄 (3.6KB) | - | `-` | Out:0 / In:0 · DB:consumable_logs,mechanic_consumable_stocks,repairs | v1.128 차량 소모품 재고·입출고 로그·수리 테이블 스키마 패치 DDL |
| `scripts/patch_v1_129_product_spec_schema.sql` | 22줄 (1.2KB) | - | `-` | Out:0 / In:0 · DB:products | v1.129 products 테이블 13대 장비 제원 컬럼 추가 DDL |
| `scripts/patch_v1_134_contract_billing_milestones.sql` | 19줄 (1.2KB) | - | `-` | Out:0 / In:0 · DB:contracts | v1.134 contracts 테이블 직전 청구 마일스톤 메타데이터 컬럼 추가 DDL |
| `scripts/patch_v1_21_inrental_and_as_timeline.sql` | 111줄 (6.2KB) | - | `-` | Out:0 / In:0 · DB:assets,deliveries,receivables,repairs | v1.21 임차자산 원사번호 및 AS 타임라인 관련 컬럼·테이블 추가 DDL |
| `scripts/patch_v1_4_0_asset_sale_domain.sql` | 44줄 (2.7KB) | - | `-` | Out:0 / In:0 · DB:billings,contract_assets,contract_history,contracts | v1.4.0 자산 매각 계약 및 매각 청구 도메인 스키마 DDL |
| `scripts/patch_v1_4_0_schema_deficiencies.sql` | 445줄 (23.9KB) | - | `-` | Out:0 / In:0 · DB:IF,annual_leave_quotas,asset_inout_logs,assets(+28) | v1.4.0 전사 DB 스키마 누락 컬럼·테이블 일괄 보완 통합 DDL |
| `scripts/prepare_demo_db_for_as_rwtt.cjs` | 483줄 (16.2KB) | - | `-` | Out:0 / In:0 · DB:assets,consumable_lots,contract_assets,departments(+2) | 데모 Supabase DB 스키마 동기화 및 현장정비·소모품·동선 RWTT 시드 적재 스크립트 |
| `scripts/publish_to_github_releases.cjs` | 199줄 (6.0KB) | - | `-` | Out:0 / In:0 | 로컬 빌드된 eBroAgent 실행파일·인스톨러를 GitHub Releases로 업로드하는 배포 스크립트 |
| `scripts/purge_all_projects.cjs` | 62줄 (2.0KB) | - | `-` | Out:0 / In:0 | 다수 Vercel 프로젝트 배포 슬롯 상한 초과분 일괄 삭제 스크립트 |
| `scripts/purge_all_vercel_projects.cjs` | 71줄 (2.6KB) | - | `-` | Out:0 / In:0 | Vercel 전체 프로젝트 목록 조회 및 구 배포 슬롯 일괄 정리 스크립트 |
| `scripts/purge_vercel_deployments.cjs` | 41줄 (1.3KB) | - | `-` | Out:0 / In:0 | 현재 연결된 Vercel 프로젝트 최근 배포 슬롯 초과분 자동 삭제 스크립트 |
| `scripts/read_pixels.ps1` | 29줄 (1.2KB) | - | `-` | Out:0 / In:0 | 캡처 PNG 이미지 특정 좌표 픽셀 RGB 값 판독 디버그 PowerShell 스크립트 |
| `scripts/register_fl_tenant_central.cjs` | 186줄 (7.1KB) | - | `-` | Out:0 / In:0 · DB:tenants | 중앙 플랫폼 DB(core_tenants)에 eBroFL 데모 테넌트(tenant-ebro-fl) 등록·업서트 스크립트 |
| `scripts/reload_schema_and_seed.cjs` | 57줄 (1.8KB) | - | `-` | Out:0 / In:0 · DB:agent_heartbeats | PostgREST 스키마 캐시 리로드 통지 및 에이전트 하트비트 시드 스크립트 |
| `scripts/rename_and_sync_r2_folders.cjs` | 204줄 (8.2KB) | - | `-` | Out:0 / In:0 · DB:products | Cloudflare R2 장비 문서 폴더명 정규화 및 DB products 문서 경로 동기화 스크립트 |
| `scripts/reorganize_tables_zero_loss.sql` | 610줄 (31.8KB) | - | `-` | Out:0 / In:0 · DB:assets,assets_new,deliveries,deliveries_new(+4) | 전사 4대 운영 테이블 무손실 컬럼 재배치 DDL 스크립트 |
| `scripts/reset_db.cjs` | 120줄 (3.8KB) | - | `-` | Out:0 / In:0 | 운영 Supabase DB 전체 테이블 FK 역순 초기화(TRUNCATE/DELETE) 스크립트 |
| `scripts/restore_fl_golden_snapshot.cjs` | 175줄 (5.7KB) | - | `-` | Out:0 / In:0 | 골든 스냅샷 JSON에서 전체 fl_* 테이블 데이터를 외래키 순서로 원자적 복원하는 스크립트 |
| `scripts/run_asset_sale_patch.cjs` | 53줄 (1.6KB) | - | `-` | Out:0 / In:0 | PostgreSQL 직접 연결로 자산 매각 스키마 패치를 적용하는 스크립트 |
| `scripts/run_fl_30_trade_contracts_rwtt.cjs` | 411줄 (17.3KB) | - | `-` | Out:0 / In:0 | FL 유통계약 30건 생성·청구·수납·연체 원격 DB 적재 및 대차 차액 0원 보존 법칙 RWTT 실행 스크립트 |
| `scripts/RUN_IN_SUPABASE_ALL_SPECS.sql` | 1,939줄 (89.8KB) | GOD_FILE | `-` | Out:0 / In:0 · DB:products | products 테이블 13대 규격 컬럼 신설 및 53종 모델 제원 일괄 업서트 SQL |
| `scripts/run_initial_migration.cjs` | 946줄 (35.0KB) | LARGE_FILE | `-` | Out:0 / In:0 | 풀 라이프사이클 및 과거 청구 소급 적재 CLI 마이그레이션 실행기(CJS) |
| `scripts/run_initial_migration.js` | 707줄 (26.0KB) | - | `-` | Out:0 / In:0 | 초기 엑셀 기반 Supabase 일괄 마이그레이션 실행기(ESM) |
| `scripts/run_migration_batch.cjs` | 99줄 (4.0KB) | - | `-` | Out:0 / In:0 | 2026-09-19 일괄 SQL 마이그레이션을 PostgreSQL에 직접 적용하는 스크립트 |
| `scripts/run_rwtt_as_all_types_10runs.cjs` | 803줄 (36.6KB) | LARGE_FILE | `-` | Out:0 / In:0 · DB:as_route_logs,asset_inout_logs,assets,consumable_logs(+6) | 데모 DB 대상 현장정비 4개 유형 각 10회(총 40회) 및 차단 게이트 RWTT 실행기 |
| `scripts/run_rwtt_create_1prod_1asset_1cust_1site_1dispatch.cjs` | 410줄 (19.8KB) | - | `-` | Out:0 / In:0 · DB:assets,contracts,customer_sites,customers(+2) | 데모 DB 대상 제품·자산·고객·현장·출고요청 전주기 관통 RWTT 실행기 |
| `scripts/run_rwtt_manual_permission_isolation.cjs` | 452줄 (22.0KB) | - | `-` | Out:0 / In:0 | 매뉴얼 2개 메뉴 권한 격리 및 무인가 가이드 차단 Playwright RWTT 실행기 |
| `scripts/run_rwtt_today_features_5runs.cjs` | 401줄 (19.8KB) | - | `-` | Out:0 / In:0 | 핵심 신규 기능 5회 연속 스트레스 검증 Playwright RWTT 실행기 |
| `scripts/run_rwtt_trade_contract_email_3.cjs` | 424줄 (20.9KB) | - | `-` | Out:0 / In:0 | 유통 계약서 엑셀 편집 및 이메일 발송 3회 연속 Playwright RWTT 실행기 |
| `scripts/run_rwtt_trade_delivery_5.cjs` | 501줄 (23.5KB) | - | `-` | Out:0 / In:0 | 유통 수주·출고·배송 5회 연속 Playwright RWTT 실행기 |
| `scripts/run_wtt_100_dispatch4.cjs` | 383줄 (17.6KB) | - | `-` | Out:0 / In:0 | 출고 요청(smart_dispatch4) 100회 도메인 관통 스트레스 WTT 실행기 |
| `scripts/run_wtt_20_dispatch_option_loading.cjs` | 503줄 (26.4KB) | - | `-` | Out:0 / In:0 | 출고 요청 고객현장 옵션 자동 상속 5대 축 20회 WTT 실행기 |
| `scripts/run_wtt_20_options_suite.cjs` | 549줄 (29.3KB) | - | `-` | Out:0 / In:0 | 전사 안전옵션 마스터 및 고객·현장 옵션 체계 5대 축 20회 WTT 실행기 |
| `scripts/run_wtt_30_dispatch_types.cjs` | 906줄 (43.4KB) | LARGE_FILE | `-` | Out:0 / In:0 | 출고 요청 3대 유형(신규·추가·교환) 각 10건 총 30회 WTT 실행기 |
| `scripts/run-patch-direct.js` | 65줄 (2.1KB) | - | `-` | Out:0 / In:0 | PostgreSQL 직접 연결을 통한 DDL 패치 파일 실행 유틸리티(ESM) |
| `scripts/sample_pixels.ps1` | 24줄 (1.0KB) | - | `-` | Out:0 / In:0 | 스크린샷 이미지 격자 픽셀 색상 샘플링 검사 PowerShell 스크립트 |
| `scripts/scan_menu_ui_consistency.cjs` | 238줄 (14.4KB) | - | `-` | Out:0 / In:0 | 전 메뉴 페이지 제목·Z-패턴·불필요 UI 요소 일관성 정적 스캔 스크립트 |
| `scripts/scan_redundant_buttons_and_texts.cjs` | 144줄 (5.0KB) | - | `-` | Out:0 / In:0 | 전 페이지 내 중복 버튼 및 불필요 설명 문구 정적 탐지 스크립트 |
| `scripts/scan_true_white.cjs` | 78줄 (3.1KB) | - | `-` | Out:0 / In:0 | 소스코드 내 종이질감 표준 위반 순백(#ffffff) 배경 사용 탐지 스크립트 |
| `scripts/seed_awp_demo_rich.cjs` | 1,292줄 (63.7KB) | LARGE_FILE | `-` | Out:0 / In:0 · DB:assets,contract_assets,contracts,customer_sites(+7) | 데모 DB(awp-demo)용 자산·운송사·배차·정산대사 테스트 데이터 시드 생성기 |
| `scripts/seed_dept_functional_tags.cjs` | 43줄 (1.4KB) | - | `-` | Out:0 / In:0 · DB:departments | 표준 부서별 직무 기능 태그(functional_tags) 기본값 일괄 시드 스크립트 |
| `scripts/seed_fl_from_golden.cjs` | 154줄 (5.8KB) | - | `-` | Out:0 / In:0 | AWP 골든 스냅샷 JSON 데이터를 초기 eBroFL 데이터베이스로 복제 시딩하는 스크립트 |
| `scripts/seed_full_organic_fl_data.cjs` | 2,026줄 (92.7KB) | GOD_FILE | `-` | Out:3(동적3) / In:0 · DB:fl_ap_payables,fl_approval_requests,fl_bank_transactions,fl_billings(+5) | eBroFL 전 도메인(매입·통관·수주·출고·렌탈·리스·정비·청구·수납) 유기적 실무 데이터셋 적재 및 대차 0원 검증 스크립트 |
| `scripts/seed_fx_3months.cjs` | 70줄 (2.6KB) | - | `-` | Out:0 / In:0 | 최근 3개월 USD·CNY·EUR·JPY 고시환율 조회 및 fl_exchange_rates 테이블 일괄 시딩 스크립트 |
| `scripts/seed_manual_demo.cjs` | 190줄 (9.1KB) | - | `-` | Out:0 / In:0 · DB:manual_annotations | 결재선 규칙 설정 메뉴 데모 매뉴얼 및 스크린샷 Storage 업로드 스크립트 |
| `scripts/seed_products_spec_53.sql` | 1,438줄 (74.3KB) | LARGE_FILE | `-` | Out:0 / In:0 · DB:products | 53종 고소작업대 제품 모델 제원 일괄 UPSERT SQL 시드 파일 |
| `scripts/seed-db.js` | 82줄 (3.0KB) | - | `-` | Out:0 / In:0 | pg 연결 기반 초기 데이터베이스 시드 SQL 실행 스크립트 |
| `scripts/send_wtt_statements.cjs` | 252줄 (10.7KB) | - | `-` | Out:0 / In:0 | 계약변경 4건 거래명세서 /api/send-email 개발자 계정 발송 검증 스크립트 |
| `scripts/setup_seed_rpc.sql` | 488줄 (14.5KB) | - | `-` | Out:0 / In:0 · DB:assets,bank_transactions,billing_details,billings(+11) | Supabase 고속 데이터 시딩용 PL/pgSQL RPC(generate_test_data) 설치 DDL |
| `scripts/supabase_patch.sql` | 135줄 (8.6KB) | - | `-` | Out:0 / In:0 · DB:asset_inout_logs,billings,cash_flow_snapshots,consumable_logs(+8) | Supabase 통합 컬럼 보강 및 누락 스키마 패치 DDL |
| `scripts/sync_asset_contract_links.cjs` | 174줄 (6.5KB) | - | `-` | Out:0 / In:0 · DB:assets,billing_details,contract_assets,contracts | 계약·체결자산·청구상세 기준 자산(assets) 연결 필드 양방향 동기화 스크립트 |
| `scripts/sync_fl_rental_specs_and_options.cjs` | 513줄 (34.0KB) | - | `-` | Out:0 / In:0 | fl_assets 테이블 지게차 VDI 2198 제원·안전옵션·원가 컬럼 보강 및 계약 수익성 일괄 동기화 스크립트 |
| `scripts/sync_manuals_to_db.ts` | 52줄 (1.7KB) | - | `-` | Out:0 / In:0 · DB:manual_annotations | allMenuManuals.ts 버전 5 이상 매뉴얼을 Supabase manual_annotations 테이블로 일괄 업서트하는 스크립트 |
| `scripts/sync_vercel_env.cjs` | 34줄 (1.0KB) | - | `-` | Out:0 / In:0 | 로컬 .env 환경변수를 Vercel 프로젝트(ebro_fl) production·preview·development 환경에 일괄 등록하는 스크립트 |
| `scripts/syncAll7StepManualsToDB.cjs` | 94줄 (3.0KB) | - | `-` | Out:0 / In:0 · DB:manual_annotations | allMenuManuals.ts 7단계 매뉴얼 데이터를 Supabase에 일괄 동기화하는 스크립트 |
| `scripts/test_special_features_control.cjs` | 237줄 (12.3KB) | - | `-` | Out:0 / In:0 | 테넌트별 선별적 특수 탭·버튼 통제 Playwright E2E 검증 스크립트 |
| `scripts/test_tenant_schema_stamp_repair.cjs` | 133줄 (9.0KB) | - | `-` | Out:0 / In:0 | 테넌트 DB 스키마 및 직인 이미지 매핑 정합성 단위 검증 스크립트 |
| `scripts/test_xlsx.cjs` | 17줄 (0.6KB) | - | `-` | Out:0 / In:0 | 초기 DB 현황 원본 엑셀 파일 시트·행 읽기 동작 확인 스크립트 |
| `scripts/update_cashflow_manual.cjs` | 78줄 (3.8KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 내 자금흐름(cash_flow) 매뉴얼 정의 갱신 스크립트 |
| `scripts/update_cashflow.cjs` | 65줄 (3.1KB) | - | `-` | Out:0 / In:0 | CashFlowPage.tsx 컨테이너 레이아웃 패치 보조 스크립트 |
| `scripts/update_org_settings.cjs` | 257줄 (12.4KB) | - | `-` | Out:0 / In:0 | OrganizationSettings.tsx 부서·직무 태그 구조 패치 보조 스크립트 |
| `scripts/update_receivable.cjs` | 162줄 (7.2KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 내 외상미수금(receivable) 매뉴얼 정의 갱신 스크립트 |
| `scripts/update_tenant_management_agents_tab.cjs` | 196줄 (12.1KB) | - | `-` | Out:0 / In:0 | TenantManagementPage.tsx 에이전트 관리 탭 UI 갱신 보조 스크립트 |
| `scripts/update_users_permissions.cjs` | 58줄 (3.1KB) | - | `-` | Out:0 / In:0 | users_permissions.tsx 직무 기능 태그 배지 표시 패치 스크립트 |
| `scripts/update_vendors_manual.cjs` | 98줄 (3.5KB) | - | `-` | Out:0 / In:0 | allMenuManuals.ts 내 매입처(vendors) 매뉴얼 정의 갱신 스크립트 |
| `scripts/update_vendors.cjs` | 49줄 (2.6KB) | - | `-` | Out:0 / In:0 | Vendors.tsx 레이아웃 스타일 보정 보조 스크립트 |
| `scripts/upsert_prepared_spec_data.cjs` | 236줄 (11.0KB) | - | `-` | Out:0 / In:0 · DB:products | Cloudflare R2 제원표 문서 URL 및 백업 제원 데이터를 products 테이블에 업서트하는 스크립트 |
| `scripts/verify_courier_dispatch_dark.cjs` | 83줄 (2.9KB) | - | `-` | Out:0 / In:0 | 택배 배송 관리 화면 다크 모드 UI 캡처 Playwright 검증 스크립트 |
| `scripts/verify_courier_dispatch_light.cjs` | 83줄 (2.9KB) | - | `-` | Out:0 / In:0 | 택배 배송 관리 화면 라이트 모드 UI 캡처 Playwright 검증 스크립트 |
| `scripts/verify_dev_pc_register.cjs` | 64줄 (3.3KB) | - | `-` | Out:0 / In:0 | 개발자 PC 등록 프로그램 및 웹 로그인 연동 Playwright 검증 스크립트 |
| `scripts/verify_developer_device_governance.cjs` | 166줄 (7.2KB) | - | `-` | Out:0 / In:0 · DB:developer_authorized_devices,privacy_access_logs | 개발자 물리 단말기 보안 통제·비상 복구 및 다중 개발자 정합성 검증 스크립트 |
| `scripts/verify_developer_device_security.cjs` | 250줄 (13.3KB) | - | `-` | Out:0 / In:0 | 비인가 PC 개발자 로그인 차단 및 보안 모달 Playwright 감사 스크립트 |
| `scripts/verify_dual_error_modals.cjs` | 161줄 (7.3KB) | - | `-` | Out:0 / In:0 | 업무 안내 모달과 시스템 오류 모달 2트랙 분기 표시 Playwright 검증 스크립트 |
| `scripts/verify_full_organic_erp.cjs` | 418줄 (18.6KB) | - | `-` | Out:3(동적3) / In:0 | 전 원장 실데이터 기반 domainEngine 및 financialStatementEngine 대차·현금 0원 보존 법칙 검증 스크립트 |
| `scripts/verify_login_and_safari.cjs` | 67줄 (2.6KB) | - | `-` | Out:0 / In:0 | 로그인 흐름 및 Safari 호환성 안내 UI Playwright 검증 스크립트 |
| `scripts/verify_manual_modal_avoidance.cjs` | 156줄 (6.0KB) | - | `-` | Out:0 / In:0 | 인앱 매뉴얼 오버레이의 열린 모달 가림 회피 동작 Playwright 검증 스크립트 |
| `scripts/verify_manual_permission_isolation.cjs` | 249줄 (12.6KB) | - | `-` | Out:0 / In:0 | 사용자 권한별 매뉴얼 조회 격리 및 무인가 가이드 차단 Playwright 검증 스크립트 |
| `scripts/verify_organic_ui_e2e.cjs` | 209줄 (10.5KB) | - | `-` | Out:0 / In:0 | 프로덕션 프리뷰 서버 기반 28개 화면 렌더링, 비렌탈·멀티테넌트 전환 및 콘솔 오류 0건 Playwright E2E 검증 스크립트 |
| `scripts/verify_permission_json.cjs` | 38줄 (1.7KB) | - | `-` | Out:0 / In:0 | 사용자권한 마스터 백업 JSON 파일 구조·무결성 검증 스크립트 |
| `scripts/verify_privacy_encryption.cjs` | 219줄 (8.7KB) | - | `-` | Out:0 / In:0 | 개인정보 필드 암호화 저장 및 비권한자 UI 마스킹 Playwright 감사 스크립트 |
| `scripts/verify_process_drag_avoidance.cjs` | 121줄 (4.7KB) | - | `-` | Out:0 / In:0 | 매뉴얼 작성 패널·프로세스 박스 드래그 충돌 회피 Playwright 검증 스크립트 |
| `scripts/verify_truck_dispatch_excel.cjs` | 99줄 (3.6KB) | - | `-` | Out:0 / In:0 | 배차 운송 관리 월말 정산 엑셀 업로드·대사 Playwright 검증 스크립트 |
| `scripts/verify_v2_conservation.cjs` | 973줄 (41.3KB) | LARGE_FILE | `-` | Out:5(동적5) / In:0 · 동적패키지:vite · DB:fl_approval_requests,fl_contract_lines,fl_contracts,fl_fulfillments(+3) | 원격 PostgreSQL 실데이터 기준 eBroFL v2 재무제표·재고·정비·리스 종단 보존 법칙 일괄 검증 스크립트 |
| `scripts/verify_v2_playwright.cjs` | 583줄 (37.7KB) | - | `-` | Out:0 / In:0 | eBroFL v2 로그인, 메뉴 탐색, 매뉴얼 오버레이 및 화면 무결성 Playwright E2E 검증 스크립트 |
| `scripts/wtt_contract_events.cjs` | 251줄 (10.8KB) | - | `-` | Out:0 / In:0 · DB:assets,contract_assets,contract_history,contracts(+1) | 계약 교환·단축·연장 4대 계약변경 이벤트 Supabase WTT 검증 스크립트 |
| `scripts/wtt_full_business_activity_suite.cjs` | 259줄 (18.2KB) | - | `-` | Out:0 / In:0 · DB:asset_in_out_logs,assets,bank_account_initial_balances,bank_transactions(+24) | 16대 전사 업무활동 파이프라인 데이터·규칙 종합 검증 WTT 스위트 |
| `scripts/wtt_webapp_apk_attendance_10.cjs` | 356줄 (14.3KB) | - | `-` | Out:0 / In:0 | 모바일 웹앱 APK 다운로드·모니터링 및 출퇴근 동기화 10회 관통 WTT 스크립트 |
| `tests/bank_ui_rwtt.spec.ts` | 45줄 (1.8KB) | - | `-` | Out:0 / In:0 | 은행 입출금 대사 UI 20회 반복 스트레스 Playwright RWTT 스펙 |
| `tests/billing_rwtt.spec.ts` | 83줄 (3.6KB) | - | `-` | Out:0 / In:0 | 청구 생성·수정 20회 반복 스트레스 Playwright RWTT 스펙 |
| `tests/contract_rwtt.spec.ts` | 89줄 (3.6KB) | - | `-` | Out:0 / In:0 | 계약 연장·단축 및 변경 이력 추적 10회 Playwright RWTT 스펙 |
| `tests/leave_ot_rwtt.spec.ts` | 114줄 (4.5KB) | - | `-` | Out:0 / In:0 | 연차 신청 및 연장근무(OT) 관리 10회 Playwright RWTT 스펙 |
| `tests/multi_domain_rwtt.spec.ts` | 136줄 (5.6KB) | - | `-` | Out:0 / In:0 | 일일입출고·주기장정비·매입정산·현장옵션 다중 도메인 Playwright RWTT 스펙 |
| `tests/oct20_21_changes_rwtt.spec.ts` | 301줄 (19.4KB) | - | `-` | Out:0 / In:0 | 한국어 UI 정합성 및 주요 개편 사항 5종 Playwright RWTT 검증 스펙 |
| `tests/outbound_procedural_gate_rwtt.spec.ts` | 45줄 (2.5KB) | - | `-` | Out:0 / In:0 | 출고 절차적 상태전이 역순·미할당 차단 네거티브 게이트 Playwright RWTT 스펙 |
| `tests/repairs_rwtt.spec.ts` | 99줄 (4.0KB) | - | `-` | Out:0 / In:0 | 주기장 정비 스튜디오 및 정비 대장 10회 Playwright RWTT 스펙 |
| `tests/sitemaster_dispatch_rwtt.spec.ts` | 313줄 (16.8KB) | - | `-` | Out:0 / In:0 · DB:customer_sites,deliveries,site_masters | 현장 옵션 그룹 상속 및 출고 요청 연동 Playwright RWTT 스펙 |
| `tests/stocktaking_rwtt.spec.ts` | 92줄 (3.5KB) | - | `-` | Out:0 / In:0 | 소모품 재고 실사 및 보정 확정 3회 Playwright RWTT 스펙 |
| `tests/trade_rwtt.spec.ts` | 12줄 (0.6KB) | - | `-` | Out:0 / In:0 | IT 유통 테넌트 전용 수주·출고·청구 Playwright RWTT 스펙 |
