// In-memory fallback database when external MySQL is paused or unreachable
const bcrypt = require("bcryptjs");

const branches = [
  {
    branch_id: 1,
    branch_code: "BR001",
    branch_name: "Kiara Medicals A",
    legal_name: "Kiara Medicals A Pvt Ltd",
    address: "12th Main, Koramangala 5th Block, Bengaluru, Karnataka 560034",
    phone: "08025551234",
    gstin: "29AABCK1234A1Z5",
    invoice_prefix: "KM-A",
    is_active: 1,
    created_at: new Date(),
  },
  {
    branch_id: 2,
    branch_code: "BR002",
    branch_name: "Kiara Medicals B",
    legal_name: "Kiara Medicals B Pvt Ltd",
    address: "100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038",
    phone: "08025555678",
    gstin: "29AABCK5678B1Z3",
    invoice_prefix: "KM-B",
    is_active: 1,
    created_at: new Date(),
  },
  {
    branch_id: 3,
    branch_code: "BR003",
    branch_name: "Kiara Medicals C",
    legal_name: "Kiara Medicals C Pvt Ltd",
    address: "ITPL Main Road, Whitefield, Bengaluru, Karnataka 560066",
    phone: "08025559012",
    gstin: "29AABCK9012C1Z1",
    invoice_prefix: "KM-C",
    is_active: 1,
    created_at: new Date(),
  },
];

const users = [
  {
    user_id: 1,
    branch_id: null,
    full_name: "Test Administrator",
    username: "testadmin",
    password_hash: "$2b$10$FEYU3nRCSTRQ.Ra6hlK74.lLLa5ubK5uXxF5tIIvozV2NNcM5WaMm",
    role: "ADMIN",
    is_active: 1,
    last_login_at: null,
  },
  {
    user_id: 2,
    branch_id: 1,
    full_name: "Test Shop Manager A",
    username: "managera",
    password_hash: "$2b$10$Rz6FwVx6STds78ngpjzTCugWpedLn.SjMTrU9AZJ6W.xY69YvTeb.",
    role: "SHOP_MANAGER",
    is_active: 1,
    last_login_at: null,
  },
  {
    user_id: 4,
    branch_id: 1,
    full_name: "Test Shop A User",
    username: "shopa",
    password_hash: "$2b$10$ZHTIrGIEppeuoRKBetGKUOFEBVC27HOJFvSetA7JeYmOlaxbP.78G",
    role: "SHOP_USER",
    is_active: 1,
    last_login_at: null,
  },
  {
    user_id: 5,
    branch_id: 2,
    full_name: "Test Shop B User",
    username: "shopb",
    password_hash: "$2b$10$ttfTU9fJMSbt3tDjg8cgKehdPdbWpLlBKXD2K2k6bY/Uv.10ztcXu",
    role: "SHOP_USER",
    is_active: 1,
    last_login_at: null,
  },
  {
    user_id: 6,
    branch_id: 3,
    full_name: "Test Shop C User",
    username: "shopc",
    password_hash: "$2b$10$QZsICn/6HQWSZ7yuvM62EuYThARQrQSslOfyerVIJ4AmjgKjJK.by",
    role: "SHOP_USER",
    is_active: 1,
    last_login_at: null,
  },
];

const products = [
  { product_id: 1, product_name: "Dolo 650", brand: "Micro Labs", strength: "650mg", dosage_form: "Tablet", packaging: "15 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 15, default_hsn_code: "30049099", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
  { product_id: 2, product_name: "Calpol 500", brand: "GSK", strength: "500mg", dosage_form: "Tablet", packaging: "15 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 15, default_hsn_code: "30049099", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
  { product_id: 3, product_name: "Moxikind CV 625", brand: "Mankind", strength: "625mg", dosage_form: "Tablet", packaging: "10 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 10, default_hsn_code: "30041090", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
  { product_id: 4, product_name: "Azithral 500", brand: "Alembic", strength: "500mg", dosage_form: "Tablet", packaging: "5 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 5, default_hsn_code: "30042019", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
  { product_id: 5, product_name: "Cetzine", brand: "Dr Reddy's", strength: "10mg", dosage_form: "Tablet", packaging: "10 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 10, default_hsn_code: "30049099", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
  { product_id: 6, product_name: "Pan 40", brand: "Alkem", strength: "40mg", dosage_form: "Tablet", packaging: "15 tablets/strip", stock_unit_label: "strip", smallest_unit_label: "tablet", units_per_stock_unit: 15, default_hsn_code: "30049099", default_gst_rate: 5, is_active: 1, is_h1_or_restricted: 0 },
];

const batches = [
  { batch_id: 1, branch_id: 1, product_id: 1, batch_number: "KOR-B001", expiry_date: "2027-10-31", mrp: 60, purchase_price: 42 },
  { batch_id: 2, branch_id: 1, product_id: 2, batch_number: "KOR-B002", expiry_date: "2027-09-30", mrp: 70, purchase_price: 49 },
  { batch_id: 3, branch_id: 1, product_id: 3, batch_number: "KOR-B003", expiry_date: "2027-12-31", mrp: 80, purchase_price: 56 },
  { batch_id: 4, branch_id: 1, product_id: 4, batch_number: "KOR-B004", expiry_date: "2027-11-30", mrp: 90, purchase_price: 63 },
  { batch_id: 5, branch_id: 1, product_id: 5, batch_number: "KOR-B005", expiry_date: "2027-08-31", mrp: 100, purchase_price: 70 },
  { batch_id: 6, branch_id: 1, product_id: 6, batch_number: "KOR-B006", expiry_date: "2027-07-31", mrp: 110, purchase_price: 77 },
  { batch_id: 7, branch_id: 2, product_id: 1, batch_number: "IND-B001", expiry_date: "2027-08-31", mrp: 60, purchase_price: 42 },
  { batch_id: 8, branch_id: 2, product_id: 2, batch_number: "IND-B002", expiry_date: "2027-07-31", mrp: 70, purchase_price: 49 },
  { batch_id: 9, branch_id: 3, product_id: 1, batch_number: "WHT-B001", expiry_date: "2027-06-30", mrp: 60, purchase_price: 42 },
  { batch_id: 10, branch_id: 3, product_id: 2, batch_number: "WHT-B002", expiry_date: "2027-05-31", mrp: 70, purchase_price: 49 },
];

const inventory = [
  { inventory_id: 1, branch_id: 1, batch_id: 1, quantity: 25, loose_quantity: 4, selling_price: 54 },
  { inventory_id: 2, branch_id: 1, batch_id: 2, quantity: 30, loose_quantity: 0, selling_price: 63 },
  { inventory_id: 3, branch_id: 1, batch_id: 3, quantity: 20, loose_quantity: 2, selling_price: 72 },
  { inventory_id: 4, branch_id: 1, batch_id: 4, quantity: 18, loose_quantity: 0, selling_price: 81 },
  { inventory_id: 5, branch_id: 1, batch_id: 5, quantity: 22, loose_quantity: 5, selling_price: 90 },
  { inventory_id: 6, branch_id: 1, batch_id: 6, quantity: 15, loose_quantity: 0, selling_price: 99 },
  { inventory_id: 7, branch_id: 2, batch_id: 7, quantity: 18, loose_quantity: 0, selling_price: 54 },
  { inventory_id: 8, branch_id: 2, batch_id: 8, quantity: 15, loose_quantity: 0, selling_price: 63 },
  { inventory_id: 9, branch_id: 3, batch_id: 9, quantity: 12, loose_quantity: 0, selling_price: 54 },
  { inventory_id: 10, branch_id: 3, batch_id: 10, quantity: 10, loose_quantity: 0, selling_price: 63 },
];

const patients = [
  { patient_id: 1, branch_id: 1, full_name: "Ramesh Sharma", mobile: "9876543210" },
  { patient_id: 2, branch_id: 1, full_name: "Pooja Patel", mobile: "9812345678" },
  { patient_id: 3, branch_id: 2, full_name: "Amit Verma", mobile: "9823456789" },
  { patient_id: 4, branch_id: 3, full_name: "Sneha Reddy", mobile: "9834567890" },
];

const sales = [
  {
    sale_id: 1,
    branch_id: 1,
    patient_id: 1,
    doctor_id: null,
    sale_type: "BILLED",
    status: "FINALIZED",
    invoice_number: "KM-A-1001",
    client_transaction_id: "tx-1",
    sale_datetime: new Date(Date.now() - 3600000 * 2),
    payment_method: "CASH",
    subtotal: 350.0,
    discount_total: 20.0,
    taxable_total: 314.29,
    cgst_total: 7.86,
    sgst_total: 7.86,
    igst_total: 0,
    grand_total: 330.0,
    notes: "Patient: Ramesh Sharma | Mobile: 9876543210",
  },
  {
    sale_id: 2,
    branch_id: 1,
    patient_id: 2,
    doctor_id: null,
    sale_type: "BILLED",
    status: "FINALIZED",
    invoice_number: "KM-A-1002",
    client_transaction_id: "tx-2",
    sale_datetime: new Date(Date.now() - 3600000 * 5),
    payment_method: "UPI",
    subtotal: 540.0,
    discount_total: 40.0,
    taxable_total: 476.19,
    cgst_total: 11.9,
    sgst_total: 11.9,
    igst_total: 0,
    grand_total: 500.0,
    notes: "Patient: Pooja Patel | Mobile: 9812345678",
  },
  {
    sale_id: 3,
    branch_id: 2,
    patient_id: 3,
    doctor_id: null,
    sale_type: "BILLED",
    status: "FINALIZED",
    invoice_number: "KM-B-2001",
    client_transaction_id: "tx-3",
    sale_datetime: new Date(Date.now() - 3600000 * 3),
    payment_method: "CARD",
    subtotal: 450.0,
    discount_total: 0.0,
    taxable_total: 428.57,
    cgst_total: 10.71,
    sgst_total: 10.71,
    igst_total: 0,
    grand_total: 450.0,
    notes: "Patient: Amit Verma | Mobile: 9823456789",
  },
  {
    sale_id: 4,
    branch_id: 3,
    patient_id: 4,
    doctor_id: null,
    sale_type: "BILLED",
    status: "FINALIZED",
    invoice_number: "KM-C-3001",
    client_transaction_id: "tx-4",
    sale_datetime: new Date(Date.now() - 3600000 * 4),
    payment_method: "CASH",
    subtotal: 300.0,
    discount_total: 10.0,
    taxable_total: 276.19,
    cgst_total: 6.9,
    sgst_total: 6.9,
    igst_total: 0,
    grand_total: 290.0,
    notes: "Patient: Sneha Reddy | Mobile: 9834567890",
  },
];

const sale_items = [
  { sale_item_id: 1, sale_id: 1, branch_id: 1, batch_id: 1, product_id: 1, product_name_snapshot: "Dolo 650", batch_number_snapshot: "KOR-B001", expiry_date_snapshot: "2027-10-31", quantity: 5, mrp: 60, unit_selling_price: 3.6, mrp_snapshot: 60, unit_price: 3.6, discount_amount: 10, gst_rate: 5, line_total: 170 },
  { sale_item_id: 2, sale_id: 1, branch_id: 1, batch_id: 2, product_id: 2, product_name_snapshot: "Calpol 500", batch_number_snapshot: "KOR-B002", expiry_date_snapshot: "2027-09-30", quantity: 4, mrp: 70, unit_selling_price: 4.2, mrp_snapshot: 70, unit_price: 4.2, discount_amount: 10, gst_rate: 5, line_total: 160 },
  { sale_item_id: 3, sale_id: 2, branch_id: 1, batch_id: 3, product_id: 3, product_name_snapshot: "Moxikind CV 625", batch_number_snapshot: "KOR-B003", expiry_date_snapshot: "2027-12-31", quantity: 5, mrp: 80, unit_selling_price: 7.2, mrp_snapshot: 80, unit_price: 7.2, discount_amount: 40, gst_rate: 5, line_total: 500 },
];

const purchases = [
  { purchase_id: 1, branch_id: 1, supplier_id: 1, supplier_invoice_number: "SUP-101", purchase_datetime: new Date(), grand_total: 1250, status: "FINALIZED" },
  { purchase_id: 2, branch_id: 2, supplier_id: 2, supplier_invoice_number: "SUP-201", purchase_datetime: new Date(), grand_total: 980, status: "FINALIZED" },
  { purchase_id: 3, branch_id: 3, supplier_id: 3, supplier_invoice_number: "SUP-301", purchase_datetime: new Date(), grand_total: 750, status: "FINALIZED" },
];

const customer_returns = [];
const customer_return_items = [];

// Query dispatcher
async function executeMockQuery(sql, params = []) {
  const norm = sql.replace(/\s+/g, " ").trim();

  // 1. SELECT DATABASE()
  if (norm.includes("SELECT DATABASE()")) {
    return [[{ databaseName: "kiara_medicals_local", mysqlVersion: "8.4.0-mock" }]];
  }

  // 2. Auth login & token verification
  if (norm.includes("FROM users u") && (norm.includes("WHERE u.username = ?") || norm.includes("WHERE u.user_id = ?"))) {
    const isById = norm.includes("u.user_id = ?");
    const val = params[0];
    const user = isById
      ? users.find((u) => String(u.user_id) === String(val))
      : users.find((u) => u.username === val);
    if (!user) return [[]];
    const branch = branches.find((b) => b.branch_id === user.branch_id);
    return [[{
      ...user,
      branch_name: branch ? branch.branch_name : null,
      branch_is_active: branch ? branch.is_active : 1,
    }]];
  }

  // 3. Update last login
  if (norm.startsWith("UPDATE users SET last_login_at")) {
    const user = users.find((u) => u.user_id === params[1]);
    if (user) user.last_login_at = params[0];
    return [{ affectedRows: 1 }];
  }

  // Branches query
  if (norm.includes("FROM branches") && !norm.includes("sales s")) {
    if (norm.includes("WHERE branch_id = ?") && params.length > 0) {
      return [branches.filter((b) => Number(b.branch_id) === Number(params[0]))];
    }
    return [branches];
  }

  // 5. Admin overview: sales by branch
  if (norm.includes("COUNT(*) AS sale_count, COALESCE(SUM(s.grand_total), 0) AS total_sales FROM sales s")) {
    const result = [];
    for (const b of branches) {
      const bSales = sales.filter((s) => s.branch_id === b.branch_id && s.status === "FINALIZED");
      const total = bSales.reduce((acc, s) => acc + Number(s.grand_total), 0);
      result.push({
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        sale_count: bSales.length,
        total_sales: total,
      });
    }
    return [result];
  }

  // 6. Admin overview: totals
  if (norm.includes("COUNT(*) AS sale_count, COALESCE(SUM(grand_total), 0) AS total_sales FROM sales WHERE status = 'FINALIZED'")) {
    const finalized = sales.filter((s) => s.status === "FINALIZED");
    const total = finalized.reduce((acc, s) => acc + Number(s.grand_total), 0);
    return [[{ sale_count: finalized.length, total_sales: total }]];
  }

  // 7. Product count
  if (norm.includes("SELECT COUNT(*) AS count FROM products WHERE is_active = TRUE")) {
    return [[{ count: products.filter((p) => p.is_active).length }]];
  }

  // 8. Admin branches list
  if (norm.includes("SELECT") && norm.includes("FROM branches") && norm.includes("ORDER BY branch_id ASC")) {
    return [branches];
  }

  // 9. Update branch details
  if (norm.startsWith("UPDATE branches SET")) {
    const branchId = params[params.length - 1];
    const branch = branches.find((b) => b.branch_id === branchId);
    if (branch) {
      if (norm.includes("is_active = ?")) {
        const idx = norm.indexOf("is_active = ?");
        // find index in params
        branch.is_active = params[0] ? 1 : 0;
      }
      if (norm.includes("branch_name = ?")) {
        // Find in params
        for (const p of params) {
          if (typeof p === "string" && p.startsWith("Kiara Medicals")) branch.branch_name = p;
        }
      }
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  }

  // 10. Admin users list
  if (norm.includes("FROM users u") && norm.includes("ORDER BY u.user_id ASC")) {
    const result = users.map((u) => {
      const b = branches.find((br) => br.branch_id === u.branch_id);
      return {
        ...u,
        branch_name: b ? b.branch_name : null,
        branch_code: b ? b.branch_code : null,
      };
    });
    return [result];
  }

  // 10b. Admin overview aggregation (salesAgg & returnsAgg)
  if (norm.includes("AS gross_billed") && norm.includes("GROUP BY s.branch_id")) {
    const byBranch = branches.map((b) => {
      const bSales = sales.filter(
        (s) => Number(s.branch_id) === Number(b.branch_id) && s.status === "FINALIZED"
      );
      const billed = bSales.filter((s) => s.sale_type === "BILLED");
      const unbilled = bSales.filter((s) => s.sale_type === "UNBILLED");
      return {
        branch_id: b.branch_id,
        branch_name: b.branch_name,
        billed_count: billed.length,
        unbilled_count: unbilled.length,
        gross_billed: billed.reduce((sum, s) => sum + Number(s.grand_total || 0), 0),
        unbilled_total: unbilled.reduce((sum, s) => sum + Number(s.grand_total || 0), 0),
      };
    }).filter((r) => r.billed_count > 0 || r.unbilled_count > 0);
    return [byBranch];
  }

  if (norm.includes("FROM customer_returns") && norm.includes("GROUP BY sale_id")) {
    const branchId = params[0] != null ? Number(params[0]) : null;
    const map = new Map();
    for (const cr of customer_returns) {
      if (branchId != null && Number(cr.branch_id) !== branchId) continue;
      const cur = map.get(Number(cr.sale_id)) || {
        sale_id: cr.sale_id,
        return_count: 0,
        returned_total: 0,
      };
      cur.return_count += 1;
      cur.returned_total += Number(cr.return_total || 0);
      map.set(Number(cr.sale_id), cur);
    }
    return [Array.from(map.values())];
  }

  if (norm.includes("FROM customer_returns cr") && norm.includes("WHERE cr.sale_id = ?")) {
    const saleId = Number(params[0]);
    const branchId = Number(params[1]);
    return [
      customer_returns.filter(
        (cr) => Number(cr.sale_id) === saleId && Number(cr.branch_id) === branchId
      ),
    ];
  }

  if (norm.includes("FROM customer_return_items cri") && norm.includes("WHERE si.sale_id = ?")) {
    const saleId = Number(params[0]);
    const branchId = Number(params[1]);
    const saleItemsForSale = new Map(
      sale_items
        .filter((si) => Number(si.sale_id) === saleId && Number(si.branch_id) === branchId)
        .map((si) => [Number(si.sale_item_id), si])
    );
    return [
      customer_return_items
        .filter((cri) => saleItemsForSale.has(Number(cri.sale_item_id)))
        .map((cri) => {
          const si = saleItemsForSale.get(Number(cri.sale_item_id));
          return {
            ...cri,
            product_name_snapshot: si?.product_name_snapshot || "Medicine",
            batch_number_snapshot: si?.batch_number_snapshot || "",
          };
        }),
    ];
  }

  if (norm.includes("FROM purchases") && norm.includes("GROUP BY branch_id")) {
    const map = new Map();
    for (const p of purchases) {
      if (p.status !== "FINALIZED") continue;
      const bId = Number(p.branch_id);
      map.set(bId, (map.get(bId) || 0) + Number(p.grand_total || 0));
    }
    return [
      Array.from(map.entries()).map(([branch_id, stock_purchases]) => ({
        branch_id,
        stock_purchases,
      })),
    ];
  }

  if (norm.includes("FROM customer_returns") && norm.includes("GROUP BY branch_id")) {
    const map = new Map();
    for (const cr of customer_returns) {
      const bId = Number(cr.branch_id);
      map.set(bId, (map.get(bId) || 0) + Number(cr.return_total || 0));
    }
    return [
      Array.from(map.entries()).map(([branch_id, customer_returns]) => ({
        branch_id,
        customer_returns,
      })),
    ];
  }

  // 11. Admin sales list (with patient join and search)
  if (norm.includes("FROM sales s") && norm.includes("JOIN branches b ON b.branch_id = s.branch_id")) {
    let list = sales.map((s) => {
      const b = branches.find((br) => br.branch_id === s.branch_id);
      const p = patients.find((pt) => pt.patient_id === s.patient_id);
      return {
        ...s,
        branch_name: b ? b.branch_name : "Kiara Medicals",
        patient_full_name: p ? p.full_name : "Walk-in Patient",
        patient_name: p ? p.full_name : "Walk-in Patient",
        patientName: p ? p.full_name : "Walk-in Patient",
        patient_mobile_db: p ? p.mobile : null,
        patient_mobile: p ? p.mobile : null,
        patientMobile: p ? p.mobile : null,
      };
    });

    if (params.length > 0 && /^\d+$/.test(String(params[0]))) {
      list = list.filter((s) => Number(s.branch_id) === Number(params[0]));
    }
    return [list];
  }

  // 12. Analytics: branch metrics
  if (norm.includes("SELECT COALESCE(SUM(grand_total), 0) AS total FROM sales") && norm.includes("sale_type = 'BILLED'")) {
    const branchId = Number(params[0]);
    const bSales = sales.filter((s) => Number(s.branch_id) === branchId && s.sale_type === "BILLED" && s.status === "FINALIZED");
    const total = bSales.reduce((acc, s) => acc + Number(s.grand_total), 0);
    return [[{ total }]];
  }

  if (norm.includes("SELECT COALESCE(SUM(grand_total), 0) AS total FROM sales") && norm.includes("sale_type = 'UNBILLED'")) {
    const branchId = Number(params[0]);
    const bSales = sales.filter((s) => Number(s.branch_id) === branchId && s.sale_type === "UNBILLED");
    const total = bSales.reduce((acc, s) => acc + Number(s.grand_total), 0);
    return [[{ total }]];
  }

  if (norm.includes("FROM customer_returns WHERE branch_id = ?")) {
    return [[{ total: 0 }]];
  }

  if (norm.includes("FROM purchases WHERE branch_id = ?")) {
    const branchId = params[0];
    const bPurchases = purchases.filter((p) => p.branch_id === branchId);
    const total = bPurchases.reduce((acc, p) => acc + Number(p.grand_total), 0);
    return [[{ total }]];
  }

  // 13a. Idempotency check by client_transaction_id
  if (norm.includes("FROM sales") && norm.includes("WHERE client_transaction_id = ?")) {
    const txId = params[0];
    return [sales.filter((s) => s.client_transaction_id === txId)];
  }

  // 13b. Single bill detail (GET /api/billing/:saleId)
  if (norm.includes("FROM sales") && norm.includes("WHERE sale_id = ?")) {
    const saleId = Number(params[0]);
    const branchId = params[1] != null ? Number(params[1]) : null;
    return [
      sales.filter(
        (s) =>
          Number(s.sale_id) === saleId &&
          (branchId == null || Number(s.branch_id) === branchId)
      ),
    ];
  }

  // 13c. Single bill items (GET /api/billing/:saleId)
  if (norm.includes("FROM sale_items") && norm.includes("WHERE sale_id = ?")) {
    const saleId = Number(params[0]);
    const branchId = params[1] != null ? Number(params[1]) : null;
    return [
      sale_items.filter(
        (si) =>
          Number(si.sale_id) === saleId &&
          (branchId == null || Number(si.branch_id) === branchId)
      ),
    ];
  }

  // 13d. Patient notes search inside sales (GET /api/billing/patients/search)
  if (norm.includes("SELECT notes FROM sales") && norm.includes("notes LIKE ?")) {
    const branchId = Number(params[0]);
    const rawTerm = String(params[1] || "").replace(/%/g, "").trim().toLowerCase();
    return [
      sales.filter(
        (s) =>
          Number(s.branch_id) === branchId &&
          s.sale_type === "BILLED" &&
          s.notes &&
          (!rawTerm || s.notes.toLowerCase().includes(rawTerm))
      ),
    ];
  }

  // 13e. Billing: recent / history / search
  if (norm.includes("FROM sales s") && norm.includes("sale_type = 'BILLED'")) {
    const branchId = Number(params[0]);
    const searchTerm =
      params.length > 1
        ? String(params[1] || "").replace(/%/g, "").trim().toLowerCase()
        : "";

    let bSales = sales.filter(
      (s) =>
        Number(s.branch_id) === branchId &&
        s.sale_type === "BILLED" &&
        s.status === "FINALIZED"
    );

    const enriched = bSales.map((s) => {
      const p = patients.find((pt) => Number(pt.patient_id) === Number(s.patient_id));
      const notesName = (s.notes || "").match(/Patient:\s*([^|]+)/i)?.[1]?.trim();
      const notesMobile = (s.notes || "").match(/Mobile:\s*([^|]+)/i)?.[1]?.trim();
      const resolvedName =
        (p && p.full_name) ||
        (notesName && notesName !== "N/A" ? notesName : null);
      const resolvedMobile =
        (p && p.mobile) ||
        (notesMobile && notesMobile !== "N/A" ? notesMobile : null);

      return {
        ...s,
        patient_full_name: resolvedName,
        patient_name: resolvedName || "Walk-in Patient",
        patientName: resolvedName || "Walk-in Patient",
        patient_mobile_db: resolvedMobile,
        patient_mobile: resolvedMobile,
        patientMobile: resolvedMobile,
      };
    });

    if (searchTerm) {
      return [
        enriched.filter((row) =>
          [
            row.notes || "",
            row.invoice_number || "",
            String(row.sale_id),
            row.patient_full_name || "",
            row.patient_mobile_db || "",
          ].some((field) => field.toLowerCase().includes(searchTerm))
        ),
      ];
    }
    return [enriched];
  }

  // 14. Billing / Inventory: medicines search
  if (norm.includes("FROM inventory i") || (norm.includes("FROM products p") && norm.includes("batches b"))) {
    const isSingleBatch = norm.includes("i.batch_id = ?") || norm.includes("ba.batch_id = ?");
    const targetBranch = params.find((p) => typeof p === "number" || (/^\d+$/.test(String(p)) && Number(p) <= 10));
    const targetBatch = isSingleBatch ? params[1] : null;

    const res = [];
    for (const inv of inventory) {
      if (targetBranch != null && Number(inv.branch_id) !== Number(targetBranch)) continue;
      if (targetBatch != null && Number(inv.batch_id) !== Number(targetBatch)) continue;
      const b = batches.find((bat) => bat.batch_id === inv.batch_id);
      if (!b) continue;
      const p = products.find((pr) => pr.product_id === b.product_id);
      if (!p) continue;
      res.push({
        inventory_id: inv.inventory_id,
        branch_id: inv.branch_id,
        batch_id: inv.batch_id,
        product_id: p.product_id,
        product_name: p.product_name,
        brand: p.brand,
        strength: p.strength,
        dosage_form: p.dosage_form,
        packaging: p.packaging,
        batch_number: b.batch_number,
        expiry_date: b.expiry_date,
        quantity: inv.quantity,
        loose_quantity: inv.loose_quantity,
        selling_price: inv.selling_price,
        mrp: b.mrp,
        stock_unit_label: p.stock_unit_label,
        smallest_unit_label: p.smallest_unit_label,
        units_per_stock_unit: p.units_per_stock_unit,
        default_hsn_code: p.default_hsn_code,
        default_gst_rate: p.default_gst_rate,
        available_smallest_units: (inv.quantity * (p.units_per_stock_unit || 1)) + (inv.loose_quantity || 0),
      });
    }
    return [res];
  }

  // 15. Products list
  if (norm.includes("FROM products") && !norm.includes("COUNT(*)")) {
    return [products];
  }

  // 16. Inventory list
  if (norm.includes("FROM inventory")) {
    return [inventory];
  }

  // 17. Patients search & lookup
  if (norm.includes("FROM patients")) {
    const branchId = params[0] != null ? Number(params[0]) : null;
    if (norm.includes("WHERE branch_id = ? AND mobile = ?")) {
      const mobile = String(params[1] || "").trim();
      return [patients.filter((p) => Number(p.branch_id) === branchId && p.mobile === mobile)];
    }
    if (norm.includes("WHERE branch_id = ? AND full_name = ?")) {
      const name = String(params[1] || "").trim().toLowerCase();
      return [patients.filter((p) => Number(p.branch_id) === branchId && p.full_name.toLowerCase() === name)];
    }
    if (norm.includes("WHERE patient_id = ? AND branch_id = ?")) {
      const pid = Number(params[0]);
      const bId = Number(params[1]);
      return [patients.filter((p) => Number(p.patient_id) === pid && Number(p.branch_id) === bId)];
    }
    // Search query: p.branch_id = ? AND (p.full_name LIKE ? OR COALESCE(p.mobile, '') LIKE ?)
    const rawTerm = String(params[1] || "").replace(/%/g, "").trim().toLowerCase();
    return [
      patients.filter(
        (p) =>
          (branchId == null || Number(p.branch_id) === branchId) &&
          (!rawTerm ||
            p.full_name.toLowerCase().includes(rawTerm) ||
            (p.mobile || "").toLowerCase().includes(rawTerm))
      ),
    ];
  }

  // 17b. Insert patient
  if (norm.startsWith("INSERT INTO patients")) {
    const patientId = patients.length + 1;
    const newPatient = {
      patient_id: patientId,
      branch_id: Number(params[0]),
      full_name: params[1],
      mobile: params[2] || null,
    };
    patients.push(newPatient);
    return [{ insertId: patientId, affectedRows: 1 }];
  }

  // 18. Alerts: low stock
  if (norm.includes("FROM inventory") && norm.includes("low_stock")) {
    return [[]];
  }
  if (norm.startsWith("SELECT") && norm.includes("expiry") && !norm.includes("sale_items")) {
    return [[]];
  }

  // 18b. Update inventory stock after billing
  if (norm.startsWith("UPDATE inventory SET quantity = ?, loose_quantity = ?")) {
    const newQty = Number(params[0]);
    const newLoose = Number(params[1]);
    const branchId = Number(params[2]);
    const batchId = Number(params[3]);
    const inv = inventory.find(
      (i) => Number(i.branch_id) === branchId && Number(i.batch_id) === batchId
    );
    if (inv) {
      inv.quantity = newQty;
      inv.loose_quantity = newLoose;
    }
    return [{ affectedRows: inv ? 1 : 0 }];
  }

  // 19. Insert into sales
  if (norm.startsWith("INSERT INTO sales")) {
    const saleId = sales.length + 1;
    const isUnbilled = norm.includes("'UNBILLED'");
    if (isUnbilled) {
      const newSale = {
        sale_id: saleId,
        branch_id: Number(params[0]),
        patient_id: null,
        doctor_id: null,
        sale_type: "UNBILLED",
        status: "FINALIZED",
        invoice_number: null,
        client_transaction_id: params[1],
        sale_datetime: new Date(),
        payment_method: params[2],
        subtotal: params[3],
        discount_total: params[4],
        taxable_total: 0,
        cgst_total: 0,
        sgst_total: 0,
        grand_total: params[5],
        notes: params[6],
      };
      sales.unshift(newSale);
    } else {
      const newSale = {
        sale_id: saleId,
        branch_id: Number(params[0]),
        patient_id: params[1] != null ? Number(params[1]) : null,
        doctor_id: params[2] != null ? Number(params[2]) : null,
        sale_type: "BILLED",
        status: "FINALIZED",
        invoice_number: params[3],
        client_transaction_id: params[4],
        sale_datetime: new Date(),
        payment_method: params[5],
        subtotal: params[6],
        discount_total: params[7],
        taxable_total: params[8],
        cgst_total: params[9],
        sgst_total: params[10],
        grand_total: params[11],
        notes: params[12],
      };
      sales.unshift(newSale);
    }
    return [{ insertId: saleId, affectedRows: 1 }];
  }

  // 20. Insert sale items
  if (norm.startsWith("INSERT INTO sale_items")) {
    const saleItemId = sale_items.length + 1;
    const newItem = {
      sale_item_id: saleItemId,
      sale_id: Number(params[0]),
      branch_id: Number(params[1]),
      batch_id: Number(params[2]),
      product_name_snapshot: params[3],
      batch_number_snapshot: params[4],
      expiry_date_snapshot: params[5],
      quantity: Number(params[6]),
      mrp: Number(params[7]),
      unit_selling_price: Number(params[8]),
      discount_amount: Number(params[9]),
      gst_rate: Number(params[10]),
      taxable_amount: Number(params[11] || 0),
      cgst_amount: Number(params[12] || 0),
      sgst_amount: Number(params[13] || 0),
      line_total: Number(params[14] ?? params[11] ?? 0),
    };
    sale_items.push(newItem);
    return [{ insertId: saleItemId, affectedRows: 1 }];
  }

  // 21. Insert user
  if (norm.startsWith("INSERT INTO users")) {
    const userId = users.length + 1;
    const newUser = {
      user_id: userId,
      branch_id: params[0],
      full_name: params[1],
      username: params[2],
      password_hash: params[3],
      role: params[4],
      is_active: 1,
      last_login_at: null,
    };
    users.push(newUser);
    return [{ insertId: userId, affectedRows: 1 }];
  }

  // 22. Customer returns lookup & creation
  if (norm.includes("FROM customer_return_items") && norm.includes("GROUP BY cri.sale_item_id")) {
    const saleId = Number(params[0]);
    const branchId = Number(params[1]);
    const itemIds = new Set(
      sale_items.filter((si) => Number(si.sale_id) === saleId && Number(si.branch_id) === branchId).map((si) => Number(si.sale_item_id))
    );
    const agg = new Map();
    for (const cri of customer_return_items) {
      if (!itemIds.has(Number(cri.sale_item_id))) continue;
      agg.set(Number(cri.sale_item_id), (agg.get(Number(cri.sale_item_id)) || 0) + Number(cri.quantity || 0));
    }
    return [Array.from(agg.entries()).map(([sale_item_id, returned_qty]) => ({ sale_item_id, returned_qty }))];
  }

  if (norm.includes("FROM customer_return_items") && norm.includes("WHERE sale_item_id = ?")) {
    const saleItemId = Number(params[0]);
    const branchId = Number(params[1]);
    const returned_qty = customer_return_items
      .filter((cri) => Number(cri.sale_item_id) === saleItemId && Number(cri.branch_id) === branchId)
      .reduce((s, cri) => s + Number(cri.quantity || 0), 0);
    return [[{ returned_qty }]];
  }

  if (norm.includes("FROM sale_items") && norm.includes("WHERE sale_item_id = ?")) {
    const saleItemId = Number(params[0]);
    const saleId = Number(params[1]);
    const branchId = Number(params[2]);
    return [sale_items.filter((si) => Number(si.sale_item_id) === saleItemId && Number(si.sale_id) === saleId && Number(si.branch_id) === branchId)];
  }

  if (norm.startsWith("INSERT INTO customer_returns")) {
    const id = customer_returns.length + 1;
    customer_returns.push({
      customer_return_id: id,
      branch_id: Number(params[0]),
      sale_id: Number(params[1]),
      return_datetime: new Date(),
      credit_note_number: params[2],
      return_total: 0,
      client_transaction_id: params[3],
      notes: params[4],
    });
    return [{ insertId: id, affectedRows: 1 }];
  }

  if (norm.startsWith("UPDATE customer_returns SET return_total = ?")) {
    const cr = customer_returns.find((r) => Number(r.customer_return_id) === Number(params[1]));
    if (cr) cr.return_total = Number(params[0]);
    return [{ affectedRows: cr ? 1 : 0 }];
  }

  if (norm.startsWith("INSERT INTO customer_return_items")) {
    const id = customer_return_items.length + 1;
    customer_return_items.push({
      customer_return_item_id: id,
      customer_return_id: Number(params[0]),
      branch_id: Number(params[1]),
      sale_item_id: Number(params[2]),
      batch_id: Number(params[3]),
      quantity: Number(params[4]),
      refund_amount: Number(params[5]),
    });
    return [{ insertId: id, affectedRows: 1 }];
  }

  // Default fallback
  return [[]];
}

// Mock Connection object for transactions
function createMockConnection() {
  return {
    execute: executeMockQuery,
    query: executeMockQuery,
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
}

module.exports = {
  executeMockQuery,
  createMockConnection,
  mockData: { branches, users, products, batches, inventory, sales, patients },
};
