package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"sync"
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

func TestGenerateVariantsPassesPreviousVariantsForSameTaskItem(t *testing.T) {
	taskItemID := uuid.New()
	task := &domain.Task{
		ID:     uuid.New(),
		UserID: uuid.New(),
		TaskItems: []domain.TaskItem{
			{ID: taskItemID, Order: 1, Content: "solve x + 1 = 3"},
		},
		Settings: []byte(`{}`),
	}
	ai := &recordingAIClient{}
	orchestrator := &Orchestrator{
		ai:     ai,
		logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	}

	variants, failedItems, err := orchestrator.generateVariants(context.Background(), task, 3)
	if err != nil {
		t.Fatalf("generateVariants returned unexpected error: %v", err)
	}
	if failedItems != 0 {
		t.Fatalf("failedItems = %d, want 0", failedItems)
	}
	if len(variants) != 3 {
		t.Fatalf("variants length = %d, want 3", len(variants))
	}

	generateRequests := ai.generateRequestsSnapshot()
	if len(generateRequests) != 3 {
		t.Fatalf("generate requests length = %d, want 3", len(generateRequests))
	}
	assertPreviousVariants(t, generateRequests[0].PreviousVariants, nil)
	assertPreviousVariants(t, generateRequests[1].PreviousVariants, []string{"variant-1-prev-0"})
	assertPreviousVariants(t, generateRequests[2].PreviousVariants, []string{"variant-1-prev-0", "variant-2-prev-1"})

	validateRequests := ai.validateRequestsSnapshot()
	if len(validateRequests) != 3 {
		t.Fatalf("validate requests length = %d, want 3", len(validateRequests))
	}
	assertPreviousVariants(t, validateRequests[0].PreviousVariants, nil)
	assertPreviousVariants(t, validateRequests[1].PreviousVariants, []string{"variant-1-prev-0"})
	assertPreviousVariants(t, validateRequests[2].PreviousVariants, []string{"variant-1-prev-0", "variant-2-prev-1"})
}

func assertPreviousVariants(t *testing.T, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("previous variants length = %d, want %d; got %#v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("previous variants[%d] = %q, want %q; got %#v", i, got[i], want[i], got)
		}
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

func (c fakeAIClient) Validate(context.Context, domain.ValidateRequest) (*domain.ValidateResult, error) {
	return &domain.ValidateResult{Valid: true}, nil
}

func (c fakeAIClient) Export(context.Context, *domain.Task, string, bool) (*domain.ExportResult, error) {
	return nil, errors.New("not implemented")
}

type recordingAIClient struct {
	mu               sync.Mutex
	generateRequests []domain.GenerateRequest
	validateRequests []domain.ValidateRequest
}

func (c *recordingAIClient) Analyze(context.Context, domain.AnalyzeRequest) (*domain.AnalyzeResult, error) {
	return nil, errors.New("not implemented")
}

func (c *recordingAIClient) Generate(_ context.Context, req domain.GenerateRequest) (*domain.VariantItem, error) {
	c.mu.Lock()
	c.generateRequests = append(c.generateRequests, req)
	c.mu.Unlock()

	return &domain.VariantItem{
		TaskItemID: req.TaskItemID,
		Content:    fmt.Sprintf("variant-%d-prev-%d", req.VariantNumber, len(req.PreviousVariants)),
		Status:     domain.VariantItemStatusReady,
	}, nil
}

func (c *recordingAIClient) Validate(_ context.Context, req domain.ValidateRequest) (*domain.ValidateResult, error) {
	c.mu.Lock()
	c.validateRequests = append(c.validateRequests, req)
	c.mu.Unlock()
	return &domain.ValidateResult{Valid: true}, nil
}

func (c *recordingAIClient) Export(context.Context, *domain.Task, string, bool) (*domain.ExportResult, error) {
	return nil, errors.New("not implemented")
}

func (c *recordingAIClient) generateRequestsSnapshot() []domain.GenerateRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]domain.GenerateRequest(nil), c.generateRequests...)
}

func (c *recordingAIClient) validateRequestsSnapshot() []domain.ValidateRequest {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]domain.ValidateRequest(nil), c.validateRequests...)
}
