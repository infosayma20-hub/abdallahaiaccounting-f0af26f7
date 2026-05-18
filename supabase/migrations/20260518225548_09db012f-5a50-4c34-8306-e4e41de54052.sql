ALTER TABLE invoices
ADD CONSTRAINT invoices_salesperson_fk
FOREIGN KEY (salesperson_id) REFERENCES sales_representatives(id) 
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE invoices VALIDATE CONSTRAINT invoices_salesperson_fk;

CREATE INDEX IF NOT EXISTS idx_invoices_salesperson_id 
ON invoices(salesperson_id);

CREATE INDEX IF NOT EXISTS idx_invoices_rep_user_date 
ON invoices(salesperson_id, user_id, invoice_date);