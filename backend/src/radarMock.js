const CASE_ID = "kr_case_002_kr_mvp_v1";

const FEED_ITEMS = [
  {
    caseVersionId: CASE_ID,
    ticker: "000660",
    companyName: "SK Hynix",
    market: "KOSPI",
    filingUrl: null,
    eventType: "MA_ANNOUNCED",
    strategyType: "MERGER_ARB",
    baseCaseIrr: 0.1909,
    pSuccess: 0.62,
    decisionStatus: "decision_grade",
    timelineStatus: {
      startDate: "2026-02-10",
      expectedEndDate: "2026-09-30",
      progressPct: 37.5,
      daysElapsed: 84,
      daysRemaining: 140,
      status: "in_progress"
    },
    compositeScore: 0.42454,
    keyRisks: ["REGULATORY_RISK"]
  }
];

const CASE_DETAIL = {
  item: FEED_ITEMS[0],
  evidence: {
    headline: "합병 추진 및 주주총회 의결 예정",
    source: "OpenDART",
    filingUrl: null,
    receiptNo: null,
    qualityGates: {
      has_primary_source: true,
      has_key_field_citations: true,
      valuation_inputs_cited: true
    }
  },
  filing: {
    filingUrl: null,
    receiptNo: null
  },
  tradeSetup: {
    currentPrice: 188000,
    targetPrice: 225000,
    downsidePrice: 168000,
    spreadPct: 19.68,
    upsidePct: 19.68,
    downsidePct: -10.64,
    riskRewardRatio: 1.85,
    expectedValuePct: 8.14,
    riskAdjustedIrr: 0.118,
    valuationBasis: "peer-multiple rerating + merger completion spread"
  },
  timelineStatus: FEED_ITEMS[0].timelineStatus,
  situationStart: {
    startedAt: "2026-02-10",
    startedBy: "회사 공시",
    initiationMode: "전략적 결합 발표",
    triggerHeadline: "사업 시너지 극대화를 위한 합병 발표"
  },
  progressionPath: [
    {
      step: "이사회/공시",
      status: "completed",
      expectedWindowDays: 7,
      completionEta: "2026-02-17"
    },
    {
      step: "주주총회 승인",
      status: "in_progress",
      expectedWindowDays: 45,
      completionEta: "2026-04-01"
    },
    {
      step: "규제 승인",
      status: "pending",
      expectedWindowDays: 90,
      completionEta: "2026-07-15"
    }
  ],
  scenarios: [
    {
      name: "긍정",
      sentiment: "positive",
      probability: 0.42,
      valuationModel: "merger close spread",
      targetPrice: 235000,
      downsidePrice: 178000,
      scenarioReturnPct: 25,
      annualizedReturnPct: 36,
      riskReward: 2.4,
      expectedValueContributionPct: 10.5,
      resolutionDays: 120,
      keyDrivers: ["승인 가속", "시너지 가시화"],
      falsifiers: ["심사 지연"]
    },
    {
      name: "중립",
      sentiment: "neutral",
      probability: 0.38,
      valuationModel: "base completion",
      targetPrice: 220000,
      downsidePrice: 175000,
      scenarioReturnPct: 17,
      annualizedReturnPct: 24,
      riskReward: 1.7,
      expectedValueContributionPct: 6.46,
      resolutionDays: 170,
      keyDrivers: ["일정 준수"],
      falsifiers: ["심리 악화"]
    },
    {
      name: "부정",
      sentiment: "negative",
      probability: 0.2,
      valuationModel: "broken deal downside",
      targetPrice: 178000,
      downsidePrice: 158000,
      scenarioReturnPct: -16,
      annualizedReturnPct: -22,
      riskReward: 0.7,
      expectedValueContributionPct: -3.2,
      resolutionDays: 80,
      keyDrivers: ["규제 리스크"],
      falsifiers: ["대체 구조"]
    }
  ],
  scenarioFramework: {
    asOfDate: "2026-03-03",
    entryPrice: 188000,
    probabilitySum: 1,
    expectedReturnPct: 13.76,
    expectedAnnualizedReturnPct: 19.4,
    decisionGuidance: "positive+neutral 확률이 80%로 비중 유지",
    decisionNow: "핵심 촉매 확인 전까지 기존 비중 유지",
    rebalanceRule: "규제 승인 지연 시 30% 감축",
    exitRule: "승인 완료 + 목표가 근접 시 단계적 청산",
    breakEvenPositiveProb: 0.31
  },
  intelligence: {
    freshnessStatus: "live",
    snapshot: {
      snapshotId: "snap_live_1",
      caseVersionId: CASE_ID,
      asOf: "2026-03-03T15:00:00.000Z",
      overallSentimentScore: 0.18,
      confidenceShift: 0.04,
      scenarioDelta: {
        positive: 0.03,
        neutral: -0.01,
        negative: -0.02
      },
      signalCount24h: 4,
      lastUpdatedAt: "2026-03-03T15:00:00.000Z"
    },
    signals: [
      {
        signalId: "sig_a",
        caseVersionId: CASE_ID,
        signalType: "news_flow",
        sentiment: "positive",
        score: 0.23,
        headline: "규제 심사 진척 보도",
        summary: "승인 일정 단축 가능성",
        source: "news_satellite_v1",
        sourceUrl: null,
        observedAt: "2026-03-03T14:30:00.000Z",
        freshnessMinutes: 30,
        metadata: {
          channel: "press"
        }
      }
    ]
  },
  valuationNarrative: "합병 종결 확률이 높고 잔여 스프레드가 유효해 EV가 양수로 유지된다.",
  catalystTimeline: ["주총", "규제 승인", "클로징"],
  similarCaseInsights: ["유사 합병 사례에서 승인 직전 리레이팅 발생"],
  playbook: ["승인 지연 신호 발생 시 비중 감축"],
  similarCases: [
    {
      caseVersionId: "hist_1",
      companyName: "유사 반도체 케이스",
      eventType: "MA_ANNOUNCED",
      strategyType: "MERGER_ARB",
      outcome: "success",
      reportPath: "fallback://hist_1",
      outcomeSourceUrl: "fallback://hist_1"
    }
  ],
  modeling: {
    valuationModel: "merger-arb",
    baseCaseIrr: 0.19,
    bullCaseIrr: 0.34,
    bearCaseIrr: -0.16,
    successProbability: 0.62,
    irrBreakdown: [
      {
        component: "spread",
        contribution: 0.12
      },
      {
        component: "re-rating",
        contribution: 0.07
      }
    ]
  },
  uncertainty: {
    pSuccess: 0.62,
    confidenceRationale: "승인 절차 가시성 + 과거 선례",
    unknowns: ["예상 외 규제 쟁점"],
    falsificationTriggers: ["승인 일정 60일 이상 지연"]
  },
  runManifest: {
    run_id: "vercel_static_run",
    generated_at: "2026-03-03T15:00:00.000Z",
    source_artifact_ids: ["mock_artifact_1"],
    report_sha256: "mock"
  }
};

const DOSSIER = {
  caseVersionId: CASE_ID,
  companyName: FEED_ITEMS[0].companyName,
  ticker: FEED_ITEMS[0].ticker,
  market: FEED_ITEMS[0].market,
  generatedAt: "2026-03-03T15:00:00.000Z",
  topSummaryBullets: [
    "합병 종결 이벤트 기반 EV 양수",
    "승인 일정 진행률 37.5%",
    "시나리오 가중 기대수익 13.76%"
  ],
  situationSummary: "합병 종결형 특수상황으로 스프레드/리레이팅 동시 추적",
  detailedSections: [
    {
      title: "핵심 포인트",
      bulletSummary: ["규제 승인 진행 중", "손익비 우위"],
      detail: "이벤트 진행률과 확률모형을 결합해 포지션 유지/조정 규칙을 제시한다."
    }
  ],
  valuationDeepDive: {
    framework: CASE_DETAIL.tradeSetup.valuationBasis,
    currentPrice: CASE_DETAIL.tradeSetup.currentPrice,
    targetPrice: CASE_DETAIL.tradeSetup.targetPrice,
    downsidePrice: CASE_DETAIL.tradeSetup.downsidePrice,
    upsidePct: CASE_DETAIL.tradeSetup.upsidePct,
    downsidePct: CASE_DETAIL.tradeSetup.downsidePct,
    riskRewardRatio: CASE_DETAIL.tradeSetup.riskRewardRatio,
    expectedValuePct: CASE_DETAIL.tradeSetup.expectedValuePct,
    riskAdjustedIrr: CASE_DETAIL.tradeSetup.riskAdjustedIrr,
    assumptions: [
      "승인 절차는 계획 대비 지연이 제한적",
      "종결 이후 시너지 기대가 멀티플 지지"
    ]
  },
  timelineSummary: CASE_DETAIL.timelineStatus,
  situationStart: CASE_DETAIL.situationStart,
  progressionPath: CASE_DETAIL.progressionPath,
  scenarios: CASE_DETAIL.scenarios,
  scenarioFramework: CASE_DETAIL.scenarioFramework,
  intelligence: CASE_DETAIL.intelligence,
  catalystMap: CASE_DETAIL.catalystTimeline,
  historicalCases: [
    {
      caseVersionId: "hist_1",
      companyName: "유사 반도체 케이스",
      eventType: "MA_ANNOUNCED",
      strategyType: "MERGER_ARB",
      outcome: "success",
      reportPath: "fallback://hist_1",
      outcomeSourceUrl: "fallback://hist_1"
    }
  ],
  researchSources: ["OpenDART", "news_satellite_v1", "sentiment_satellite_v1"]
};

export function getRadarFeedResponse() {
  return {
    items: FEED_ITEMS,
    total: FEED_ITEMS.length,
    filters: {
      eventType: null,
      strategyType: null,
      market: null,
      ticker: null,
      minScore: null
    },
    mode: "fallback"
  };
}

export function getCaseDetail(caseVersionId) {
  if (caseVersionId !== CASE_ID) {
    return null;
  }
  return CASE_DETAIL;
}

export function getCaseIntelligence(caseVersionId) {
  if (caseVersionId !== CASE_ID) {
    return null;
  }
  return {
    caseVersionId,
    mode: "fallback",
    intelligence: CASE_DETAIL.intelligence
  };
}

export function getCaseDossier(caseVersionId) {
  if (caseVersionId !== CASE_ID) {
    return null;
  }
  return DOSSIER;
}
