-- Add multi-currency fields to pos_orders
ALTER TABLE pos_orders
ADD COLUMN IF NOT EXISTS payment_currency TEXT DEFAULT 'ILS',
ADD COLUMN IF NOT EXISTS payment_currency_rate DECIMAL(10,4) DEFAULT 1,
ADD COLUMN IF NOT EXISTS payment_currency_amount DECIMAL(12,4),
ADD COLUMN IF NOT EXISTS rate_source TEXT DEFAULT 'system',
ADD COLUMN IF NOT EXISTS ils_equivalent DECIMAL(12,2);

-- Add POS rate override to exchange_rates
ALTER TABLE exchange_rates
ADD COLUMN IF NOT EXISTS pos_rate_override DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS allow_pos_edit BOOLEAN DEFAULT true;