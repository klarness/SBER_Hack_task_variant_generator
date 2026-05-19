package main

import (
	"context"
	"log/slog"
	stdhttp "net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"core/internal/client/aiworker"
	"core/internal/config"
	"core/internal/infrastructure/database"
	"core/internal/infrastructure/ratelimit"
	"core/internal/service"
	transporthttp "core/internal/transport/http"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	logger.Info("application starting",
		"http_addr", cfg.HTTPAddr,
		"database_url_set", cfg.DatabaseURL != "",
		"valkey_addr", cfg.ValkeyAddr,
		"ai_worker_base_url", cfg.AIWorkerBaseURL,
		"rate_limit_capacity", cfg.RequestLimitCapacity,
		"rate_limit_refill", cfg.RequestLimitRefill,
		"rate_limit_window", cfg.RequestLimitWindow.String(),
		"default_variant_count", cfg.DefaultVariantCount,
		"max_upload_bytes", cfg.MaxUploadBytes,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("connect postgres", "error", err)
		os.Exit(1)
	}
	defer pool.Close()
	if err = pool.Ping(ctx); err != nil {
		logger.Error("ping postgres", "error", err)
		os.Exit(1)
	}
	logger.Info("postgres connected")

	redisClient := ratelimit.NewClient(cfg.ValkeyAddr, cfg.ValkeyPassword, cfg.ValkeyDB)
	defer redisClient.Close()
	if err = redisClient.Ping(ctx).Err(); err != nil {
		logger.Error("ping valkey", "error", err)
		os.Exit(1)
	}
	logger.Info("valkey connected")

	repo := database.NewPostgresRepository(pool)
	aiClient := aiworker.NewPythonClient(cfg.AIWorkerBaseURL, 90*time.Second, logger)
	limiter := ratelimit.NewValkeyLimiter(redisClient, cfg.RequestLimitCapacity, cfg.RequestLimitRefill, cfg.RequestLimitWindow)

	orchestrator := service.NewOrchestrator(repo, aiClient, logger)
	taskService := service.NewTaskService(repo, aiClient, logger)
	handlers := transporthttp.NewHandlers(orchestrator, taskService, cfg.DefaultVariantCount, cfg.MaxUploadBytes, logger)

	server := &stdhttp.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           transporthttp.NewRouter(handlers, limiter, logger),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		logger.Info("http server started", "addr", cfg.HTTPAddr)
		if err := server.ListenAndServe(); err != nil && err != stdhttp.ErrServerClosed {
			logger.Error("http server failed", "error", err)
			stop()
		}
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("http server shutdown failed", "error", err)
	}
	logger.Info("application stopped")
}
