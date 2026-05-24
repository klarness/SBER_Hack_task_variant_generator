package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusProcessing TaskStatus = "processing"
	TaskStatusDone       TaskStatus = "done"
	TaskStatusFailed     TaskStatus = "failed"
)

type VariantItemStatus string

const (
	VariantItemStatusReady  VariantItemStatus = "ready"
	VariantItemStatusFailed VariantItemStatus = "failed"
)

type Task struct {
	ID           uuid.UUID       `json:"id"`
	UserID       uuid.UUID       `json:"user_id"`
	Title        string          `json:"title"`
	Subject      string          `json:"subject,omitempty"`
	Topic        string          `json:"topic,omitempty"`
	TaskType     string          `json:"task_type,omitempty"`
	Difficulty   string          `json:"difficulty,omitempty"`
	OriginalText string          `json:"original_text"`
	Settings     json.RawMessage `json:"settings,omitempty"`
	Status       TaskStatus      `json:"status"`
	ErrorMessage string          `json:"error_message,omitempty"`
	TaskItems    []TaskItem      `json:"task_items,omitempty"`
	Variants     []Variant       `json:"variants,omitempty"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
}

type TaskItem struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"task_id"`
	Order     int       `json:"order"`
	Context   string    `json:"context,omitempty"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

type Variant struct {
	ID            uuid.UUID     `json:"id"`
	TaskID        uuid.UUID     `json:"task_id"`
	VariantNumber int           `json:"variant_number"`
	Items         []VariantItem `json:"items,omitempty"`
	CreatedAt     time.Time     `json:"created_at"`
}

type VariantItem struct {
	ID           uuid.UUID         `json:"id"`
	VariantID    uuid.UUID         `json:"variant_id"`
	TaskItemID   uuid.UUID         `json:"task_item_id"`
	Content      string            `json:"content"`
	Status       VariantItemStatus `json:"status"`
	ErrorMessage string            `json:"error_message,omitempty"`
	IsEdited     bool              `json:"is_edited"`
	CreatedAt    time.Time         `json:"created_at"`
	UpdatedAt    time.Time         `json:"updated_at"`
}

type UploadedFile struct {
	Filename    string
	ContentType string
	Data        []byte
}

type AnalyzeRequest struct {
	UserID   uuid.UUID
	Title    string
	Subject  string
	Settings json.RawMessage
	Files    []UploadedFile
	Text     string
}

type AnalyzeResult struct {
	OriginalText string
	Items        []TaskItem
	Subject      string
	Topic        string
	TaskType     string
	Difficulty   string
}

type TaskFilter struct {
	Query   string
	Subject string
	Topic   string
	Status  TaskStatus
	Limit   int
	Offset  int
}

type VariantItemHistory struct {
	ID            uuid.UUID `json:"id"`
	VariantItemID uuid.UUID `json:"variant_item_id"`
	OldContent    string    `json:"old_content"`
	NewContent    string    `json:"new_content"`
	ChangeSource  string    `json:"change_source"`
	CreatedAt     time.Time `json:"created_at"`
}

type GenerateRequest struct {
	UserID           uuid.UUID       `json:"user_id"`
	TaskID           uuid.UUID       `json:"task_id"`
	TaskItemID       uuid.UUID       `json:"task_item_id"`
	Subject          string          `json:"subject,omitempty"`
	VariantNumber    int             `json:"variant_number"`
	Order            int             `json:"order"`
	Context          string          `json:"context,omitempty"`
	SourceContent    string          `json:"source_content"`
	Settings         json.RawMessage `json:"settings,omitempty"`
	PreviousVariants []string        `json:"previous_variants,omitempty"`
	CustomPrompt     string          `json:"custom_prompt,omitempty"`
}

type ValidateRequest struct {
	UserID           uuid.UUID       `json:"user_id"`
	TaskID           uuid.UUID       `json:"task_id"`
	TaskItemID       uuid.UUID       `json:"task_item_id"`
	Subject          string          `json:"subject,omitempty"`
	VariantNumber    int             `json:"variant_number"`
	Original         string          `json:"original"`
	Generated        string          `json:"generated"`
	Settings         json.RawMessage `json:"settings,omitempty"`
	PreviousVariants []string        `json:"previous_variants,omitempty"`
}

type ExportResult struct {
	Filename           string
	ContentDisposition string
	ContentType        string
	Data               []byte
}
