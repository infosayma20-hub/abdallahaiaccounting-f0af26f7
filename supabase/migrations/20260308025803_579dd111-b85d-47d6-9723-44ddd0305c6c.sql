
UPDATE transactions t
SET debit_account_code = sub.account_code
FROM (
  SELECT DISTINCT t2.id as tx_id, a.account_code
  FROM transactions t2
  JOIN pos_orders o ON t2.reference = o.order_number
  JOIN employee_financial_movements efm ON efm.source_id = o.id
  JOIN employees e ON e.id = efm.employee_id
  JOIN accounts a ON a.account_name = 'ذمم موظف - ' || e.full_name AND a.user_id = t2.user_id AND a.is_active = true
  WHERE t2.payment_method = 'employee_account'
    AND t2.debit_account_code = '1180'
    AND t2.is_deleted = false
    AND NOT EXISTS (
      SELECT 1 FROM employee_financial_movements efm2
      WHERE efm2.source_id = o.id AND efm2.employee_id != efm.employee_id
    )
) sub
WHERE t.id = sub.tx_id;
