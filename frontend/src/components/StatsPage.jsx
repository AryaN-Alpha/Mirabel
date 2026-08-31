import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fontHeading, text, cream, space } from "./homeTheme";
import { GhostLink } from "./homeWidgets";
import StatsFilterBar from "./stats/StatsFilterBar";
import KpiCards from "./stats/KpiCards";
import BudgetPanel from "./stats/BudgetPanel";
import TokenTimeseriesChart from "./stats/TokenTimeseriesChart";
import CostTimeseriesChart from "./stats/CostTimeseriesChart";
import ProviderDistributionChart from "./stats/ProviderDistributionChart";
import ProviderComparisonTable from "./stats/ProviderComparisonTable";
import EfficiencySection from "./stats/EfficiencySection";
import CacheSection from "./stats/CacheSection";
import OptimizationSection from "./stats/OptimizationSection";
import CallSiteTable from "./stats/CallSiteTable";
import PerformanceSection from "./stats/PerformanceSection";
import TopUsageTable from "./stats/TopUsageTable";
import {
  getStatsMeta, getStatsOverview, getStatsTimeseries, getStatsProviders, getStatsModels,
  getStatsCallSites, getStatsCache, getStatsPerformance, getStatsOptimization,
  getStatsBudget, setStatsBudget, statsExportUrl,
} from "../services/api";
import { getErrorMessage } from "../utils/errors";

const DEFAULT_FILTERS = { period: "last_30_days", start_date: "", end_date: "", provider: "", model: "", call_site: "", estimated: "" };
const DEBOUNCE_MS = 350;

function toApiParams(filters) {
  const params = { period: filters.period };
  if (filters.period === "custom") {
    params.start_date = filters.start_date;
    params.end_date = filters.end_date;
  }
  if (filters.provider) params.provider = filters.provider;
  if (filters.model) params.model = filters.model;
  if (filters.call_site) params.call_site = filters.call_site;
  if (filters.estimated) params.estimated = filters.estimated;
  return params;
}

export default function StatsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [debouncedFilters, setDebouncedFilters] = useState(DEFAULT_FILTERS);
  const [meta, setMeta] = useState(null);
  const [overview, setOverview] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [providers, setProviders] = useState(null);
  const [models, setModels] = useState(null);
  const [callSites, setCallSites] = useState(null);
  const [cache, setCache] = useState(null);
  const [performance, setPerformance] = useState(null);
  const [optimization, setOptimization] = useState(null);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      // Custom range with an incomplete date pair isn't ready to fetch yet.
      if (filters.period === "custom" && (!filters.start_date || !filters.end_date)) return;
      setDebouncedFilters(filters);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    getStatsMeta().then(setMeta).catch(() => {});
  }, [reloadToken]);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    const params = toApiParams(debouncedFilters);
    const groupByProvider = !debouncedFilters.provider;

    // {label, setter, section title} so a failure names the section that
    // failed rather than only ever reporting on "overview" — a section
    // besides overview failing used to leave that one part of the page
    // silently empty (indistinguishable from "genuinely no data") with no
    // error shown anywhere on the page.
    const fetches = [
      ["Overview", getStatsOverview(params), setOverview],
      ["Token/cost trend", getStatsTimeseries(params, groupByProvider), setTimeseries],
      ["Provider breakdown", getStatsProviders(params), setProviders],
      ["Model breakdown", getStatsModels(params), setModels],
      ["Call-site breakdown", getStatsCallSites(params), setCallSites],
      ["Cache analytics", getStatsCache(params), setCache],
      ["Performance analytics", getStatsPerformance(params), setPerformance],
      ["Optimization analytics", getStatsOptimization(params), setOptimization],
      ["Budget", getStatsBudget(), setBudget],
    ];
    const results = await Promise.allSettled(fetches.map(([, promise]) => promise));

    const failedSections = [];
    results.forEach((result, i) => {
      const [label, , setter] = fetches[i];
      if (result.status === "fulfilled") setter(result.value);
      else failedSections.push(label);
    });

    if (failedSections.length === fetches.length) {
      setError(getErrorMessage(results[0].reason, "Couldn't load Stats — is the backend running?"));
    } else if (failedSections.length > 0) {
      setError(`Couldn't load: ${failedSections.join(", ")}. Showing the rest of the dashboard with what loaded.`);
    }

    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
  }, [debouncedFilters]);

  const firstLoad = useRef(true);
  useEffect(() => {
    load(!firstLoad.current);
    firstLoad.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedFilters, reloadToken]);

  async function handleSaveBudget(monthlyBudgetUsd) {
    const updated = await setStatsBudget({ monthly_budget_usd: monthlyBudgetUsd });
    setBudget(updated);
  }

  const granularity = overview?.period?.granularity ?? "day";
  const showByProvider = !debouncedFilters.provider;
  // Referentially stable across the many setState calls in load() — passed
  // as a prop to TopUsageTable, whose fetch effect depends on it; a fresh
  // object every render (computed inline) triggered a refetch loop (visible
  // in the dev server log as the same top-usage request firing ~9x per
  // page load, once per state slice load() resolves).
  const apiParams = useMemo(() => toApiParams(debouncedFilters), [debouncedFilters]);

  return (
    <div style={{ animation: "home-rise 1s cubic-bezier(.2,.7,.2,1) .08s both", paddingBottom: space[8] }}>
      <div
        className="flex items-baseline justify-between flex-wrap"
        style={{ gap: space[6], marginTop: space[8] * 1.2, paddingBottom: space[5] ?? 23 }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: cream(0.42) }}>Stats</div>
          <div style={{ fontFamily: fontHeading, fontSize: "clamp(30px,3.2vw,42px)", lineHeight: 1.1, color: text.bright, marginTop: space[2] }}>
            LLM Usage, Cost <em style={{ fontStyle: "italic", color: cream(0.6) }}>& Performance</em>
          </div>
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: space[6] }}>
        <StatsFilterBar
          filters={filters}
          onChange={setFilters}
          meta={meta}
          onRefresh={() => setReloadToken((n) => n + 1)}
          refreshing={refreshing}
          lastUpdated={lastUpdated}
          onExport={() => window.open(statsExportUrl("call_sites", apiParams), "_blank")}
        />

        {error && (
          <div style={{ padding: space[3], border: "1px solid rgba(224,140,140,0.4)", borderRadius: 6, color: "rgba(224,140,140,0.95)", fontSize: 13 }}>
            {error} <GhostLink onClick={() => load(false)} muted>Retry</GhostLink>
          </div>
        )}

        <KpiCards overview={overview} loading={loading} />

        <BudgetPanel overview={overview} budget={budget} loading={loading} onSaveBudget={handleSaveBudget} />

        <TokenTimeseriesChart buckets={timeseries?.buckets} granularity={granularity} loading={loading} />

        <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: space[6] }}>
          <ProviderDistributionChart providers={providers} loading={loading} />
          <CostTimeseriesChart
            buckets={timeseries?.buckets}
            byProvider={timeseries?.by_provider}
            granularity={granularity}
            loading={loading}
            showByProvider={showByProvider}
          />
        </div>

        <ProviderComparisonTable providers={providers} models={models} loading={loading} />

        <EfficiencySection overview={overview} loading={loading} />

        <CacheSection cache={cache} buckets={timeseries?.buckets} granularity={granularity} loading={loading} />

        <OptimizationSection optimization={optimization} loading={loading} />

        <PerformanceSection performance={performance} loading={loading} />

        <CallSiteTable callSites={callSites} loading={loading} />

        <TopUsageTable filters={apiParams} />
      </div>
    </div>
  );
}
