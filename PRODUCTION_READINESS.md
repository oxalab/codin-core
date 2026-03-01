# Production Readiness Roadmap

**Status**: Beta / Production-Ready for Small Teams
**Last Updated**: 2025-02-16
**Target**: Enterprise-Grade Agent System

## Overview

This roadmap tracks the journey from the current beta state to a production-ready, enterprise-grade agent system. Items are prioritized by impact on reliability, security, and observability.

## Progress Summary

| Category | Progress | P0 | P1 | P2 |
|----------|----------|----|----|----|
| Observability | 20% | 3 | 2 | 1 |
| Testing | 5% | 4 | 2 | 2 |
| Security | 40% | 2 | 3 | 1 |
| Reliability | 70% | 1 | 1 | 0 |
| Scalability | 10% | 0 | 2 | 3 |
| Documentation | 30% | 0 | 2 | 3 |
| Deployment | 0% | 1 | 2 | 2 |
| Compliance | 0% | 0 | 1 | 3 |

**Legend**: P0 = Critical (blocker for production), P1 = High (important for reliability), P2 = Medium (nice to have)

---

## P0: Critical (Must Have for Production)

### 1. Structured Logging (Observability)

**File**: `src/observability/logger.ts`

**Requirements**:
```typescript
// Structured log levels
enum LogLevel { DEBUG, INFO, WARN, ERROR, FATAL }

// Structured log entry
interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  context?: Record<string, unknown>
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  metadata?: {
    run_id?: string
    user_id?: string
    session_id?: string
    tool_name?: string
    duration_ms?: number
    tokens_used?: number
  }
}
```

**Implementation Tasks**:
- [ ] Create logger with pluggable transports (console, file, remote)
- [ ] Add request_id tracing across agent loop
- [ ] Implement sampling for high-frequency logs
- [ ] Add sensitive data redaction (API keys, PII)
- [ ] Support JSON output for log aggregation

**Dependencies**: None
**Estimated**: 4-6 hours

---

### 2. Health Check System (Reliability)

**File**: `src/observability/health.ts`

**Requirements**:
```typescript
interface HealthCheck {
  name: string
  status: "healthy" | "degraded" | "unhealthy"
  latency_ms: number
  message?: string
  last_check: string
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy"
  checks: Record<string, HealthCheck>
  uptime_seconds: number
  version: string
}
```

**Checks to implement**:
- [ ] LLM API connectivity (all providers)
- [ ] File system accessibility
- [ ] Memory usage (< 80% threshold)
- [ ] Circuit breaker states
- [ ] Active tool executor status
- [ ] Session persistence accessibility

**HTTP Endpoint**: `GET /health` returns JSON report

**Dependencies**: None
**Estimated**: 3-4 hours

---

### 3. Graceful Shutdown (Reliability)

**File**: `src/runtime/lifecycle.ts`

**Requirements**:
```typescript
class LifecycleManager {
  // Handle SIGTERM, SIGINT
  shutdown(timeout_ms: number): Promise<void>

  // Register cleanup handlers
  registerShutdownHook(priority: number, fn: () => Promise<void>): void

  // Track in-flight operations
  trackOperation(operationId: string): void
  completeOperation(operationId: string): void
}
```

**Implementation**:
- [ ] Signal handlers for SIGTERM, SIGINT
- [ ] Drain in-flight LLM requests (with timeout)
- [ ] Flush pending logs
- [ ] Close file handles
- [ ] Persist active sessions
- [ ] Prevent new requests during shutdown

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 4. Request Tracing (Observability)

**File**: `src/observability/tracing.ts`

**Requirements**:
```typescript
interface TraceContext {
  trace_id: string
  span_id: string
  parent_span_id?: string
  baggage: Record<string, string>
}

interface Span {
  name: string
  start_time: number
  end_time?: number
  status: string
  attributes: Record<string, unknown>
  events: Array<{ name: string; time: number; attributes?: Record<string, unknown> }>
}
```

**Spans to create**:
- [ ] `agent_loop` - Entire agent execution
- [ ] `llm_call` - LLM API request
- [ ] `tool_execution` - Each tool call
- [ ] `permission_check` - Permission evaluation
- [ ] `file_operation` - File reads/writes

**Dependencies**: Logging (P0-1)
**Estimated**: 5-6 hours

---

### 5. Input Sanitization & Validation (Security)

**Files**: `src/security/validation.ts`, `src/security/sanitization.ts`

**Requirements**:
```typescript
// Validate all user inputs
interface ValidationRule {
  maxSize?: number
  allowedPatterns?: RegExp[]
  blockedPatterns?: RegExp[]
  sanitizeHTML?: boolean
  maxDepth?: number
}

// Sanitize paths to prevent directory traversal
function sanitizePath(path: string, basePath: string): string

// Validate tool arguments against schema
function validateToolArgs(toolName: string, args: unknown): ValidationResult
```

**Implementation**:
- [ ] Path traversal prevention (already partially done)
- [ ] Command injection prevention in bash tool
- [ ] XSS prevention in HTML output
- [ ] Size limits on all inputs (1MB default)
- [ ] Depth limits on nested structures
- [ ] Schema validation for all tool arguments

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 6. Core Integration Tests (Testing)

**File**: `tests/integration/*.test.ts`

**Critical test paths**:
- [ ] Agent loop with permission grant → tool execution → completion
- [ ] Agent loop with permission deny → custom response → continuation
- [ ] Permission "don't ask again" → rule creation → auto-allow
- [ ] Circuit breaker trip → tool failure → recovery
- [ ] Session save → modify → load → state persistence
- [ ] Multi-step tool execution (file read → edit → write)
- [ ] LLM API failure → retry → success
- [ ] LLM API failure → retry → exhaust → graceful error

**Target**: 80% coverage of critical paths

**Dependencies**: None
**Estimated**: 8-10 hours

---

### 7. Error Aggregation & Alerting (Observability)

**File**: `src/observability/errors.ts`

**Requirements**:
```typescript
interface ErrorReport {
  error_id: string
  type: string
  message: string
  stack_trace: string
  context: Record<string, unknown>
  count: number
  first_seen: string
  last_seen: string
}

class ErrorAggregator {
  report(error: Error, context: Record<string, unknown>): void
  getFrequentErrors(minCount: number): ErrorReport[]
  clearError(errorId: string): void
}
```

**Implementation**:
- [ ] In-memory error aggregation with deduplication
- [ ] Error context capture (run state, tool name, args)
- [ ] Alert thresholds (e.g., 10 same errors in 1 minute)
- [ ] Webhook integration for external alerting
- [ ] Error digest generation

**Dependencies**: Logging (P0-1)
**Estimated**: 3-4 hours

---

## P1: High Priority (Important for Reliability)

### 8. Metrics Collection (Observability)

**File**: `src/observability/metrics.ts`

**Requirements**:
```typescript
interface Metric {
  name: string
  type: "counter" | "gauge" | "histogram"
  value: number
  labels: Record<string, string>
  timestamp: string
}

// Key metrics to track
- agent_loop_duration_seconds (histogram)
- llm_request_duration_seconds (histogram) by provider, model
- tool_execution_duration_seconds (histogram) by tool_name, status
- permission_requests_total (counter) by decision, risk_level
- active_sessions_total (gauge)
- tool_errors_total (counter) by tool_name, error_type
- tokens_used_total (counter) by provider, model
```

**Dependencies**: Logging (P0-1)
**Estimated**: 4-5 hours

---

### 9. Configuration Validation (Reliability)

**File**: `src/runtime/config-validation.ts`

**Requirements**:
```typescript
interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ path: string; message: string }>
  warnings: Array<{ path: string; message: string }>
}

function validateConfig(config: unknown): ConfigValidationResult
```

**Validations**:
- [ ] Required fields present
- [ ] API keys format validation
- [ ] URLs are well-formed
- [ ] File paths exist and are accessible
- [ ] Numeric values in valid ranges
- [ ] Enum values are valid
- [ ] Environment variable precedence

**Dependencies**: None
**Estimated**: 3-4 hours

---

### 10. Secrets Management (Security)

**File**: `src/runtime/secrets.ts`

**Requirements**:
```typescript
interface SecretsManager {
  get(key: string): string | undefined
  getRequired(key: string): string
  validate(keys: string[]): boolean
}

// Support multiple sources
- Environment variables
- .env files (with precedence)
- System secret stores (optional)
- External secret managers (AWS Secrets Manager, etc. - future)
```

**Implementation**:
- [ ] Centralized secrets loading
- [ ] Validation at startup (fail fast)
- [ ] No secret logging (redaction)
- [ ] Hot-reload support for development

**Dependencies**: Configuration Validation (P1-9)
**Estimated**: 3-4 hours

---

### 11. Rate Limiting (Security)

**File**: `src/security/rate-limit.ts`

**Requirements**:
```typescript
interface RateLimiter {
  check(identifier: string, limit: number, window_ms: number): Promise<boolean>
  reset(identifier: string): void
}

// Rate limit targets
- LLM API calls per minute
- Tool executions per minute
- Permission requests per minute
- Total requests per session
```

**Implementation**:
- [ ] Sliding window rate limiter
- [ ] Per-session and per-IP limits
- [ ] Configurable limits via environment
- [ ] Distributed locking (for future scaling)

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 12. Unit Tests for Core Logic (Testing)

**Files**: `tests/unit/**/*.test.ts`

**Components to test**:
- [ ] `permission-engine.ts` - All decision paths
- [ ] `context-manager.ts` - Token counting, context optimization
- [ ] `tool-validator.ts` - Schema validation
- [ ] `circuit-breaker.ts` - State transitions
- [ ] `error-recovery.ts` - Retry logic
- [ ] `session-persistence.ts` - Serialize/deserialize
- [ ] `llm-gateway.ts` - Message formatting
- [ ] `orchestrator.ts` - Loop logic (with mocks)

**Target**: 70% coverage

**Dependencies**: None
**Estimated**: 12-15 hours

---

### 13. Docker Containerization (Deployment)

**Files**: `Dockerfile`, `docker-compose.yml`, `.dockerignore`

**Requirements**:
```dockerfile
# Multi-stage build
- Stage 1: Build TypeScript
- Stage 2: Production runtime (node:20-slim)
- Health check endpoint
- Non-root user
- Minimal attack surface
```

**Implementation**:
- [ ] Optimized Dockerfile (layer caching)
- [ ] docker-compose for local development
- [ ] Production configuration via environment
- [ ] Volume mounting for sessions
- [ ] Health check in Docker

**Dependencies**: Health Check (P0-2)
**Estimated**: 3-4 hours

---

### 14. API Documentation (Documentation)

**File**: `docs/api.md` or OpenAPI spec

**Document**:
- [ ] All tool interfaces
- [ ] Permission system API
- [ ] Session management API
- [ ] Configuration reference
- [ ] Error codes and meanings
- [ ] Type definitions export

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 15. Environment Management (Deployment)

**Files**: `.env.example`, `scripts/setup.ts`

**Requirements**:
```bash
# Environment template
- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- OPENROUTER_API_KEY
- CODIN_LLM_MODEL
- CODIN_WORKING_DIR
- CODIN_LOG_LEVEL
- CODIN_SENTRY_DSN
- CODIN_MAX_TOKENS
```

**Implementation**:
- [ ] `.env.example` with all variables
- [ ] Startup validation script
- [ ] Development vs production configs
- [ ] Secrets generation helper

**Dependencies**: Configuration Validation (P1-9), Secrets (P1-10)
**Estimated**: 2-3 hours

---

## P2: Medium Priority (Nice to Have)

### 16. Distributed Tracing (Observability)

**File**: `src/observability/distributed-tracing.ts`

**Implementation**:
- [ ] OpenTelemetry integration
- [ ] Jaeger/Tempo exporter
- [ ] Trace context propagation
- [ ] Service graph generation

**Dependencies**: Request Tracing (P0-4)
**Estimated**: 8-10 hours

---

### 17. End-to-End Testing (Testing)

**File**: `tests/e2e/*.spec.ts`

**Scenarios**:
- [ ] Full rebuild workflow (init → capture → extract → generate)
- [ ] Multi-turn conversation with permissions
- [ ] Session persistence across restarts
- [ ] Error recovery from LLM failures
- [ ] Circuit breaker recovery

**Dependencies**: Integration Tests (P0-6)
**Estimated**: 10-12 hours

---

### 18. Horizontal Scaling (Scalability)

**File**: `src/scaling/worker-pool.ts`

**Requirements**:
```typescript
interface WorkerPool {
  submit<T>(task: () => Promise<T>): Promise<T>
  scale(up: boolean): void
  getStats(): { active: number; queued: number }
}
```

**Implementation**:
- [ ] Worker pool for tool execution
- [ ] Request queue with priority
- [ ] Worker health monitoring
- [ ] Graceful scaling

**Dependencies**: Health Check (P0-2)
**Estimated**: 10-12 hours

---

### 19. Audit Logging (Compliance)

**File**: `src/compliance/audit-log.ts`

**Requirements**:
```typescript
interface AuditEvent {
  timestamp: string
  actor: string  // user_id or system
  action: string
  resource: string
  outcome: "success" | "failure"
  details: Record<string, unknown>
}
```

**Events to log**:
- [ ] Permission decisions (allow/deny with reason)
- [ ] File operations outside working directory
- [ ] Bash command execution
- [ ] Configuration changes
- [ ] Session access

**Dependencies**: Logging (P0-1)
**Estimated**: 3-4 hours

---

### 20. Performance Profiling (Observability)

**File**: `src/observability/profiler.ts`

**Requirements**:
```typescript
interface Profiler {
  start(label: string): void
  end(label: string): number  // returns ms
  measure<T>(label: string, fn: () => T): T
}
```

**Implementation**:
- [ ] CPU profiling hooks
- [ ] Memory profiling hooks
- [ ] Flame graph generation
- [ ] Slow operation detection (> 1s threshold)

**Dependencies**: Metrics (P1-8)
**Estimated**: 4-5 hours

---

### 21. Kubernetes Deployment (Deployment)

**Files**: `k8s/deployment.yaml`, `k8s/service.yaml`, `k8s/configmap.yaml`

**Requirements**:
- [ ] Deployment with replicas
- [ ] Service exposure
- [ ] ConfigMap for configuration
- [ ] Secret for API keys
- [ ] Horizontal Pod Autoscaler
- [ ] Liveness/readiness probes

**Dependencies**: Docker (P1-13), Health Check (P0-2)
**Estimated**: 6-8 hours

---

### 22. CI/CD Pipeline (Deployment)

**File**: `.github/workflows/ci.yml`

**Stages**:
- [ ] Lint (ESLint, Biome)
- [ ] Type check (tsc)
- [ ] Unit tests (bun test)
- [ ] Integration tests
- [ ] Build Docker image
- [ ] Push to registry
- [ ] Deploy to staging

**Dependencies**: Tests (P0-6, P1-12), Docker (P1-13)
**Estimated**: 6-8 hours

---

### 23. Architecture Documentation (Documentation)

**Files**: `docs/architecture.md`, `docs/data-flow.md`

**Content**:
- [ ] System architecture diagram
- [ ] Data flow diagrams
- [ ] Component interactions
- [ ] Deployment patterns
- [ ] Runbooks for common issues

**Dependencies**: None
**Estimated**: 6-8 hours

---

### 24. Connection Pooling (Performance)

**File**: `src/infrastructure/pool.ts`

**Requirements**:
```typescript
interface Pool<T> {
  acquire(): Promise<T>
  release(item: T): void
  close(): Promise<void>
}
```

**Pools needed**:
- [ ] LLM gateway connections (HTTP keep-alive)
- [ ] File handles
- [ ] Browser instances (for rebuild tools)

**Dependencies**: None
**Estimated**: 5-6 hours

---

### 25. Caching Strategy (Performance)

**File**: `src/infrastructure/cache.ts`

**Implementation**:
- [ ] LRU cache for file reads
- [ ] LLM response caching (with TTL)
- [ ] Cached session states
- [ ] Cache invalidation strategy

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 26. PII Detection (Compliance)

**File**: `src/compliance/pii-detector.ts`

**Requirements**:
```typescript
function detectPII(text: string): {
  hasPII: boolean
  types: Array<"email" | "phone" | "ssn" | "credit_card" | "api_key">
  redacted: string
}
```

**Implementation**:
- [ ] Pattern-based PII detection
- [ ] Automatic redaction in logs
- [ ] User notification of PII presence

**Dependencies**: Logging (P0-1)
**Estimated**: 4-5 hours

---

### 27. Blue-Green Deployment (Deployment)

**File**: `scripts/deploy.ts`

**Requirements**:
- [ ] Zero-downtime deployment
- [ ] Traffic switching capability
- [ ] Rollback mechanism
- [ ] Health check validation

**Dependencies**: Health Check (P0-2), K8s (P2-21)
**Estimated**: 8-10 hours

---

### 28. Deadlock Detection (Reliability)

**File**: `src/observability/deadlock.ts`

**Requirements**:
```typescript
class DeadlockDetector {
  trackLock(resourceId: string, holder: string): void
  releaseLock(resourceId: string, holder: string): void
  detectDeadlocks(): Array<{ cycle: string[] }>
}
```

**Dependencies**: Metrics (P1-8)
**Estimated**: 6-8 hours

---

### 29. Feature Flags (Reliability)

**File**: `src/runtime/feature-flags.ts`

**Requirements**:
```typescript
interface FeatureFlags {
  rebuild_tools: boolean
  experimental_llm: boolean
  new_permission_ui: boolean
  // ...
}
```

**Implementation**:
- [ ] Runtime flag toggling
- [ ] Per-user flag targeting
- [ ] Flag persistence
- [ ] Admin UI for flag management

**Dependencies**: None
**Estimated**: 4-5 hours

---

### 30. Load Testing (Testing)

**File**: `tests/load/k6.js` or similar

**Scenarios**:
- [ ] 100 concurrent sessions
- [ ] Sustained 10 requests/second for 10 minutes
- [ ] Spike test (burst of traffic)
- [ ] Resource exhaustion recovery

**Dependencies**: Health Check (P0-2), Metrics (P1-8)
**Estimated**: 6-8 hours

---

## Task Dependencies

```
P0: Critical Path
─────────────────────────────────────────────────────────────────────
P0-4 (Request Tracing) ────────────────┐
P0-7 (Error Aggregation) ─────────────┤
                                       ├──► P1-8 (Metrics)
P0-1 (Logging) ─────────────────────────┤
                                       │
P0-3 (Graceful Shutdown) ───────────────┤           ┌──► P1-13 (Docker)
                                       │           │
P0-6 (Integration Tests) ───────────────┤           ├──► P1-14 (API Docs)
                                       │           │
P1-9 (Config Validation) ───────────────┤           └──► P1-15 (Environment)
                                       │
P1-10 (Secrets) ────────────────────────┤
                                       │
P2-18 (Worker Pool) ─────────────────────┘
                                       │
P2-21 (K8s) ────────────────────────────┘
```

---

## Implementation Order

### Phase 1: Foundation (1-2 weeks)
**Goal**: Basic observability and reliability

1. P0-1: Structured Logging
2. P0-2: Health Checks
3. P0-3: Graceful Shutdown
4. P1-9: Configuration Validation
5. P1-15: Environment Management

**Deliverable**: System can be deployed and monitored

### Phase 2: Reliability (1-2 weeks)
**Goal**: Confident operations

6. P0-4: Request Tracing
7. P0-5: Input Sanitization
8. P0-6: Core Integration Tests
9. P0-7: Error Aggregation
10. P1-10: Secrets Management
11. P1-12: Unit Tests

**Deliverable**: Known failure modes, can debug issues

### Phase 3: Security (1 week)
**Goal**: Production security baseline

12. P1-11: Rate Limiting
13. P1-14: API Documentation
14. P2-19: Audit Logging
15. P2-26: PII Detection

**Deliverable**: Security-hardened deployment

### Phase 4: Deployment (1 week)
**Goal**: Production deployment pipeline

16. P1-13: Docker
17. P1-8: Metrics Collection
18. P2-21: Kubernetes
19. P2-22: CI/CD Pipeline
20. P2-23: Architecture Documentation

**Deliverable**: One-command deployment

### Phase 5: Scale & Polish (2 weeks)
**Goal**: Enterprise-grade polish

21. P2-16: Distributed Tracing
22. P2-17: E2E Tests
23. P2-18: Horizontal Scaling
24. P2-30: Load Testing
25. Remaining P2 items

**Deliverable**: Enterprise-ready system

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM API rate limiting | High | Implement rate limiting, caching, fallback |
| Memory leaks in long-running sessions | High | Profiling, session limits, monitoring |
| Permission bypass | Critical | Security audit, input validation, testing |
| Data loss (sessions) | Medium | Backup strategy, persistence validation |
| Concurrent tool execution bugs | Medium | Integration tests, circuit breakers |
| Dependency vulnerabilities | Medium | Dependabot, regular updates |

---

## Success Criteria

### Phase Completion Criteria

**Phase 1 (Foundation)**:
- [ ] All logs structured and searchable
- [ ] `/health` endpoint returns valid data
- [ ] Graceful shutdown completes in < 30s
- [ ] Config validation catches invalid startup

**Phase 2 (Reliability)**:
- [ ] 80% of critical paths covered by tests
- [ ] Tracing available for all requests
- [ ] Error aggregation catches and deduplicates
- [ ] Unit tests pass for all core modules

**Phase 3 (Security)**:
- [ ] No command injection vulnerabilities
- [ ] Rate limiting prevents API abuse
- [ ] All secrets validated at startup
- [ ] Audit log trail for sensitive operations

**Phase 4 (Deployment)**:
- [ ] Docker image < 500MB
- [ ] `docker-compose up` works end-to-end
- [ ] CI/CD pipeline passes on all PRs
- [ ] Rolling deployment succeeds in < 5 minutes

**Phase 5 (Enterprise)**:
- [ ] Handles 100 concurrent users
- [ ] P99 latency < 2s for agent loops
- [ ] 99.9% uptime over 30 days
- [ ] Full documentation available

---

## Open Questions

1. **Deployment Target**: Self-hosted? Cloud provider? Serverless?
2. **User Base**: Internal team? External customers? Open source?
3. **Scale**: Expected concurrent users? Requests per day?
4. **Compliance**: Any specific requirements (SOC2, HIPAA, GDPR)?
5. **Budget**: Infrastructure cost limits? Monitoring tool preferences?

---

## References

- Current implementation: `src/`
- Type definitions: `src/types/`
- Tool specifications: `specs/tool_schemas/tools.json`
- Migration docs: `migration_docs/`

---

**Next Step**: Start with Phase 1, Task 1 (Structured Logging) or schedule a planning meeting to discuss priorities.
