package http

import (
	"context"
	"errors"
	"log/slog"
	stdhttp "net/http"
	"time"

	"core/internal/domain"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

type contextKey string

const userIDContextKey contextKey = "user_id"

func NewRouter(handlers *Handlers, limiter domain.RateLimiter, logger *slog.Logger) stdhttp.Handler {
	if logger == nil {
		logger = slog.Default()
	}
	logger = logger.With("component", "http")

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(requestLogMiddleware(logger))

	r.Get("/healthz", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		writeJSON(w, stdhttp.StatusOK, map[string]string{"status": "ok"})
	})

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(userMiddleware)
		r.Use(rateLimitMiddleware(limiter, logger))

		r.Get("/tasks", handlers.ListTasks)
		r.Post("/tasks", handlers.CreateTask)
		r.Get("/tasks/{id}", handlers.GetTask)
		r.Delete("/tasks/{id}", handlers.DeleteTask)
		r.Get("/tasks/{id}/export", handlers.ExportTask)
		r.Patch("/tasks/{id}/items/{item_id}", handlers.EditTaskItem)
		r.Post("/tasks/{id}/items/{item_id}/regenerate-variants", handlers.RegenerateTaskItemVariants)
		r.Patch("/variants/{id}/items/{item_id}", handlers.EditVariantItem)
		r.Post("/variants/{id}/items/{item_id}/regenerate", handlers.RegenerateVariantItem)
	})

	return r
}

func userMiddleware(next stdhttp.Handler) stdhttp.Handler {
	return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		raw := r.Header.Get("X-User-ID")
		userID, err := uuid.Parse(raw)
		if err != nil {
			writeError(w, stdhttp.StatusUnauthorized, errors.New("missing or invalid X-User-ID header"))
			return
		}

		ctx := context.WithValue(r.Context(), userIDContextKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func rateLimitMiddleware(limiter domain.RateLimiter, logger *slog.Logger) func(stdhttp.Handler) stdhttp.Handler {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if limiter == nil {
				next.ServeHTTP(w, r)
				return
			}

			userID, ok := userIDFromContext(r.Context())
			if !ok {
				writeError(w, stdhttp.StatusUnauthorized, errors.New("user is not resolved"))
				return
			}

			allowed, err := limiter.Allow(r.Context(), userID.String())
			if err != nil {
				logger.ErrorContext(r.Context(), "rate limit check failed",
					"request_id", middleware.GetReqID(r.Context()),
					"user_id", userID.String(),
					"error", err,
				)
				writeError(w, stdhttp.StatusServiceUnavailable, err)
				return
			}
			if !allowed {
				logger.WarnContext(r.Context(), "rate limit exceeded",
					"request_id", middleware.GetReqID(r.Context()),
					"user_id", userID.String(),
					"method", r.Method,
					"path", r.URL.Path,
				)
				writeError(w, stdhttp.StatusTooManyRequests, domain.ErrRateLimitExceeded)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func userIDFromContext(ctx context.Context) (uuid.UUID, bool) {
	userID, ok := ctx.Value(userIDContextKey).(uuid.UUID)
	return userID, ok && userID != uuid.Nil
}

func requestLogMiddleware(logger *slog.Logger) func(stdhttp.Handler) stdhttp.Handler {
	return func(next stdhttp.Handler) stdhttp.Handler {
		return stdhttp.HandlerFunc(func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			startedAt := time.Now()
			ww := &statusResponseWriter{ResponseWriter: w, statusCode: stdhttp.StatusOK}

			next.ServeHTTP(ww, r)

			attrs := []any{
				"request_id", middleware.GetReqID(r.Context()),
				"method", r.Method,
				"path", r.URL.Path,
				"query", r.URL.RawQuery,
				"status", ww.statusCode,
				"bytes", ww.bytesWritten,
				"duration_ms", time.Since(startedAt).Milliseconds(),
				"remote_addr", r.RemoteAddr,
			}
			if userID, ok := userIDFromContext(r.Context()); ok {
				attrs = append(attrs, "user_id", userID.String())
			}

			if ww.statusCode >= 500 {
				logger.ErrorContext(r.Context(), "http request completed", attrs...)
				return
			}
			if ww.statusCode >= 400 {
				logger.WarnContext(r.Context(), "http request completed", attrs...)
				return
			}
			logger.InfoContext(r.Context(), "http request completed", attrs...)
		})
	}
}

type statusResponseWriter struct {
	stdhttp.ResponseWriter
	statusCode   int
	bytesWritten int
}

func (w *statusResponseWriter) WriteHeader(statusCode int) {
	w.statusCode = statusCode
	w.ResponseWriter.WriteHeader(statusCode)
}

func (w *statusResponseWriter) Write(data []byte) (int, error) {
	written, err := w.ResponseWriter.Write(data)
	w.bytesWritten += written
	return written, err
}
