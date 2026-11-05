# DESIGN.md — 무진글로벌(주) 지게차 렌탈·유통 ERP 디자인 시스템 (Design SSOT)

## 1. 디자인 철학 및 핵심 정체성 (Core Aesthetic Identity)
- **Warm Cotton Paper & OLED Dark Slate Ledger**: 장시간 고밀도 데이터를 대사·검토하는 렌탈·물류·회계 실무자의 시각 피로도를 최소화하기 위해, 라이트 모드는 반사광을 억제한 따뜻한 코튼 페이퍼(`#ebe5d8` / `#f5f1e8`) 톤을, 다크 모드는 고대비 OLED 다크 슬레이트(`#0b0f19` / `#131b2e`) 톤을 표준으로 사용한다.
- **무수식어 건조 명사·동사 표기 (Charter 3.1 & 3.7)**: 모든 타이틀, 탭, 버튼, 테이블 헤더, 배지에는 감성적·과장적 수식어와 `한국어(English)` 괄호 영문 병기를 일절 배제하고, 건조하고 명확한 순수 한국어 명사·동사만을 사용한다.

---

## 2. 전사 컬러 토큰 체계 (5-Color Core Token System)

| 토큰 구분 | CSS 변수명 | 라이트 모드 (Warm Cotton Paper) | 다크 모드 (OLED Dark Slate) | 용도 |
| :--- | :--- | :--- | :--- | :--- |
| **배경 (Canvas)** | `--bg-app` | `#ebe5d8` | `#0b0f19` | 전체 워크스페이스 기본 배경 |
| **패널/카드 (Surface)** | `--bg-card` | `#f5f1e8` | `#131b2e` | 테이블, 카드, 필터 컨테이너 표면 |
| **호버/보조면 (Hover)** | `--bg-hover` | `#e4decb` | `#1e293b` | 테이블 헤더, 입력 읽기전용, 행 호버 |
| **본문 텍스트 (Primary Ink)** | `--text-primary` | `#18181b` | `#f8fafc` | 핵심 데이터, 타이틀, 금액 |
| **보조 텍스트 (Secondary Ink)** | `--text-secondary` | `#3f3f46` | `#cbd5e1` | 필드 레이블, 부가 메타데이터 |
| **경계선 (Hairline Border)** | `--border-color` | `#d0c8b8` | `#26334d` | 1px 솔리드 컨테이너·그리드 구분선 |
| **주 강조색 (Primary Accent)** | `--primary-color` | `#1d4ed8` | `#60a5fa` | 주요 완결 버튼, 활성 탭, 핵심 금액 |
| **시맨틱 상태색 (Status)** | `--success/warning/danger-color` | `#15803d` / `#b45309` / `#b91c1c` | `#34d399` / `#fbbf24` / `#f87171` | 정상·완료 / 대기·주의 / 연체·차단 |

---

## 3. 타이포그래피 및 수치 정렬 표준 (Typography & Tabular Numbers)
- **본문 폰트 (`--font-sans`)**: `'Pretendard Variable'`, `'Pretendard'`, `'Noto Sans KR'`, `system-ui`, `sans-serif`
- **코드·식별자·금액 폰트 (`--font-mono`)**: `'JetBrains Mono'`, `'D2Coding'`, `monospace` (`font-variant-numeric: tabular-nums` 필수 적용)
- **줄바꿈 절대 방지 (Charter 3.2)**: 모든 테이블 셀(`th`, `td`), 버튼, 배지, 폼 레이블에는 `white-space: nowrap` 및 `flex-shrink: 0`을 적용하여 텍스트 세로 깨짐을 원천 차단한다.

---

## 4. 레이아웃 및 컴포넌트 표준 (Layout & Component Architecture)

### 4.1 좌상단 ➔ 우하단 구텐베르크 Z-패턴 동선 (Charter 3.5)
1. **좌상단 (Scope)**: 조회 연월, 계약 구분, 거래처, 상태 필터 배치.
2. **우상단 (Pipeline)**: 엑셀 업로드·내보내기, 신규 등록, 서버 점검 등 유입 액션 배치.
3. **중앙 본문 (High-Density Grid / Dossier)**: 화면 세로 영역의 80~85%를 차지하는 메인 작업대 배치 (테이블 행 높이 `38px~42px`, 첫 번째 컬럼에 핵심 조치 버튼 배치).
4. **우하단 (Terminal Action & Conservation Bar)**: 대차대조 합계 검증식(`총액 = 완료액 + 대기액 | 대차 차액 ₩0`)과 최종 일괄 처리 버튼 배치.

### 4.2 레이블-입력창 상하 수직 스택 (Charter 3.4)
- 모든 입력 폼과 필터 항목은 `display: flex; flex-direction: column; gap: 4px` 구조로 레이블을 입력창 상단에 수직 배치한다.

### 4.3 단일 세그먼트 탭 표준 (`.segmented-tab-group` & `.segmented-tab-item`)
- 통합 메뉴의 하위 탭 전환은 무분별한 원색(초록/주황/보라) 알약 버튼을 금지하고, `src/index.css`에 정의된 `.segmented-tab-group` 및 `.segmented-tab-item` 단일 표준 클래스를 사용한다.

---

## 5. AI 슬롭(AI Slop) 6대 영구 금지 규칙 (Charter 3.7)
1. **카드 내 카드 중첩 금지 (No Cards in Cards)**: `.card` 내부에 또 다른 `.card`나 두꺼운 컬러 테두리 박스를 중첩하지 않고, 1px 구분선(`var(--border-color)`)으로 정리한다.
2. **장식적 그라디언트 및 그림자 금지 (Zero Box-Shadow)**: 모든 컨테이너는 `box-shadow: none !important`와 `1px solid var(--border-color)`만으로 경계를 정의한다.
3. **좌측 두꺼운 컬러 보더 탭(`border-left: 4px solid`) 금지**: 콜아웃이나 카드 좌측에 무의미한 두꺼운 색띠를 두르는 대신, 깔끔한 1px 전체 테두리(`border: 1px solid`)와 상태 배지를 사용한다.
4. **바운스 애니메이션(`animate-bounce`) 및 레이아웃 폭 트랜지션(`transition: width`) 금지**: 과장된 바운스 모션을 제거하고, 프로그레스 바 등은 `transition: transform` 또는 불투명도/색상 트랜지션만 허용한다.
5. **유채색 배경 위 회색 텍스트(`gray-on-color`) 금지**: 컬러 배지나 버튼 위에는 반드시 고대비 텍스트 토큰을 사용하여 가독성을 보장한다.
6. **상단 카드형 요약정보(KPI Summary Card Strip / Grid) 영구 금지**: 화면 상단이나 탭 상단에 다열 박스/그리드(`repeat(auto-fit/fill, ...)`, `grid-cols-2~6` 등)로 품목수·수량·금액·건수 등을 나열하는 카드형 요약 스트립을 절대 배치하지 않는다. 모든 집계·대사 수치는 오직 테이블 하단(`tfoot`) 또는 구텐베르크 Z-패턴 4단계 우하단 대차대조 검증 바에서만 표기한다.
