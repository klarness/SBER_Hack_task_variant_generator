package database

import (
	"context"
	"encoding/json"
	"errors"

	"core/internal/domain"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgresRepository struct {
	pool *pgxpool.Pool
}

func NewPostgresRepository(pool *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{pool: pool}
}

func Connect(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	return pgxpool.NewWithConfig(ctx, cfg)
}

func (r *PostgresRepository) CreateTask(ctx context.Context, task *domain.Task) error {
	if task.ID == uuid.Nil {
		task.ID = uuid.New()
	}
	if len(task.Settings) == 0 {
		task.Settings = json.RawMessage(`{}`)
	}
	if task.Status == "" {
		task.Status = domain.TaskStatusPending
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, email)
		VALUES ($1, $2)
		ON CONFLICT (id) DO NOTHING
	`, task.UserID, task.UserID.String()+"@local")
	if err != nil {
		return err
	}

	return r.pool.QueryRow(ctx, `
		INSERT INTO tasks (id, user_id, title, subject, topic, task_type, difficulty, original_text, settings, status, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING created_at, updated_at
	`, task.ID, task.UserID, task.Title, task.Subject, task.Topic, task.TaskType, task.Difficulty, task.OriginalText, task.Settings, task.Status, task.ErrorMessage).
		Scan(&task.CreatedAt, &task.UpdatedAt)
}

func (r *PostgresRepository) UpdateTaskAnalysis(ctx context.Context, userID, taskID uuid.UUID, analysis *domain.AnalyzeResult) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tasks
		SET original_text = $1,
			subject = $2,
			topic = $3,
			task_type = $4,
			difficulty = $5,
			status = $6,
			error_message = '',
			updated_at = now()
		WHERE id = $7 AND user_id = $8
	`, analysis.OriginalText, analysis.Subject, analysis.Topic, analysis.TaskType, analysis.Difficulty, domain.TaskStatusProcessing, taskID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}

	_, err = tx.Exec(ctx, `DELETE FROM task_items WHERE task_id = $1`, taskID)
	if err != nil {
		return err
	}

	for i := range analysis.Items {
		if analysis.Items[i].ID == uuid.Nil {
			analysis.Items[i].ID = uuid.New()
		}
		analysis.Items[i].TaskID = taskID
		if analysis.Items[i].Order == 0 {
			analysis.Items[i].Order = i + 1
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO task_items (id, task_id, item_order, context, content)
			VALUES ($1, $2, $3, $4, $5)
		`, analysis.Items[i].ID, taskID, analysis.Items[i].Order, analysis.Items[i].Context, analysis.Items[i].Content)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) UpdateTaskStatus(ctx context.Context, userID, taskID uuid.UUID, status domain.TaskStatus, errorMessage string) error {
	tag, err := r.pool.Exec(ctx, `
		UPDATE tasks
		SET status = $1, error_message = $2, updated_at = now()
		WHERE id = $3 AND user_id = $4
	`, status, errorMessage, taskID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) GetTask(ctx context.Context, userID, taskID uuid.UUID) (*domain.Task, error) {
	task := &domain.Task{}
	err := r.pool.QueryRow(ctx, `
		SELECT id, user_id, title, subject, topic, task_type, difficulty, original_text, settings, status, error_message, created_at, updated_at
		FROM tasks
		WHERE id = $1 AND user_id = $2
	`, taskID, userID).Scan(
		&task.ID,
		&task.UserID,
		&task.Title,
		&task.Subject,
		&task.Topic,
		&task.TaskType,
		&task.Difficulty,
		&task.OriginalText,
		&task.Settings,
		&task.Status,
		&task.ErrorMessage,
		&task.CreatedAt,
		&task.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return task, nil
}

func (r *PostgresRepository) GetTaskWithDetails(ctx context.Context, userID, taskID uuid.UUID) (*domain.Task, error) {
	task, err := r.GetTask(ctx, userID, taskID)
	if err != nil {
		return nil, err
	}

	items, err := r.listTaskItems(ctx, taskID)
	if err != nil {
		return nil, err
	}
	task.TaskItems = items

	variants, err := r.listVariants(ctx, taskID)
	if err != nil {
		return nil, err
	}
	task.Variants = variants

	return task, nil
}

func (r *PostgresRepository) ListTasks(ctx context.Context, userID uuid.UUID, filter domain.TaskFilter) ([]domain.Task, error) {
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 50
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, title, subject, topic, task_type, difficulty, original_text, settings, status, error_message, created_at, updated_at
		FROM tasks
		WHERE user_id = $1
			AND ($2 = '' OR title ILIKE '%' || $2 || '%' OR original_text ILIKE '%' || $2 || '%')
			AND ($3 = '' OR subject = $3)
			AND ($4 = '' OR topic = $4)
			AND ($5 = '' OR status = $5)
		ORDER BY updated_at DESC
		LIMIT $6 OFFSET $7
	`, userID, filter.Query, filter.Subject, filter.Topic, string(filter.Status), filter.Limit, filter.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []domain.Task
	for rows.Next() {
		var task domain.Task
		err = rows.Scan(
			&task.ID,
			&task.UserID,
			&task.Title,
			&task.Subject,
			&task.Topic,
			&task.TaskType,
			&task.Difficulty,
			&task.OriginalText,
			&task.Settings,
			&task.Status,
			&task.ErrorMessage,
			&task.CreatedAt,
			&task.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		tasks = append(tasks, task)
	}
	return tasks, rows.Err()
}

func (r *PostgresRepository) DeleteTask(ctx context.Context, userID, taskID uuid.UUID) error {
	tag, err := r.pool.Exec(ctx, `
		DELETE FROM tasks
		WHERE id = $1 AND user_id = $2
	`, taskID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) SaveVariants(ctx context.Context, userID, taskID uuid.UUID, variants []domain.Variant) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var lockedTaskID uuid.UUID
	err = tx.QueryRow(ctx, `
		SELECT id FROM tasks WHERE id = $1 AND user_id = $2 FOR UPDATE
	`, taskID, userID).Scan(&lockedTaskID)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM variants WHERE task_id = $1`, taskID)
	if err != nil {
		return err
	}

	for i := range variants {
		if variants[i].ID == uuid.Nil {
			variants[i].ID = uuid.New()
		}
		variants[i].TaskID = taskID

		err = tx.QueryRow(ctx, `
			INSERT INTO variants (id, task_id, variant_number)
			VALUES ($1, $2, $3)
			RETURNING created_at
		`, variants[i].ID, taskID, variants[i].VariantNumber).Scan(&variants[i].CreatedAt)
		if err != nil {
			return err
		}

		for j := range variants[i].Items {
			if variants[i].Items[j].ID == uuid.Nil {
				variants[i].Items[j].ID = uuid.New()
			}
			if variants[i].Items[j].Status == "" {
				variants[i].Items[j].Status = domain.VariantItemStatusReady
			}
			variants[i].Items[j].VariantID = variants[i].ID

			_, err = tx.Exec(ctx, `
				INSERT INTO variant_items (id, variant_id, task_item_id, content, status, error_message, is_edited)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
			`, variants[i].Items[j].ID, variants[i].ID, variants[i].Items[j].TaskItemID, variants[i].Items[j].Content, variants[i].Items[j].Status, variants[i].Items[j].ErrorMessage, variants[i].Items[j].IsEdited)
			if err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) GetVariantItemForRegeneration(ctx context.Context, userID, variantID, itemID uuid.UUID) (*domain.Task, *domain.TaskItem, *domain.VariantItem, error) {
	task := &domain.Task{}
	taskItem := &domain.TaskItem{}
	variantItem := &domain.VariantItem{}

	err := r.pool.QueryRow(ctx, `
		SELECT
			t.id, t.user_id, t.title, t.subject, t.topic, t.task_type, t.difficulty, t.original_text, t.settings, t.status, t.error_message, t.created_at, t.updated_at,
			ti.id, ti.task_id, ti.item_order, ti.context, ti.content, ti.created_at,
			vi.id, vi.variant_id, vi.task_item_id, vi.content, vi.status, vi.error_message, vi.is_edited, vi.created_at, vi.updated_at
		FROM variant_items vi
		JOIN variants v ON v.id = vi.variant_id
		JOIN tasks t ON t.id = v.task_id
		JOIN task_items ti ON ti.id = vi.task_item_id AND ti.task_id = t.id
		WHERE t.user_id = $1 AND v.id = $2 AND vi.id = $3
	`, userID, variantID, itemID).Scan(
		&task.ID,
		&task.UserID,
		&task.Title,
		&task.Subject,
		&task.Topic,
		&task.TaskType,
		&task.Difficulty,
		&task.OriginalText,
		&task.Settings,
		&task.Status,
		&task.ErrorMessage,
		&task.CreatedAt,
		&task.UpdatedAt,
		&taskItem.ID,
		&taskItem.TaskID,
		&taskItem.Order,
		&taskItem.Context,
		&taskItem.Content,
		&taskItem.CreatedAt,
		&variantItem.ID,
		&variantItem.VariantID,
		&variantItem.TaskItemID,
		&variantItem.Content,
		&variantItem.Status,
		&variantItem.ErrorMessage,
		&variantItem.IsEdited,
		&variantItem.CreatedAt,
		&variantItem.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, nil, nil, err
	}
	return task, taskItem, variantItem, nil
}

func (r *PostgresRepository) UpdateTaskItem(ctx context.Context, userID, taskID, itemID uuid.UUID, content, contextText string) (*domain.TaskItem, error) {
	item := &domain.TaskItem{}
	err := r.pool.QueryRow(ctx, `
		UPDATE task_items ti
		SET content = $1,
			context = $2
		FROM tasks t
		WHERE ti.task_id = t.id
			AND t.user_id = $3
			AND ti.task_id = $4
			AND ti.id = $5
		RETURNING ti.id, ti.task_id, ti.item_order, ti.context, ti.content, ti.created_at
	`, content, contextText, userID, taskID, itemID).Scan(
		&item.ID,
		&item.TaskID,
		&item.Order,
		&item.Context,
		&item.Content,
		&item.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE tasks
		SET updated_at = now()
		WHERE id = $1 AND user_id = $2
	`, taskID, userID)
	if err != nil {
		return nil, err
	}
	return item, nil
}

func (r *PostgresRepository) UpdateVariantItem(ctx context.Context, userID, variantID, itemID uuid.UUID, content string, isEdited bool) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var oldContent string
	err = tx.QueryRow(ctx, `
		SELECT vi.content
		FROM variant_items vi
		JOIN variants v ON v.id = vi.variant_id
		JOIN tasks t ON t.id = v.task_id
		WHERE t.user_id = $1 AND v.id = $2 AND vi.id = $3
		FOR UPDATE
	`, userID, variantID, itemID).Scan(&oldContent)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ErrNotFound
	}
	if err != nil {
		return err
	}

	tag, err := tx.Exec(ctx, `
		UPDATE variant_items
		SET content = $1,
			status = $2,
			error_message = '',
			is_edited = $3,
			updated_at = now()
		WHERE variant_id = $4 AND id = $5
	`, content, domain.VariantItemStatusReady, isEdited, variantID, itemID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return domain.ErrNotFound
	}

	changeSource := "regenerate"
	if isEdited {
		changeSource = "manual_edit"
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO variant_item_history (variant_item_id, old_content, new_content, change_source)
		VALUES ($1, $2, $3, $4)
	`, itemID, oldContent, content, changeSource)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func (r *PostgresRepository) listTaskItems(ctx context.Context, taskID uuid.UUID) ([]domain.TaskItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, task_id, item_order, context, content, created_at
		FROM task_items
		WHERE task_id = $1
		ORDER BY item_order
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.TaskItem
	for rows.Next() {
		var item domain.TaskItem
		err = rows.Scan(&item.ID, &item.TaskID, &item.Order, &item.Context, &item.Content, &item.CreatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) listVariants(ctx context.Context, taskID uuid.UUID) ([]domain.Variant, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, task_id, variant_number, created_at
		FROM variants
		WHERE task_id = $1
		ORDER BY variant_number
	`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var variants []domain.Variant
	for rows.Next() {
		var variant domain.Variant
		err = rows.Scan(&variant.ID, &variant.TaskID, &variant.VariantNumber, &variant.CreatedAt)
		if err != nil {
			return nil, err
		}
		variant.Items, err = r.listVariantItems(ctx, variant.ID)
		if err != nil {
			return nil, err
		}
		variants = append(variants, variant)
	}
	return variants, rows.Err()
}

func (r *PostgresRepository) listVariantItems(ctx context.Context, variantID uuid.UUID) ([]domain.VariantItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT vi.id, vi.variant_id, vi.task_item_id, vi.content, vi.status, vi.error_message, vi.is_edited, vi.created_at, vi.updated_at
		FROM variant_items vi
		JOIN task_items ti ON ti.id = vi.task_item_id
		WHERE vi.variant_id = $1
		ORDER BY ti.item_order
	`, variantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []domain.VariantItem
	for rows.Next() {
		var item domain.VariantItem
		err = rows.Scan(&item.ID, &item.VariantID, &item.TaskItemID, &item.Content, &item.Status, &item.ErrorMessage, &item.IsEdited, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
