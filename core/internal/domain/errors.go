package domain

import "errors"

var (
	ErrNotFound          = errors.New("not found")
	ErrRateLimitExceeded = errors.New("rate limit exceeded")
	ErrAIWorkerFailed    = errors.New("ai worker failed")
	ErrValidationFailed  = errors.New("generated item did not pass validation")
	ErrInvalidInput      = errors.New("invalid input")
)
