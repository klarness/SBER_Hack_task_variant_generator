CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT '',
    subject VARCHAR(255) NOT NULL DEFAULT '',
    topic VARCHAR(255) NOT NULL DEFAULT '',
    task_type VARCHAR(100) NOT NULL DEFAULT '',
    difficulty VARCHAR(100) NOT NULL DEFAULT '',
    original_text TEXT NOT NULL DEFAULT '',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_subject_topic ON tasks(subject, topic);

CREATE TABLE task_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    item_order INTEGER NOT NULL,
    context TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, item_order)
);

CREATE INDEX idx_task_items_task_id ON task_items(task_id);

CREATE TABLE variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    variant_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, variant_number)
);

CREATE INDEX idx_variants_task_id ON variants(task_id);

CREATE TABLE variant_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_id UUID NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
    task_item_id UUID NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (variant_id, task_item_id)
);

CREATE INDEX idx_variant_items_variant_id ON variant_items(variant_id);
CREATE INDEX idx_variant_items_task_item_id ON variant_items(task_item_id);

CREATE TABLE variant_item_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    variant_item_id UUID NOT NULL REFERENCES variant_items(id) ON DELETE CASCADE,
    old_content TEXT NOT NULL,
    new_content TEXT NOT NULL,
    change_source VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_variant_item_history_variant_item_id ON variant_item_history(variant_item_id);
