---
name: audit-security
description: "OWASP-informed security audit for code changes. Triggers: audit security, security scan, vulnerability check, owasp audit"
---

# /audit-security

Perform a structured, OWASP-informed security audit on code in scope.

## Audit Categories

### 1. Injection (A03:2021)
- SQL injection — string concatenation in queries, missing parameterization
- XSS — unsanitized user input in HTML/DOM, `innerHTML`, `dangerouslySetInnerHTML`
- Command injection — `exec`, `spawn`, `system` with user input
- Template injection — user input in template literals rendered as HTML

### 2. Authentication & Authorization (A01:2021, A07:2021)
- Missing auth checks on sensitive endpoints
- Broken session management
- Hardcoded credentials or API keys
- Weak password policies or missing rate limiting

### 3. Sensitive Data Exposure (A02:2021)
- Secrets in source code (API keys, tokens, passwords)
- Sensitive data in logs
- Missing encryption for data at rest or in transit
- PII exposure in error messages

### 4. Insecure Data Handling (A04:2021, A08:2021)
- Missing input validation at system boundaries
- Unsafe deserialization
- Path traversal vulnerabilities
- SSRF — server-side request forgery

### 5. Dependencies (A06:2021)
- Known vulnerable dependencies
- Outdated packages with security patches available
- Unnecessary dependencies expanding attack surface

## Steps

1. **Define scope** — which files/packages to audit
2. **Pattern scan** — use Grep to search for known dangerous patterns:
   ```
   eval(, exec(, innerHTML, dangerouslySetInnerHTML,
   process.env. (in client code), password, secret, token, api_key,
   SQL string concatenation, child_process
   ```
3. **Manual review** — read flagged files in context
4. **Classify findings** by severity:
   - **Critical** — exploitable now, immediate risk
   - **High** — exploitable with effort, needs fix before deploy
   - **Medium** — defense-in-depth gap, fix in next sprint
   - **Low** — minor hardening, nice to have
5. **Write report** — structured findings table

## Rules

- Rate every finding by severity — don't just list them
- Include specific file and line references
- Provide actionable recommendations, not just "fix this"
- If the code is clean, say so. Don't manufacture findings.
