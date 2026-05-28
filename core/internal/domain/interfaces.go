package domain

import (
	"context"

	"github.com/google/uuid"
)

type Repository interface {
	CreateTask(ctx context.Context, task *Task) error
	UpdateTaskAnalysis(ctx context.Context, userID, taskID uuid.UUID, analysis *AnalyzeResult) error
	UpdateTaskStatus(ctx context.Context, userID, taskID uuid.UUID, status TaskStatus, errorMessage string) error
	GetTask(ctx context.Context, userID, taskID uuid.UUID) (*Task, error)
	GetTaskWithDetails(ctx context.Context, userID, taskID uuid.UUID) (*Task, error)
	ListTasks(ctx context.Context, userID uuid.UUID, filter TaskFilter) ([]Task, error)
	DeleteTask(ctx context.Context, userID, taskID uuid.UUID) error
	SaveVariants(ctx context.Context, userID, taskID uuid.UUID, variants []Variant) error
	GetVariantItemForRegeneration(ctx context.Context, userID, variantID, itemID uuid.UUID) (*Task, *TaskItem, *VariantItem, error)
	UpdateTaskItem(ctx context.Context, userID, taskID, itemID uuid.UUID, content, contextText string) (*TaskItem, error)
	UpdateVariantItem(ctx context.Context, userID, variantID, itemID uuid.UUID, content string, isEdited bool) error
}

type AIClient interface {
	Analyze(ctx context.Context, req AnalyzeRequest) (*AnalyzeResult, error)
	Generate(ctx context.Context, req GenerateRequest) (*VariantItem, error)
	Validate(ctx context.Context, req ValidateRequest) (*ValidateResult, error)
	Export(ctx context.Context, task *Task, format string, includeDifficulty bool) (*ExportResult, error)
}

type RateLimiter interface {
	Allow(ctx context.Context, userID string) (bool, error)
}
