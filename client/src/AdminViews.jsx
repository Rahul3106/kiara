import { useCallback, useEffect, useState } from "react";
import {
  AreaLineChart,
  BarChart,
  DonutChart,
  HorizontalBarChart,
} from "./components/AnalyticsCharts.jsx";
import {
  ExtraDashboardCharts,
  MetricGrid,
  ProfitSummaryCard,
  formatSignedRupees,
} from "./ShopOperations.jsx";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function AdminDashboard({ apiUrl, token, onSelectBranchSales }) {
  const [overview, setOverview] = useState(null);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("month");
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/admin/overview`, {
          headers: authHeaders(token),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load overview.");
        if (!cancelled) setOverview(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${apiUrl}/api/analytics/admin?period=${analyticsPeriod}`,
          { headers: authHeaders(token) }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Analytics failed.");
        if (!cancelled) setAnalytics(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, analyticsPeriod]);

  if (error) {
    return (
      <div className="error-message" role="alert">
        {error}
      </div>
    );
  }

  if (!overview) {
    return <p className="empty-state">Loading business overview…</p>;
  }

  const salesMap = new Map(
    (overview.salesByBranch || []).map((row) => [
      Number(row.branch_id),
      row,
    ])
  );

  const activeBranches = (overview.branches || []).filter((b) => b.is_active);

  // Chart data: Branch sales share (donut chart)
  const branchColors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
  const branchSalesShareData = (analytics?.byBranch || []).map((b, i) => ({
    label: b.branchName,
    value: Math.max(0, Number(b.netTotal || b.grossBilled || 0)),
    color: branchColors[i % branchColors.length],
  }));

  const lifetimeSalesShareData = (overview.salesByBranch || []).map((b, i) => ({
    label: b.branch_name,
    value: Math.max(0, Number(b.total_sales || 0)),
    color: branchColors[i % branchColors.length],
  }));

  // Chart data: Branch comparison grouped bar chart
  const branchCategories = (analytics?.byBranch || []).map((b) => b.branchName);
  const branchBarSeries = [
    {
      name: "Net Sales",
      color: "#2563eb",
      data: (analytics?.byBranch || []).map((b) => Number(b.netTotal || 0)),
    },
    {
      name: "Stock Purchases (−)",
      color: "#f59e0b",
      data: (analytics?.byBranch || []).map((b) => Number(b.stockPurchases || 0)),
    },
    {
      name: "Total Profit",
      color: "#10b981",
      data: (analytics?.byBranch || []).map((b) =>
        Number(b.totalProfit ?? (Number(b.netTotal || 0) - Number(b.stockPurchases || 0)))
      ),
    },
  ];

  const overallProfit = analytics?.overall
    ? Number(
        analytics.overall.totalProfit ??
          Number(analytics.overall.netTotal || 0) - Number(analytics.overall.stockPurchases || 0)
      )
    : 0;
  const lifetimeProfit = Number(
    overview.totals?.total_profit ??
      Number(overview.totals?.total_sales || 0) - Number(overview.totals?.stock_purchases || 0)
  );

  const paymentColors = {
    UPI: "#10b981",
    CASH: "#2563eb",
    CARD: "#8b5cf6",
    OTHER: "#f59e0b",
  };
  const paymentMixData = (analytics?.charts?.paymentMix || []).map((p) => ({
    label: `${p.paymentMethod} (${p.billCount})`,
    value: Number(p.total || 0),
    color: paymentColors[p.paymentMethod] || "#64748b",
  }));
  const dailyTrendPoints = (analytics?.charts?.dailyTrend || []).map((d) => ({
    label: d.label,
    date: d.date,
    value: Number(d.total || 0),
    sub: `${d.billCount} bill${d.billCount === 1 ? "" : "s"}`,
  }));
  const topMedicineItems = (analytics?.charts?.topMedicines || []).map((m) => ({
    label: m.productName,
    sub: `${m.unitsSold} units`,
    value: Number(m.revenue || 0),
  }));

  return (
    <>
      <section className="dashboard-hero dashboard-hero-admin">
        <div className="dashboard-hero-text">
          <p className="eyebrow">Consolidated control</p>
          <h2>Kiara Medicals — All branches</h2>
          <p>Read-only sales, purchases, and branch performance.</p>
        </div>
        <span className="role-badge">Admin</span>
      </section>

      <div className="dashboard-kpi-grid">
        <article className="stat-card stat-card-sales">
          <span className="stat-card-label">Lifetime net sales (all branches)</span>
          <p className="stat-card-value">
            ₹{Number(overview.totals?.total_sales || 0).toFixed(2)}
          </p>
          <span className="stat-card-hint">
            {overview.totals?.billed_count ?? overview.totals?.sale_count ?? 0} billed ·{" "}
            {overview.totals?.unbilled_count ?? 0} unbilled (net of returns)
          </span>
        </article>
        <article className="stat-card stat-card-purchase">
          <span className="stat-card-label">
            Stock purchases ({analytics?.label || "period"})
          </span>
          <p className="stat-card-value">
            − ₹{Number(analytics?.overall?.stockPurchases || 0).toFixed(2)}
          </p>
          <span className="stat-card-hint">Supplier stock cost (deducted)</span>
        </article>
        <article className="stat-card stat-card-profit">
          <span className="stat-card-label">
            Total profit ({analytics?.label || "period"})
          </span>
          <p
            className={`stat-card-value ${
              overallProfit < 0 ? "metric-profit-negative" : "metric-profit-positive"
            }`}
          >
            {overallProfit < 0
              ? `− ₹${Math.abs(overallProfit).toFixed(2)}`
              : `₹${overallProfit.toFixed(2)}`}
          </p>
          <span className="stat-card-hint">
            Lifetime profit: {lifetimeProfit < 0 ? `− ₹${Math.abs(lifetimeProfit).toFixed(2)}` : `₹${lifetimeProfit.toFixed(2)}`}
          </span>
        </article>
        <article className="stat-card stat-card-neutral">
          <span className="stat-card-label">Active branches</span>
          <p className="stat-card-value">{activeBranches.length}</p>
          <span className="stat-card-hint">
            {overview.activeProductCount} medicines in master
          </span>
        </article>
      </div>

      <div className="billing-card dashboard-analytics-panel">
        <div className="dashboard-section-head">
          <h3>Period analytics</h3>
          <p>Shop-wise net sales, stock purchases (deducted), and total profit.</p>
        </div>
        <div className="period-toggle">
          {["day", "week", "month"].map((p) => (
            <button
              key={p}
              type="button"
              className={
                analyticsPeriod === p ? "primary-button" : "secondary-button"
              }
              onClick={() => setAnalyticsPeriod(p)}
            >
              {p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
        {analytics?.overall && (
          <div className="dashboard-overall-strip">
            <div>
              <span>Billed gross</span>
              <strong>₹{Number(analytics.overall.grossBilled).toFixed(2)}</strong>
            </div>
            <div>
              <span>Returns</span>
              <strong>− ₹{Number(analytics.overall.customerReturns).toFixed(2)}</strong>
            </div>
            <div>
              <span>Net sales</span>
              <strong>₹{Number(analytics.overall.netTotal).toFixed(2)}</strong>
            </div>
            <div>
              <span>Stock purchases</span>
              <strong className="metric-purchase">
                − ₹{Number(analytics.overall.stockPurchases).toFixed(2)}
              </strong>
            </div>
            <div>
              <span>Total profit</span>
              <strong className={overallProfit < 0 ? "metric-profit-negative" : "metric-profit-positive"}>
                {overallProfit < 0
                  ? `− ₹${Math.abs(overallProfit).toFixed(2)}`
                  : `₹${overallProfit.toFixed(2)}`}
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Visual Analytics Charts & Graphs for Branch Performance */}
      <div className="charts-grid-2col">
        <DonutChart
          title={`Branch Sales Share (${analytics?.label || "Selected Period"})`}
          data={
            branchSalesShareData.some((d) => d.value > 0)
              ? branchSalesShareData
              : lifetimeSalesShareData
          }
          centerLabel="Branch Sales"
        />
        <BarChart
          title={`Branch Sales, Purchases & Total Profit (${analytics?.label || "Selected Period"})`}
          categories={branchCategories}
          series={branchBarSeries}
        />
      </div>

      {analytics?.charts && (
        <>
          <div className="charts-grid-2col" style={{ marginTop: "20px" }}>
            <AreaLineChart
              title="Daily Sales Trend — All Branches (This Month)"
              points={dailyTrendPoints}
              color="#2563eb"
            />
            <DonutChart
              title={`Payment Mode Breakdown (${analytics?.label || "Selected Period"})`}
              data={paymentMixData}
              centerLabel="Billed Sales"
            />
          </div>
          <div style={{ marginTop: "20px", marginBottom: "22px" }}>
            <HorizontalBarChart
              title={`Top Selling Medicines — All Branches (${analytics?.label || "Selected Period"})`}
              items={topMedicineItems}
              color="#10b981"
            />
          </div>
        </>
      )}

      {analytics?.byBranch?.length > 0 && (
        <div className="table-card">
          <h3>Branch-wise — {analytics.label}</h3>
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Billed</th>
                  <th>Unbilled</th>
                  <th>Returns</th>
                  <th>Net sales</th>
                  <th>Stock purchases</th>
                  <th>Total profit</th>
                </tr>
              </thead>
              <tbody>
                {analytics.byBranch.map((row) => {
                  const rowProfit = Number(
                    row.totalProfit ?? (Number(row.netTotal || 0) - Number(row.stockPurchases || 0))
                  );
                  return (
                    <tr key={row.branchId}>
                      <td>{row.branchName}</td>
                      <td>₹{Number(row.grossBilled).toFixed(2)}</td>
                      <td>₹{Number(row.unbilledTotal).toFixed(2)}</td>
                      <td>− ₹{Number(row.customerReturns).toFixed(2)}</td>
                      <td>₹{Number(row.netTotal).toFixed(2)}</td>
                      <td className="metric-purchase">
                        − ₹{Number(row.stockPurchases || 0).toFixed(2)}
                      </td>
                      <td>
                        <strong
                          className={
                            rowProfit < 0 ? "metric-profit-negative" : "metric-profit-positive"
                          }
                        >
                          {rowProfit < 0
                            ? `− ₹${Math.abs(rowProfit).toFixed(2)}`
                            : `₹${rowProfit.toFixed(2)}`}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="notice-card">
        <h3>Branch performance</h3>
        <p>Select a branch for invoice-level sales (read-only).</p>
      </div>

      <div className="dashboard-grid">
        {(overview.branches || []).map((branch) => {
          const sales = salesMap.get(Number(branch.branch_id));
          return (
            <button
              key={branch.branch_id}
              type="button"
              className="info-card branch-tile-button"
              disabled={!branch.is_active}
              onClick={() =>
                onSelectBranchSales({
                  id: branch.branch_id,
                  name: branch.branch_name,
                  code: branch.branch_code,
                  gstin: branch.gstin,
                })
              }
            >
              <span className="card-label">{branch.branch_code}</span>
              <h3>{branch.branch_name}</h3>
              <p>GSTIN: {branch.gstin}</p>
              <p>
                Net sales: ₹{Number(sales?.total_sales || 0).toFixed(2)} (
                {sales?.sale_count || 0} bills)
              </p>
              {!branch.is_active && (
                <span className="status-badge status-warning">Inactive</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function AdminBranchSales({ apiUrl, token, branch, onBack }) {
  const [sales, setSales] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [alertCounts, setAlertCounts] = useState({ low: 0, expiry: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!branch?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [anRes, alRes] = await Promise.all([
          fetch(`${apiUrl}/api/analytics/branch?branchId=${branch.id}`, {
            headers: authHeaders(token),
          }),
          fetch(`${apiUrl}/api/alerts?branchId=${branch.id}`, {
            headers: authHeaders(token),
          }),
        ]);
        const anData = await anRes.json();
        const alData = await alRes.json();
        if (!cancelled && anRes.ok) {
          setAnalytics(anData.analytics || null);
          setCharts(anData.charts || null);
        }
        if (!cancelled && alRes.ok) {
          setAlertCounts({
            low: (alData.lowStock || []).length,
            expiry: (alData.expiryAlerts || []).length,
          });
        }
      } catch {
        /* analytics optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, token, branch?.id]);

  const loadSales = useCallback(async (searchTerm = "") => {
    if (!branch?.id) return;
    setLoading(true);
    setError("");
    try {
      const q = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : "";
      const res = await fetch(
        `${apiUrl}/api/admin/sales?branchId=${branch.id}${q}`,
        { headers: authHeaders(token) }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load sales.");
      setSales(data.sales || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, branch?.id]);

  useEffect(() => {
    loadSales(search);
  }, [loadSales, search]);

  const month = analytics?.month;
  const monthProfit = Number(
    month?.totalProfit ??
      Number(month?.netTotal || 0) - Number(month?.stockPurchases || 0)
  );
  const periodBarCategories = ["Today", "This Week", "This Month"];
  const periodBarSeries = [
    {
      name: "Net Sales",
      color: "#2563eb",
      data: [
        Number(analytics?.day?.netTotal || 0),
        Number(analytics?.week?.netTotal || 0),
        Number(analytics?.month?.netTotal || 0),
      ],
    },
    {
      name: "Stock Purchases (−)",
      color: "#f59e0b",
      data: [
        Number(analytics?.day?.stockPurchases || 0),
        Number(analytics?.week?.stockPurchases || 0),
        Number(analytics?.month?.stockPurchases || 0),
      ],
    },
    {
      name: "Total Profit",
      color: "#10b981",
      data: [
        Number(analytics?.day?.totalProfit ?? (Number(analytics?.day?.netTotal || 0) - Number(analytics?.day?.stockPurchases || 0))),
        Number(analytics?.week?.totalProfit ?? (Number(analytics?.week?.netTotal || 0) - Number(analytics?.week?.stockPurchases || 0))),
        monthProfit,
      ],
    },
  ];

  return (
    <div className="billing-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BRANCH DASHBOARD &amp; ANALYTICS</p>
          <h2>{branch?.name}</h2>
          <p>
            {branch?.code} · GSTIN {branch?.gstin || "—"}
          </p>
        </div>
        <button type="button" className="secondary-button" onClick={onBack}>
          ← Back
        </button>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      {analytics && (
        <>
          <div className="dashboard-kpi-grid">
            <article className="stat-card stat-card-sales">
              <span className="stat-card-label">Net sales (this month)</span>
              <p className="stat-card-value">
                ₹{Number(month?.netTotal || 0).toFixed(2)}
              </p>
              <span className="stat-card-hint">Billed + unbilled − returns</span>
            </article>
            <article className="stat-card stat-card-purchase">
              <span className="stat-card-label">Stock purchases (this month)</span>
              <p className="stat-card-value">
                − ₹{Number(month?.stockPurchases || 0).toFixed(2)}
              </p>
              <span className="stat-card-hint">Supplier stock cost (deducted)</span>
            </article>
            <article className="stat-card stat-card-profit">
              <span className="stat-card-label">Total profit (this month)</span>
              <p
                className={`stat-card-value ${
                  monthProfit < 0 ? "metric-profit-negative" : "metric-profit-positive"
                }`}
              >
                {formatSignedRupees(monthProfit)}
              </p>
              <span className="stat-card-hint">Net sales − stock purchases</span>
            </article>
            <article className="stat-card stat-card-alert">
              <span className="stat-card-label">Alerts</span>
              <p className="stat-card-value">{alertCounts.low + alertCounts.expiry}</p>
              <span className="stat-card-hint">
                {alertCounts.low} low stock · {alertCounts.expiry} expiry
              </span>
            </article>
          </div>

          <div className="charts-grid-2col">
            <ProfitSummaryCard analytics={analytics} />
            <BarChart
              title="Sales, Purchases & Total Profit (Day / Week / Month)"
              categories={periodBarCategories}
              series={periodBarSeries}
            />
          </div>

          <ExtraDashboardCharts charts={charts} />

          <div className="dashboard-grid dashboard-grid-metrics" style={{ marginBottom: "22px" }}>
            <MetricGrid title={analytics?.day?.label || "Today"} data={analytics?.day} />
            <MetricGrid title={analytics?.week?.label || "This week"} data={analytics?.week} />
            <MetricGrid
              title={analytics?.month?.label || "This month"}
              data={analytics?.month}
              highlight
            />
          </div>
        </>
      )}

      <div className="table-card">
        <div className="table-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <h3>Invoices & Sales (by Patient Name / Invoice)</h3>
            <p>{sales.length} record(s) found</p>
          </div>
          <div style={{ minWidth: "280px" }}>
            <input
              type="search"
              placeholder="Search by patient name, mobile, invoice…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            />
          </div>
        </div>

        {loading ? (
          <p className="empty-state">Loading sales…</p>
        ) : sales.length === 0 ? (
          <p className="empty-state">
            {search ? `No sales match "${search}".` : "No finalized sales for this branch yet."}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Patient Name</th>
                  <th>Invoice #</th>
                  <th>Type</th>
                  <th>Payment</th>
                  <th>Billed</th>
                  <th>Returns</th>
                  <th>Net</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => {
                  const retTotal = Number(sale.returnedTotal ?? sale.returned_total ?? 0);
                  const retCount = Number(sale.returnCount ?? sale.return_count ?? 0);
                  const netTotal = Number(
                    sale.netTotal ?? sale.net_total ?? Math.max(0, Number(sale.grand_total) - retTotal)
                  );
                  return (
                    <tr key={sale.sale_id}>
                      <td>
                        {sale.sale_datetime
                          ? String(sale.sale_datetime).slice(0, 16)
                          : "—"}
                      </td>
                      <td>
                        <strong>{sale.patientName || sale.patient_name || "Walk-in Patient"}</strong>
                        {(sale.patientMobile || sale.patient_mobile) && (
                          <div style={{ fontSize: "12px", color: "#64748b" }}>
                            {sale.patientMobile || sale.patient_mobile}
                          </div>
                        )}
                      </td>
                      <td>{sale.invoice_number || `#${sale.sale_id}`}</td>
                      <td>{sale.sale_type}</td>
                      <td>{sale.payment_method}</td>
                      <td>₹{Number(sale.grand_total).toFixed(2)}</td>
                      <td>
                        {retTotal > 0 ? (
                          <span className="status-badge status-danger">
                            −₹{retTotal.toFixed(2)} ({retCount})
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <strong>₹{netTotal.toFixed(2)}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AdminMedicineMaster({ apiUrl, token }) {
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (term = "") => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        if (term.trim()) params.set("search", term.trim());
        const res = await fetch(
          `${apiUrl}/api/products?${params.toString()}`,
          { headers: authHeaders(token) }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load products.");
        setProducts(data.products || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, token]
  );

  useEffect(() => {
    load("");
  }, [load]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SHARED CATALOG</p>
          <h2>Medicine Master</h2>
          <p>Same product data for all branches (read-only for admin).</p>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="table-card">
        <div className="table-toolbar">
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              load(search);
            }}
          >
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, brand, or salt…"
            />
            <button type="submit" className="secondary-button">
              Search
            </button>
          </form>
        </div>

        {loading ? (
          <p className="empty-state">Loading products…</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Brand / Salt</th>
                  <th>Strength</th>
                  <th>HSN</th>
                  <th>GST %</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <strong>{p.product_name}</strong>
                      <small>{p.packaging || ""}</small>
                    </td>
                    <td>
                      {p.brand || "—"}
                      <small>{p.salt_name || ""}</small>
                    </td>
                    <td>
                      {p.strength || "—"} {p.dosage_form || ""}
                    </td>
                    <td>{p.default_hsn_code || "—"}</td>
                    <td>{Number(p.default_gst_rate).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function AdminInventoryReadOnly({
  apiUrl,
  token,
  branches,
  loadInventory,
  inventory,
  loadingInventory,
  inventoryError,
  inventorySearch,
  setInventorySearch,
}) {
  const [branchFilter, setBranchFilter] = useState("");

  useEffect(() => {
    loadInventory(inventorySearch, branchFilter);
  }, [branchFilter]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">STOCK (READ-ONLY)</p>
          <h2>Branch inventory</h2>
          <p>View stock by branch; admin cannot modify quantities.</p>
        </div>
        <label className="branch-filter">
          Branch
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="">All branches</option>
            {branches
              .filter((b) => b.is_active)
              .map((b) => (
                <option key={b.branch_id} value={String(b.branch_id)}>
                  {b.branch_name}
                </option>
              ))}
          </select>
        </label>
      </div>

      {inventoryError && (
        <div className="error-message" role="alert">
          {inventoryError}
        </div>
      )}

      <div className="table-card">
        <div className="table-toolbar">
          <form
            className="search-form"
            onSubmit={(e) => {
              e.preventDefault();
              loadInventory(inventorySearch, branchFilter);
            }}
          >
            <input
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              placeholder="Search medicine or batch…"
            />
            <button type="submit" className="secondary-button">
              Search
            </button>
          </form>
        </div>

        {loadingInventory ? (
          <p className="empty-state">Loading inventory…</p>
        ) : inventory.length === 0 ? (
          <p className="empty-state">No stock records found.</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th>Selling</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((item) => (
                  <tr key={`${item.branch_id}-${item.batch_id}`}>
                    <td>{item.branch_name}</td>
                    <td>
                      <strong>{item.product_name}</strong>
                    </td>
                    <td>{item.batch_number}</td>
                    <td>
                      {item.expiry_date
                        ? String(item.expiry_date).slice(0, 10)
                        : "—"}
                    </td>
                    <td>{item.quantity}</td>
                    <td>₹{Number(item.selling_price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function AdminBranches({ apiUrl, token, onBranchesChanged, onSelectBranch }) {
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    branchCode: "",
    branchName: "",
    legalName: "Kiara Medicals",
    address: "",
    phone: "",
    gstin: "",
    invoicePrefix: "KM",
  });

  const [editingBranch, setEditingBranch] = useState(null);
  const [editForm, setEditForm] = useState({
    branchName: "",
    legalName: "",
    phone: "",
    address: "",
    invoicePrefix: "",
  });

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`${apiUrl}/api/admin/branches`, {
      headers: authHeaders(token),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load branches.");
    setBranches(data.branches || []);
    onBranchesChanged?.(data.branches || []);
  }, [apiUrl, token, onBranchesChanged]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  function startEdit(branch) {
    setEditingBranch(branch);
    setEditForm({
      branchName: branch.branch_name || "",
      legalName: branch.legal_name || "",
      phone: branch.phone || "",
      address: branch.address || "",
      invoicePrefix: branch.invoice_prefix || "KM",
    });
  }

  async function handleUpdateBranch(e) {
    e.preventDefault();
    if (!editingBranch) return;
    setError("");
    setMessage("");
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/branches/${editingBranch.branch_id}`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify(editForm),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not update branch.");
      setMessage("Branch details updated successfully.");
      setEditingBranch(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/admin/branches`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not create branch.");
      setMessage(data.message);
      setForm({
        branchCode: "",
        branchName: "",
        legalName: "Kiara Medicals",
        address: "",
        phone: "",
        gstin: "",
        invoicePrefix: "KM",
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(branch) {
    setError("");
    setMessage("");
    try {
      const res = await fetch(
        `${apiUrl}/api/admin/branches/${branch.branch_id}`,
        {
          method: "PATCH",
          headers: authHeaders(token),
          body: JSON.stringify({ isActive: !branch.is_active }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed.");
      setMessage(data.message);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ORGANIZATION</p>
          <h2>Branches</h2>
          <p>Click any branch to view its dashboard &amp; analytics, or add/edit branches below.</p>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {message && <div className="notice-card">{message}</div>}

      <div className="table-card">
        <table className="products-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>GSTIN</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr
                key={b.branch_id}
                className={onSelectBranch ? "clickable-branch-row" : ""}
                onClick={() =>
                  onSelectBranch?.({
                    id: b.branch_id,
                    name: b.branch_name,
                    code: b.branch_code,
                    gstin: b.gstin,
                  })
                }
              >
                <td>{b.branch_code}</td>
                <td>
                  <strong>{b.branch_name}</strong>
                  {b.legal_name && (
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {b.legal_name}
                    </div>
                  )}
                </td>
                <td>{b.gstin}</td>
                <td>{b.is_active ? "Active" : "Inactive"}</td>
                <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                  {onSelectBranch && (
                    <button
                      type="button"
                      className="primary-button"
                      style={{ marginRight: "8px", minHeight: "36px", padding: "6px 12px" }}
                      onClick={() =>
                        onSelectBranch({
                          id: b.branch_id,
                          name: b.branch_name,
                          code: b.branch_code,
                          gstin: b.gstin,
                        })
                      }
                    >
                      Dashboard
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ marginRight: "8px" }}
                    onClick={() => startEdit(b)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => toggleActive(b)}
                  >
                    {b.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingBranch && (
        <div className="billing-card" style={{ border: "2px solid #3b82f6", background: "#f8fafc" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0 }}>Edit Branch: {editingBranch.branch_code}</h3>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setEditingBranch(null)}
            >
              Cancel
            </button>
          </div>
          <form className="billing-grid" onSubmit={handleUpdateBranch}>
            <label>
              Display Name *
              <input
                required
                value={editForm.branchName}
                onChange={(e) =>
                  setEditForm({ ...editForm, branchName: e.target.value })
                }
                placeholder="Kiara Medicals A"
              />
            </label>
            <label>
              Legal Name
              <input
                value={editForm.legalName}
                onChange={(e) =>
                  setEditForm({ ...editForm, legalName: e.target.value })
                }
                placeholder="Kiara Medicals A Pvt Ltd"
              />
            </label>
            <label>
              Invoice Prefix
              <input
                value={editForm.invoicePrefix}
                onChange={(e) =>
                  setEditForm({ ...editForm, invoicePrefix: e.target.value.toUpperCase() })
                }
                placeholder="KM-A"
              />
            </label>
            <label>
              Phone
              <input
                value={editForm.phone}
                onChange={(e) =>
                  setEditForm({ ...editForm, phone: e.target.value })
                }
                placeholder="08025551234"
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Address
              <input
                value={editForm.address}
                onChange={(e) =>
                  setEditForm({ ...editForm, address: e.target.value })
                }
                placeholder="Full address"
              />
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: "10px", marginTop: "10px" }}>
              <button type="submit" className="primary-button">
                Save Branch Changes
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditingBranch(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="billing-card">
        <h3>Add branch</h3>
        <form className="billing-grid" onSubmit={handleCreate}>
          <label>
            Branch code *
            <input
              required
              value={form.branchCode}
              onChange={(e) =>
                setForm({ ...form, branchCode: e.target.value })
              }
              placeholder="BR004"
            />
          </label>
          <label>
            Display name *
            <input
              required
              value={form.branchName}
              onChange={(e) =>
                setForm({ ...form, branchName: e.target.value })
              }
            />
          </label>
          <label>
            Legal name *
            <input
              required
              value={form.legalName}
              onChange={(e) =>
                setForm({ ...form, legalName: e.target.value })
              }
            />
          </label>
          <label>
            GSTIN (15 chars) *
            <input
              required
              value={form.gstin}
              onChange={(e) =>
                setForm({ ...form, gstin: e.target.value.toUpperCase() })
              }
              placeholder="29AABCU9603R1ZM"
            />
          </label>
          <label>
            Address
            <input
              value={form.address}
              onChange={(e) =>
                setForm({ ...form, address: e.target.value })
              }
            />
          </label>
          <label>
            Phone
            <input
              value={form.phone}
              onChange={(e) =>
                setForm({ ...form, phone: e.target.value })
              }
            />
          </label>
          <button type="submit" className="primary-button">
            Create branch
          </button>
        </form>
      </div>
    </>
  );
}

export function AdminUsers({ apiUrl, token, branches }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    username: "",
    password: "",
    fullName: "",
    role: "SHOP_USER",
    branchId: "",
  });

  const load = useCallback(async () => {
    const res = await fetch(`${apiUrl}/api/admin/users`, {
      headers: authHeaders(token),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to load users.");
    setUsers(data.users || []);
  }, [apiUrl, token]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const payload = {
        username: form.username,
        password: form.password,
        fullName: form.fullName,
        role: form.role,
        branchId:
          form.role !== "ADMIN" ? Number(form.branchId) : null,
      };
      const res = await fetch(`${apiUrl}/api/admin/users`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not create user.");
      setMessage(data.message);
      setForm({
        username: "",
        password: "",
        fullName: "",
        role: "SHOP_USER",
        branchId: "",
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  const activeBranches = branches.filter((b) => b.is_active);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ACCESS CONTROL</p>
          <h2>Users</h2>
          <p>Add shop users (branch-bound) or additional admins.</p>
        </div>
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      {message && <div className="notice-card">{message}</div>}

      <div className="table-card">
        <table className="products-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Branch</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const roleLabel =
                u.role === "ADMIN"
                  ? "Admin"
                  : u.role === "SHOP_MANAGER"
                  ? "Shop Manager"
                  : "Shop User";
              const roleBadgeClass =
                u.role === "ADMIN"
                  ? "role-badge"
                  : u.role === "SHOP_MANAGER"
                  ? "status-badge status-warning"
                  : "status-badge";

              return (
                <tr key={u.user_id}>
                  <td><strong>{u.full_name}</strong></td>
                  <td><code>{u.username}</code></td>
                  <td>
                    <span className={roleBadgeClass} style={{ fontSize: "11px", padding: "3px 8px" }}>
                      {roleLabel}
                    </span>
                  </td>
                  <td>{u.branch_name || "—"}</td>
                  <td>{u.is_active ? "Yes" : "No"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="billing-card">
        <h3>Add user</h3>
        <form className="billing-grid" onSubmit={handleCreate}>
          <label>
            Full name *
            <input
              required
              value={form.fullName}
              onChange={(e) =>
                setForm({ ...form, fullName: e.target.value })
              }
            />
          </label>
          <label>
            Username *
            <input
              required
              value={form.username}
              onChange={(e) =>
                setForm({ ...form, username: e.target.value })
              }
            />
          </label>
          <label>
            Password (min 8) *
            <input
              required
              type="password"
              minLength={8}
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
            />
          </label>
          <label>
            Role *
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value })
              }
            >
              <option value="SHOP_MANAGER">Shop Manager (Full Operations)</option>
              <option value="SHOP_USER">Shop User (Branch Operations)</option>
              <option value="ADMIN">Admin (All Branches)</option>
            </select>
          </label>
          {form.role !== "ADMIN" && (
            <label>
              Branch *
              <select
                required
                value={form.branchId}
                onChange={(e) =>
                  setForm({ ...form, branchId: e.target.value })
                }
              >
                <option value="">Select branch</option>
                {activeBranches.map((b) => (
                  <option key={b.branch_id} value={String(b.branch_id)}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" className="primary-button">
            Create user
          </button>
        </form>
      </div>
    </>
  );
}
