package aiworker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"strings"
	"time"

	"core/internal/domain"
)

type PythonClient struct {
	baseURL    string
	httpClient *http.Client
	logger     *slog.Logger
}

func NewPythonClient(baseURL string, timeout time.Duration, logger *slog.Logger) *PythonClient {
	if logger == nil {
		logger = slog.Default()
	}
	return &PythonClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		httpClient: &http.Client{
			Timeout: timeout,
		},
		logger: logger.With("component", "aiworker_client"),
	}
}

func (c *PythonClient) Analyze(ctx context.Context, req domain.AnalyzeRequest) (*domain.AnalyzeResult, error) {
	c.logger.InfoContext(ctx, "ai analyze request started",
		"user_id", req.UserID.String(),
		"subject", req.Subject,
		"files_count", len(req.Files),
		"text_bytes", len(req.Text),
	)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	_ = writer.WriteField("user_id", req.UserID.String())
	_ = writer.WriteField("title", req.Title)
	_ = writer.WriteField("subject", req.Subject)
	if len(req.Settings) > 0 {
		_ = writer.WriteField("settings", string(req.Settings))
	}
	if req.Text != "" {
		_ = writer.WriteField("text", req.Text)
	}

	for _, file := range req.Files {
		if err := writeFilePart(writer, "files", file); err != nil {
			_ = writer.Close()
			return nil, err
		}
	}

	if err := writer.Close(); err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/analyze", &body)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	var resp struct {
		OriginalText string            `json:"original_text"`
		Items        []analyzeItemJSON `json:"items"`
		Subject      string            `json:"subject"`
		Topic        string            `json:"topic"`
		TaskType     string            `json:"task_type"`
		Difficulty   string            `json:"difficulty"`
	}
	if err := c.do(httpReq, &resp); err != nil {
		c.logger.ErrorContext(ctx, "ai analyze request failed",
			"user_id", req.UserID.String(),
			"error", err,
		)
		return nil, err
	}

	items := make([]domain.TaskItem, 0, len(resp.Items))
	for i, item := range resp.Items {
		order := item.Order
		if order == 0 {
			order = i + 1
		}
		items = append(items, domain.TaskItem{
			Order:   order,
			Context: item.Context,
			Content: item.Content,
		})
	}

	result := &domain.AnalyzeResult{
		OriginalText: resp.OriginalText,
		Items:        items,
		Subject:      resp.Subject,
		Topic:        resp.Topic,
		TaskType:     resp.TaskType,
		Difficulty:   resp.Difficulty,
	}
	c.logger.InfoContext(ctx, "ai analyze request completed",
		"user_id", req.UserID.String(),
		"items_count", len(result.Items),
		"original_text_bytes", len(result.OriginalText),
		"subject", result.Subject,
		"topic", result.Topic,
		"task_type", result.TaskType,
		"difficulty", result.Difficulty,
	)
	return result, nil
}

func (c *PythonClient) Generate(ctx context.Context, req domain.GenerateRequest) (*domain.VariantItem, error) {
	c.logger.InfoContext(ctx, "ai generate request started",
		"user_id", req.UserID.String(),
		"task_id", req.TaskID.String(),
		"task_item_id", req.TaskItemID.String(),
		"variant_number", req.VariantNumber,
		"custom_prompt_bytes", len(req.CustomPrompt),
	)

	var resp struct {
		Content string `json:"content"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/generate", req, &resp); err != nil {
		c.logger.ErrorContext(ctx, "ai generate request failed",
			"user_id", req.UserID.String(),
			"task_id", req.TaskID.String(),
			"task_item_id", req.TaskItemID.String(),
			"variant_number", req.VariantNumber,
			"error", err,
		)
		return nil, err
	}
	c.logger.InfoContext(ctx, "ai generate request completed",
		"user_id", req.UserID.String(),
		"task_id", req.TaskID.String(),
		"task_item_id", req.TaskItemID.String(),
		"variant_number", req.VariantNumber,
		"content_bytes", len(resp.Content),
	)
	return &domain.VariantItem{
		TaskItemID: req.TaskItemID,
		Content:    resp.Content,
		Status:     domain.VariantItemStatusReady,
	}, nil
}

func (c *PythonClient) Validate(ctx context.Context, req domain.ValidateRequest) (bool, error) {
	c.logger.InfoContext(ctx, "ai validate request started",
		"user_id", req.UserID.String(),
		"task_id", req.TaskID.String(),
		"task_item_id", req.TaskItemID.String(),
		"variant_number", req.VariantNumber,
	)

	var resp struct {
		Valid bool `json:"valid"`
	}
	if err := c.doJSON(ctx, http.MethodPost, "/validate", req, &resp); err != nil {
		c.logger.ErrorContext(ctx, "ai validate request failed",
			"user_id", req.UserID.String(),
			"task_id", req.TaskID.String(),
			"task_item_id", req.TaskItemID.String(),
			"variant_number", req.VariantNumber,
			"error", err,
		)
		return false, err
	}
	c.logger.InfoContext(ctx, "ai validate request completed",
		"user_id", req.UserID.String(),
		"task_id", req.TaskID.String(),
		"task_item_id", req.TaskItemID.String(),
		"variant_number", req.VariantNumber,
		"valid", resp.Valid,
	)
	return resp.Valid, nil
}

func (c *PythonClient) Export(ctx context.Context, task *domain.Task, format string) (*domain.ExportResult, error) {
	c.logger.InfoContext(ctx, "ai export request started",
		"user_id", task.UserID.String(),
		"task_id", task.ID.String(),
		"variants_count", len(task.Variants),
		"format", format,
	)

	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(task); err != nil {
		return nil, err
	}

	path := "/export"
	if format != "" {
		path += "?format=" + format
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, &body)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		c.logger.ErrorContext(ctx, "ai export request failed",
			"user_id", task.UserID.String(),
			"task_id", task.ID.String(),
			"error", err,
		)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		err := fmt.Errorf("%w: export status %d: %s", domain.ErrAIWorkerFailed, resp.StatusCode, strings.TrimSpace(string(payload)))
		c.logger.ErrorContext(ctx, "ai export request failed",
			"user_id", task.UserID.String(),
			"task_id", task.ID.String(),
			"status_code", resp.StatusCode,
			"error", err,
		)
		return nil, err
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	filename := resp.Header.Get("X-Filename")
	if filename == "" {
		if format == "pdf" {
			filename = "task-export.pdf"
		} else {
			filename = "task-export.docx"
		}
	}
	contentDisposition := resp.Header.Get("Content-Disposition")
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	result := &domain.ExportResult{
		Filename:           filename,
		ContentDisposition: contentDisposition,
		ContentType:        contentType,
		Data:               data,
	}
	c.logger.InfoContext(ctx, "ai export request completed",
		"user_id", task.UserID.String(),
		"task_id", task.ID.String(),
		"filename", result.Filename,
		"content_type", result.ContentType,
		"bytes", len(result.Data),
	)
	return result, nil
}

func (c *PythonClient) doJSON(ctx context.Context, method, path string, in any, out any) error {
	var body bytes.Buffer
	if err := json.NewEncoder(&body).Encode(in); err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, &body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.do(req, out)
}

func (c *PythonClient) do(req *http.Request, out any) error {
	startedAt := time.Now()
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("%w: %v", domain.ErrAIWorkerFailed, err)
	}
	defer resp.Body.Close()

	c.logger.InfoContext(req.Context(), "ai http response received",
		"method", req.Method,
		"path", req.URL.Path,
		"status_code", resp.StatusCode,
		"duration_ms", time.Since(startedAt).Milliseconds(),
	)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		payload, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("%w: status %d: %s", domain.ErrAIWorkerFailed, resp.StatusCode, strings.TrimSpace(string(payload)))
	}

	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func writeFilePart(writer *multipart.Writer, field string, file domain.UploadedFile) error {
	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, escapeQuotes(file.Filename)))
	header.Set("Content-Type", contentType)

	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = part.Write(file.Data)
	return err
}

func escapeQuotes(value string) string {
	return strings.NewReplacer("\\", "\\\\", `"`, "\\\"").Replace(value)
}

type analyzeItemJSON struct {
	Order   int    `json:"order"`
	Context string `json:"context"`
	Content string `json:"content"`
}
