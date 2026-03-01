# Production Readiness Quick Checklist

*Quick reference guide companion to PRODUCTION_READINESS.md*

## Pre-Flight Checklist (Before Deploying)

### Security 🔒
- [ ] API keys stored in environment variables, not code
- [ ] No hardcoded secrets anywhere
- [ ] Working directory is properly scoped
- [ ] Bash tool has command sanitization
- [ ] Permission system actually enforces decisions
- [ ] Rate limiting configured for LLM APIs

### Reliability 🛡️
- [ ] Health check endpoint implemented
- [ ] Graceful shutdown handles SIGTERM/SIGINT
- [ ] Circuit breakers have backoff/timeout
- [ ] Retry logic has max attempt limits
- [ ] Session persistence saves on critical operations
- [ ] Memory usage monitored (< 80% warning)

### Observability 📊
- [ ] All logs use structured format (JSON preferred)
- [ ] Request IDs traced through agent loop
- [ ] Errors captured with full context
- [ ] Sensitive data redacted from logs
- [ ] Metrics exported for monitoring
- [ ] Critical alerts configured

### Testing ✅
- [ ] Core integration tests pass
- [ ] Permission grant/deny flow tested
- [ ] Circuit breaker tested
- [ ] Session save/load tested
- [ ] LLM failure scenario tested
- [ ] Manual smoke test completed

---

## Emergency Runbook

### System Not Responding
1. Check `/health` endpoint
2. Review logs for `FATAL` errors
3. Check LLM API status
4. Verify memory usage
5. Check circuit breaker states

### High Error Rate
1. Check LLM API rate limits
2. Review recent changes
3. Check tool error aggregation
4. Verify configuration
5. Review circuit breaker trips

### Memory Leak Suspected
1. Check active sessions count
2. Review session sizes
3. Profile long-running operations
4. Check for file handle leaks
5. Restart if > 80% memory

### Permission Issues
1. Check permission_rules state
2. Verify risk level classification
3. Review approval callback chain
4. Check for race conditions
5. Test with clear permissions

---

## Minimum Viable Production (MVP) Setup

**Absolute minimum for production**:
1. Structured logging (console → file)
2. Health check endpoint
3. Graceful shutdown
4. Environment variable validation
5. Integration tests for happy path
6. Docker containerization

**Estimated effort**: 20-30 hours

---

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ | Implemented and tested |
| ⚠️ | Partially implemented, needs work |
| ❌ | Not implemented |
| 🔄 | In progress |

---

## Quick Commands

```bash
# Type check
bun x tsc --noEmit

# Run tests
bun test

# Health check
curl http://localhost:3000/health

# View logs
tail -f logs/app.log | jq

# Build Docker
docker build -t codin:latest .

# Run with Docker
docker-compose up -d

# Check memory
docker stats

# Graceful shutdown
docker-compose down
```

---

*Last updated: 2025-02-16*
*Full details: See PRODUCTION_READINESS.md*
