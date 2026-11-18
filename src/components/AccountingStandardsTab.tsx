import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import "./AccountingStandardsTab.css";
import {
  Search,
  BookOpen,
  FileText,
  RotateCcw,
  ExternalLink,
  Scale,
} from "lucide-react";
import type {
  StandardArticle,
  CommentarySection,
} from "../data/accountingStandardsData";
import { useAppShell } from "../core/AppShellContext";
import {
  StandardArticlesPane,
  CommentarySectionsPane,
  matchesArticle,
  matchesCommentary,
} from "./AccountingStandardsPanes";

const QUICK_KEYWORDS = [
  "유형자산",
  "감가상각",
  "리스거래",
  "수익인식",
  "대손충당금",
  "퇴직급여",
  "재고자산",
  "무형자산",
  "외화환산",
  "정부보조금",
  "법인세비용",
  "주석",
];

type AccountingStandardsDataModule = typeof import("../data/accountingStandardsData");

let cachedAccountingDataPromise: Promise<AccountingStandardsDataModule> | null = null;

function loadAccountingStandardsData(): Promise<AccountingStandardsDataModule> {
  if (!cachedAccountingDataPromise) {
    cachedAccountingDataPromise = import("../data/accountingStandardsData").catch(
      (err) => {
        cachedAccountingDataPromise = null;
        throw err;
      }
    );
  }
  return cachedAccountingDataPromise;
}

export default function AccountingStandardsTab() {
  const { isRentalEnabled } = useAppShell();
  const [stdData, setStdData] = useState<AccountingStandardsDataModule | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    loadAccountingStandardsData()
      .then((mod) => {
        if (!cancelled) {
          setStdData(mod);
        }
      })
      .catch((err) => {
        console.error("회계기준 데이터 로드 실패", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleQuickKeywords = useMemo(
    () =>
      isRentalEnabled
        ? QUICK_KEYWORDS
        : QUICK_KEYWORDS.filter((k) => k !== "리스거래" && k !== "감가상각"),
    [isRentalEnabled]
  );
  // 통합 검색어 및 좌/우 개별 검색어 상태
  const [unifiedQuery, setUnifiedQuery] = useState("");
  const [leftQuery, setLeftQuery] = useState("");
  const [rightQuery, setRightQuery] = useState("");

  // 장별 필터 상태
  const [leftChapterFilter, setLeftChapterFilter] = useState("ALL");
  const [rightChapterFilter, setRightChapterFilter] = useState("ALL");

  // 검색 결과만 필터링하여 보기 토글 (기본값 false: 전체 조문 스크롤 내 위치 포커스 이동)
  const [leftFilterOnlyMatched, setLeftFilterOnlyMatched] = useState(false);
  const [rightFilterOnlyMatched, setRightFilterOnlyMatched] = useState(false);

  const standardArticles = useMemo(
    () => stdData?.STANDARD_ARTICLES ?? [],
    [stdData]
  );
  const commentarySections = useMemo(
    () => stdData?.COMMENTARY_SECTIONS ?? [],
    [stdData]
  );

  // 현재 포커스된 항목 ID 및 매칭 인덱스
  const [focusedLeftId, setFocusedLeftId] = useState<string>("art-1");
  const [focusedRightId, setFocusedRightId] = useState<string>("com-0-1");
  const [leftMatchIndex, setLeftMatchIndex] = useState<number>(0);
  const [rightMatchIndex, setRightMatchIndex] = useState<number>(0);

  // 좌우 독립 스크롤 컨테이너 Ref
  const leftScrollRef = useRef<HTMLDivElement | null>(null);
  const rightScrollRef = useRef<HTMLDivElement | null>(null);

  // 장별 필터가 적용된 좌측 기준서 목록
  const visibleLeftArticles = useMemo(() => {
    return standardArticles.filter((art) => {
      if (leftChapterFilter !== "ALL" && art.chapterNo !== leftChapterFilter) {
        return false;
      }
      if (leftFilterOnlyMatched && leftQuery.trim()) {
        return matchesArticle(art, leftQuery);
      }
      return true;
    });
  }, [standardArticles, leftChapterFilter, leftFilterOnlyMatched, leftQuery]);

  // 장별 필터가 적용된 우측 해설서 목록
  const visibleRightSections = useMemo(() => {
    return commentarySections.filter((sec) => {
      if (rightChapterFilter !== "ALL" && sec.chapterNo !== rightChapterFilter) {
        return false;
      }
      if (rightFilterOnlyMatched && rightQuery.trim()) {
        return matchesCommentary(sec, rightQuery);
      }
      return true;
    });
  }, [commentarySections, rightChapterFilter, rightFilterOnlyMatched, rightQuery]);

  // 좌측 검색 매칭 항목 리스트
  const leftMatchedArticles = useMemo(() => {
    if (!leftQuery.trim()) return [];
    return visibleLeftArticles.filter((art) => matchesArticle(art, leftQuery));
  }, [visibleLeftArticles, leftQuery]);

  // 우측 검색 매칭 항목 리스트
  const rightMatchedSections = useMemo(() => {
    if (!rightQuery.trim()) return [];
    return visibleRightSections.filter((sec) => matchesCommentary(sec, rightQuery));
  }, [visibleRightSections, rightQuery]);

  // 좌측 컨테이너 내부 특정 조문 카드로 스크롤 및 포커스
  const scrollToLeftArticle = useCallback((articleId: string) => {
    setFocusedLeftId(articleId);
    requestAnimationFrame(() => {
      const container = leftScrollRef.current;
      const target = document.getElementById(`left-card-${articleId}`);
      if (container && target) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offsetTop =
          targetRect.top - containerRect.top + container.scrollTop - 24;
        container.scrollTo({
          top: Math.max(0, offsetTop),
          behavior: "smooth",
        });
      }
    });
  }, []);

  // 우측 컨테이너 내부 특정 해설 섹션 카드로 스크롤 및 포커스
  const scrollToRightSection = useCallback((sectionId: string) => {
    setFocusedRightId(sectionId);
    requestAnimationFrame(() => {
      const container = rightScrollRef.current;
      const target = document.getElementById(`right-card-${sectionId}`);
      if (container && target) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offsetTop =
          targetRect.top - containerRect.top + container.scrollTop - 24;
        container.scrollTo({
          top: Math.max(0, offsetTop),
          behavior: "smooth",
        });
      }
    });
  }, []);

  // 좌측 검색어가 변경될 때 첫 번째 매칭 조문으로 자동 포커스 이동
  useEffect(() => {
    if (leftMatchedArticles.length > 0) {
      setLeftMatchIndex(0);
      scrollToLeftArticle(leftMatchedArticles[0].id);
    }
  }, [leftQuery, leftChapterFilter, leftMatchedArticles, scrollToLeftArticle]);

  // 우측 검색어가 변경될 때 첫 번째 매칭 해설로 자동 포커스 이동
  useEffect(() => {
    if (rightMatchedSections.length > 0) {
      setRightMatchIndex(0);
      scrollToRightSection(rightMatchedSections[0].id);
    }
  }, [rightQuery, rightChapterFilter, rightMatchedSections, scrollToRightSection]);

  // 좌측 이전/다음 검색 결과 포커스 이동
  const handleLeftNavigate = (dir: "prev" | "next") => {
    if (leftMatchedArticles.length === 0) return;
    const nextIdx =
      dir === "next"
        ? (leftMatchIndex + 1) % leftMatchedArticles.length
        : (leftMatchIndex - 1 + leftMatchedArticles.length) %
          leftMatchedArticles.length;
    setLeftMatchIndex(nextIdx);
    scrollToLeftArticle(leftMatchedArticles[nextIdx].id);
  };

  // 우측 이전/다음 검색 결과 포커스 이동
  const handleRightNavigate = (dir: "prev" | "next") => {
    if (rightMatchedSections.length === 0) return;
    const nextIdx =
      dir === "next"
        ? (rightMatchIndex + 1) % rightMatchedSections.length
        : (rightMatchIndex - 1 + rightMatchedSections.length) %
          rightMatchedSections.length;
    setRightMatchIndex(nextIdx);
    scrollToRightSection(rightMatchedSections[nextIdx].id);
  };

  // 통합 키워드 실행 (좌우 동시 검색 및 포커스)
  const applyUnifiedSearch = (keyword: string) => {
    setUnifiedQuery(keyword);
    setLeftChapterFilter("ALL");
    setRightChapterFilter("ALL");
    setLeftQuery(keyword);
    setRightQuery(keyword);
  };

  // 전체 초기화
  const handleResetAll = () => {
    setUnifiedQuery("");
    setLeftQuery("");
    setRightQuery("");
    setLeftChapterFilter("ALL");
    setRightChapterFilter("ALL");
    setLeftFilterOnlyMatched(false);
    setRightFilterOnlyMatched(false);
    scrollToLeftArticle("art-1");
    scrollToRightSection("com-0-1");
  };

  // 좌측 조문에서 우측 연계 해설로 점프
  const handleCrossJumpToRight = (commentaryId: string) => {
    setRightChapterFilter("ALL");
    setRightFilterOnlyMatched(false);
    setTimeout(() => {
      scrollToRightSection(commentaryId);
    }, 30);
  };

  // 우측 해설에서 좌측 연계 조문으로 점프
  const handleCrossJumpToLeft = (articleId: string) => {
    setLeftChapterFilter("ALL");
    setLeftFilterOnlyMatched(false);
    setTimeout(() => {
      scrollToLeftArticle(articleId);
    }, 30);
  };

  // ID로 조문 번호 조회 헬퍼
  const articleMap = useMemo(() => {
    const map = new Map<string, StandardArticle>();
    standardArticles.forEach((a) => map.set(a.id, a));
    return map;
  }, [standardArticles]);

  // ID로 해설 섹션 조회 헬퍼
  const commentaryMap = useMemo(() => {
    const map = new Map<string, CommentarySection>();
    commentarySections.forEach((c) => map.set(c.id, c));
    return map;
  }, [commentarySections]);

  if (!stdData) {
    return (
      <div className="acc-std-root flex flex-col gap-3 w-full">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs py-16 flex items-center justify-center text-center text-xs text-slate-500 min-h-[640px]">
          회계기준 데이터 불러오는 중
        </div>
      </div>
    );
  }

  const meta = stdData.ACCOUNTING_STANDARDS_META;

  return (
    <div className="acc-std-root flex flex-col gap-3 w-full">
      {/* 상단 스코프 및 통합 검색 컨트롤 바 */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 whitespace-nowrap">
                  중소기업회계기준 및 해설
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                  {meta.standardNoticeNo}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                  {meta.legalBasis}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                좌측: 중소기업회계기준 조문(제1장~제10장, 제1조~제56조, 부칙·별지서식) · 우측: 중소기업회계기준 해설(제1장~제18장, 분개사례, 상법·법인세법 참고)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={meta.standardPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              회계기준 원문 PDF
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <a
              href={meta.commentaryPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
              회계기준 해설 PDF
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
          </div>
        </div>

        {/* 좌우 동시 통합 검색 및 주요 키워드 단축 칩 */}
        <div className="pt-3 flex flex-col lg:flex-row lg:items-end justify-between gap-3">
          <div className="flex flex-col gap-1 w-full lg:max-w-md">
            <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
              좌우 동시 키워드 검색 (조문 + 해설 동시 포커스 이동)
            </label>
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
              <input
                type="text"
                value={unifiedQuery}
                onChange={(e) => applyUnifiedSearch(e.target.value)}
                placeholder={
                  isRentalEnabled
                    ? "예: 감가상각, 유형자산, 리스, 수익인식, 대손충당금, 제38조..."
                    : "예: 재고자산, 외화환산, 수익인식, 대손충당금, 제38조..."
                }
                className="w-full pl-9 pr-20 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white text-slate-900"
              />
              {unifiedQuery && (
                <button
                  type="button"
                  onClick={() => applyUnifiedSearch("")}
                  className="absolute right-2 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 bg-slate-200/70 rounded"
                >
                  지우기
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1 flex-1">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
              빈출 회계주제 바로가기
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {visibleQuickKeywords.map((kw) => {
                const isActive =
                  leftQuery.trim() === kw && rightQuery.trim() === kw;
                return (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => applyUnifiedSearch(kw)}
                    className={`px-2 py-1 text-xs font-semibold rounded border transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    #{kw}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 좌우 분할 영역 (독립 종스크롤 적용) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-[calc(100vh-230px)] min-h-[640px]">
        <StandardArticlesPane
          standardChapters={stdData.STANDARD_CHAPTERS}
          standardArticlesCount={standardArticles.length}
          visibleLeftArticles={visibleLeftArticles}
          leftQuery={leftQuery}
          leftChapterFilter={leftChapterFilter}
          leftFilterOnlyMatched={leftFilterOnlyMatched}
          focusedLeftId={focusedLeftId}
          leftMatchedCount={leftMatchedArticles.length}
          leftMatchIndex={leftMatchIndex}
          leftScrollRef={leftScrollRef}
          commentaryMap={commentaryMap}
          onLeftQueryChange={setLeftQuery}
          onLeftChapterFilterChange={setLeftChapterFilter}
          onToggleLeftFilterOnlyMatched={() =>
            setLeftFilterOnlyMatched((prev) => !prev)
          }
          onLeftNavigate={handleLeftNavigate}
          onFocusLeftArticle={setFocusedLeftId}
          onCrossJumpToRight={handleCrossJumpToRight}
          onApplyUnifiedSearch={applyUnifiedSearch}
        />

        <CommentarySectionsPane
          commentaryChapters={stdData.COMMENTARY_CHAPTERS}
          commentarySectionsCount={commentarySections.length}
          visibleRightSections={visibleRightSections}
          rightQuery={rightQuery}
          rightChapterFilter={rightChapterFilter}
          rightFilterOnlyMatched={rightFilterOnlyMatched}
          focusedRightId={focusedRightId}
          rightMatchedCount={rightMatchedSections.length}
          rightMatchIndex={rightMatchIndex}
          rightScrollRef={rightScrollRef}
          articleMap={articleMap}
          onRightQueryChange={setRightQuery}
          onRightChapterFilterChange={setRightChapterFilter}
          onToggleRightFilterOnlyMatched={() =>
            setRightFilterOnlyMatched((prev) => !prev)
          }
          onRightNavigate={handleRightNavigate}
          onFocusRightSection={setFocusedRightId}
          onCrossJumpToLeft={handleCrossJumpToLeft}
          onApplyUnifiedSearch={applyUnifiedSearch}
        />
      </div>
    </div>
  );
}
