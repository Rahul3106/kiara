
USE defaultdb;

-- Step 1: Add missing branch mappings
INSERT INTO branch_products (
    branch_id, product_id, low_stock_threshold
)
SELECT
    b.branch_id,
    p.product_id,
    10
FROM branches b
CROSS JOIN products p
LEFT JOIN branch_products bp
    ON bp.branch_id = b.branch_id
    AND bp.product_id = p.product_id
WHERE p.product_id BETWEEN 64 AND 69
  AND bp.product_id IS NULL;


-- Step 2: Create batches only where missing
-- Copy existing BR003 batch pricing and expiry details

INSERT INTO batches (
    branch_id,
    product_id,
    batch_number,
    expiry_date,
    mrp,
    purchase_price
)
SELECT
    target.branch_id,
    source.product_id,
    CONCAT(target.branch_code, '-FIX-', source.product_id),
    source.expiry_date,
    source.mrp,
    source.purchase_price
FROM batches source
JOIN branches source_branch
    ON source.branch_id = source_branch.branch_id
JOIN branches target
    ON target.branch_id <> source.branch_id
LEFT JOIN batches existing
    ON existing.branch_id = target.branch_id
    AND existing.product_id = source.product_id
WHERE source_branch.branch_code = 'BR003'
  AND source.product_id BETWEEN 64 AND 69
  AND existing.batch_id IS NULL;


-- Step 3: Add inventory for newly created batches

INSERT INTO inventory (
    branch_id,
    batch_id,
    quantity,
    loose_quantity,
    selling_price
)
SELECT
    ba.branch_id,
    ba.batch_id,
    CASE b.branch_code
        WHEN 'BR001' THEN 20
        WHEN 'BR002' THEN 15
        ELSE 10
    END,
    0,
    ROUND(ba.mrp * 0.90, 2)
FROM batches ba
JOIN branches b
    ON b.branch_id = ba.branch_id
LEFT JOIN inventory i
    ON i.branch_id = ba.branch_id
    AND i.batch_id = ba.batch_id
WHERE ba.product_id BETWEEN 64 AND 69
  AND ba.batch_number LIKE '%-FIX-%'
  AND i.batch_id IS NULL;
  
  
  
  
SELECT 'products' AS table_name, COUNT(*) AS total FROM products
UNION ALL
SELECT 'branch_products', COUNT(*) FROM branch_products
UNION ALL
SELECT 'batches', COUNT(*) FROM batches
UNION ALL
SELECT 'inventory', COUNT(*) FROM inventory;
