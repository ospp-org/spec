# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities **privately** to:

**security@ospp-standard.org**

Include:

- Affected component (`spec`, `schemas`, `conformance`)
- Version or commit hash
- Reproduction steps or proof-of-concept
- Impact assessment (if known)

## Responsible Disclosure

Please do **not** disclose publicly until coordinated resolution. We follow a 90-day disclosure timeline.

## Response Timeline

| Step | Timeline |
|------|----------|
| Acknowledgement | Within 5 business days |
| Initial assessment | Within 10 business days |
| Fix/mitigation plan | As soon as feasible (severity-dependent) |
| Public disclosure | After fix is released, or 90 days (whichever comes first) |

## Supported Versions

| Version | Support |
|---------|---------|
| Draft (0.x) | Best-effort |
| Released (>= 1.0.0) | Full security support per CHANGELOG and security advisories |

## Scope

Security issues in the protocol specification itself (e.g., cryptographic weaknesses, authentication bypasses, replay attack vectors) are in scope. Implementation bugs in the reference client should be reported separately.
