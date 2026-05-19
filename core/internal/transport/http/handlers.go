package http

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	stdhttp "net/http"
	"strconv"

	"core/internal/domain"
	"core/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type Handlers struct {
	orchestrator        *service.Orchestrator
	taskService         *service.TaskService
	defaultVariantCount int
	maxUploadBytes      int64
	logger              *slog.Logger
}

func NewHandlers(orchestrator *service.Orchestrator, taskService *service.TaskService, defaultVariantCount int, maxUploadBytes int64, logger *slog.Logger) *Handlers {
	if logger == nil {
		logger = slog.Default()
	}
	return &Handlers{
		orchestrator:        orchestrator,
		taskService:         taskService,
		defaultVariantCount: defaultVariantCount,
		maxUploadBytes:      maxUploadBytes,
		logger:              logger.With("component", "http_handlers"),
	}
}

func (h *Handlers) CreateTask(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())
	r.Body = stdhttp.MaxBytesReader(w, r.Body, h.maxUploadBytes)

	if err := r.ParseMultipartForm(h.maxUploadBytes); err != nil {
		writeError(w, stdhttp.StatusBadRequest, fmt.Errorf("invalid multipart form: %w", err))
		return
	}

	settings := []byte(r.FormValue("settings"))
	if len(settings) == 0 {
		settings = []byte(`{}`)
	}
	if !json.Valid(settings) {
		writeError(w, stdhttp.StatusBadRequest, errors.New("settings must be a valid JSON object"))
		return
	}

	files, err := readUploadedFiles(r.MultipartForm)
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}

	variantCount := h.defaultVariantCount
	if raw := r.FormValue("variant_count"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			writeError(w, stdhttp.StatusBadRequest, errors.New("variant_count must be a positive integer"))
			return
		}
		variantCount = parsed
	}

	h.logger.InfoContext(r.Context(), "create task request parsed",
		"user_id", userID.String(),
		"title", r.FormValue("title"),
		"files_count", len(files),
		"text_bytes", len(r.FormValue("text")),
		"variant_count", variantCount,
	)

	task, err := h.orchestrator.StartGeneration(r.Context(), service.StartGenerationRequest{
		UserID:       userID,
		Title:        r.FormValue("title"),
		Settings:     settings,
		Files:        files,
		Text:         r.FormValue("text"),
		VariantCount: variantCount,
	})
	if err != nil {
		h.logger.ErrorContext(r.Context(), "create task request failed",
			"user_id", userID.String(),
			"error", err,
		)
		writeDomainError(w, err)
		return
	}

	h.logger.InfoContext(r.Context(), "create task request accepted",
		"user_id", userID.String(),
		"task_id", task.ID.String(),
	)
	writeJSON(w, stdhttp.StatusAccepted, task)
}

func (h *Handlers) ListTasks(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())

	limit := 50
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			writeError(w, stdhttp.StatusBadRequest, errors.New("limit must be a positive integer"))
			return
		}
		limit = parsed
	}

	offset := 0
	if raw := r.URL.Query().Get("offset"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 0 {
			writeError(w, stdhttp.StatusBadRequest, errors.New("offset must be a non-negative integer"))
			return
		}
		offset = parsed
	}

	tasks, err := h.taskService.ListTasks(r.Context(), userID, domain.TaskFilter{
		Query:   r.URL.Query().Get("q"),
		Subject: r.URL.Query().Get("subject"),
		Topic:   r.URL.Query().Get("topic"),
		Status:  domain.TaskStatus(r.URL.Query().Get("status")),
		Limit:   limit,
		Offset:  offset,
	})
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, map[string]any{"items": tasks})
}

func (h *Handlers) GetTask(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())
	taskID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}

	task, err := h.taskService.GetTask(r.Context(), userID, taskID)
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, task)
}

func (h *Handlers) EditVariantItem(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())
	variantID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}
	itemID, err := parseUUIDParam(r, "item_id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}

	var req struct {
		Content string `json:"content"`
	}
	if err = json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, stdhttp.StatusBadRequest, errors.New("invalid JSON body"))
		return
	}

	item, err := h.taskService.EditVariantItem(r.Context(), userID, variantID, itemID, req.Content)
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, item)
}

func (h *Handlers) RegenerateVariantItem(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())
	variantID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}
	itemID, err := parseUUIDParam(r, "item_id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}

	item, err := h.taskService.RegenerateVariantItem(r.Context(), userID, variantID, itemID)
	if err != nil {
		writeDomainError(w, err)
		return
	}
	writeJSON(w, stdhttp.StatusOK, item)
}

func (h *Handlers) ExportTask(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	userID, _ := userIDFromContext(r.Context())
	taskID, err := parseUUIDParam(r, "id")
	if err != nil {
		writeError(w, stdhttp.StatusBadRequest, err)
		return
	}

	result, err := h.taskService.ExportTask(r.Context(), userID, taskID)
	if err != nil {
		writeDomainError(w, err)
		return
	}

	w.Header().Set("Content-Type", result.ContentType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, result.Filename))
	w.WriteHeader(stdhttp.StatusOK)
	_, _ = w.Write(result.Data)
}

func readUploadedFiles(form *multipart.Form) ([]domain.UploadedFile, error) {
	if form == nil {
		return nil, nil
	}

	headers := append([]*multipart.FileHeader{}, form.File["files"]...)
	headers = append(headers, form.File["files[]"]...)

	files := make([]domain.UploadedFile, 0, len(headers))
	for _, header := range headers {
		file, err := header.Open()
		if err != nil {
			return nil, err
		}
		data, readErr := io.ReadAll(file)
		closeErr := file.Close()
		if readErr != nil {
			return nil, readErr
		}
		if closeErr != nil {
			return nil, closeErr
		}

		files = append(files, domain.UploadedFile{
			Filename:    header.Filename,
			ContentType: header.Header.Get("Content-Type"),
			Data:        data,
		})
	}
	return files, nil
}

func parseUUIDParam(r *stdhttp.Request, key string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, key))
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid %s", key)
	}
	return id, nil
}

func writeJSON(w stdhttp.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeDomainError(w stdhttp.ResponseWriter, err error) {
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		writeError(w, stdhttp.StatusBadRequest, err)
	case errors.Is(err, domain.ErrNotFound):
		writeError(w, stdhttp.StatusNotFound, err)
	case errors.Is(err, domain.ErrRateLimitExceeded):
		writeError(w, stdhttp.StatusTooManyRequests, err)
	case errors.Is(err, domain.ErrAIWorkerFailed):
		writeError(w, stdhttp.StatusBadGateway, err)
	default:
		writeError(w, stdhttp.StatusInternalServerError, err)
	}
}

func writeError(w stdhttp.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
