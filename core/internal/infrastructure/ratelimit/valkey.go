package ratelimit

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

const tokenBucketScript = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "updated")
local tokens = tonumber(bucket[1])
local updated = tonumber(bucket[2])

if tokens == nil then
	tokens = capacity
	updated = now
end

local elapsed = math.max(0, now - updated)
local refill_amount = elapsed * (refill / window)
tokens = math.min(capacity, tokens + refill_amount)

if tokens < 1 then
	redis.call("HSET", key, "tokens", tokens, "updated", now)
	redis.call("EXPIRE", key, window * 2)
	return 0
end

tokens = tokens - 1
redis.call("HSET", key, "tokens", tokens, "updated", now)
redis.call("EXPIRE", key, window * 2)
return 1
`

type ValkeyLimiter struct {
	client   *redis.Client
	capacity int
	refill   int
	window   time.Duration
}

func NewClient(addr, password string, db int) *redis.Client {
	return redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})
}

func NewValkeyLimiter(client *redis.Client, capacity, refill int, window time.Duration) *ValkeyLimiter {
	if capacity <= 0 {
		capacity = 1
	}
	if refill <= 0 {
		refill = capacity
	}
	if window <= 0 {
		window = time.Minute
	}
	return &ValkeyLimiter{
		client:   client,
		capacity: capacity,
		refill:   refill,
		window:   window,
	}
}

func (l *ValkeyLimiter) Allow(ctx context.Context, userID string) (bool, error) {
	key := "rate_limit:user:" + userID
	result, err := l.client.Eval(ctx, tokenBucketScript, []string{key},
		l.capacity,
		l.refill,
		int(l.window.Seconds()),
		time.Now().Unix(),
	).Int()
	if err != nil {
		return false, err
	}
	return result == 1, nil
}
