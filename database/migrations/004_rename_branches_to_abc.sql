-- Migration 004: Rename branches to Kiara Medicals A, B, C
USE defaultdb;

UPDATE branches
SET
  branch_name = 'Kiara Medicals A',
  legal_name = 'Kiara Medicals A Pvt Ltd',
  invoice_prefix = 'KM-A'
WHERE branch_code = 'BR001' OR branch_id = 1;

UPDATE branches
SET
  branch_name = 'Kiara Medicals B',
  legal_name = 'Kiara Medicals B Pvt Ltd',
  invoice_prefix = 'KM-B'
WHERE branch_code = 'BR002' OR branch_id = 2;

UPDATE branches
SET
  branch_name = 'Kiara Medicals C',
  legal_name = 'Kiara Medicals C Pvt Ltd',
  invoice_prefix = 'KM-C'
WHERE branch_code = 'BR003' OR branch_id = 3;
