package config

import (
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr             string
	DatabaseURL          string
	ValkeyAddr           string
	ValkeyPassword       string
	ValkeyDB             int
	AIWorkerBaseURL      string
	RequestLimitCapacity int
	RequestLimitRefill   int
	RequestLimitWindow   time.Duration
	DefaultVariantCount  int
	MaxUploadBytes       int64
}

func Load() Config {
	return Config{
		HTTPAddr:             getEnv("HTTP_ADDR", ":8080"),
		DatabaseURL:          getEnv("DATABASE_URL", "postgres://postgres:hackpassword@localhost:5432/variants_db?sslmode=disable"),
		ValkeyAddr:           getEnv("VALKEY_ADDR", "localhost:6379"),
		ValkeyPassword:       getEnv("VALKEY_PASSWORD", ""),
		ValkeyDB:             getEnvInt("VALKEY_DB", 0),
		AIWorkerBaseURL:      getEnv("AI_WORKER_BASE_URL", "http://localhost:8000"),
		RequestLimitCapacity: getEnvInt("RATE_LIMIT_CAPACITY", 30),
		RequestLimitRefill:   getEnvInt("RATE_LIMIT_REFILL", 30),
		RequestLimitWindow:   getEnvDuration("RATE_LIMIT_WINDOW", time.Minute),
		DefaultVariantCount:  getEnvInt("DEFAULT_VARIANT_COUNT", 2),
		MaxUploadBytes:       int64(getEnvInt("MAX_UPLOAD_MB", 32)) << 20,
	}
}

func getEnv(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return parsed
}
