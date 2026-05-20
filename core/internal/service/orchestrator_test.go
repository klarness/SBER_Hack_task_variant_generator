package service

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"

	"core/internal/domain"

	"github.com/google/uuid"
)

func TestGenerateVariantsKeepsFailedItems(t *testing.T) {
	failedTaskItemID := uuid.New()
	task := &domain.Task{
		ID:     uuid.New(),
		UserID: uuid.New(),
		TaskItems: []domain.TaskItem{
			{ID: uuid.New(), Order: 1, Content: "first"},
			{ID: failedTaskItemID, Order: 2, Content: "second"},
		},
		Settings: []byte(`{}`),
	}
	orchestrator := &Orchestrator{
		ai: fakeAIClient{
			failGenerateFor: failedTaskItemID,
		},
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	variants, failedItems, err := orchestrator.generateVariants(context.Background(), task, 1)
	if err != nil {
		t.Fatalf("generateVariants returned unexpected error: %v", err)
	}
	if failedItems != 1 {
		t.Fatalf("failedItems = %d, want 1", failedItems)
	}
	if len(variants) != 1 {
		t.Fatalf("variants length = %d, want 1", len(variants))
	}
	if len(variants[0].Items) != 2 {
		t.Fatalf("variant items length = %d, want 2", len(variants[0].Items))
	}

	var foundFailed bool
	for _, item := range variants[0].Items {
		if item.TaskItemID == failedTaskItemID {
			foundFailed = true
			if item.Status != domain.VariantItemStatusFailed {
				t.Fatalf("failed item status = %q, want %q", item.Status, domain.VariantItemStatusFailed)
			}
			if item.ErrorMessage == "" {
				t.Fatal("failed item error_message is empty")
			}
		}
	}
	if !foundFailed {
		t.Fatal("failed item placeholder was not saved")
	}
}

type fakeAIClient struct {
	failGenerateFor uuid.UUID
}

func (c fakeAIClient) Analyze(context.Context, domain.AnalyzeRequest) (*domain.AnalyzeResult, error) {
	return nil, errors.New("not implemented")
}

func (c fakeAIClient) Generate(_ context.Context, req domain.GenerateRequest) (*domain.VariantItem, error) {
	if req.TaskItemID == c.failGenerateFor {
		return nil, errors.New("generate failed")
	}
	return &domain.VariantItem{
		TaskItemID: req.TaskItemID,
		Content:    "generated: " + req.SourceContent,
		Status:     domain.VariantItemStatusReady,
	}, nil
}

func (c fakeAIClient) Validate(context.Context, domain.ValidateRequest) (bool, error) {
	return true, nil
}

func (c fakeAIClient) Export(context.Context, *domain.Task) (*domain.ExportResult, error) {
	return nil, errors.New("not implemented")
}
