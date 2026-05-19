package service

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"core/internal/domain"

	"github.com/avast/retry-go/v4"
	"github.com/google/uuid"
)

type TaskService struct {
	repo   domain.Repository
	ai     domain.AIClient
	logger *slog.Logger
}

func NewTaskService(repo domain.Repository, ai domain.AIClient, logger *slog.Logger) *TaskService {
	if logger == nil {
		logger = slog.Default()
	}
	return &TaskService{repo: repo, ai: ai, logger: logger.With("component", "task_service")}
}

func (s *TaskService) GetTask(ctx context.Context, userID, taskID uuid.UUID) (*domain.Task, error) {
	s.logger.InfoContext(ctx, "task details requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
	)
	task, err := s.repo.GetTaskWithDetails(ctx, userID, taskID)
	if err != nil {
		s.logger.ErrorContext(ctx, "task details request failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"error", err,
		)
		return nil, err
	}
	s.logger.InfoContext(ctx, "task details returned",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"status", string(task.Status),
		"task_items_count", len(task.TaskItems),
		"variants_count", len(task.Variants),
	)
	return task, nil
}

func (s *TaskService) ListTasks(ctx context.Context, userID uuid.UUID, filter domain.TaskFilter) ([]domain.Task, error) {
	s.logger.InfoContext(ctx, "task library requested",
		"user_id", userID.String(),
		"query", filter.Query,
		"subject", filter.Subject,
		"topic", filter.Topic,
		"status", string(filter.Status),
		"limit", filter.Limit,
		"offset", filter.Offset,
	)
	tasks, err := s.repo.ListTasks(ctx, userID, filter)
	if err != nil {
		s.logger.ErrorContext(ctx, "task library request failed",
			"user_id", userID.String(),
			"error", err,
		)
		return nil, err
	}
	s.logger.InfoContext(ctx, "task library returned",
		"user_id", userID.String(),
		"count", len(tasks),
	)
	return tasks, nil
}

func (s *TaskService) EditVariantItem(ctx context.Context, userID, variantID, itemID uuid.UUID, content string) (*domain.VariantItem, error) {
	s.logger.InfoContext(ctx, "variant item manual edit requested",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
		"content_bytes", len(content),
	)
	content = strings.TrimSpace(content)
	if content == "" {
		s.logger.WarnContext(ctx, "variant item manual edit rejected: empty content",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
		)
		return nil, domain.ErrInvalidInput
	}

	_, _, variantItem, err := s.repo.GetVariantItemForRegeneration(ctx, userID, variantID, itemID)
	if err != nil {
		s.logger.ErrorContext(ctx, "variant item manual edit lookup failed",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
			"error", err,
		)
		return nil, err
	}
	if err = s.repo.UpdateVariantItem(ctx, userID, variantID, itemID, content, true); err != nil {
		s.logger.ErrorContext(ctx, "variant item manual edit save failed",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
			"error", err,
		)
		return nil, err
	}

	variantItem.Content = content
	variantItem.IsEdited = true
	s.logger.InfoContext(ctx, "variant item manual edit completed",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
	)
	return variantItem, nil
}

func (s *TaskService) RegenerateVariantItem(ctx context.Context, userID, variantID, itemID uuid.UUID) (*domain.VariantItem, error) {
	s.logger.InfoContext(ctx, "variant item regeneration requested",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
	)
	task, taskItem, variantItem, err := s.repo.GetVariantItemForRegeneration(ctx, userID, variantID, itemID)
	if err != nil {
		s.logger.ErrorContext(ctx, "variant item regeneration lookup failed",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
			"error", err,
		)
		return nil, err
	}

	var generated *domain.VariantItem
	attempt := 0
	err = retry.Do(
		func() error {
			attempt++
			s.logger.InfoContext(ctx, "variant item regeneration attempt started",
				"user_id", userID.String(),
				"task_id", task.ID.String(),
				"task_item_id", taskItem.ID.String(),
				"variant_item_id", itemID.String(),
				"attempt", attempt,
			)
			item, err := s.ai.Generate(ctx, domain.GenerateRequest{
				UserID:        userID,
				TaskID:        task.ID,
				TaskItemID:    taskItem.ID,
				Order:         taskItem.Order,
				Context:       taskItem.Context,
				SourceContent: taskItem.Content,
				Settings:      task.Settings,
			})
			if err != nil {
				return err
			}

			valid, err := s.ai.Validate(ctx, domain.ValidateRequest{
				UserID:     userID,
				TaskID:     task.ID,
				TaskItemID: taskItem.ID,
				Original:   taskItem.Content,
				Generated:  item.Content,
			})
			if err != nil {
				return err
			}
			if !valid {
				s.logger.WarnContext(ctx, "variant item regeneration validation rejected generated content",
					"user_id", userID.String(),
					"task_id", task.ID.String(),
					"task_item_id", taskItem.ID.String(),
					"variant_item_id", itemID.String(),
					"attempt", attempt,
				)
				return domain.ErrValidationFailed
			}

			generated = item
			s.logger.InfoContext(ctx, "variant item regeneration attempt completed",
				"user_id", userID.String(),
				"task_id", task.ID.String(),
				"task_item_id", taskItem.ID.String(),
				"variant_item_id", itemID.String(),
				"attempt", attempt,
			)
			return nil
		},
		retry.Attempts(3),
		retry.Delay(500*time.Millisecond),
		retry.DelayType(retry.BackOffDelay),
		retry.Context(ctx),
	)
	if err != nil {
		s.logger.ErrorContext(ctx, "variant item regeneration exhausted retries",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
			"attempts", attempt,
			"error", err,
		)
		return nil, err
	}

	if err = s.repo.UpdateVariantItem(ctx, userID, variantID, itemID, generated.Content, false); err != nil {
		s.logger.ErrorContext(ctx, "variant item regeneration save failed",
			"user_id", userID.String(),
			"variant_id", variantID.String(),
			"variant_item_id", itemID.String(),
			"error", err,
		)
		return nil, err
	}

	variantItem.Content = generated.Content
	variantItem.IsEdited = false
	s.logger.InfoContext(ctx, "variant item regeneration completed",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
	)
	return variantItem, nil
}

func (s *TaskService) ExportTask(ctx context.Context, userID, taskID uuid.UUID) (*domain.ExportResult, error) {
	s.logger.InfoContext(ctx, "task export requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
	)
	task, err := s.repo.GetTaskWithDetails(ctx, userID, taskID)
	if err != nil {
		s.logger.ErrorContext(ctx, "task export lookup failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"error", err,
		)
		return nil, err
	}
	result, err := s.ai.Export(ctx, task)
	if err != nil {
		s.logger.ErrorContext(ctx, "task export failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"error", err,
		)
		return nil, err
	}
	s.logger.InfoContext(ctx, "task export completed",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"filename", result.Filename,
		"bytes", len(result.Data),
	)
	return result, nil
}
