import { useCallback, useEffect, useState } from "react";
import { MedicineSearchRow } from "./MedicineSearchRow.jsx";
import {
  AreaLineChart,
  BarChart,
  DonutChart,
  HorizontalBarChart,
} from "./components/AnalyticsCharts.jsx";
import { numberToWordsIndian } from "./utils/numberToWords.js";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readJsonResponse(response, fallbackMessage) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      fallbackMessage ||
        "Server returned HTML instead of JSON. Is the API running on port 5001?"
    );
  }
}

function formatSignedRupees(value) {
  const num = Number(value || 0);
  if (num < 0) return `− ₹${Math.abs(num).toFixed(2)}`;
  return `₹${num.toFixed(2)}`;
}

function MetricGrid({ title, data, highlight }) {
  if (!data) return null;
  const netSales = Number(data.netTotal || 0);
  const stockPurchases = Number(data.stockPurchases || 0);
  const totalProfit = Number(
    data.totalProfit ?? Number((netSales - stockPurchases).toFixed(2))
  );
  return (
    <article
      className={`metric-period-card${highlight ? " metric-period-card-highlight" : ""}`}
    >
      <h3>{title}</h3>
      <div className="metric-period-rows">
        <div className="metric-period-row">
          <span>Billed sales</span>
          <strong>₹{Number(data.grossBilled || 0).toFixed(2)}</strong>
        </div>
        <div className="metric-period-row">
          <span>Unbilled sales</span>
          <strong>₹{Number(data.unbilledTotal || 0).toFixed(2)}</strong>
        </div>
        <div className="metric-period-row">
          <span>Customer returns</span>
          <strong>− ₹{Number(data.customerReturns || 0).toFixed(2)}</strong>
        </div>
        <div className="metric-period-row">
          <span>Net sales</span>
          <strong>₹{netSales.toFixed(2)}</strong>
        </div>
        <div className="metric-period-row">
          <span>Stock purchases</span>
          <strong className="metric-purchase">
            − ₹{stockPurchases.toFixed(2)}
          </strong>
        </div>
        <div className="metric-period-row metric-period-net">
          <span>Total profit</span>
          <strong className={totalProfit < 0 ? "metric-profit-negative" : "metric-profit-positive"}>
            {formatSignedRupees(totalProfit)}
          </strong>
        </div>
      </div>
    </article>
  );
}

function ProfitSummaryCard({ analytics }) {
  const rows = [
    { key: "day", label: analytics?.day?.label || "Today" },
    { key: "week", label: analytics?.week?.label || "This week" },
    { key: "month", label: analytics?.month?.label || "This month" },
  ];

  return (
    <div className="chart-container profit-summary-card">
      <h4 className="chart-title">Total Profit Summary (Net Sales − Stock Purchases)</h4>
      <div className="profit-rows">
        {rows.map(({ key, label }) => {
          const d = analytics?.[key] || {};
          const netSales = Number(d.netTotal || 0);
          const purchases = Number(d.stockPurchases || 0);
          const profit = Number(d.totalProfit ?? (netSales - purchases));
          return (
            <div key={key} className="profit-period-row">
              <div>
                <strong>{label}</strong>
                <small>
                  Net sales ₹{netSales.toFixed(2)} − Purchases ₹{purchases.toFixed(2)}
                </small>
              </div>
              <strong
                className={`profit-period-amount ${
                  profit < 0 ? "metric-profit-negative" : "metric-profit-positive"
                }`}
              >
                {formatSignedRupees(profit)}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useBranchAnalytics(apiUrl, token) {
  const [analytics, setAnalytics] = useState(null);
  const [charts, setCharts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/analytics/branch`, {
          headers: headers(token),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load analytics.");
        setAnalytics(data.analytics);
        setCharts(data.charts || null);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [apiUrl, token]);

  return { analytics, charts, error };
}

const PAYMENT_COLORS = {
  UPI: "#10b981",
  CASH: "#2563eb",
  CARD: "#8b5cf6",
  OTHER: "#f59e0b",
};

function ExtraDashboardCharts({ charts }) {
  if (!charts) return null;

  const paymentData = (charts.paymentMix || []).map((p) => ({
    label: `${p.paymentMethod} (${p.billCount})`,
    value: Number(p.total || 0),
    color: PAYMENT_COLORS[p.paymentMethod] || "#64748b",
  }));

  const trendPoints = (charts.dailyTrend || []).map((d) => ({
    label: d.label,
    date: d.date,
    value: Number(d.total || 0),
    sub: `${d.billCount} bill${d.billCount === 1 ? "" : "s"}`,
  }));

  const topMedItems = (charts.topMedicines || []).map((m) => ({
    label: m.productName,
    sub: `${m.unitsSold} units`,
    value: Number(m.revenue || 0),
  }));

  return (
    <>
      <div className="charts-grid-2col" style={{ marginTop: "20px" }}>
        <AreaLineChart
          title="Daily Sales Trend (This Month)"
          points={trendPoints}
          color="#2563eb"
        />
        <DonutChart
          title="Payment Mode Breakdown (This Month)"
          data={paymentData}
          centerLabel="Billed Sales"
        />
      </div>
      <div style={{ marginTop: "20px", marginBottom: "22px" }}>
        <HorizontalBarChart
          title="Top Selling Medicines (This Month)"
          items={topMedItems}
          color="#10b981"
        />
      </div>
    </>
  );
}

export function ShopDashboard({ apiUrl, token, branchName, userName }) {
  const { analytics, charts, error } = useBranchAnalytics(apiUrl, token);
  const [alertCounts, setAlertCounts] = useState({ low: 0, expiry: 0 });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/alerts`, {
          headers: headers(token),
        });
        const data = await res.json();
        if (res.ok) {
          setAlertCounts({
            low: (data.lowStock || []).length,
            expiry: (data.expiryAlerts || []).length,
          });
        }
      } catch {
        /* optional */
      }
    })();
  }, [apiUrl, token]);

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
    <>
      <section className="dashboard-hero">
        <div className="dashboard-hero-text">
          <p className="eyebrow">Branch dashboard</p>
          <h2>{branchName || "Your branch"}</h2>
          <p>Welcome back, {userName}. Here is how your shop is performing.</p>
        </div>
        <span className="role-badge">Shop</span>
      </section>

      {error && <div className="error-message">{error}</div>}

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
          <p className="stat-card-value">
            {alertCounts.low + alertCounts.expiry}
          </p>
          <span className="stat-card-hint">
            {alertCounts.low} low stock · {alertCounts.expiry} expiry
          </span>
        </article>
      </div>

      {!analytics && !error && <p className="empty-state">Loading metrics…</p>}

      {analytics && (
        <>
          <div className="charts-grid-2col">
            <ProfitSummaryCard analytics={analytics} />
            <BarChart
              title="Sales, Purchases & Total Profit (Day / Week / Month)"
              categories={periodBarCategories}
              series={periodBarSeries}
            />
          </div>
          <ExtraDashboardCharts charts={charts} />
        </>
      )}

      <div className="dashboard-section-head">
        <h3>Sales, purchases &amp; profit by period</h3>
        <p>Stock purchases are subtracted from net sales to compute total profit.</p>
      </div>
      <div className="dashboard-grid dashboard-grid-metrics">
        <MetricGrid title={analytics?.day?.label || "Today"} data={analytics?.day} />
        <MetricGrid
          title={analytics?.week?.label || "This week"}
          data={analytics?.week}
        />
        <MetricGrid
          title={analytics?.month?.label || "This month"}
          data={analytics?.month}
          highlight
        />
      </div>
    </>
  );
}

export function ShopAnalytics({ apiUrl, token }) {
  const { analytics, charts, error } = useBranchAnalytics(apiUrl, token);

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
        Number(analytics?.month?.totalProfit ?? (Number(analytics?.month?.netTotal || 0) - Number(analytics?.month?.stockPurchases || 0))),
      ],
    },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPORTS</p>
          <h2>Branch analytics</h2>
          <p>Daily, weekly, and monthly sales, stock purchases, and total profit.</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {!analytics && !error && <p className="empty-state">Loading…</p>}

      {analytics && (
        <>
          <div className="charts-grid-2col">
            <ProfitSummaryCard analytics={analytics} />
            <BarChart
              title="Sales, Purchases & Total Profit (Day / Week / Month)"
              categories={periodBarCategories}
              series={periodBarSeries}
            />
          </div>
          <ExtraDashboardCharts charts={charts} />
        </>
      )}

      <div className="dashboard-grid dashboard-grid-metrics">
        <MetricGrid title={analytics?.day?.label || "Today"} data={analytics?.day} />
        <MetricGrid title={analytics?.week?.label || "This week"} data={analytics?.week} />
        <MetricGrid
          title={analytics?.month?.label || "This month"}
          data={analytics?.month}
          highlight
        />
      </div>
    </>
  );
}

export function ShopAlerts({ apiUrl, token }) {
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/alerts`, { headers: headers(token) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load alerts.");
        setAlerts(data);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [apiUrl, token]);

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ALERTS</p>
          <h2>Low stock & expiry</h2>
          <p>Usable stock threshold: ≤10 units · Expiry window: Going to expire within 1 month (0–30 days).</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="table-card">
        <h3>Low stock medicines ({alerts?.lowStock?.length || 0})</h3>
        {!alerts?.lowStock?.length ? (
          <p className="empty-state">No low-stock alerts.</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Rack</th>
                  <th>Stock left</th>
                  <th>Threshold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {alerts.lowStock.map((row) => {
                  const qtyLeft = Number(row.total_smallest_units || 0);
                  const threshold = Number(row.low_stock_threshold ?? 10);
                  const unitLabel = row.smallest_unit_label || "units";
                  const statusLabel =
                    qtyLeft === 0
                      ? "Out of stock"
                      : qtyLeft <= 5
                        ? "Critical"
                        : "Low stock";
                  return (
                    <tr key={`${row.product_id}-${row.branch_id}`}>
                      <td>
                        <strong>{row.product_name}</strong>
                        {(row.brand || row.strength) && (
                          <small>
                            {[row.brand, row.strength].filter(Boolean).join(" · ")}
                          </small>
                        )}
                      </td>
                      <td>{row.rack_code || "—"}</td>
                      <td>
                        <strong>{qtyLeft}</strong> {unitLabel}
                      </td>
                      <td>
                        ≤ {threshold} {unitLabel}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            qtyLeft === 0 ? "status-danger" : "status-warning"
                          }`}
                        >
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="table-card">
        <h3>Expiring within 1 month ({alerts?.expiryAlerts?.length || 0})</h3>
        {!alerts?.expiryAlerts?.length ? (
          <p className="empty-state">No batches expiring within the next 30 days.</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Batch</th>
                  <th>Stock left</th>
                  <th>Expiry date</th>
                  <th>Days left</th>
                </tr>
              </thead>
              <tbody>
                {alerts.expiryAlerts.map((row) => {
                  const daysLeft = Number(row.days_to_expiry ?? 0);
                  return (
                    <tr key={row.batch_id}>
                      <td>
                        <strong>{row.product_name}</strong>
                        {(row.brand || row.strength) && (
                          <small>
                            {[row.brand, row.strength].filter(Boolean).join(" · ")}
                          </small>
                        )}
                      </td>
                      <td>{row.batch_number}</td>
                      <td>
                        {row.available_units ?? row.quantity}{" "}
                        {row.smallest_unit_label || "units"}
                      </td>
                      <td>{String(row.expiry_date).slice(0, 10)}</td>
                      <td>
                        <span
                          className={`status-badge ${
                            daysLeft <= 7 ? "status-danger" : "status-warning"
                          }`}
                        >
                          {daysLeft === 0 ? "Expires today" : `${daysLeft} days`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

const emptyPurchaseLine = () => ({
  productId: "",
  batchNumber: "",
  expiryDate: "",
  quantityPacks: "1",
  purchasePrice: "",
  mrp: "",
  sellingPrice: "",
});

export function PurchaseStock({ apiUrl, token }) {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [header, setHeader] = useState({
    supplierId: "",
    supplierInvoiceNumber: "",
    paymentMethod: "CASH",
  });
  const [lineDraft, setLineDraft] = useState(emptyPurchaseLine());
  const [productQuery, setProductQuery] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [newSupplier, setNewSupplier] = useState({
    supplierName: "",
    phone: "",
    gstin: "",
    address: "",
  });
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [sRes, pRes, hRes] = await Promise.all([
      fetch(`${apiUrl}/api/purchases/suppliers`, { headers: headers(token) }),
      fetch(`${apiUrl}/api/products`, { headers: headers(token) }),
      fetch(`${apiUrl}/api/purchases`, { headers: headers(token) }),
    ]);
    const sData = await sRes.json();
    const pData = await pRes.json();
    const hData = await hRes.json();
    if (sRes.ok) setSuppliers(sData.suppliers || []);
    if (pRes.ok) setProducts(pData.products || []);
    if (hRes.ok) setHistory(hData.purchases || []);
  }, [apiUrl, token]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function addSupplier(event) {
    event.preventDefault();
    if (savingSupplier) return;
    setError("");
    setMessage("");

    const cleanName = newSupplier.supplierName.trim();
    const cleanPhone = newSupplier.phone.replace(/\D/g, "");
    const cleanGstin = newSupplier.gstin.trim().toUpperCase();

    if (!cleanName) {
      setError("Supplier name is required.");
      return;
    }
    if (!/^\d{10,12}$/.test(cleanPhone)) {
      setError("Supplier phone number must be 10-12 digits so suppliers can be distinguished.");
      return;
    }
    if (cleanGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
      setError("Enter a valid 15-character GSTIN or leave GSTIN blank.");
      return;
    }

    setSavingSupplier(true);
    try {
      const res = await fetch(`${apiUrl}/api/purchases/suppliers`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          supplierName: cleanName,
          phone: cleanPhone,
          gstin: cleanGstin,
          address: newSupplier.address.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setNewSupplier({ supplierName: "", phone: "", gstin: "", address: "" });
      await load();
      if (data.supplierId) {
        setHeader((prev) => ({ ...prev, supplierId: String(data.supplierId) }));
      }
      setMessage(`Supplier "${cleanName}" (${cleanPhone}) saved and selected.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSupplier(false);
    }
  }

  const filteredProducts = products
    .filter((p) => {
      const q = productQuery.trim().toLowerCase();
      if (!q) return true;
      return (
        String(p.product_name || "").toLowerCase().includes(q) ||
        String(p.brand || "").toLowerCase().includes(q) ||
        String(p.salt_name || "").toLowerCase().includes(q) ||
        String(p.strength || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 25);

  const selectedProduct = products.find(
    (p) => Number(p.product_id) === Number(lineDraft.productId)
  );

  function selectPurchaseProduct(product) {
    setLineDraft((prev) => ({ ...prev, productId: String(product.product_id) }));
    setProductQuery(
      `${product.product_name}${product.brand ? ` (${product.brand})` : ""}`
    );
    setProductMenuOpen(false);
  }

  const cartLineTotal = (line) =>
    Number(line.purchasePrice || 0) * Number(line.quantityPacks || 0);

  const purchaseGrandTotal = cart.reduce(
    (sum, line) => sum + cartLineTotal(line),
    0
  );

  function addLineToCart(event) {
    event.preventDefault();
    setError("");
    if (!lineDraft.productId) {
      setError("Search and select a medicine from the dropdown list.");
      return;
    }
    if (!lineDraft.batchNumber.trim()) {
      setError("Batch number is required.");
      return;
    }
    const product = products.find(
      (p) => Number(p.product_id) === Number(lineDraft.productId)
    );
    setCart((prev) => [
      ...prev,
      {
        ...lineDraft,
        productName: product?.product_name || "Medicine",
        quantityPacks: Number(lineDraft.quantityPacks) || 1,
        purchasePrice: Number(lineDraft.purchasePrice),
        mrp: Number(lineDraft.mrp),
        sellingPrice: Number(lineDraft.sellingPrice || lineDraft.mrp),
      },
    ]);
    setLineDraft(emptyPurchaseLine());
    setProductQuery("");
    setProductMenuOpen(false);
  }

  async function savePurchase(event) {
    event.preventDefault();
    if (!cart.length) {
      setError("Add at least one medicine line to the purchase.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        supplierId: Number(header.supplierId),
        supplierInvoiceNumber: header.supplierInvoiceNumber,
        paymentMethod: header.paymentMethod,
        clientTransactionId: crypto.randomUUID(),
        items: cart.map((line) => ({
          productId: Number(line.productId),
          batchNumber: line.batchNumber.trim(),
          expiryDate: line.expiryDate || null,
          quantityPacks: Number(line.quantityPacks),
          purchasePrice: Number(line.purchasePrice),
          mrp: Number(line.mrp),
          sellingPrice: Number(line.sellingPrice || line.mrp),
        })),
      };
      const res = await fetch(`${apiUrl}/api/purchases`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Purchase failed.");
      setMessage(
        `${data.message || "Purchase saved."} Total ₹${Number(data.grandTotal).toFixed(2)} (${cart.length} line(s)).`
      );
      setCart([]);
      setLineDraft(emptyPurchaseLine());
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INVENTORY</p>
          <h2>Purchase stock</h2>
          <p>Supplier → invoice → batch → stock update (SRS 4.3).</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="notice-card">{message}</div>}

      <div className="billing-card">
        <h3>Add new supplier</h3>
        <p className="billing-search-hint">
          Include phone number (and GSTIN/city if available) to distinguish suppliers with similar names.
        </p>
        <form onSubmit={addSupplier}>
          <div className="billing-grid">
            <label>
              Supplier name *
              <input
                value={newSupplier.supplierName}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, supplierName: e.target.value })
                }
                placeholder="e.g. MedPlus Distributors"
                required
              />
            </label>
            <label>
              Phone / Mobile * (10-12 digits)
              <input
                type="tel"
                inputMode="numeric"
                maxLength={12}
                value={newSupplier.phone}
                onChange={(e) =>
                  setNewSupplier({
                    ...newSupplier,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 12),
                  })
                }
                placeholder="10-digit mobile or STD phone"
                required
              />
            </label>
            <label>
              GSTIN (optional)
              <input
                maxLength={15}
                value={newSupplier.gstin}
                onChange={(e) =>
                  setNewSupplier({
                    ...newSupplier,
                    gstin: e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 15),
                  })
                }
                placeholder="15-character GSTIN"
              />
            </label>
            <label>
              Address / City (optional)
              <input
                value={newSupplier.address}
                onChange={(e) =>
                  setNewSupplier({ ...newSupplier, address: e.target.value })
                }
                placeholder="Area or city"
              />
            </label>
          </div>
          <div className="form-actions-row">
            <button
              type="submit"
              className="secondary-button"
              disabled={savingSupplier}
            >
              {savingSupplier ? "Saving supplier…" : "Save supplier"}
            </button>
          </div>
        </form>
      </div>

      <div className="billing-card">
        <h3>Purchase header</h3>
        <div className="billing-grid">
          <label>
            Supplier *
            <select
              required
              value={header.supplierId}
              onChange={(e) =>
                setHeader({ ...header, supplierId: e.target.value })
              }
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                  {s.phone ? ` · ${s.phone}` : ""}
                  {s.gstin ? ` · GSTIN ${s.gstin}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Purchase invoice no. *
            <input
              required
              value={header.supplierInvoiceNumber}
              onChange={(e) =>
                setHeader({ ...header, supplierInvoiceNumber: e.target.value })
              }
              placeholder="Supplier bill / invoice no."
            />
          </label>
          <label>
            Payment
            <select
              value={header.paymentMethod}
              onChange={(e) =>
                setHeader({ ...header, paymentMethod: e.target.value })
              }
            >
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
            </select>
          </label>
        </div>
      </div>

      <div className="billing-card">
        <h3>Add medicine line</h3>
        <p className="billing-search-hint">
          Add each medicine/batch on this supplier invoice, then save once.
        </p>
        <form className="billing-grid" onSubmit={addLineToCart}>
          <label className="patient-field-with-suggest purchase-product-field">
            Medicine / Product *
            <div className="purchase-combobox-wrap">
              <input
                type="search"
                autoComplete="off"
                value={productQuery}
                onFocus={() => setProductMenuOpen(true)}
                onBlur={() => window.setTimeout(() => setProductMenuOpen(false), 180)}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setLineDraft((prev) => ({ ...prev, productId: "" }));
                  setProductMenuOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setProductMenuOpen(false);
                }}
                placeholder="Search & select medicine by name, brand, or salt…"
                required={!lineDraft.productId}
              />
              {lineDraft.productId && (
                <button
                  type="button"
                  className="combobox-clear-btn"
                  aria-label="Clear selected medicine"
                  onClick={() => {
                    setLineDraft((prev) => ({ ...prev, productId: "" }));
                    setProductQuery("");
                    setProductMenuOpen(true);
                  }}
                >
                  ×
                </button>
              )}
            </div>
            {selectedProduct && (
              <small className="purchase-selected-hint">
                Selected: {selectedProduct.product_name}
                {selectedProduct.packaging ? ` · ${selectedProduct.packaging}` : ""}
              </small>
            )}
            {productMenuOpen && (
              <ul className="patient-suggest-list" role="listbox">
                {filteredProducts.length === 0 ? (
                  <li className="patient-suggest-empty">No medicines match “{productQuery}”.</li>
                ) : (
                  filteredProducts.map((p) => (
                    <li key={p.product_id}>
                      <button
                        type="button"
                        className="patient-suggest-item"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectPurchaseProduct(p)}
                      >
                        <strong>
                          {p.product_name}
                          {p.brand ? ` (${p.brand})` : ""}
                        </strong>
                        <span>
                          {[p.salt_name, p.strength, p.packaging].filter(Boolean).join(" · ") ||
                            "Medicine"}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </label>
          <label>
            Batch number *
            <input
              required
              value={lineDraft.batchNumber}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, batchNumber: e.target.value })
              }
            />
          </label>
          <label>
            Expiry date
            <input
              type="date"
              value={lineDraft.expiryDate}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, expiryDate: e.target.value })
              }
            />
          </label>
          <label>
            Qty (packs) *
            <input
              type="number"
              min="1"
              required
              value={lineDraft.quantityPacks}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, quantityPacks: e.target.value })
              }
            />
          </label>
          <label>
            Purchase price / pack *
            <input
              type="number"
              step="0.01"
              required
              value={lineDraft.purchasePrice}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, purchasePrice: e.target.value })
              }
            />
          </label>
          <label>
            MRP *
            <input
              type="number"
              step="0.01"
              required
              value={lineDraft.mrp}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, mrp: e.target.value })
              }
            />
          </label>
          <label>
            Selling price / pack
            <input
              type="number"
              step="0.01"
              value={lineDraft.sellingPrice}
              onChange={(e) =>
                setLineDraft({ ...lineDraft, sellingPrice: e.target.value })
              }
            />
          </label>
          <button type="submit" className="secondary-button">
            Add line to purchase
          </button>
        </form>
      </div>

      <form className="billing-card" onSubmit={savePurchase}>
        <h3>Purchase lines ({cart.length})</h3>
        {cart.length === 0 ? (
          <p className="empty-state">No lines yet — add medicines above.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch</th>
                    <th>Packs</th>
                    <th>Rate/pack</th>
                    <th>Line total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line, index) => (
                    <tr key={`${line.productId}-${line.batchNumber}-${index}`}>
                      <td>{line.productName}</td>
                      <td>{line.batchNumber}</td>
                      <td>{line.quantityPacks}</td>
                      <td>₹{Number(line.purchasePrice).toFixed(2)}</td>
                      <td>₹{cartLineTotal(line).toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="remove-item-button"
                          onClick={() =>
                            setCart((p) => p.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="checkout-total supplier-return-total">
              <span>Purchase total</span>
              <strong>₹{purchaseGrandTotal.toFixed(2)}</strong>
            </div>
            <button
              type="submit"
              className="primary-button save-bill-button"
              disabled={saving || !header.supplierId || !header.supplierInvoiceNumber.trim()}
            >
              {saving ? "Saving…" : "Save purchase & update stock"}
            </button>
          </>
        )}
      </form>

      <div className="table-card">
        <h3>Purchase history</h3>
        <table className="products-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Supplier</th>
              <th>Invoice</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {history.map((p) => (
              <tr key={p.purchase_id}>
                <td>{String(p.purchase_datetime).slice(0, 19)}</td>
                <td>{p.supplier_name}</td>
                <td>{p.supplier_invoice_number}</td>
                <td>₹{Number(p.grand_total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function UnbilledSale({ apiUrl, token, searchMedicines }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [notes, setNotes] = useState("");
  const [billDiscount, setBillDiscount] = useState("0");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setError("");
      try {
        const meds = await searchMedicines(query);
        setResults(meds || []);
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchMedicines]);

  function addLine(medicineResult, unit = "smallest") {
    const packSize = Number(medicineResult.units_per_stock_unit || 1);
    const availableUnits = Number(
      medicineResult.available_smallest_units || 0
    );
    if (availableUnits <= 0) {
      setError("No stock available for this batch.");
      return;
    }
    setError("");
    setCart((previous) => {
      const existing = previous.find(
        (item) => Number(item.batch_id) === Number(medicineResult.batch_id)
      );
      if (existing) {
        return previous.map((item) =>
          Number(item.batch_id) === Number(medicineResult.batch_id)
            ? {
                ...item,
                quantity: Math.min(
                  item.quantity + (unit === "pack" ? packSize : 1),
                  availableUnits
                ),
              }
            : item
        );
      }
      return [
        ...previous,
        {
          ...medicineResult,
          quantity: unit === "pack" ? packSize : 1,
          packSize,
          availableUnits,
          discountAmount: 0,
          gstRate: 5,
        },
      ];
    });
  }

  function updateCartItem(batchId, changes) {
    setCart((previous) =>
      previous.map((item) =>
        Number(item.batch_id) === Number(batchId)
          ? { ...item, ...changes }
          : item
      )
    );
  }

  function removeCartItem(batchId) {
    setCart((previous) =>
      previous.filter((item) => Number(item.batch_id) !== Number(batchId))
    );
  }

  const cartSubtotal = cart.reduce((sum, item) => {
    const unitPrice =
      Number(item.selling_price || 0) / Number(item.packSize || 1);
    return sum + unitPrice * Number(item.quantity || 0);
  }, 0);

  const cartItemDiscount = cart.reduce(
    (sum, item) => sum + Number(item.discountAmount || 0),
    0
  );

  const totalBeforeBillDiscount = Math.max(
    0,
    cartSubtotal - cartItemDiscount
  );

  const finalTotal = Math.max(
    0,
    totalBeforeBillDiscount - Number(billDiscount || 0)
  );

  async function submit() {
    if (!cart.length) {
      setError("Add at least one item.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/billing/unbilled`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          clientTransactionId: crypto.randomUUID(),
          paymentMethod: "NOT_RECORDED",
          notes,
          billDiscount: Number(billDiscount || 0),
          items: cart.map((c) => ({
            batchId: c.batch_id,
            quantity: c.quantity,
            discountAmount: Number(c.discountAmount || 0),
            gstRate: Number(c.gstRate || 5),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMessage(
        `Unbilled sale saved — ₹${Number(data.grandTotal ?? finalTotal).toFixed(2)}`
      );
      setCart([]);
      setNotes("");
      setBillDiscount("0");
      setSearch("");
      setResults([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SALES</p>
          <h2>Unbilled sale</h2>
          <p>Reduce stock without a customer invoice.</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="notice-card">{message}</div>}

      <div className="billing-card">
        <h3>Search medicine</h3>
        <form
          className="billing-search"
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type medicine, brand or salt (min 2 letters)…"
            autoComplete="off"
          />
        </form>
        {search.trim().length > 0 && search.trim().length < 2 && (
          <p className="billing-search-hint">
            Enter at least 2 characters to search.
          </p>
        )}
        {searchLoading && <p className="billing-search-hint">Searching…</p>}
        {!searchLoading &&
          search.trim().length >= 2 &&
          results.length === 0 && (
            <p className="empty-state billing-no-results">No matches found.</p>
          )}
        {results.length > 0 && (
          <div className="billing-results">
            {results.map((item) => (
              <MedicineSearchRow
                key={item.batch_id}
                item={item}
                onAddPack={(row) => addLine(row, "pack")}
                onAddUnit={(row) => addLine(row, "smallest")}
              />
            ))}
          </div>
        )}
      </div>

      <div className="billing-card">
        <h3>Bill items</h3>
        {cart.length === 0 ? (
          <p className="empty-state">Search and add medicines above.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Qty (smallest units)</th>
                    <th>Discount (₹)</th>
                    <th>Line total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => {
                    const unitPrice =
                      Number(item.selling_price) / item.packSize;
                    const lineTotal = Math.max(
                      0,
                      unitPrice * item.quantity -
                        Number(item.discountAmount || 0)
                    );
                    return (
                      <tr key={item.batch_id}>
                        <td>
                          <strong>{item.product_name}</strong>
                          <small>
                            Batch {item.batch_number} · ₹
                            {unitPrice.toFixed(2)} per{" "}
                            {item.smallest_unit_label || "unit"}
                          </small>
                        </td>
                        <td>
                          <input
                            className="billing-number"
                            type="number"
                            min="1"
                            max={item.availableUnits}
                            value={item.quantity}
                            onChange={(event) => {
                              const value = Number(event.target.value);
                              updateCartItem(item.batch_id, {
                                quantity: Math.max(
                                  1,
                                  Math.min(value || 1, item.availableUnits)
                                ),
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="billing-number"
                            type="number"
                            min="0"
                            max={unitPrice * item.quantity}
                            step="0.01"
                            value={item.discountAmount}
                            onChange={(event) =>
                              updateCartItem(item.batch_id, {
                                discountAmount: Math.max(
                                  0,
                                  Number(event.target.value || 0)
                                ),
                              })
                            }
                          />
                        </td>
                        <td>₹{lineTotal.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="remove-item-button"
                            onClick={() => removeCartItem(item.batch_id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="billing-checkout-panel">
              <label>
                Notes (optional)
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Reason or reference…"
                />
              </label>
              <div className="billing-checkout-fields">
                <label>
                  Bill discount (₹)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={billDiscount}
                    onChange={(e) => setBillDiscount(e.target.value)}
                  />
                </label>
              </div>
              <div className="checkout-total">
                <span>Subtotal</span>
                <strong>₹{cartSubtotal.toFixed(2)}</strong>
                <span>Line discounts</span>
                <strong>− ₹{cartItemDiscount.toFixed(2)}</strong>
                <span>Bill discount</span>
                <strong>− ₹{Number(billDiscount || 0).toFixed(2)}</strong>
                <span>Total</span>
                <strong>₹{finalTotal.toFixed(2)}</strong>
              </div>
              <button
                type="button"
                className="primary-button save-bill-button"
                disabled={saving}
                onClick={submit}
              >
                {saving ? "Saving…" : "Record unbilled sale"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function PastBills({ apiUrl, token }) {
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showInvoiceSheet, setShowInvoiceSheet] = useState(false);

  const loadHistory = useCallback(
    async (term) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        const query = term.trim();
        if (query) params.set("search", query);
        const res = await fetch(
          `${apiUrl}/api/billing/history?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || "Unable to load bill history.");
        }
        setSales(Array.isArray(data.sales) ? data.sales : []);
      } catch (err) {
        setError(
          err.message === "Failed to fetch"
            ? "Could not reach the server. Is the backend running?"
            : err.message
        );
        setSales([]);
      } finally {
        setLoading(false);
      }
    },
    [apiUrl, token]
  );

  useEffect(() => {
    loadHistory("");
  }, [loadHistory]);

  function runSearch(event) {
    event.preventDefault();
    const query = searchDraft.trim();
    setAppliedSearch(query);
    loadHistory(query);
  }

  function showAllBills() {
    setSearchDraft("");
    setAppliedSearch("");
    loadHistory("");
  }

  async function openBill(saleId) {
    setSelectedId(saleId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/billing/${saleId}`, {
        headers: headers(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setDetail(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SALES</p>
          <h2>Past bills</h2>
          <p>Search by patient name, mobile, or invoice number.</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}

      <div className="billing-card no-print">
        <h3>Search bills</h3>
        <form className="billing-search" onSubmit={runSearch}>
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Patient name, mobile, or invoice…"
            autoComplete="off"
          />
          <button
            type="submit"
            className="primary-button billing-search-btn"
            disabled={loading}
          >
            {loading ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="past-bills-toolbar">
          <button
            type="button"
            className="secondary-button medicine-add-btn"
            onClick={showAllBills}
            disabled={loading}
          >
            Show all recent
          </button>
          {!loading && sales.length > 0 && (
            <span className="billing-search-hint past-bills-count">
              {appliedSearch
                ? `${sales.length} match(es) for “${appliedSearch}”`
                : `${sales.length} recent bill(s)`}
            </span>
          )}
        </div>
        {loading && <p className="billing-search-hint">Loading…</p>}
        {!loading && sales.length === 0 && (
          <p className="empty-state">
            {appliedSearch
              ? `No bills found for “${appliedSearch}”. Try invoice number or mobile.`
              : "No billed sales yet for this branch."}
          </p>
        )}
        {sales.length > 0 && (
          <div className="table-scroll past-bills-table">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Patient Name</th>
                  <th>Mobile</th>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Billed</th>
                  <th>Returns</th>
                  <th>Net</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((row) => {
                  const retTotal = Number(row.returnedTotal ?? row.returned_total ?? 0);
                  const retCount = Number(row.returnCount ?? row.return_count ?? 0);
                  const netTotal = Number(
                    row.netTotal ?? row.net_total ?? Math.max(0, Number(row.grand_total) - retTotal)
                  );
                  return (
                    <tr
                      key={row.sale_id}
                      className={
                        selectedId === row.sale_id ? "past-bill-row-active" : ""
                      }
                    >
                      <td>
                        <strong>{row.patientName || row.patient_name || "Walk-in Patient"}</strong>
                      </td>
                      <td>{row.patientMobile || row.patient_mobile || "—"}</td>
                      <td>
                        <code>{row.invoice_number || `#${row.sale_id}`}</code>
                      </td>
                      <td>{String(row.sale_datetime).slice(0, 16)}</td>
                      <td>
                        <strong>₹{Number(row.grand_total).toFixed(2)}</strong>
                      </td>
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
                      <td>
                        <button
                          type="button"
                          className="secondary-button medicine-add-btn"
                          onClick={() => openBill(row.sale_id)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId && (
        <div className="billing-card">
          <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
            <h3 style={{ margin: 0 }}>Bill detail</h3>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowInvoiceSheet((v) => !v)}
              >
                {showInvoiceSheet ? "Hide GST Invoice" : "🖨️ View / Print GST Invoice"}
              </button>
              {showInvoiceSheet && (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              )}
            </div>
          </div>

          {detailLoading && <p className="billing-search-hint no-print">Loading…</p>}
          {detail?.sale && (
            <>
              <div className="notice-card bill-summary-banner no-print">
                <div>
                  <strong>{detail.sale.invoice_number || `Bill #${detail.sale.sale_id}`}</strong>
                  <p>
                    Patient:{" "}
                    <strong>{detail.sale.patientName || "Walk-in Patient"}</strong>
                    {detail.sale.patientMobile ? ` · ${detail.sale.patientMobile}` : ""} ·{" "}
                    {String(detail.sale.sale_datetime).slice(0, 19)} ·{" "}
                    {detail.sale.payment_method}
                  </p>
                  {detail.sale.notes && (
                    <p className="past-bill-notes">{detail.sale.notes}</p>
                  )}
                </div>
                <div className="bill-summary-total">
                  <span>
                    Billed: ₹{Number(detail.sale.grand_total).toFixed(2)}
                    {Number(detail.sale.returnedTotal || 0) > 0
                      ? ` · Returned: −₹${Number(detail.sale.returnedTotal).toFixed(2)}`
                      : ""}
                  </span>
                  <strong>
                    Net: ₹
                    {Number(
                      detail.sale.netTotal ??
                        Math.max(
                          0,
                          Number(detail.sale.grand_total) -
                            Number(detail.sale.returnedTotal || 0)
                        )
                    ).toFixed(2)}
                  </strong>
                </div>
              </div>

              {showInvoiceSheet ? (
                (() => {
                  const notes = detail.sale.notes || "";
                  const patMatch = notes.match(/Patient:\s*([^|]+)/i);
                  const docMatch = notes.match(/Doctor:\s*([^|]+)/i);
                  const addrMatch = notes.match(/Address:\s*([^|]+)/i);
                  const drRegMatch = notes.match(/Dr\s*Reg\s*No:\s*([^|]+)/i);

                  const patientName = patMatch && patMatch[1].trim() !== "N/A" ? patMatch[1].trim() : "Walk-in Patient";
                  const doctorName = docMatch && docMatch[1].trim() !== "N/A" ? docMatch[1].trim() : "";
                  const patientAddress = addrMatch && addrMatch[1].trim() !== "N/A" ? addrMatch[1].trim() : "—";
                  const doctorRegNo = drRegMatch && drRegMatch[1].trim() !== "N/A" ? drRegMatch[1].trim() : "—";

                  const grandTotal = Number(detail.sale.grand_total || 0);
                  const subTotal = Number(detail.sale.subtotal || grandTotal);
                  const discountTotal = Number(detail.sale.discount_total || 0);
                  const taxableVal = grandTotal / 1.05;
                  const sgstVal = taxableVal * 0.025;
                  const cgstVal = taxableVal * 0.025;
                  const words = numberToWordsIndian(grandTotal).replace(/Rupees Only/i, "").trim();

                  const formatExp = (expStr) => {
                    if (!expStr) return "—";
                    const p = String(expStr).trim().split("-");
                    return p.length >= 2 ? `${p[1]}/${p[0].slice(-2)}` : expStr;
                  };

                  const formatDt = (dtStr) => {
                    const d = dtStr ? new Date(dtStr) : new Date();
                    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
                  };

                  return (
                    <div className="tax-invoice-sheet" style={{ marginTop: "16px" }}>
                      <header className="gst-photo-header">
                        <h1 className="gst-photo-title">KIARA MEDICAL AND PROVISION STORE</h1>
                        <p className="gst-photo-sub">290/207, RAJPUT COLONY,</p>
                        <p className="gst-photo-sub">NEAR INCOME TAX COLONY,</p>
                        <p className="gst-photo-sub">Phone : 9528120548, 7014271864</p>
                        <p className="gst-photo-sub">E-Mail : sanjaygupta85@gmail.com</p>
                        <p className="gst-photo-sub">GSTIN : 08ABCFK5291Q1ZM</p>
                        <p className="gst-photo-sub">D.L.No : DRUG/2024-25/117477-117478</p>
                      </header>

                      <div className="gst-photo-banner">GST INVOICE</div>

                      <div className="gst-photo-meta-section">
                        <div className="gst-meta-top-row">
                          <div className="gst-meta-patient-block">
                            <div className="gst-meta-line">
                              <span className="gst-field-label">Patient Name :</span>
                              <strong className="gst-field-value">{patientName.toUpperCase()}</strong>
                            </div>
                            <div className="gst-meta-line">
                              <span className="gst-field-label">Patient Address :</span>
                              <span className="gst-field-value">{patientAddress}</span>
                            </div>
                            <div className="gst-meta-line">
                              <span className="gst-field-label">Dr Name :</span>
                              <span className="gst-field-value">
                                {doctorName
                                  ? (doctorName.toUpperCase().startsWith("DR")
                                      ? doctorName.toUpperCase()
                                      : `DR ${doctorName.toUpperCase()}`)
                                  : "—"}
                              </span>
                            </div>
                            <div className="gst-meta-line">
                              <span className="gst-field-label">Dr Reg No. :</span>
                              <span className="gst-field-value">{doctorRegNo}</span>
                            </div>
                          </div>
                        </div>
                        <div className="gst-meta-bar">
                          <div className="gst-meta-bar-item">
                            <span className="gst-field-label">Invoice No. :</span>
                            <strong className="gst-field-value">{detail.sale.invoice_number || `KM-${detail.sale.sale_id}`}</strong>
                          </div>
                          <div className="gst-meta-bar-item">
                            <span className="gst-field-label">Date:</span>
                            <span className="gst-field-value">{formatDt(detail.sale.sale_datetime)}</span>
                          </div>
                          <div className="gst-meta-bar-item">
                            <span className="gst-field-label">Mode:</span>
                            <span className="gst-field-value">{detail.sale.payment_method || "CASH"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="gst-invoice-table-wrapper">
                        <table className="gst-photo-table">
                          <thead>
                            <tr>
                              <th style={{ width: "28px" }}>SN.</th>
                              <th>PRODUCT NAME</th>
                              <th>PACK</th>
                              <th>DISC</th>
                              <th>HSN</th>
                              <th>BATCH</th>
                              <th>EXP</th>
                              <th>QTY</th>
                              <th>MRP</th>
                              <th>SGST</th>
                              <th>CGST</th>
                              <th>AMOUNT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(detail.items || []).map((line, idx) => (
                              <tr key={line.sale_item_id || idx}>
                                <td className="center-cell">{idx + 1}</td>
                                <td className="product-name-cell">
                                  <strong>{line.product_name_snapshot}</strong>
                                </td>
                                <td className="center-cell">1*10</td>
                                <td className="center-cell">
                                  {Number(line.discount_amount || 0) > 0 ? `₹${Number(line.discount_amount).toFixed(0)}` : "0%"}
                                </td>
                                <td className="center-cell">{line.hsn_code || "3004"}</td>
                                <td className="center-cell">{line.batch_number_snapshot || "—"}</td>
                                <td className="center-cell">{formatExp(line.expiry_date_snapshot)}</td>
                                <td className="center-cell">{line.quantity}</td>
                                <td className="right-cell">{Number(line.mrp || line.unit_selling_price || 0).toFixed(2)}</td>
                                <td className="right-cell">2.50</td>
                                <td className="right-cell">2.50</td>
                                <td className="right-cell amount-cell">{Number(line.line_total).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="gst-formula-banner">
                        GST {taxableVal.toFixed(2)}*2.5%+2.5%={sgstVal.toFixed(2)}SGST+{cgstVal.toFixed(2)}CGST, ** GET WELL SOON **
                      </div>

                      <div className="gst-bottom-split">
                        <div className="gst-bottom-terms">
                          <p className="gst-terms-title">Terms &amp; Conditions</p>
                          <p>Consult your Doctor before use.</p>
                          <p>All disputes subject to Jaipur Jurisdiction only.</p>
                          <p>Prescribed Sales Tax declaration will be given.</p>
                          <p className="gst-remark-line">Remark:</p>

                          <div className="gst-signatory-wrap">
                            <p className="gst-for-store">For KIARA MEDICAL AND PROVISION STORE</p>
                            <div className="gst-sig-spacer" />
                            <p className="gst-authorised">Authorised Signatory</p>
                          </div>
                        </div>

                        <div className="gst-bottom-totals">
                          <table className="gst-totals-table">
                            <tbody>
                              <tr>
                                <td className="gst-tot-label">SUB TOTAL</td>
                                <td className="gst-tot-val">{subTotal.toFixed(2)}</td>
                              </tr>
                              <tr>
                                <td className="gst-tot-label">DISCOUNT</td>
                                <td className="gst-tot-val">{discountTotal.toFixed(2)}</td>
                              </tr>
                              <tr className="gst-grand-row">
                                <td className="gst-tot-label"><strong>GRAND TOTAL</strong></td>
                                <td className="gst-tot-val"><strong>{grandTotal.toFixed(2)}</strong></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="gst-words-line">
                        Rs. {words} only
                      </div>

                      <div className="gst-footer-tagline">
                        Get well soon. Scan the Healthcare QR Code for complete health services, insurance, and government benefits.
                      </div>

                      {(detail.returns || []).length > 0 && (
                        <div className="gst-returns-note">
                          <strong>Customer Returns Recorded:</strong>{" "}
                          {(detail.returns || [])
                            .map(
                              (r) =>
                                `${r.credit_note_number} (−₹${Number(r.return_total).toFixed(2)})`
                            )
                            .join(", ")}{" "}
                          · Net after returns: ₹
                          {Number(
                            detail.sale.netTotal ??
                              Math.max(0, grandTotal - Number(detail.sale.returnedTotal || 0))
                          ).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })()
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="products-table">
                      <thead>
                        <tr>
                          <th>Medicine</th>
                          <th>Batch</th>
                          <th>Sold</th>
                          <th>Returned</th>
                          <th>Net qty</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.items || []).map((line) => {
                          const soldQty = Number(line.quantity || 0);
                          const retQty = Number(line.already_returned_qty || 0);
                          const netQty = Math.max(0, soldQty - retQty);
                          return (
                            <tr key={line.sale_item_id}>
                              <td>{line.product_name_snapshot}</td>
                              <td>{line.batch_number_snapshot}</td>
                              <td>{soldQty}</td>
                              <td>
                                {retQty > 0 ? (
                                  <span className="status-badge status-danger">
                                    −{retQty}
                                  </span>
                                ) : (
                                  "0"
                                )}
                              </td>
                              <td>{netQty}</td>
                              <td>₹{Number(line.line_total).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="checkout-total supplier-return-total">
                      <span>
                        Billed ₹{Number(detail.sale.grand_total).toFixed(2)}
                        {Number(detail.sale.returnedTotal || 0) > 0
                          ? ` · Returned −₹${Number(detail.sale.returnedTotal).toFixed(2)}`
                          : ""}
                      </span>
                      <strong>
                        Net total: ₹
                        {Number(
                          detail.sale.netTotal ??
                            Math.max(
                              0,
                              Number(detail.sale.grand_total) -
                                Number(detail.sale.returnedTotal || 0)
                            )
                        ).toFixed(2)}
                      </strong>
                    </div>
                  </div>

                  <div className="bill-returns-section">
                    <h4>
                      Customer returns for this bill ({(detail.returns || []).length})
                    </h4>
                    {!(detail.returns || []).length ? (
                      <p className="empty-state">
                        No customer returns recorded for this bill.
                      </p>
                    ) : (
                      <div className="bill-returns-list">
                        {(detail.returns || []).map((ret) => (
                          <div
                            key={ret.customer_return_id}
                            className="bill-return-card"
                          >
                            <div className="bill-return-card-head">
                              <div>
                                <strong>{ret.credit_note_number}</strong>
                                <span className="billing-search-hint" style={{ marginLeft: "10px" }}>
                                  {String(ret.return_datetime).slice(0, 19)}
                                  {ret.notes ? ` · ${ret.notes}` : ""}
                                </span>
                              </div>
                              <span className="status-badge status-danger">
                                Refunded: −₹{Number(ret.return_total).toFixed(2)}
                              </span>
                            </div>
                            {(ret.items || []).length > 0 && (
                              <table className="products-table">
                                <thead>
                                  <tr>
                                    <th>Returned medicine</th>
                                    <th>Batch</th>
                                    <th>Qty returned</th>
                                    <th>Refund ₹</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ret.items.map((ri) => (
                                    <tr key={ri.customer_return_item_id}>
                                      <td>{ri.product_name_snapshot}</td>
                                      <td>{ri.batch_number_snapshot || "—"}</td>
                                      <td>{ri.quantity}</td>
                                      <td>−₹{Number(ri.refund_amount).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function BillLookupField({
  title,
  searchTerm,
  onSearchChange,
  bills,
  selectedId,
  onSelectBill,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="billing-card">
      <h3>{title}</h3>
      <label className="patient-field-with-suggest">
        Search &amp; select bill ({bills.length} available)
        <div className="purchase-combobox-wrap">
          <input
            type="search"
            autoComplete="off"
            value={searchTerm}
            onFocus={() => setMenuOpen(true)}
            onBlur={() => window.setTimeout(() => setMenuOpen(false), 180)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              if (selectedId) onSelectBill(null, { keepQuery: true });
              setMenuOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setMenuOpen(false);
            }}
            placeholder="Type patient name, mobile, or KM-... (or click to browse)"
          />
          {(searchTerm || selectedId) && (
            <button
              type="button"
              className="combobox-clear-btn"
              aria-label="Clear selected bill"
              onClick={() => {
                onSearchChange("");
                onSelectBill(null);
                setMenuOpen(true);
              }}
            >
              ×
            </button>
          )}
        </div>
        {menuOpen && (
          <ul className="patient-suggest-list" role="listbox">
            {bills.length === 0 ? (
              <li className="patient-suggest-empty">
                No bills match “{searchTerm}”.
              </li>
            ) : (
              bills.slice(0, 25).map((b) => {
                const name = b.patient_name || b.patientName || "Walk-in";
                const mobile = b.patient_mobile || b.patientMobile || "";
                const inv = b.invoice_number || `#${b.sale_id}`;
                return (
                  <li key={b.sale_id}>
                    <button
                      type="button"
                      className="patient-suggest-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelectBill(b);
                        setMenuOpen(false);
                      }}
                    >
                      <strong>
                        {name} · {inv}
                      </strong>
                      <span>
                        {[
                          mobile || "No mobile",
                          String(b.sale_datetime).slice(0, 16),
                          `₹${Number(b.grand_total).toFixed(2)}`,
                        ].join(" · ")}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </label>
    </div>
  );
}

export function CustomerReturn({ apiUrl, token }) {
  const [bills, setBills] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [bill, setBill] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [returnNotes, setReturnNotes] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [successPopup, setSuccessPopup] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  const loadRecentBills = useCallback(async (query = "") => {
    const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
    const res = await fetch(`${apiUrl}/api/billing/recent${q}`, {
      headers: headers(token),
    });
    const data = await res.json();
    if (res.ok) setBills(data.sales || []);
  }, [apiUrl, token]);

  useEffect(() => {
    if (selectedId) return;
    loadRecentBills(searchTerm);
  }, [loadRecentBills, searchTerm, selectedId]);

  async function loadBill(saleId) {
    setSelectedId(saleId);
    setBill(null);
    setError("");
    if (!saleId) return;
    const res = await fetch(`${apiUrl}/api/billing/${saleId}`, {
      headers: headers(token),
    });
    const data = await res.json();
    if (res.ok) {
      setBill(data);
      const q = {};
      for (const item of data.items || []) {
        q[item.sale_item_id] = 0;
      }
      setQuantities(q);
    } else {
      setError(data.message || "Could not load selected bill.");
    }
  }

  const estimatedRefund = (bill?.items || []).reduce((sum, item) => {
    const qty = Math.max(0, Number(quantities[item.sale_item_id] || 0));
    const soldQty = Math.max(1, Number(item.quantity || 1));
    const unitNet = Number(item.line_total || 0) / soldQty;
    return sum + unitNet * qty;
  }, 0);

  async function submitReturn(event) {
    event.preventDefault();
    if (processing) return;

    setError("");
    setMessage("");
    const items = Object.entries(quantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([saleItemId, quantity]) => ({
        saleItemId: Number(saleItemId),
        quantity: Number(quantity),
      }));
    if (!items.length) {
      setError("Enter return quantity for at least one line.");
      return;
    }

    setProcessing(true);
    const startedAt = Date.now();

    try {
      const res = await fetch(`${apiUrl}/api/returns/customer`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          saleId: Number(selectedId),
          clientTransactionId: crypto.randomUUID(),
          notes: returnNotes.trim(),
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      const creditNote = data.creditNoteNumber || data.credit_note_number;
      const total = Number(data.returnTotal ?? data.return_total ?? 0).toFixed(2);
      setSuccessPopup({
        title: "Return processed",
        detail: creditNote
          ? `Credit note ${creditNote} · ₹${total} credited. Stock has been restocked.`
          : `Return of ₹${total} was recorded. Stock has been restocked.`,
      });

      setReturnNotes("");
      await loadBill(selectedId);
      await loadRecentBills(searchTerm);
    } catch (err) {
      setError(err.message);
    } finally {
      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(0, 1000 - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      setProcessing(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RETURNS</p>
          <h2>Customer return</h2>
          <p>Select bill → enter return quantity → restock & issue credit note (SRS 4.6).</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="notice-card">{message}</div>}

      {successPopup && (
        <div
          className="app-modal-overlay"
          role="presentation"
          onClick={() => setSuccessPopup(null)}
        >
          <div
            className="app-modal"
            role="dialog"
            aria-labelledby="return-success-title"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="return-success-title">{successPopup.title}</h3>
            <p>{successPopup.detail}</p>
            <button
              type="button"
              className="primary-button"
              autoFocus
              onClick={() => setSuccessPopup(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      <BillLookupField
        title="Find bill to return"
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        bills={bills}
        selectedId={selectedId}
        onSelectBill={(b, opts) => {
          if (!b) {
            setSelectedId("");
            setBill(null);
            if (!opts?.keepQuery) setSearchTerm("");
            return;
          }
          const name = b.patient_name || b.patientName || "Walk-in";
          setSearchTerm(`${name} · ${b.invoice_number || `#${b.sale_id}`}`);
          loadBill(b.sale_id);
        }}
      />

      {bill?.sale && (
        <div className="notice-card bill-summary-banner">
          <div>
            <strong>{bill.sale.invoice_number || `Bill #${bill.sale.sale_id}`}</strong>
            <p>
              Patient: <strong>{bill.sale.patientName || "Walk-in Patient"}</strong>
              {bill.sale.patientMobile ? ` · ${bill.sale.patientMobile}` : ""} ·{" "}
              {String(bill.sale.sale_datetime).slice(0, 16)} · Payment:{" "}
              {bill.sale.payment_method}
            </p>
          </div>
          <div className="bill-summary-total">
            <span>Bill Total</span>
            <strong>₹{Number(bill.sale.grand_total).toFixed(2)}</strong>
          </div>
        </div>
      )}

      {bill?.items && (
        <form className="billing-card" onSubmit={submitReturn}>
          <h3>Select quantities to return</h3>
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Medicine / batch</th>
                  <th>Rate / unit</th>
                  <th>Sold / returned</th>
                  <th>Return qty</th>
                  <th>Refund ₹</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((item) => {
                  const soldQty = Number(item.quantity || 0);
                  const alreadyReturned = Number(item.already_returned_qty || 0);
                  const maxReturnable =
                    item.returnable_quantity != null
                      ? Number(item.returnable_quantity)
                      : Math.max(0, soldQty - alreadyReturned);
                  const qty = Math.max(0, Number(quantities[item.sale_item_id] || 0));
                  const unitRefund = soldQty > 0 ? Number(item.line_total || 0) / soldQty : 0;
                  const lineRefund = unitRefund * qty;

                  return (
                    <tr key={item.sale_item_id}>
                      <td>
                        <strong>{item.product_name_snapshot}</strong>
                        <small>
                          Batch {item.batch_number_snapshot}
                          {item.expiry_date_snapshot
                            ? ` · Exp ${String(item.expiry_date_snapshot).slice(0, 10)}`
                            : ""}
                        </small>
                      </td>
                      <td>₹{unitRefund.toFixed(2)}</td>
                      <td>
                        <span>{soldQty} sold</span>
                        {alreadyReturned > 0 && (
                          <small>{alreadyReturned} returned · {maxReturnable} left</small>
                        )}
                      </td>
                      <td>
                        <input
                          className="billing-number"
                          type="number"
                          min="0"
                          max={maxReturnable}
                          disabled={maxReturnable === 0}
                          value={quantities[item.sale_item_id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(Number(e.target.value) || 0, maxReturnable)
                            );
                            setQuantities({
                              ...quantities,
                              [item.sale_item_id]: val,
                            });
                          }}
                        />
                      </td>
                      <td>₹{lineRefund.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="return-footer">
            <label className="return-notes-field">
              Return reason / notes (optional)
              <input
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g. Patient returned unused strip"
              />
            </label>
            <div className="checkout-total supplier-return-total">
              <span>Estimated refund</span>
              <strong>₹{estimatedRefund.toFixed(2)}</strong>
            </div>
            <div className="form-actions-row">
              <button
                type="submit"
                className="primary-button"
                disabled={processing || estimatedRefund <= 0}
              >
                {processing ? "Processing return…" : "Process return & restock"}
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}

function supplierCreditAmount(item, quantity) {
  const packSize = Number(item.packSize || item.units_per_stock_unit || 1);
  const purchasePerPack = Number(item.purchase_price || 0);
  return Number(
    (purchasePerPack * (Number(quantity) / packSize)).toFixed(2)
  );
}

export function SupplierReturn({ apiUrl, token, searchBatches }) {
  const [suppliers, setSuppliers] = useState([]);
  const [history, setHistory] = useState([]);
  const [header, setHeader] = useState({
    supplierId: "",
    referenceNumber: "",
    reason: "",
  });
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cart, setCart] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const loadInitial = useCallback(async () => {
    try {
      const [sRes, hRes] = await Promise.all([
        fetch(`${apiUrl}/api/purchases/suppliers`, { headers: headers(token) }),
        fetch(`${apiUrl}/api/returns/supplier`, { headers: headers(token) }),
      ]);
      const sData = await readJsonResponse(sRes, "Could not load suppliers.");
      const hData = await readJsonResponse(hRes, "Could not load supplier returns.");
      if (sRes.ok) setSuppliers(sData.suppliers || []);
      else setError(sData.message || "Could not load suppliers.");
      if (hRes.ok) setHistory(hData.returns || []);
    } catch (err) {
      setError(err.message);
    }
  }, [apiUrl, token]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setError("");
      try {
        const batches = await searchBatches(query);
        setResults(batches || []);
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchBatches]);

  function addLine(medicineResult, unit = "smallest") {
    const packSize = Number(medicineResult.units_per_stock_unit || 1);
    const availableUnits = Number(
      medicineResult.available_smallest_units || 0
    );
    if (availableUnits <= 0) {
      setError("No stock available for this batch.");
      return;
    }
    setError("");
    setCart((previous) => {
      const existing = previous.find(
        (item) => Number(item.batch_id) === Number(medicineResult.batch_id)
      );
      if (existing) {
        return previous.map((item) =>
          Number(item.batch_id) === Number(medicineResult.batch_id)
            ? {
                ...item,
                quantity: Math.min(
                  item.quantity + (unit === "pack" ? packSize : 1),
                  availableUnits
                ),
              }
            : item
        );
      }
      return [
        ...previous,
        {
          ...medicineResult,
          quantity: unit === "pack" ? packSize : 1,
          packSize,
          availableUnits,
        },
      ];
    });
  }

  function updateCartItem(batchId, changes) {
    setCart((previous) =>
      previous.map((item) =>
        Number(item.batch_id) === Number(batchId)
          ? { ...item, ...changes }
          : item
      )
    );
  }

  function removeCartItem(batchId) {
    setCart((previous) =>
      previous.filter((item) => Number(item.batch_id) !== Number(batchId))
    );
  }

  const returnTotal = cart.reduce(
    (sum, item) => sum + supplierCreditAmount(item, item.quantity),
    0
  );

  async function submit(event) {
    event.preventDefault();
    if (!cart.length) {
      setError("Add at least one medicine line to return.");
      return;
    }
    if (!header.supplierId) {
      setError("Select a supplier.");
      return;
    }
    if (!header.referenceNumber.trim()) {
      setError("Enter a supplier reference / RGA number.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`${apiUrl}/api/returns/supplier`, {
        method: "POST",
        headers: headers(token),
        body: JSON.stringify({
          supplierId: Number(header.supplierId),
          referenceNumber: header.referenceNumber.trim(),
          reason: header.reason.trim(),
          clientTransactionId: crypto.randomUUID(),
          items: cart.map((c) => ({
            batchId: c.batch_id,
            quantity: Number(c.quantity),
          })),
        }),
      });
      const data = await readJsonResponse(
        res,
        "Supplier return failed — check the API server."
      );
      if (!res.ok) throw new Error(data.message);
      setMessage(
        `Supplier return saved — expected credit ₹${Number(data.returnTotal).toFixed(2)}`
      );
      setCart([]);
      setSearch("");
      setResults([]);
      setHeader((prev) => ({ ...prev, referenceNumber: "", reason: "" }));
      await loadInitial();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RETURNS</p>
          <h2>Supplier return</h2>
          <p>
            Return damaged or expired stock to the supplier. Credit is based on
            batch purchase price.
          </p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="notice-card">{message}</div>}

      <div className="billing-card">
        <h3>Supplier details</h3>
        <div className="billing-grid">
          <label>
            Supplier *
            <select
              required
              value={header.supplierId}
              onChange={(e) =>
                setHeader({ ...header, supplierId: e.target.value })
              }
            >
              <option value="">Select supplier</option>
              {suppliers.map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>
                  {s.supplier_name}
                  {s.phone ? ` · ${s.phone}` : ""}
                  {s.gstin ? ` · GSTIN ${s.gstin}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reference / RGA no. *
            <input
              required
              value={header.referenceNumber}
              onChange={(e) =>
                setHeader({ ...header, referenceNumber: e.target.value })
              }
              placeholder="Supplier return reference"
            />
          </label>
          <label>
            Reason
            <input
              value={header.reason}
              onChange={(e) =>
                setHeader({ ...header, reason: e.target.value })
              }
              placeholder="Damaged, expired, etc."
            />
          </label>
        </div>
      </div>

      <div className="billing-card">
        <h3>Add medicines to return</h3>
        <form className="billing-search" onSubmit={(e) => e.preventDefault()}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search medicine, brand, salt, or batch (min 2 letters)…"
            autoComplete="off"
          />
        </form>
        {search.trim().length > 0 && search.trim().length < 2 && (
          <p className="billing-search-hint">
            Enter at least 2 characters to search.
          </p>
        )}
        {searchLoading && <p className="billing-search-hint">Searching…</p>}
        {!searchLoading &&
          search.trim().length >= 2 &&
          results.length === 0 && (
            <p className="empty-state billing-no-results">No batches found.</p>
          )}
        {results.length > 0 && (
          <div className="billing-results">
            {results.map((item) => (
              <MedicineSearchRow
                key={item.batch_id}
                item={item}
                onAddPack={(row) => addLine(row, "pack")}
                onAddUnit={(row) => addLine(row, "smallest")}
              />
            ))}
          </div>
        )}
      </div>

      <form className="billing-card" onSubmit={submit}>
        <h3>Return lines</h3>
        {cart.length === 0 ? (
          <p className="empty-state">
            Search and add medicines you are sending back to the supplier.
          </p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="products-table">
                <thead>
                  <tr>
                    <th>Medicine / batch</th>
                    <th>Purchase rate</th>
                    <th>Return qty</th>
                    <th>Credit (₹)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((item) => {
                    const packSize = item.packSize;
                    const purchasePerPack = Number(item.purchase_price || 0);
                    const credit = supplierCreditAmount(item, item.quantity);
                    const expired =
                      item.expiry_date &&
                      String(item.expiry_date).slice(0, 10) <
                        new Date().toISOString().slice(0, 10);
                    return (
                      <tr key={item.batch_id}>
                        <td>
                          <strong>{item.product_name}</strong>
                          <small>
                            Batch {item.batch_number}
                            {item.expiry_date
                              ? ` · Exp ${String(item.expiry_date).slice(0, 10)}`
                              : ""}
                            {expired ? " · EXPIRED" : ""}
                          </small>
                        </td>
                        <td>
                          ₹{purchasePerPack.toFixed(2)}/
                          {item.stock_unit_label || "pack"}
                        </td>
                        <td>
                          <input
                            className="billing-number"
                            type="number"
                            min="1"
                            max={item.availableUnits}
                            value={item.quantity}
                            onChange={(e) => {
                              const value = Number(e.target.value);
                              updateCartItem(item.batch_id, {
                                quantity: Math.max(
                                  1,
                                  Math.min(value || 1, item.availableUnits)
                                ),
                              });
                            }}
                          />
                          <small>
                            {item.smallest_unit_label || "units"} (max{" "}
                            {item.availableUnits})
                          </small>
                        </td>
                        <td>₹{credit.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="remove-item-button"
                            onClick={() => removeCartItem(item.batch_id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="checkout-total supplier-return-total">
              <span>Expected credit from supplier</span>
              <strong>₹{returnTotal.toFixed(2)}</strong>
            </div>
            <p className="billing-search-hint">
              Credit uses the batch purchase price (what the shop paid the
              supplier), pro-rated by quantity returned.
            </p>
            <button
              type="submit"
              className="primary-button save-bill-button"
              disabled={saving}
            >
              {saving ? "Submitting…" : "Submit supplier return"}
            </button>
          </>
        )}
      </form>

      <div className="table-card">
        <h3>Supplier return history ({history.length})</h3>
        {history.length === 0 ? (
          <p className="empty-state">No supplier returns recorded yet.</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Reference / RGA #</th>
                  <th>Reason</th>
                  <th>Returned items</th>
                  <th>Credit (₹)</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.supplier_return_id}>
                    <td>{String(row.return_datetime).slice(0, 16)}</td>
                    <td>
                      <strong>{row.supplier_name}</strong>
                      {row.supplier_phone && <small>{row.supplier_phone}</small>}
                    </td>
                    <td>
                      <code>{row.reference_number}</code>
                    </td>
                    <td>{row.reason || "—"}</td>
                    <td>
                      {(row.items || []).length === 0 ? (
                        "—"
                      ) : (
                        <div className="supplier-return-items-cell">
                          {row.items.map((it) => (
                            <div key={it.supplier_return_item_id}>
                              <strong>{it.product_name}</strong> ({it.batch_number}) ×{" "}
                              {it.quantity} — ₹{Number(it.line_total).toFixed(2)}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>₹{Number(row.return_total).toFixed(2)}</strong>
                    </td>
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

export function EditBill({ apiUrl, token, searchMedicines }) {
  const [bills, setBills] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [bill, setBill] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [search, setSearch] = useState("");
  const [searchBillTerm, setSearchBillTerm] = useState("");
  const [results, setResults] = useState([]);
  const [searchingMeds, setSearchingMeds] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshBillList = useCallback(async (query = "") => {
    const q = query.trim() ? `?search=${encodeURIComponent(query.trim())}` : "";
    const res = await fetch(`${apiUrl}/api/billing/recent${q}`, {
      headers: headers(token),
    });
    const data = await res.json();
    if (res.ok) setBills(data.sales || []);
  }, [apiUrl, token]);

  useEffect(() => {
    if (selectedId) return;
    refreshBillList(searchBillTerm).catch(() => {});
  }, [refreshBillList, searchBillTerm, selectedId]);

  async function loadBill(saleId) {
    if (!saleId) {
      setSelectedId("");
      setBill(null);
      setEditItems([]);
      return;
    }
    setSelectedId(String(saleId));
    setError("");
    setMessage("");
    const res = await fetch(`${apiUrl}/api/billing/${saleId}`, {
      headers: headers(token),
    });
    const data = await res.json();
    if (res.ok) {
      setBill(data.sale);
      setPaymentMethod(data.sale?.payment_method || "CASH");
      setEditItems(
        (data.items || []).map((item) => ({
          saleItemId: item.sale_item_id,
          batchId: item.batch_id,
          batchNumber: item.batch_number_snapshot,
          quantity: item.quantity,
          discountAmount: item.discount_amount ?? 0,
          gstRate: item.gst_rate ?? 5,
          unitPrice: Number(item.unit_selling_price || 0),
          label: item.product_name_snapshot,
          alreadyReturned: Number(item.already_returned_qty || 0),
        }))
      );
      setResults([]);
      setSearch("");
    } else {
      setError(data.message || "Could not load bill.");
    }
  }

  const estimatedBillTotal = editItems.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.quantity || 0));
    const unit = Number(item.unitPrice || 0);
    const disc = Math.max(0, Number(item.discountAmount || 0));
    return sum + Math.max(0, unit * qty - disc);
  }, 0);

  async function saveEdit() {
    if (!editItems.length) {
      setError("Keep at least one medicine line on the bill.");
      return;
    }
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const res = await fetch(`${apiUrl}/api/billing/${selectedId}`, {
        method: "PUT",
        headers: headers(token),
        body: JSON.stringify({
          paymentMethod,
          items: editItems.map((item) => ({
            batchId: item.batchId,
            quantity: Number(item.quantity),
            discountAmount: Number(item.discountAmount || 0),
            gstRate: Number(item.gstRate || 5),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      await loadBill(selectedId);
      await refreshBillList(searchBillTerm);
      setMessage(
        `Bill updated. New total ₹${Number(data.grandTotal ?? bill?.grand_total ?? 0).toFixed(2)}. Past bills and returns will show the corrected quantities.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function addFromSearch(event) {
    event.preventDefault();
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearchingMeds(true);
    try {
      const meds = await searchMedicines(search.trim());
      setResults(meds || []);
    } finally {
      setSearchingMeds(false);
    }
  }

  function addSearchBatchToEdit(row) {
    const packSize = Number(row.units_per_stock_unit || 1);
    const unitPrice = Number(row.selling_price || 0) / packSize;
    setEditItems((prev) => {
      const idx = prev.findIndex((i) => Number(i.batchId) === Number(row.batch_id));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          quantity: Number(next[idx].quantity || 0) + 1,
        };
        return next;
      }
      return [
        ...prev,
        {
          saleItemId: null,
          batchId: row.batch_id,
          batchNumber: row.batch_number,
          quantity: 1,
          discountAmount: 0,
          gstRate: Number(row.default_gst_rate ?? 5),
          unitPrice,
          label: row.product_name,
          alreadyReturned: 0,
        },
      ];
    });
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">BILLING</p>
          <h2>Edit bill</h2>
          <p>Adjust quantities, discounts, payment method, or add/remove lines; stock adjusts automatically.</p>
        </div>
      </div>
      {error && <div className="error-message">{error}</div>}
      {message && <div className="notice-card">{message}</div>}

      <BillLookupField
        title="Find bill to edit"
        searchTerm={searchBillTerm}
        onSearchChange={setSearchBillTerm}
        bills={bills}
        selectedId={selectedId}
        onSelectBill={(b, opts) => {
          if (!b) {
            setSelectedId("");
            setBill(null);
            setEditItems([]);
            if (!opts?.keepQuery) setSearchBillTerm("");
            return;
          }
          const name = b.patient_name || b.patientName || "Walk-in";
          setSearchBillTerm(`${name} · ${b.invoice_number || `#${b.sale_id}`}`);
          loadBill(b.sale_id);
        }}
      />

      {bill && (
        <div className="notice-card bill-summary-banner">
          <div>
            <strong>{bill.invoice_number || `Bill #${bill.sale_id}`}</strong>
            <p>
              Patient: <strong>{bill.patientName || "Walk-in Patient"}</strong>
              {bill.patientMobile ? ` · ${bill.patientMobile}` : ""} ·{" "}
              {String(bill.sale_datetime).slice(0, 16)}
            </p>
          </div>
          <div className="bill-summary-total">
            <span>Saved Bill Total</span>
            <strong>₹{Number(bill.grand_total).toFixed(2)}</strong>
          </div>
        </div>
      )}

      {bill && (
        <div className="billing-card">
          <div className="edit-bill-header-row">
            <h3>Bill lines ({editItems.length})</h3>
            <label className="edit-bill-payment-field">
              Payment method
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                <option value="CASH">CASH</option>
                <option value="UPI">UPI</option>
                <option value="CARD">CARD</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>
          </div>

          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Medicine / batch</th>
                  <th>Unit ₹</th>
                  <th>Qty (units)</th>
                  <th>Discount ₹</th>
                  <th>Est. total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {editItems.map((item, index) => {
                  const qty = Math.max(0, Number(item.quantity || 0));
                  const disc = Math.max(0, Number(item.discountAmount || 0));
                  const estLine = Math.max(0, Number(item.unitPrice || 0) * qty - disc);
                  return (
                    <tr key={item.saleItemId || `${item.batchId}-${index}`}>
                      <td>
                        <strong>{item.label}</strong>
                        <small>
                          Batch {item.batchNumber || item.batchId}
                          {item.alreadyReturned > 0
                            ? ` · ${item.alreadyReturned} already returned (min qty)`
                            : ""}
                        </small>
                      </td>
                      <td>₹{Number(item.unitPrice || 0).toFixed(2)}</td>
                      <td>
                        <input
                          className="billing-number"
                          type="number"
                          min={Math.max(1, item.alreadyReturned || 0)}
                          value={item.quantity}
                          onChange={(e) => {
                            const next = [...editItems];
                            next[index] = {
                              ...next[index],
                              quantity: e.target.value,
                            };
                            setEditItems(next);
                          }}
                        />
                      </td>
                      <td>
                        <input
                          className="billing-number"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.discountAmount}
                          onChange={(e) => {
                            const next = [...editItems];
                            next[index] = {
                              ...next[index],
                              discountAmount: e.target.value,
                            };
                            setEditItems(next);
                          }}
                        />
                      </td>
                      <td>₹{estLine.toFixed(2)}</td>
                      <td>
                        <button
                          type="button"
                          className="remove-item-button"
                          disabled={item.alreadyReturned > 0}
                          title={
                            item.alreadyReturned > 0
                              ? "Cannot remove line with customer returns"
                              : "Remove line"
                          }
                          onClick={() =>
                            setEditItems(editItems.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="edit-bill-add-section">
            <h4>Add another medicine to this bill</h4>
            <form className="billing-search" onSubmit={addFromSearch}>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search medicine name, brand, or batch (min 2 letters)…"
              />
              <button type="submit" className="secondary-button" disabled={searchingMeds}>
                {searchingMeds ? "Searching…" : "Search"}
              </button>
            </form>
            {results.length > 0 && (
              <div className="billing-results">
                {results.slice(0, 6).map((r) => {
                  const packSize = Number(r.units_per_stock_unit || 1);
                  const unitRate = Number(r.selling_price || 0) / packSize;
                  return (
                    <div key={r.batch_id} className="medicine-search-row">
                      <div className="medicine-search-row-text">
                        <span className="medicine-search-row-name">
                          {r.product_name}
                          {r.brand ? ` (${r.brand})` : ""}
                        </span>
                        <span className="medicine-search-row-meta">
                          Batch {r.batch_number} · Exp {String(r.expiry_date || "").slice(0, 10) || "N/A"} · ₹{unitRate.toFixed(2)}/{r.smallest_unit_label || "unit"} · Avail {r.available_smallest_units}
                        </span>
                      </div>
                      <div className="medicine-search-row-actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => addSearchBatchToEdit(r)}
                        >
                          + Add 1 {r.smallest_unit_label || "unit"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="edit-bill-footer">
            <div className="checkout-total supplier-return-total">
              <span>Estimated updated bill total</span>
              <strong>₹{estimatedBillTotal.toFixed(2)}</strong>
            </div>
            <p className="billing-search-hint">
              After save, reopen this bill under Past bills or Customer return to see updated quantities.
            </p>
            <div className="form-actions-row">
              <button
                type="button"
                className="primary-button"
                disabled={saving || editItems.length === 0}
                onClick={saveEdit}
              >
                {saving ? "Saving…" : "Save bill changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function DoctorSalesReport({ apiUrl, token, isAdmin = false, branches = [] }) {
  const [period, setPeriod] = useState("month");
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedKey, setExpandedKey] = useState(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ period });
      if (isAdmin && branchId) params.set("branchId", branchId);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`${apiUrl}/api/analytics/doctor-sales?${params.toString()}`, {
        headers: headers(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to load doctor-wise sales report.");
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, token, period, isAdmin, branchId, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadReport();
    }, 180);
    return () => window.clearTimeout(timer);
  }, [loadReport]);

  const doctors = report?.doctors || [];
  const summary = report?.summary || {
    doctorCount: 0,
    totalBills: 0,
    grossBilled: 0,
    customerReturns: 0,
    netSales: 0,
  };

  const chartDoctors = doctors.filter((d) => !d.isWalkIn).slice(0, 8);
  const chartCategories = chartDoctors.map((d) => d.doctorName);
  const chartSeries = [
    {
      name: "Gross Billed",
      color: "#2563eb",
      data: chartDoctors.map((d) => Number(d.grossBilled || 0)),
    },
    {
      name: "Net Sales",
      color: "#10b981",
      data: chartDoctors.map((d) => Number(d.netSales || 0)),
    },
  ];

  const periodLabels = {
    day: "Today",
    week: "This Week",
    month: "This Month",
    all: "All Time",
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">REPORTS</p>
          <h2>Doctor-wise sales report</h2>
          <p>Prescription bills, units sold, returns, and net revenue grouped by prescribing doctor.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadReport} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="billing-card">
        <div className="doctor-report-toolbar">
          <div className="period-toggle" style={{ margin: 0 }}>
            {["day", "week", "month", "all"].map((p) => (
              <button
                key={p}
                type="button"
                className={period === p ? "primary-button" : "secondary-button"}
                onClick={() => setPeriod(p)}
                style={{ minHeight: "36px", padding: "6px 14px", fontSize: "13px" }}
              >
                {periodLabels[p]}
              </button>
            ))}
          </div>

          <div className="doctor-report-filters">
            {isAdmin && (
              <select
                aria-label="Filter by branch"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">All branches</option>
                {branches
                  .filter((b) => b.is_active)
                  .map((b) => (
                    <option key={b.branch_id} value={b.branch_id}>
                      {b.branch_name} ({b.branch_code})
                    </option>
                  ))}
              </select>
            )}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search doctor name…"
            />
          </div>
        </div>
      </div>

      <div className="dashboard-kpi-grid">
        <article className="stat-card stat-card-neutral">
          <span className="stat-card-label">Doctors ({periodLabels[period]})</span>
          <p className="stat-card-value">{summary.doctorCount}</p>
          <span className="stat-card-hint">Prescribing doctors with billed sales</span>
        </article>
        <article className="stat-card stat-card-sales">
          <span className="stat-card-label">Total billed invoices</span>
          <p className="stat-card-value">{summary.totalBills}</p>
          <span className="stat-card-hint">Across matched doctor &amp; walk-in bills</span>
        </article>
        <article className="stat-card stat-card-purchase">
          <span className="stat-card-label">Gross billed</span>
          <p className="stat-card-value">₹{Number(summary.grossBilled || 0).toFixed(2)}</p>
          <span className="stat-card-hint">Returns: − ₹{Number(summary.customerReturns || 0).toFixed(2)}</span>
        </article>
        <article className="stat-card stat-card-profit">
          <span className="stat-card-label">Net sales</span>
          <p className="stat-card-value metric-profit-positive">
            ₹{Number(summary.netSales || 0).toFixed(2)}
          </p>
          <span className="stat-card-hint">Billed minus customer returns</span>
        </article>
      </div>

      {chartDoctors.length > 0 && (
        <div style={{ marginBottom: "22px" }}>
          <BarChart
            title={`Top Doctors by Sales (${periodLabels[period]})`}
            categories={chartCategories}
            series={chartSeries}
          />
        </div>
      )}

      <div className="table-card">
        <h3>Doctor breakdown ({doctors.length})</h3>
        {loading && !report ? (
          <p className="empty-state">Loading doctor-wise sales…</p>
        ) : doctors.length === 0 ? (
          <p className="empty-state">No billed sales found for the selected filter.</p>
        ) : (
          <div className="table-scroll">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Doctor name</th>
                  {isAdmin && <th>Branch</th>}
                  <th>Bills</th>
                  <th>Patients</th>
                  <th>Units sold</th>
                  <th>Gross billed</th>
                  <th>Returns</th>
                  <th>Net sales</th>
                  <th>Last bill</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {doctors.map((doc) => {
                  const isOpen = expandedKey === doc.doctorKey;
                  return (
                    <tr key={doc.doctorKey}>
                      <td>
                        <strong>{doc.doctorName}</strong>
                        {doc.isWalkIn && <small>No doctor entered on bill</small>}
                      </td>
                      {isAdmin && <td>{doc.branchName || "—"}</td>}
                      <td>{doc.billCount}</td>
                      <td>{doc.patientCount}</td>
                      <td>{doc.unitsSold}</td>
                      <td>₹{Number(doc.grossBilled).toFixed(2)}</td>
                      <td>
                        {Number(doc.customerReturns) > 0 ? (
                          <span className="status-badge status-danger">
                            − ₹{Number(doc.customerReturns).toFixed(2)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <strong className="metric-profit-positive">
                          ₹{Number(doc.netSales).toFixed(2)}
                        </strong>
                      </td>
                      <td>
                        {doc.lastSaleDate ? String(doc.lastSaleDate).slice(0, 10) : "—"}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-button medicine-add-btn"
                          onClick={() =>
                            setExpandedKey((prev) =>
                              prev === doc.doctorKey ? null : doc.doctorKey
                            )
                          }
                        >
                          {isOpen ? "Hide bills" : "View bills"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {expandedKey && (() => {
          const selectedDoc = doctors.find((d) => d.doctorKey === expandedKey);
          if (!selectedDoc) return null;
          return (
            <div className="doctor-bills-drawer">
              <div className="doctor-bills-drawer-head">
                <h4>
                  Bills for {selectedDoc.doctorName} ({selectedDoc.bills.length})
                </h4>
                <button
                  type="button"
                  className="secondary-button medicine-add-btn"
                  onClick={() => setExpandedKey(null)}
                >
                  Close
                </button>
              </div>
              <div className="table-scroll">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Patient</th>
                      {isAdmin && <th>Branch</th>}
                      <th>Date</th>
                      <th>Payment</th>
                      <th>Billed</th>
                      <th>Returns</th>
                      <th>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDoc.bills.map((b) => (
                      <tr key={b.sale_id}>
                        <td><code>{b.invoice_number || `#${b.sale_id}`}</code></td>
                        <td>{b.patientName}</td>
                        {isAdmin && <td>{b.branch_name}</td>}
                        <td>{String(b.sale_datetime).slice(0, 16)}</td>
                        <td>{b.payment_method}</td>
                        <td>₹{Number(b.gross_billed).toFixed(2)}</td>
                        <td>
                          {Number(b.returned_total) > 0
                            ? `− ₹${Number(b.returned_total).toFixed(2)}`
                            : "—"}
                        </td>
                        <td>
                          <strong>₹{Number(b.net_total).toFixed(2)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </div>
    </>
  );
}
