ALTER TABLE variant_items
    ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'ready',
    ADD COLUMN error_message TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_variant_items_status ON variant_items(status);
