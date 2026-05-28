package service

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
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

type RegenerateVariantItemOptions struct {
	CustomPrompt                string
	IgnorePreviousVariants      bool
	PreviousVariantsOverride    []string
	UsePreviousVariantsOverride bool
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

func (s *TaskService) DeleteTask(ctx context.Context, userID, taskID uuid.UUID) error {
	s.logger.InfoContext(ctx, "task delete requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
	)
	if err := s.repo.DeleteTask(ctx, userID, taskID); err != nil {
		s.logger.ErrorContext(ctx, "task delete failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"error", err,
		)
		return err
	}
	s.logger.InfoContext(ctx, "task delete completed",
		"user_id", userID.String(),
		"task_id", taskID.String(),
	)
	return nil
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
	variantItem.Status = domain.VariantItemStatusReady
	variantItem.ErrorMessage = ""
	variantItem.IsEdited = true
	s.logger.InfoContext(ctx, "variant item manual edit completed",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
	)
	return variantItem, nil
}

func (s *TaskService) EditTaskItem(ctx context.Context, userID, taskID, itemID uuid.UUID, content, contextText string) (*domain.TaskItem, error) {
	s.logger.InfoContext(ctx, "task item manual edit requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"task_item_id", itemID.String(),
		"content_bytes", len(content),
		"context_bytes", len(contextText),
	)
	content = strings.TrimSpace(content)
	contextText = strings.TrimSpace(contextText)
	if content == "" {
		s.logger.WarnContext(ctx, "task item manual edit rejected: empty content",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"task_item_id", itemID.String(),
		)
		return nil, domain.ErrInvalidInput
	}

	item, err := s.repo.UpdateTaskItem(ctx, userID, taskID, itemID, content, contextText)
	if err != nil {
		s.logger.ErrorContext(ctx, "task item manual edit save failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"task_item_id", itemID.String(),
			"error", err,
		)
		return nil, err
	}

	s.logger.InfoContext(ctx, "task item manual edit completed",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"task_item_id", itemID.String(),
	)
	return item, nil
}

func (s *TaskService) RegenerateVariantItem(ctx context.Context, userID, variantID, itemID uuid.UUID, options RegenerateVariantItemOptions) (*domain.VariantItem, error) {
	s.logger.InfoContext(ctx, "variant item regeneration requested",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
		"custom_prompt_bytes", len(options.CustomPrompt),
		"ignore_previous_variants", options.IgnorePreviousVariants,
	)
	customPrompt := strings.TrimSpace(options.CustomPrompt)
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

	variantNumber := 0
	previousVariants := []string(nil)
	if detailedTask, detailsErr := s.repo.GetTaskWithDetails(ctx, userID, task.ID); detailsErr != nil {
		s.logger.WarnContext(ctx, "variant item regeneration uniqueness context lookup failed",
			"user_id", userID.String(),
			"task_id", task.ID.String(),
			"task_item_id", taskItem.ID.String(),
			"variant_item_id", itemID.String(),
			"error", detailsErr,
		)
	} else {
		variantNumber, previousVariants = variantContextForItem(detailedTask, taskItem.ID, itemID)
	}
	if options.UsePreviousVariantsOverride {
		previousVariants = append([]string(nil), options.PreviousVariantsOverride...)
	} else if options.IgnorePreviousVariants {
		previousVariants = nil
	}

	var generated *domain.VariantItem
	validationOriginal := taskItem.Content
	currentContent := ""
	if customPrompt != "" && strings.TrimSpace(variantItem.Content) != "" {
		validationOriginal = variantItem.Content
		currentContent = variantItem.Content
	}
	attempt := 0
	validationFeedback := ""
	err = retry.Do(
		func() error {
			attempt++
			s.logger.InfoContext(ctx, "variant item regeneration attempt started",
				"user_id", userID.String(),
				"task_id", task.ID.String(),
				"task_item_id", taskItem.ID.String(),
				"variant_item_id", itemID.String(),
				"attempt", attempt,
				"variant_number", variantNumber,
				"previous_variants_count", len(previousVariants),
			)
			item, err := s.ai.Generate(ctx, domain.GenerateRequest{
				UserID:             userID,
				TaskID:             task.ID,
				TaskItemID:         taskItem.ID,
				Subject:            task.Subject,
				VariantNumber:      variantNumber,
				Order:              taskItem.Order,
				Context:            taskItem.Context,
				SourceContent:      taskItem.Content,
				CurrentContent:     currentContent,
				Settings:           task.Settings,
				PreviousVariants:   previousVariants,
				CustomPrompt:       customPrompt,
				ValidationFeedback: validationFeedback,
			})
			if err != nil {
				return err
			}

			validation, err := s.ai.Validate(ctx, domain.ValidateRequest{
				UserID:           userID,
				TaskID:           task.ID,
				TaskItemID:       taskItem.ID,
				Subject:          task.Subject,
				VariantNumber:    variantNumber,
				Original:         validationOriginal,
				Generated:        item.Content,
				Settings:         task.Settings,
				PreviousVariants: previousVariants,
				CustomPrompt:     customPrompt,
			})
			if err != nil {
				return err
			}
			if !validation.Valid {
				validationFeedback = validation.Reason
				s.logger.WarnContext(ctx, "variant item regeneration validation rejected generated content",
					"user_id", userID.String(),
					"task_id", task.ID.String(),
					"task_item_id", taskItem.ID.String(),
					"variant_item_id", itemID.String(),
					"attempt", attempt,
					"variant_number", variantNumber,
					"previous_variants_count", len(previousVariants),
					"reason", validation.Reason,
				)
				return fmt.Errorf("%w: %s", domain.ErrValidationFailed, validation.Reason)
			}

			generated = item
			s.logger.InfoContext(ctx, "variant item regeneration attempt completed",
				"user_id", userID.String(),
				"task_id", task.ID.String(),
				"task_item_id", taskItem.ID.String(),
				"variant_item_id", itemID.String(),
				"attempt", attempt,
				"variant_number", variantNumber,
				"previous_variants_count", len(previousVariants),
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
	variantItem.Status = domain.VariantItemStatusReady
	variantItem.ErrorMessage = ""
	variantItem.IsEdited = false
	s.logger.InfoContext(ctx, "variant item regeneration completed",
		"user_id", userID.String(),
		"variant_id", variantID.String(),
		"variant_item_id", itemID.String(),
	)
	return variantItem, nil
}

func (s *TaskService) RegenerateTaskItemVariants(ctx context.Context, userID, taskID, taskItemID uuid.UUID) ([]domain.VariantItem, error) {
	s.logger.InfoContext(ctx, "task item related variants regeneration requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"task_item_id", taskItemID.String(),
	)
	task, err := s.repo.GetTaskWithDetails(ctx, userID, taskID)
	if err != nil {
		s.logger.ErrorContext(ctx, "task item related variants lookup failed",
			"user_id", userID.String(),
			"task_id", taskID.String(),
			"task_item_id", taskItemID.String(),
			"error", err,
		)
		return nil, err
	}

	targets := variantTargetsForTaskItem(task, taskItemID)
	previousFresh := []string(nil)
	updated := make([]domain.VariantItem, 0, len(targets))
	var lastErr error
	for _, target := range targets {
		item, regenErr := s.RegenerateVariantItem(ctx, userID, target.variantID, target.itemID, RegenerateVariantItemOptions{
			IgnorePreviousVariants:      true,
			PreviousVariantsOverride:    previousFresh,
			UsePreviousVariantsOverride: true,
		})
		if regenErr != nil {
			lastErr = regenErr
			s.logger.WarnContext(ctx, "task item related variant regeneration failed",
				"user_id", userID.String(),
				"task_id", taskID.String(),
				"task_item_id", taskItemID.String(),
				"variant_id", target.variantID.String(),
				"variant_item_id", target.itemID.String(),
				"variant_number", target.variantNumber,
				"error", regenErr,
			)
			continue
		}
		updated = append(updated, *item)
		if strings.TrimSpace(item.Content) != "" {
			previousFresh = append(previousFresh, item.Content)
		}
	}
	if len(updated) == 0 && lastErr != nil {
		return nil, lastErr
	}
	s.logger.InfoContext(ctx, "task item related variants regeneration completed",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"task_item_id", taskItemID.String(),
		"targets_count", len(targets),
		"updated_count", len(updated),
	)
	return updated, nil
}

type variantTarget struct {
	variantNumber int
	variantID     uuid.UUID
	itemID        uuid.UUID
}

func variantTargetsForTaskItem(task *domain.Task, taskItemID uuid.UUID) []variantTarget {
	targets := []variantTarget(nil)
	if task == nil {
		return targets
	}
	for _, variant := range task.Variants {
		for _, item := range variant.Items {
			if item.TaskItemID == taskItemID {
				targets = append(targets, variantTarget{
					variantNumber: variant.VariantNumber,
					variantID:     variant.ID,
					itemID:        item.ID,
				})
			}
		}
	}
	sort.Slice(targets, func(i, j int) bool {
		return targets[i].variantNumber < targets[j].variantNumber
	})
	return targets
}

func variantContextForItem(task *domain.Task, taskItemID, currentItemID uuid.UUID) (int, []string) {
	variantNumber := 0
	previousVariants := []string(nil)
	for _, variant := range task.Variants {
		for _, item := range variant.Items {
			if item.ID == currentItemID {
				variantNumber = variant.VariantNumber
				continue
			}
			if item.TaskItemID == taskItemID && item.Status == domain.VariantItemStatusReady && strings.TrimSpace(item.Content) != "" {
				previousVariants = append(previousVariants, item.Content)
			}
		}
	}
	return variantNumber, previousVariants
}

func (s *TaskService) ExportTask(ctx context.Context, userID, taskID uuid.UUID, variantNumbers []int, format string, includeDifficulty bool) (*domain.ExportResult, error) {
	format = normalizeExportFormat(format)
	if format == "" {
		return nil, domain.ErrInvalidInput
	}
	s.logger.InfoContext(ctx, "task export requested",
		"user_id", userID.String(),
		"task_id", taskID.String(),
		"selected_variants_count", len(variantNumbers),
		"format", format,
		"include_difficulty", includeDifficulty,
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
	filterTaskVariants(task, variantNumbers)
	result, err := s.ai.Export(ctx, task, format, includeDifficulty)
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

func normalizeExportFormat(format string) string {
	format = strings.ToLower(strings.TrimSpace(format))
	if format == "" {
		return "docx"
	}
	if format == "docx" || format == "pdf" {
		return format
	}
	return ""
}

func filterTaskVariants(task *domain.Task, variantNumbers []int) {
	if task == nil || len(variantNumbers) == 0 {
		return
	}

	allowed := make(map[int]struct{}, len(variantNumbers))
	for _, number := range variantNumbers {
		allowed[number] = struct{}{}
	}

	filtered := make([]domain.Variant, 0, len(task.Variants))
	for _, variant := range task.Variants {
		if _, ok := allowed[variant.VariantNumber]; ok {
			filtered = append(filtered, variant)
		}
	}
	task.Variants = filtered
}
