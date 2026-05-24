package aiworker

import (
	"context"
	"log/slog"

	"core/internal/domain"
)

type LimitedClient struct {
	next        domain.AIClient
	permits     chan struct{}
	concurrency int
	logger      *slog.Logger
}

func NewLimitedClient(next domain.AIClient, concurrency int, logger *slog.Logger) *LimitedClient {
	if concurrency <= 0 {
		concurrency = 1
	}
	if logger == nil {
		logger = slog.Default()
	}

	return &LimitedClient{
		next:        next,
		permits:     make(chan struct{}, concurrency),
		concurrency: concurrency,
		logger:      logger.With("component", "aiworker_limiter"),
	}
}

func (c *LimitedClient) Analyze(ctx context.Context, req domain.AnalyzeRequest) (*domain.AnalyzeResult, error) {
	release, err := c.acquire(ctx, "analyze")
	if err != nil {
		return nil, err
	}
	defer release()
	return c.next.Analyze(ctx, req)
}

func (c *LimitedClient) Generate(ctx context.Context, req domain.GenerateRequest) (*domain.VariantItem, error) {
	release, err := c.acquire(ctx, "generate")
	if err != nil {
		return nil, err
	}
	defer release()
	return c.next.Generate(ctx, req)
}

func (c *LimitedClient) Validate(ctx context.Context, req domain.ValidateRequest) (bool, error) {
	release, err := c.acquire(ctx, "validate")
	if err != nil {
		return false, err
	}
	defer release()
	return c.next.Validate(ctx, req)
}

func (c *LimitedClient) Export(ctx context.Context, task *domain.Task, format string) (*domain.ExportResult, error) {
	c.logger.InfoContext(ctx, "ai worker export bypasses llm permit",
		"operation", "export",
		"concurrency", c.concurrency,
		"in_flight", len(c.permits),
		"format", format,
	)
	return c.next.Export(ctx, task, format)
}

func (c *LimitedClient) acquire(ctx context.Context, operation string) (func(), error) {
	c.logger.InfoContext(ctx, "ai worker permit requested",
		"operation", operation,
		"concurrency", c.concurrency,
		"in_flight", len(c.permits),
	)

	select {
	case c.permits <- struct{}{}:
		c.logger.InfoContext(ctx, "ai worker permit acquired",
			"operation", operation,
			"concurrency", c.concurrency,
			"in_flight", len(c.permits),
		)
		return func() {
			<-c.permits
			c.logger.InfoContext(ctx, "ai worker permit released",
				"operation", operation,
				"concurrency", c.concurrency,
				"in_flight", len(c.permits),
			)
		}, nil
	case <-ctx.Done():
		c.logger.WarnContext(ctx, "ai worker permit request canceled",
			"operation", operation,
			"concurrency", c.concurrency,
			"error", ctx.Err(),
		)
		return nil, ctx.Err()
	}
}
