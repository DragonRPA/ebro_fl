ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_mgt_key TEXT;
ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_status TEXT;
ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_channel TEXT;
ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_purpose TEXT;
ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_email TEXT;
ALTER TABLE fl_billings ADD COLUMN IF NOT EXISTS tax_invoice_nts_sent_at TIMESTAMPTZ;
