# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via email:

📧 **security@girardellitecnologia.com**

Include the following in your report:

1. **Description** of the vulnerability
2. **Steps to reproduce** the issue
3. **Impact assessment** (what an attacker could achieve)
4. **Affected component** (package name, file, line number if possible)

### Response Timeline

| Action | Timeline |
|--------|----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix development | Depends on severity |
| Public disclosure | After fix is released |

### Severity Classification

- **Critical**: Remote code execution, credential exposure, data breach
- **High**: Authentication bypass, privilege escalation, SQL injection
- **Medium**: XSS, CSRF, information disclosure
- **Low**: Configuration issues, minor information leaks

## Scope

The following are **in scope**:

- All `@nexus/*` packages
- Cloud API (`@nexus/cloud`) — authentication, authorization, data handling
- MCP Servers (`@nexus/mcp`) — tool execution, input validation
- CLI (`@nexus/cli`) — file system operations
- LLM integrations — prompt injection, data exfiltration

The following are **out of scope**:

- Third-party dependencies (report to the respective maintainers)
- Social engineering attacks
- DDoS attacks

## Security Best Practices for Contributors

- **Never** commit secrets, API keys, or credentials
- **Never** log sensitive data (passwords, tokens, PII)
- **Always** sanitize user inputs
- **Always** use parameterized queries for database operations
- **Always** validate file paths to prevent traversal attacks

## Hall of Fame

We appreciate responsible disclosure. Contributors who report valid security issues will be acknowledged here (with their permission).
