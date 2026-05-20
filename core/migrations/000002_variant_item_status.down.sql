DROP INDEX IF EXISTS idx_variant_items_status;

ALTER TABLE variant_items
    DROP COLUMN IF EXISTS error_message,
    DROP COLUMN IF EXISTS status;
