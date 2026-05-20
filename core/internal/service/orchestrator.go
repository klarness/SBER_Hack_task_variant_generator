package service

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"core/internal/domain"

	"github.com/avast/retry-go/v4"
	"github.com/google/uuid"
)

type Orchestrator struct {
	repo       domain.Repository
	ai         domain.AIClient
	maxRuntime time.Duration
	logger     *slog.Logger
}

type StartGenerationRequest struct {
	UserID       uuid.UUID
	Title        string
	Settings     []byte
	Files        []domain.UploadedFile
	Text         string
	VariantCount int
}

func NewOrchestrator(repo domain.Repository, ai domain.AIClient, logger *slog.Logger) *Orchestrator {
	if logger == nil {
		logger = slog.Default()
	}
	return &Orchestrator{
		repo:       repo,
		ai:         ai,
		maxRuntime: 30 * time.Minute,
		logger:     logger.With("component", "orchestrator"),
	}
}

func (o *Orchestrator) StartGeneration(ctx context.Context, req StartGenerationRequest) (*domain.Task, error) {
	if req.UserID == uuid.Nil || (len(req.Files) == 0 && req.Text == "") {
		o.logger.WarnContext(ctx, "task generation rejected: invalid input",
			"user_id", req.UserID.String(),
			"files_count", len(req.Files),
			"text_bytes", len(req.Text),
		)
		return nil, domain.ErrInvalidInput
	}
	if req.VariantCount <= 0 {
		req.VariantCount = 1
	}

	task := &domain.Task{
		ID:           uuid.New(),
		UserID:       req.UserID,
		Title:        req.Title,
		OriginalText: "",
		Settings:     req.Settings,
		Status:       domain.TaskStatusProcessing,
	}
	if err := o.repo.CreateTask(ctx, task); err != nil {
		o.logger.ErrorContext(ctx, "task creation failed",
			"user_id", req.UserID.String(),
			"task_id", task.ID.String(),
			"error", err,
		)
		return nil, err
	}

	o.logger.InfoContext(ctx, "task generation accepted",
		"user_id", req.UserID.String(),
		"task_id", task.ID.String(),
		"title", req.Title,
		"files_count", len(req.Files),
		"text_bytes", len(req.Text),
		"variant_count", req.VariantCount,
	)

	go o.runGeneration(task.ID, req)
	return task, nil
}

func (o *Orchestrator) runGeneration(taskID uuid.UUID, req StartGenerationRequest) {
	ctx, cancel := context.WithTimeout(context.Background(), o.maxRuntime)
	defer cancel()

	fail := func(err error) {
		o.logger.ErrorContext(ctx, "task generation failed",
			"user_id", req.UserID.String(),
			"task_id", taskID.String(),
			"error", err,
		)
		_ = o.repo.UpdateTaskStatus(ctx, req.UserID, taskID, domain.TaskStatusFailed, err.Error())
	}

	o.logger.InfoContext(ctx, "task analysis started",
		"user_id", req.UserID.String(),
		"task_id", taskID.String(),
		"files_count", len(req.Files),
		"text_bytes", len(req.Text),
	)

	analysis, err := o.ai.Analyze(ctx, domain.AnalyzeRequest{
		UserID:   req.UserID,
		Title:    req.Title,
		Settings: req.Settings,
		Files:    req.Files,
		Text:     req.Text,
	})
	if err != nil {
		fail(err)
		return
	}
	if analysis.OriginalText == "" || len(analysis.Items) == 0 {
		fail(fmt.Errorf("%w: ai analysis returned empty task", domain.ErrAIWorkerFailed))
		return
	}

	if err = o.repo.UpdateTaskAnalysis(ctx, req.UserID, taskID, analysis); err != nil {
		fail(err)
		return
	}
	o.logger.InfoContext(ctx, "task analysis saved",
		"user_id", req.UserID.String(),
		"task_id", taskID.String(),
		"task_items_count", len(analysis.Items),
		"subject", analysis.Subject,
		"topic", analysis.Topic,
		"task_type", analysis.TaskType,
		"difficulty", analysis.Difficulty,
	)

	task, err := o.repo.GetTaskWithDetails(ctx, req.UserID, taskID)
	if err != nil {
		fail(err)
		return
	}

	variants, err := o.generateVariants(ctx, task, req.VariantCount)
	if err != nil {
		fail(err)
		return
	}

	if err = o.repo.SaveVariants(ctx, req.UserID, taskID, variants); err != nil {
		fail(err)
		return
	}
	if err = o.repo.UpdateTaskStatus(ctx, req.UserID, taskID, domain.TaskStatusDone, ""); err != nil {
		fail(err)
	}
	o.logger.InfoContext(ctx, "task generation completed",
		"user_id", req.UserID.String(),
		"task_id", taskID.String(),
		"variants_count", len(variants),
		"task_items_count", len(task.TaskItems),
	)
}

func (o *Orchestrator) generateVariants(ctx context.Context, task *domain.Task, variantCount int) ([]domain.Variant, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	totalJobs := variantCount * len(task.TaskItems)
	o.logger.InfoContext(ctx, "variant fan-out started",
		"user_id", task.UserID.String(),
		"task_id", task.ID.String(),
		"variant_count", variantCount,
		"task_items_count", len(task.TaskItems),
		"jobs_count", totalJobs,
	)

	results := make(chan generationResult, variantCount*len(task.TaskItems))
	var wg sync.WaitGroup

	for variantNumber := 1; variantNumber <= variantCount; variantNumber++ {
		for _, sourceItem := range task.TaskItems {
			wg.Add(1)
			go func(variantNumber int, sourceItem domain.TaskItem) {
				defer wg.Done()

				item, err := o.generateAndValidate(ctx, task, sourceItem, variantNumber)
				results <- generationResult{
					VariantNumber: variantNumber,
					TaskItemID:    sourceItem.ID,
					Item:          item,
					Err:           err,
				}
			}(variantNumber, sourceItem)
		}
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	grouped := make(map[int][]domain.VariantItem, variantCount)
	for result := range results {
		if result.Err != nil {
			cancel()
			o.logger.ErrorContext(ctx, "variant fan-in failed",
				"user_id", task.UserID.String(),
				"task_id", task.ID.String(),
				"variant_number", result.VariantNumber,
				"task_item_id", result.TaskItemID.String(),
				"error", result.Err,
			)
			return nil, result.Err
		}
		result.Item.TaskItemID = result.TaskItemID
		grouped[result.VariantNumber] = append(grouped[result.VariantNumber], *result.Item)
	}

	variants := make([]domain.Variant, 0, variantCount)
	for variantNumber := 1; variantNumber <= variantCount; variantNumber++ {
		variants = append(variants, domain.Variant{
			VariantNumber: variantNumber,
			Items:         grouped[variantNumber],
		})
	}
	o.logger.InfoContext(ctx, "variant fan-in completed",
		"user_id", task.UserID.String(),
		"task_id", task.ID.String(),
		"variant_count", len(variants),
		"jobs_count", totalJobs,
	)
	return variants, nil
}

func (o *Orchestrator) generateAndValidate(ctx context.Context, task *domain.Task, sourceItem domain.TaskItem, variantNumber int) (*domain.VariantItem, error) {
	var generated *domain.VariantItem
	attempt := 0

	err := retry.Do(
		func() error {
			attempt++
			o.logger.InfoContext(ctx, "variant item generation attempt started",
				"user_id", task.UserID.String(),
				"task_id", task.ID.String(),
				"task_item_id", sourceItem.ID.String(),
				"variant_number", variantNumber,
				"attempt", attempt,
			)
			item, err := o.ai.Generate(ctx, domain.GenerateRequest{
				UserID:        task.UserID,
				TaskID:        task.ID,
				TaskItemID:    sourceItem.ID,
				VariantNumber: variantNumber,
				Order:         sourceItem.Order,
				Context:       sourceItem.Context,
				SourceContent: sourceItem.Content,
				Settings:      task.Settings,
			})
			if err != nil {
				return err
			}

			valid, err := o.ai.Validate(ctx, domain.ValidateRequest{
				UserID:        task.UserID,
				TaskID:        task.ID,
				TaskItemID:    sourceItem.ID,
				VariantNumber: variantNumber,
				Original:      sourceItem.Content,
				Generated:     item.Content,
				Settings:      task.Settings,
			})
			if err != nil {
				return err
			}
			if !valid {
				o.logger.WarnContext(ctx, "variant item validation rejected generated content",
					"user_id", task.UserID.String(),
					"task_id", task.ID.String(),
					"task_item_id", sourceItem.ID.String(),
					"variant_number", variantNumber,
					"attempt", attempt,
				)
				return domain.ErrValidationFailed
			}

			generated = item
			o.logger.InfoContext(ctx, "variant item generation attempt completed",
				"user_id", task.UserID.String(),
				"task_id", task.ID.String(),
				"task_item_id", sourceItem.ID.String(),
				"variant_number", variantNumber,
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
		o.logger.ErrorContext(ctx, "variant item generation exhausted retries",
			"user_id", task.UserID.String(),
			"task_id", task.ID.String(),
			"task_item_id", sourceItem.ID.String(),
			"variant_number", variantNumber,
			"attempts", attempt,
			"error", err,
		)
		return nil, err
	}
	return generated, nil
}

type generationResult struct {
	VariantNumber int
	TaskItemID    uuid.UUID
	Item          *domain.VariantItem
	Err           error
}
