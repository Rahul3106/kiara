-- Kiara Medicals: add 205 new generic medicine SKUs
-- MySQL 8+ | Database: defaultdb
-- 41 single-ingredient generics x 5 pack sizes = 205 unique product_name values.
-- ALL MRP/purchase prices and stock quantities are DEMO DATA, not supplier quotations.
-- GST is set to 5.00 as a prototype default; verify current HSN/GST classification
-- with your CA/tax adviser before using this database for live billing.
-- This script preserves existing products, batches and inventory.
-- Safe to re-run: product, branch mapping, batch and inventory inserts are guarded.

USE defaultdb;

DROP TEMPORARY TABLE IF EXISTS tmp_kiara_catalog_205;
CREATE TEMPORARY TABLE tmp_kiara_catalog_205 (
    product_name VARCHAR(180) NOT NULL,
    salt_name VARCHAR(180) NOT NULL,
    strength VARCHAR(80) NOT NULL,
    dosage_form VARCHAR(80) NOT NULL,
    packaging VARCHAR(80) NOT NULL,
    units_per_stock_unit INT NOT NULL,
    demo_mrp DECIMAL(10,2) NOT NULL,
    demo_purchase_price DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (product_name)
) ENGINE=InnoDB;

INSERT INTO tmp_kiara_catalog_205
(product_name, salt_name, strength, dosage_form, packaging,
 units_per_stock_unit, demo_mrp, demo_purchase_price)
VALUES
('Generic Paracetamol 500 mg Tablet (10s)', 'Paracetamol', '500 mg', 'Tablet', '10 tablets', 10, 18.00, 12.96),
('Generic Paracetamol 500 mg Tablet (15s)', 'Paracetamol', '500 mg', 'Tablet', '15 tablets', 15, 27.00, 19.44),
('Generic Paracetamol 500 mg Tablet (20s)', 'Paracetamol', '500 mg', 'Tablet', '20 tablets', 20, 36.00, 25.92),
('Generic Paracetamol 500 mg Tablet (30s)', 'Paracetamol', '500 mg', 'Tablet', '30 tablets', 30, 54.00, 38.88),
('Generic Paracetamol 500 mg Tablet (60s)', 'Paracetamol', '500 mg', 'Tablet', '60 tablets', 60, 108.00, 77.76),
('Generic Ibuprofen 400 mg Tablet (10s)', 'Ibuprofen', '400 mg', 'Tablet', '10 tablets', 10, 24.00, 17.28),
('Generic Ibuprofen 400 mg Tablet (15s)', 'Ibuprofen', '400 mg', 'Tablet', '15 tablets', 15, 36.00, 25.92),
('Generic Ibuprofen 400 mg Tablet (20s)', 'Ibuprofen', '400 mg', 'Tablet', '20 tablets', 20, 48.00, 34.56),
('Generic Ibuprofen 400 mg Tablet (30s)', 'Ibuprofen', '400 mg', 'Tablet', '30 tablets', 30, 72.00, 51.84),
('Generic Ibuprofen 400 mg Tablet (60s)', 'Ibuprofen', '400 mg', 'Tablet', '60 tablets', 60, 144.00, 103.68),
('Generic Diclofenac 50 mg Tablet (10s)', 'Diclofenac', '50 mg', 'Tablet', '10 tablets', 10, 22.00, 15.84),
('Generic Diclofenac 50 mg Tablet (15s)', 'Diclofenac', '50 mg', 'Tablet', '15 tablets', 15, 33.00, 23.76),
('Generic Diclofenac 50 mg Tablet (20s)', 'Diclofenac', '50 mg', 'Tablet', '20 tablets', 20, 44.00, 31.68),
('Generic Diclofenac 50 mg Tablet (30s)', 'Diclofenac', '50 mg', 'Tablet', '30 tablets', 30, 66.00, 47.52),
('Generic Diclofenac 50 mg Tablet (60s)', 'Diclofenac', '50 mg', 'Tablet', '60 tablets', 60, 132.00, 95.04),
('Generic Naproxen 250 mg Tablet (10s)', 'Naproxen', '250 mg', 'Tablet', '10 tablets', 10, 35.00, 25.20),
('Generic Naproxen 250 mg Tablet (15s)', 'Naproxen', '250 mg', 'Tablet', '15 tablets', 15, 52.50, 37.80),
('Generic Naproxen 250 mg Tablet (20s)', 'Naproxen', '250 mg', 'Tablet', '20 tablets', 20, 70.00, 50.40),
('Generic Naproxen 250 mg Tablet (30s)', 'Naproxen', '250 mg', 'Tablet', '30 tablets', 30, 105.00, 75.60),
('Generic Naproxen 250 mg Tablet (60s)', 'Naproxen', '250 mg', 'Tablet', '60 tablets', 60, 210.00, 151.20),
('Generic Aspirin 75 mg Tablet (10s)', 'Aspirin', '75 mg', 'Tablet', '10 tablets', 10, 12.00, 8.64),
('Generic Aspirin 75 mg Tablet (15s)', 'Aspirin', '75 mg', 'Tablet', '15 tablets', 15, 18.00, 12.96),
('Generic Aspirin 75 mg Tablet (20s)', 'Aspirin', '75 mg', 'Tablet', '20 tablets', 20, 24.00, 17.28),
('Generic Aspirin 75 mg Tablet (30s)', 'Aspirin', '75 mg', 'Tablet', '30 tablets', 30, 36.00, 25.92),
('Generic Aspirin 75 mg Tablet (60s)', 'Aspirin', '75 mg', 'Tablet', '60 tablets', 60, 72.00, 51.84),
('Generic Atorvastatin 10 mg Tablet (10s)', 'Atorvastatin', '10 mg', 'Tablet', '10 tablets', 10, 28.00, 20.16),
('Generic Atorvastatin 10 mg Tablet (15s)', 'Atorvastatin', '10 mg', 'Tablet', '15 tablets', 15, 42.00, 30.24),
('Generic Atorvastatin 10 mg Tablet (20s)', 'Atorvastatin', '10 mg', 'Tablet', '20 tablets', 20, 56.00, 40.32),
('Generic Atorvastatin 10 mg Tablet (30s)', 'Atorvastatin', '10 mg', 'Tablet', '30 tablets', 30, 84.00, 60.48),
('Generic Atorvastatin 10 mg Tablet (60s)', 'Atorvastatin', '10 mg', 'Tablet', '60 tablets', 60, 168.00, 120.96),
('Generic Rosuvastatin 10 mg Tablet (10s)', 'Rosuvastatin', '10 mg', 'Tablet', '10 tablets', 10, 42.00, 30.24),
('Generic Rosuvastatin 10 mg Tablet (15s)', 'Rosuvastatin', '10 mg', 'Tablet', '15 tablets', 15, 63.00, 45.36),
('Generic Rosuvastatin 10 mg Tablet (20s)', 'Rosuvastatin', '10 mg', 'Tablet', '20 tablets', 20, 84.00, 60.48),
('Generic Rosuvastatin 10 mg Tablet (30s)', 'Rosuvastatin', '10 mg', 'Tablet', '30 tablets', 30, 126.00, 90.72),
('Generic Rosuvastatin 10 mg Tablet (60s)', 'Rosuvastatin', '10 mg', 'Tablet', '60 tablets', 60, 252.00, 181.44),
('Generic Metformin 500 mg Tablet (10s)', 'Metformin', '500 mg', 'Tablet', '10 tablets', 10, 16.00, 11.52),
('Generic Metformin 500 mg Tablet (15s)', 'Metformin', '500 mg', 'Tablet', '15 tablets', 15, 24.00, 17.28),
('Generic Metformin 500 mg Tablet (20s)', 'Metformin', '500 mg', 'Tablet', '20 tablets', 20, 32.00, 23.04),
('Generic Metformin 500 mg Tablet (30s)', 'Metformin', '500 mg', 'Tablet', '30 tablets', 30, 48.00, 34.56),
('Generic Metformin 500 mg Tablet (60s)', 'Metformin', '500 mg', 'Tablet', '60 tablets', 60, 96.00, 69.12),
('Generic Glimepiride 1 mg Tablet (10s)', 'Glimepiride', '1 mg', 'Tablet', '10 tablets', 10, 20.00, 14.40),
('Generic Glimepiride 1 mg Tablet (15s)', 'Glimepiride', '1 mg', 'Tablet', '15 tablets', 15, 30.00, 21.60),
('Generic Glimepiride 1 mg Tablet (20s)', 'Glimepiride', '1 mg', 'Tablet', '20 tablets', 20, 40.00, 28.80),
('Generic Glimepiride 1 mg Tablet (30s)', 'Glimepiride', '1 mg', 'Tablet', '30 tablets', 30, 60.00, 43.20),
('Generic Glimepiride 1 mg Tablet (60s)', 'Glimepiride', '1 mg', 'Tablet', '60 tablets', 60, 120.00, 86.40),
('Generic Gliclazide 80 mg Tablet (10s)', 'Gliclazide', '80 mg', 'Tablet', '10 tablets', 10, 32.00, 23.04),
('Generic Gliclazide 80 mg Tablet (15s)', 'Gliclazide', '80 mg', 'Tablet', '15 tablets', 15, 48.00, 34.56),
('Generic Gliclazide 80 mg Tablet (20s)', 'Gliclazide', '80 mg', 'Tablet', '20 tablets', 20, 64.00, 46.08),
('Generic Gliclazide 80 mg Tablet (30s)', 'Gliclazide', '80 mg', 'Tablet', '30 tablets', 30, 96.00, 69.12),
('Generic Gliclazide 80 mg Tablet (60s)', 'Gliclazide', '80 mg', 'Tablet', '60 tablets', 60, 192.00, 138.24),
('Generic Sitagliptin 100 mg Tablet (10s)', 'Sitagliptin', '100 mg', 'Tablet', '10 tablets', 10, 110.00, 79.20),
('Generic Sitagliptin 100 mg Tablet (15s)', 'Sitagliptin', '100 mg', 'Tablet', '15 tablets', 15, 165.00, 118.80),
('Generic Sitagliptin 100 mg Tablet (20s)', 'Sitagliptin', '100 mg', 'Tablet', '20 tablets', 20, 220.00, 158.40),
('Generic Sitagliptin 100 mg Tablet (30s)', 'Sitagliptin', '100 mg', 'Tablet', '30 tablets', 30, 330.00, 237.60),
('Generic Sitagliptin 100 mg Tablet (60s)', 'Sitagliptin', '100 mg', 'Tablet', '60 tablets', 60, 660.00, 475.20),
('Generic Dapagliflozin 10 mg Tablet (10s)', 'Dapagliflozin', '10 mg', 'Tablet', '10 tablets', 10, 95.00, 68.40),
('Generic Dapagliflozin 10 mg Tablet (15s)', 'Dapagliflozin', '10 mg', 'Tablet', '15 tablets', 15, 142.50, 102.60),
('Generic Dapagliflozin 10 mg Tablet (20s)', 'Dapagliflozin', '10 mg', 'Tablet', '20 tablets', 20, 190.00, 136.80),
('Generic Dapagliflozin 10 mg Tablet (30s)', 'Dapagliflozin', '10 mg', 'Tablet', '30 tablets', 30, 285.00, 205.20),
('Generic Dapagliflozin 10 mg Tablet (60s)', 'Dapagliflozin', '10 mg', 'Tablet', '60 tablets', 60, 570.00, 410.40),
('Generic Empagliflozin 10 mg Tablet (10s)', 'Empagliflozin', '10 mg', 'Tablet', '10 tablets', 10, 105.00, 75.60),
('Generic Empagliflozin 10 mg Tablet (15s)', 'Empagliflozin', '10 mg', 'Tablet', '15 tablets', 15, 157.50, 113.40),
('Generic Empagliflozin 10 mg Tablet (20s)', 'Empagliflozin', '10 mg', 'Tablet', '20 tablets', 20, 210.00, 151.20),
('Generic Empagliflozin 10 mg Tablet (30s)', 'Empagliflozin', '10 mg', 'Tablet', '30 tablets', 30, 315.00, 226.80),
('Generic Empagliflozin 10 mg Tablet (60s)', 'Empagliflozin', '10 mg', 'Tablet', '60 tablets', 60, 630.00, 453.60),
('Generic Telmisartan 40 mg Tablet (10s)', 'Telmisartan', '40 mg', 'Tablet', '10 tablets', 10, 32.00, 23.04),
('Generic Telmisartan 40 mg Tablet (15s)', 'Telmisartan', '40 mg', 'Tablet', '15 tablets', 15, 48.00, 34.56),
('Generic Telmisartan 40 mg Tablet (20s)', 'Telmisartan', '40 mg', 'Tablet', '20 tablets', 20, 64.00, 46.08),
('Generic Telmisartan 40 mg Tablet (30s)', 'Telmisartan', '40 mg', 'Tablet', '30 tablets', 30, 96.00, 69.12),
('Generic Telmisartan 40 mg Tablet (60s)', 'Telmisartan', '40 mg', 'Tablet', '60 tablets', 60, 192.00, 138.24),
('Generic Losartan 50 mg Tablet (10s)', 'Losartan', '50 mg', 'Tablet', '10 tablets', 10, 26.00, 18.72),
('Generic Losartan 50 mg Tablet (15s)', 'Losartan', '50 mg', 'Tablet', '15 tablets', 15, 39.00, 28.08),
('Generic Losartan 50 mg Tablet (20s)', 'Losartan', '50 mg', 'Tablet', '20 tablets', 20, 52.00, 37.44),
('Generic Losartan 50 mg Tablet (30s)', 'Losartan', '50 mg', 'Tablet', '30 tablets', 30, 78.00, 56.16),
('Generic Losartan 50 mg Tablet (60s)', 'Losartan', '50 mg', 'Tablet', '60 tablets', 60, 156.00, 112.32),
('Generic Amlodipine 5 mg Tablet (10s)', 'Amlodipine', '5 mg', 'Tablet', '10 tablets', 10, 14.00, 10.08),
('Generic Amlodipine 5 mg Tablet (15s)', 'Amlodipine', '5 mg', 'Tablet', '15 tablets', 15, 21.00, 15.12),
('Generic Amlodipine 5 mg Tablet (20s)', 'Amlodipine', '5 mg', 'Tablet', '20 tablets', 20, 28.00, 20.16),
('Generic Amlodipine 5 mg Tablet (30s)', 'Amlodipine', '5 mg', 'Tablet', '30 tablets', 30, 42.00, 30.24),
('Generic Amlodipine 5 mg Tablet (60s)', 'Amlodipine', '5 mg', 'Tablet', '60 tablets', 60, 84.00, 60.48),
('Generic Cilnidipine 10 mg Tablet (10s)', 'Cilnidipine', '10 mg', 'Tablet', '10 tablets', 10, 38.00, 27.36),
('Generic Cilnidipine 10 mg Tablet (15s)', 'Cilnidipine', '10 mg', 'Tablet', '15 tablets', 15, 57.00, 41.04),
('Generic Cilnidipine 10 mg Tablet (20s)', 'Cilnidipine', '10 mg', 'Tablet', '20 tablets', 20, 76.00, 54.72),
('Generic Cilnidipine 10 mg Tablet (30s)', 'Cilnidipine', '10 mg', 'Tablet', '30 tablets', 30, 114.00, 82.08),
('Generic Cilnidipine 10 mg Tablet (60s)', 'Cilnidipine', '10 mg', 'Tablet', '60 tablets', 60, 228.00, 164.16),
('Generic Metoprolol 25 mg Tablet (10s)', 'Metoprolol', '25 mg', 'Tablet', '10 tablets', 10, 18.00, 12.96),
('Generic Metoprolol 25 mg Tablet (15s)', 'Metoprolol', '25 mg', 'Tablet', '15 tablets', 15, 27.00, 19.44),
('Generic Metoprolol 25 mg Tablet (20s)', 'Metoprolol', '25 mg', 'Tablet', '20 tablets', 20, 36.00, 25.92),
('Generic Metoprolol 25 mg Tablet (30s)', 'Metoprolol', '25 mg', 'Tablet', '30 tablets', 30, 54.00, 38.88),
('Generic Metoprolol 25 mg Tablet (60s)', 'Metoprolol', '25 mg', 'Tablet', '60 tablets', 60, 108.00, 77.76),
('Generic Atenolol 50 mg Tablet (10s)', 'Atenolol', '50 mg', 'Tablet', '10 tablets', 10, 16.00, 11.52),
('Generic Atenolol 50 mg Tablet (15s)', 'Atenolol', '50 mg', 'Tablet', '15 tablets', 15, 24.00, 17.28),
('Generic Atenolol 50 mg Tablet (20s)', 'Atenolol', '50 mg', 'Tablet', '20 tablets', 20, 32.00, 23.04),
('Generic Atenolol 50 mg Tablet (30s)', 'Atenolol', '50 mg', 'Tablet', '30 tablets', 30, 48.00, 34.56),
('Generic Atenolol 50 mg Tablet (60s)', 'Atenolol', '50 mg', 'Tablet', '60 tablets', 60, 96.00, 69.12),
('Generic Bisoprolol 2.5 mg Tablet (10s)', 'Bisoprolol', '2.5 mg', 'Tablet', '10 tablets', 10, 24.00, 17.28),
('Generic Bisoprolol 2.5 mg Tablet (15s)', 'Bisoprolol', '2.5 mg', 'Tablet', '15 tablets', 15, 36.00, 25.92),
('Generic Bisoprolol 2.5 mg Tablet (20s)', 'Bisoprolol', '2.5 mg', 'Tablet', '20 tablets', 20, 48.00, 34.56),
('Generic Bisoprolol 2.5 mg Tablet (30s)', 'Bisoprolol', '2.5 mg', 'Tablet', '30 tablets', 30, 72.00, 51.84),
('Generic Bisoprolol 2.5 mg Tablet (60s)', 'Bisoprolol', '2.5 mg', 'Tablet', '60 tablets', 60, 144.00, 103.68),
('Generic Ramipril 2.5 mg Tablet (10s)', 'Ramipril', '2.5 mg', 'Tablet', '10 tablets', 10, 20.00, 14.40),
('Generic Ramipril 2.5 mg Tablet (15s)', 'Ramipril', '2.5 mg', 'Tablet', '15 tablets', 15, 30.00, 21.60),
('Generic Ramipril 2.5 mg Tablet (20s)', 'Ramipril', '2.5 mg', 'Tablet', '20 tablets', 20, 40.00, 28.80),
('Generic Ramipril 2.5 mg Tablet (30s)', 'Ramipril', '2.5 mg', 'Tablet', '30 tablets', 30, 60.00, 43.20),
('Generic Ramipril 2.5 mg Tablet (60s)', 'Ramipril', '2.5 mg', 'Tablet', '60 tablets', 60, 120.00, 86.40),
('Generic Enalapril 5 mg Tablet (10s)', 'Enalapril', '5 mg', 'Tablet', '10 tablets', 10, 18.00, 12.96),
('Generic Enalapril 5 mg Tablet (15s)', 'Enalapril', '5 mg', 'Tablet', '15 tablets', 15, 27.00, 19.44),
('Generic Enalapril 5 mg Tablet (20s)', 'Enalapril', '5 mg', 'Tablet', '20 tablets', 20, 36.00, 25.92),
('Generic Enalapril 5 mg Tablet (30s)', 'Enalapril', '5 mg', 'Tablet', '30 tablets', 30, 54.00, 38.88),
('Generic Enalapril 5 mg Tablet (60s)', 'Enalapril', '5 mg', 'Tablet', '60 tablets', 60, 108.00, 77.76),
('Generic Furosemide 40 mg Tablet (10s)', 'Furosemide', '40 mg', 'Tablet', '10 tablets', 10, 12.00, 8.64),
('Generic Furosemide 40 mg Tablet (15s)', 'Furosemide', '40 mg', 'Tablet', '15 tablets', 15, 18.00, 12.96),
('Generic Furosemide 40 mg Tablet (20s)', 'Furosemide', '40 mg', 'Tablet', '20 tablets', 20, 24.00, 17.28),
('Generic Furosemide 40 mg Tablet (30s)', 'Furosemide', '40 mg', 'Tablet', '30 tablets', 30, 36.00, 25.92),
('Generic Furosemide 40 mg Tablet (60s)', 'Furosemide', '40 mg', 'Tablet', '60 tablets', 60, 72.00, 51.84),
('Generic Torsemide 10 mg Tablet (10s)', 'Torsemide', '10 mg', 'Tablet', '10 tablets', 10, 22.00, 15.84),
('Generic Torsemide 10 mg Tablet (15s)', 'Torsemide', '10 mg', 'Tablet', '15 tablets', 15, 33.00, 23.76),
('Generic Torsemide 10 mg Tablet (20s)', 'Torsemide', '10 mg', 'Tablet', '20 tablets', 20, 44.00, 31.68),
('Generic Torsemide 10 mg Tablet (30s)', 'Torsemide', '10 mg', 'Tablet', '30 tablets', 30, 66.00, 47.52),
('Generic Torsemide 10 mg Tablet (60s)', 'Torsemide', '10 mg', 'Tablet', '60 tablets', 60, 132.00, 95.04),
('Generic Spironolactone 25 mg Tablet (10s)', 'Spironolactone', '25 mg', 'Tablet', '10 tablets', 10, 20.00, 14.40),
('Generic Spironolactone 25 mg Tablet (15s)', 'Spironolactone', '25 mg', 'Tablet', '15 tablets', 15, 30.00, 21.60),
('Generic Spironolactone 25 mg Tablet (20s)', 'Spironolactone', '25 mg', 'Tablet', '20 tablets', 20, 40.00, 28.80),
('Generic Spironolactone 25 mg Tablet (30s)', 'Spironolactone', '25 mg', 'Tablet', '30 tablets', 30, 60.00, 43.20),
('Generic Spironolactone 25 mg Tablet (60s)', 'Spironolactone', '25 mg', 'Tablet', '60 tablets', 60, 120.00, 86.40),
('Generic Pantoprazole 40 mg Tablet (10s)', 'Pantoprazole', '40 mg', 'Tablet', '10 tablets', 10, 30.00, 21.60),
('Generic Pantoprazole 40 mg Tablet (15s)', 'Pantoprazole', '40 mg', 'Tablet', '15 tablets', 15, 45.00, 32.40),
('Generic Pantoprazole 40 mg Tablet (20s)', 'Pantoprazole', '40 mg', 'Tablet', '20 tablets', 20, 60.00, 43.20),
('Generic Pantoprazole 40 mg Tablet (30s)', 'Pantoprazole', '40 mg', 'Tablet', '30 tablets', 30, 90.00, 64.80),
('Generic Pantoprazole 40 mg Tablet (60s)', 'Pantoprazole', '40 mg', 'Tablet', '60 tablets', 60, 180.00, 129.60),
('Generic Omeprazole 20 mg Capsule (10s)', 'Omeprazole', '20 mg', 'Capsule', '10 capsules', 10, 22.00, 15.84),
('Generic Omeprazole 20 mg Capsule (15s)', 'Omeprazole', '20 mg', 'Capsule', '15 capsules', 15, 33.00, 23.76),
('Generic Omeprazole 20 mg Capsule (20s)', 'Omeprazole', '20 mg', 'Capsule', '20 capsules', 20, 44.00, 31.68),
('Generic Omeprazole 20 mg Capsule (30s)', 'Omeprazole', '20 mg', 'Capsule', '30 capsules', 30, 66.00, 47.52),
('Generic Omeprazole 20 mg Capsule (60s)', 'Omeprazole', '20 mg', 'Capsule', '60 capsules', 60, 132.00, 95.04),
('Generic Esomeprazole 40 mg Tablet (10s)', 'Esomeprazole', '40 mg', 'Tablet', '10 tablets', 10, 38.00, 27.36),
('Generic Esomeprazole 40 mg Tablet (15s)', 'Esomeprazole', '40 mg', 'Tablet', '15 tablets', 15, 57.00, 41.04),
('Generic Esomeprazole 40 mg Tablet (20s)', 'Esomeprazole', '40 mg', 'Tablet', '20 tablets', 20, 76.00, 54.72),
('Generic Esomeprazole 40 mg Tablet (30s)', 'Esomeprazole', '40 mg', 'Tablet', '30 tablets', 30, 114.00, 82.08),
('Generic Esomeprazole 40 mg Tablet (60s)', 'Esomeprazole', '40 mg', 'Tablet', '60 tablets', 60, 228.00, 164.16),
('Generic Rabeprazole 20 mg Tablet (10s)', 'Rabeprazole', '20 mg', 'Tablet', '10 tablets', 10, 34.00, 24.48),
('Generic Rabeprazole 20 mg Tablet (15s)', 'Rabeprazole', '20 mg', 'Tablet', '15 tablets', 15, 51.00, 36.72),
('Generic Rabeprazole 20 mg Tablet (20s)', 'Rabeprazole', '20 mg', 'Tablet', '20 tablets', 20, 68.00, 48.96),
('Generic Rabeprazole 20 mg Tablet (30s)', 'Rabeprazole', '20 mg', 'Tablet', '30 tablets', 30, 102.00, 73.44),
('Generic Rabeprazole 20 mg Tablet (60s)', 'Rabeprazole', '20 mg', 'Tablet', '60 tablets', 60, 204.00, 146.88),
('Generic Famotidine 20 mg Tablet (10s)', 'Famotidine', '20 mg', 'Tablet', '10 tablets', 10, 15.00, 10.80),
('Generic Famotidine 20 mg Tablet (15s)', 'Famotidine', '20 mg', 'Tablet', '15 tablets', 15, 22.50, 16.20),
('Generic Famotidine 20 mg Tablet (20s)', 'Famotidine', '20 mg', 'Tablet', '20 tablets', 20, 30.00, 21.60),
('Generic Famotidine 20 mg Tablet (30s)', 'Famotidine', '20 mg', 'Tablet', '30 tablets', 30, 45.00, 32.40),
('Generic Famotidine 20 mg Tablet (60s)', 'Famotidine', '20 mg', 'Tablet', '60 tablets', 60, 90.00, 64.80),
('Generic Ondansetron 4 mg Tablet (10s)', 'Ondansetron', '4 mg', 'Tablet', '10 tablets', 10, 18.00, 12.96),
('Generic Ondansetron 4 mg Tablet (15s)', 'Ondansetron', '4 mg', 'Tablet', '15 tablets', 15, 27.00, 19.44),
('Generic Ondansetron 4 mg Tablet (20s)', 'Ondansetron', '4 mg', 'Tablet', '20 tablets', 20, 36.00, 25.92),
('Generic Ondansetron 4 mg Tablet (30s)', 'Ondansetron', '4 mg', 'Tablet', '30 tablets', 30, 54.00, 38.88),
('Generic Ondansetron 4 mg Tablet (60s)', 'Ondansetron', '4 mg', 'Tablet', '60 tablets', 60, 108.00, 77.76),
('Generic Cetirizine 10 mg Tablet (10s)', 'Cetirizine', '10 mg', 'Tablet', '10 tablets', 10, 12.00, 8.64),
('Generic Cetirizine 10 mg Tablet (15s)', 'Cetirizine', '10 mg', 'Tablet', '15 tablets', 15, 18.00, 12.96),
('Generic Cetirizine 10 mg Tablet (20s)', 'Cetirizine', '10 mg', 'Tablet', '20 tablets', 20, 24.00, 17.28),
('Generic Cetirizine 10 mg Tablet (30s)', 'Cetirizine', '10 mg', 'Tablet', '30 tablets', 30, 36.00, 25.92),
('Generic Cetirizine 10 mg Tablet (60s)', 'Cetirizine', '10 mg', 'Tablet', '60 tablets', 60, 72.00, 51.84),
('Generic Levocetirizine 5 mg Tablet (10s)', 'Levocetirizine', '5 mg', 'Tablet', '10 tablets', 10, 16.00, 11.52),
('Generic Levocetirizine 5 mg Tablet (15s)', 'Levocetirizine', '5 mg', 'Tablet', '15 tablets', 15, 24.00, 17.28),
('Generic Levocetirizine 5 mg Tablet (20s)', 'Levocetirizine', '5 mg', 'Tablet', '20 tablets', 20, 32.00, 23.04),
('Generic Levocetirizine 5 mg Tablet (30s)', 'Levocetirizine', '5 mg', 'Tablet', '30 tablets', 30, 48.00, 34.56),
('Generic Levocetirizine 5 mg Tablet (60s)', 'Levocetirizine', '5 mg', 'Tablet', '60 tablets', 60, 96.00, 69.12),
('Generic Fexofenadine 120 mg Tablet (10s)', 'Fexofenadine', '120 mg', 'Tablet', '10 tablets', 10, 42.00, 30.24),
('Generic Fexofenadine 120 mg Tablet (15s)', 'Fexofenadine', '120 mg', 'Tablet', '15 tablets', 15, 63.00, 45.36),
('Generic Fexofenadine 120 mg Tablet (20s)', 'Fexofenadine', '120 mg', 'Tablet', '20 tablets', 20, 84.00, 60.48),
('Generic Fexofenadine 120 mg Tablet (30s)', 'Fexofenadine', '120 mg', 'Tablet', '30 tablets', 30, 126.00, 90.72),
('Generic Fexofenadine 120 mg Tablet (60s)', 'Fexofenadine', '120 mg', 'Tablet', '60 tablets', 60, 252.00, 181.44),
('Generic Loratadine 10 mg Tablet (10s)', 'Loratadine', '10 mg', 'Tablet', '10 tablets', 10, 18.00, 12.96),
('Generic Loratadine 10 mg Tablet (15s)', 'Loratadine', '10 mg', 'Tablet', '15 tablets', 15, 27.00, 19.44),
('Generic Loratadine 10 mg Tablet (20s)', 'Loratadine', '10 mg', 'Tablet', '20 tablets', 20, 36.00, 25.92),
('Generic Loratadine 10 mg Tablet (30s)', 'Loratadine', '10 mg', 'Tablet', '30 tablets', 30, 54.00, 38.88),
('Generic Loratadine 10 mg Tablet (60s)', 'Loratadine', '10 mg', 'Tablet', '60 tablets', 60, 108.00, 77.76),
('Generic Montelukast 10 mg Tablet (10s)', 'Montelukast', '10 mg', 'Tablet', '10 tablets', 10, 48.00, 34.56),
('Generic Montelukast 10 mg Tablet (15s)', 'Montelukast', '10 mg', 'Tablet', '15 tablets', 15, 72.00, 51.84),
('Generic Montelukast 10 mg Tablet (20s)', 'Montelukast', '10 mg', 'Tablet', '20 tablets', 20, 96.00, 69.12),
('Generic Montelukast 10 mg Tablet (30s)', 'Montelukast', '10 mg', 'Tablet', '30 tablets', 30, 144.00, 103.68),
('Generic Montelukast 10 mg Tablet (60s)', 'Montelukast', '10 mg', 'Tablet', '60 tablets', 60, 288.00, 207.36),
('Generic Levothyroxine 50 mcg Tablet (10s)', 'Levothyroxine', '50 mcg', 'Tablet', '10 tablets', 10, 20.00, 14.40),
('Generic Levothyroxine 50 mcg Tablet (15s)', 'Levothyroxine', '50 mcg', 'Tablet', '15 tablets', 15, 30.00, 21.60),
('Generic Levothyroxine 50 mcg Tablet (20s)', 'Levothyroxine', '50 mcg', 'Tablet', '20 tablets', 20, 40.00, 28.80),
('Generic Levothyroxine 50 mcg Tablet (30s)', 'Levothyroxine', '50 mcg', 'Tablet', '30 tablets', 30, 60.00, 43.20),
('Generic Levothyroxine 50 mcg Tablet (60s)', 'Levothyroxine', '50 mcg', 'Tablet', '60 tablets', 60, 120.00, 86.40),
('Generic Allopurinol 100 mg Tablet (10s)', 'Allopurinol', '100 mg', 'Tablet', '10 tablets', 10, 24.00, 17.28),
('Generic Allopurinol 100 mg Tablet (15s)', 'Allopurinol', '100 mg', 'Tablet', '15 tablets', 15, 36.00, 25.92),
('Generic Allopurinol 100 mg Tablet (20s)', 'Allopurinol', '100 mg', 'Tablet', '20 tablets', 20, 48.00, 34.56),
('Generic Allopurinol 100 mg Tablet (30s)', 'Allopurinol', '100 mg', 'Tablet', '30 tablets', 30, 72.00, 51.84),
('Generic Allopurinol 100 mg Tablet (60s)', 'Allopurinol', '100 mg', 'Tablet', '60 tablets', 60, 144.00, 103.68),
('Generic Folic Acid 5 mg Tablet (10s)', 'Folic Acid', '5 mg', 'Tablet', '10 tablets', 10, 10.00, 7.20),
('Generic Folic Acid 5 mg Tablet (15s)', 'Folic Acid', '5 mg', 'Tablet', '15 tablets', 15, 15.00, 10.80),
('Generic Folic Acid 5 mg Tablet (20s)', 'Folic Acid', '5 mg', 'Tablet', '20 tablets', 20, 20.00, 14.40),
('Generic Folic Acid 5 mg Tablet (30s)', 'Folic Acid', '5 mg', 'Tablet', '30 tablets', 30, 30.00, 21.60),
('Generic Folic Acid 5 mg Tablet (60s)', 'Folic Acid', '5 mg', 'Tablet', '60 tablets', 60, 60.00, 43.20),
('Generic Vitamin D3 1000 IU Tablet (10s)', 'Vitamin D3', '1000 IU', 'Tablet', '10 tablets', 10, 28.00, 20.16),
('Generic Vitamin D3 1000 IU Tablet (15s)', 'Vitamin D3', '1000 IU', 'Tablet', '15 tablets', 15, 42.00, 30.24),
('Generic Vitamin D3 1000 IU Tablet (20s)', 'Vitamin D3', '1000 IU', 'Tablet', '20 tablets', 20, 56.00, 40.32),
('Generic Vitamin D3 1000 IU Tablet (30s)', 'Vitamin D3', '1000 IU', 'Tablet', '30 tablets', 30, 84.00, 60.48),
('Generic Vitamin D3 1000 IU Tablet (60s)', 'Vitamin D3', '1000 IU', 'Tablet', '60 tablets', 60, 168.00, 120.96),
('Generic Calcium Carbonate 500 mg Tablet (10s)', 'Calcium Carbonate', '500 mg', 'Tablet', '10 tablets', 10, 22.00, 15.84),
('Generic Calcium Carbonate 500 mg Tablet (15s)', 'Calcium Carbonate', '500 mg', 'Tablet', '15 tablets', 15, 33.00, 23.76),
('Generic Calcium Carbonate 500 mg Tablet (20s)', 'Calcium Carbonate', '500 mg', 'Tablet', '20 tablets', 20, 44.00, 31.68),
('Generic Calcium Carbonate 500 mg Tablet (30s)', 'Calcium Carbonate', '500 mg', 'Tablet', '30 tablets', 30, 66.00, 47.52),
('Generic Calcium Carbonate 500 mg Tablet (60s)', 'Calcium Carbonate', '500 mg', 'Tablet', '60 tablets', 60, 132.00, 95.04);

-- 1. Add any missing salt master records.
INSERT IGNORE INTO salts (salt_name)
SELECT DISTINCT salt_name
FROM tmp_kiara_catalog_205;

-- 2. Insert only products whose exact product_name does not already exist.
INSERT INTO products (
    product_name,
    brand,
    salt_id,
    strength,
    dosage_form,
    packaging,
    product_type,
    stock_unit_label,
    smallest_unit_label,
    units_per_stock_unit,
    default_hsn_code,
    default_gst_rate,
    is_h1_or_restricted,
    is_active
)
SELECT
    t.product_name,
    'Generic',
    s.salt_id,
    t.strength,
    t.dosage_form,
    t.packaging,
    'MEDICINE',
    'pack',
    CASE WHEN t.dosage_form = 'Capsule' THEN 'capsule' ELSE 'tablet' END,
    t.units_per_stock_unit,
    NULL,
    5.00,
    FALSE,
    TRUE
FROM tmp_kiara_catalog_205 t
JOIN salts s
    ON s.salt_name = t.salt_name
WHERE NOT EXISTS (
    SELECT 1
    FROM products p
    WHERE p.product_name = t.product_name
);

-- 3. Map every catalogue product to all branches, but only where mapping is absent.
INSERT INTO branch_products (
    branch_id,
    product_id,
    rack_id,
    low_stock_threshold
)
SELECT
    b.branch_id,
    p.product_id,
    (
        SELECT MIN(r.rack_id)
        FROM racks r
        WHERE r.branch_id = b.branch_id
    ),
    10
FROM branches b
CROSS JOIN tmp_kiara_catalog_205 t
JOIN products p
    ON p.product_name = t.product_name
LEFT JOIN branch_products bp
    ON bp.branch_id = b.branch_id
    AND bp.product_id = p.product_id
WHERE bp.product_id IS NULL;

-- 4. Create one demo batch only for branch/product pairs that have no batch yet.
-- Existing batches are never modified or deleted.
INSERT INTO batches (
    branch_id,
    product_id,
    batch_number,
    expiry_date,
    mrp,
    purchase_price
)
SELECT
    b.branch_id,
    p.product_id,
    CONCAT('DEMO205-', b.branch_code, '-', p.product_id),
    DATE_ADD(CURDATE(), INTERVAL 24 MONTH),
    t.demo_mrp,
    t.demo_purchase_price
FROM branches b
CROSS JOIN tmp_kiara_catalog_205 t
JOIN products p
    ON p.product_name = t.product_name
WHERE NOT EXISTS (
    SELECT 1
    FROM batches ba
    WHERE ba.branch_id = b.branch_id
      AND ba.product_id = p.product_id
);

-- 5. Add inventory only where the corresponding batch has no inventory row.
-- Quantities are demo pack counts: BR001=20, BR002=15, BR003=10.
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
        WHEN 'BR003' THEN 10
        ELSE 10
    END,
    0,
    ROUND(ba.mrp * 0.90, 2)
FROM batches ba
JOIN branches b
    ON b.branch_id = ba.branch_id
JOIN products p
    ON p.product_id = ba.product_id
JOIN tmp_kiara_catalog_205 t
    ON t.product_name = p.product_name
LEFT JOIN inventory i
    ON i.branch_id = ba.branch_id
    AND i.batch_id = ba.batch_id
WHERE i.batch_id IS NULL;

-- 6. Summary: how many of the 205 catalogue names now exist?
SELECT
    COUNT(*) AS catalogue_products_present,
    205 AS target_products
FROM products p
JOIN tmp_kiara_catalog_205 t
    ON t.product_name = p.product_name;

-- 7. Summary by branch.
SELECT
    b.branch_code,
    COUNT(DISTINCT bp.product_id) AS mapped_catalogue_products,
    COUNT(DISTINCT ba.batch_id) AS catalogue_batches,
    COALESCE(SUM(i.quantity), 0) AS demo_stock_packs
FROM branches b
CROSS JOIN tmp_kiara_catalog_205 t
JOIN products p
    ON p.product_name = t.product_name
LEFT JOIN branch_products bp
    ON bp.branch_id = b.branch_id
    AND bp.product_id = p.product_id
LEFT JOIN batches ba
    ON ba.branch_id = b.branch_id
    AND ba.product_id = p.product_id
LEFT JOIN inventory i
    ON i.branch_id = ba.branch_id
    AND i.batch_id = ba.batch_id
GROUP BY b.branch_id, b.branch_code
ORDER BY b.branch_code;

DROP TEMPORARY TABLE IF EXISTS tmp_kiara_catalog_205;

SELECT COUNT(*) from products;
