# Governance

## Overview

OSPP is an open protocol maintained by the OSPP Organization. Governance is designed to be lightweight, transparent, and inclusive.

---

## 1. Roles

### Maintainers
- Full write access to the repository
- Merge pull requests after review
- Release new versions
- Resolve disputes on spec interpretation

### Committers
- Triage issues and review pull requests
- Propose spec changes via PRs
- Nominated by maintainers based on sustained contribution

### Contributors
- Anyone who submits issues, PRs, or participates in discussions
- No special access required -- all contributions go through the PR process

## 2. Decision Making

- **Consensus-seeking** -- maintainers aim for agreement through discussion
- **Lazy consensus** -- proposals without objections within 7 days are accepted
- **Voting** -- if consensus cannot be reached, maintainers vote (simple majority)
- **Breaking changes** -- require supermajority (2/3) of maintainers

## 3. RFC Process (for significant changes)

1. Author opens an Issue tagged `rfc`
2. Discussion period: minimum 14 days
3. Maintainers assess feedback and decide: accept, revise, or reject
4. Accepted RFCs are implemented via standard PR workflow

## 4. Release Process

1. All changes since last release are reviewed
2. CHANGELOG.md is updated
3. Version is bumped per VERSIONING.md
4. Git tag is created (`v1.2.3`)
5. GitHub Release is published with release notes

## 5. Code of Conduct

All participants must follow the [Contributor Covenant](CODE_OF_CONDUCT.md).
