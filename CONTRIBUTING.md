# Contributing to OSPP

Thank you for your interest in improving the Open Self-Service Point Protocol. This document explains how to propose changes, the review process, and coding conventions.

---

## Table of Contents

- [Ways to Contribute](#ways-to-contribute)
- [Protocol Change Process (RFC)](#protocol-change-process-rfc)
- [Protocol Change Request Template](#protocol-change-request-template)
- [Workflow](#workflow)
- [Coding Style](#coding-style)
  - [Specification Text](#specification-text)
  - [JSON Schemas](#json-schemas)
  - [Example Payloads](#example-payloads)
  - [Flow Documents](#flow-documents)
- [Review Process](#review-process)
- [Breaking Changes](#breaking-changes)
- [Developer Certificate of Origin](#developer-certificate-of-origin)
- [Code of Conduct](#code-of-conduct)

---

## Ways to Contribute

| Type | Description | Label |
|------|-------------|-------|
| **Bug report** | Spec ambiguity, schema error, broken example, missing field | `bug` |
| **Protocol Change Request (PCR)** | New message, new profile, new field, behavior change | `pcr` |
| **Spec clarification** | Normative text that needs rewording for clarity | `clarification` |
| **Schema / example** | New or improved JSON Schema or payload example | `schema` |
| **Test case** | Conformance test case or test vector | `conformance` |
| **Documentation** | Implementor's guide, flow diagrams, tutorials | `docs` |
| **Tooling** | Validator, code generator, CI integration | `tooling` |

---

## Protocol Change Process (RFC)

OSPP is a wire protocol — changes affect every implementation. We use a lightweight RFC-inspired process to ensure changes are well-considered.

### Change Categories

| Category | Examples | Process |
|----------|----------|---------|
| **Editorial** | Typo fix, wording clarification, example correction | PR directly (no PCR needed) |
| **Minor** | New optional field, new error code, new config key | PCR Issue → PR |
| **Major** | New message, new profile, behavior change | PCR Issue → Discussion → PR |
| **Breaking** | Remove/rename required field, change wire format | PCR Issue → Discussion → 2 maintainer reviews |

### PCR Lifecycle

```
1. PROPOSED    Author opens a PCR Issue using the template below
2. DISCUSSION  Community discusses feasibility, alternatives, impact
3. ACCEPTED    Maintainer(s) approve the approach
4. IMPLEMENTED Author submits PR with spec text + schema + examples + tests
5. MERGED      PR reviewed and merged into main
6. RELEASED    Included in next version (see VERSIONING.md)
```

A PCR can be **REJECTED** or **DEFERRED** at any stage with a documented reason.

### When You Need a PCR

You need a PCR if your change:
- Adds, removes, or modifies a message or field
- Changes message direction, type, or timeout
- Alters retry policy, circuit breaker thresholds, or error handling
- Introduces a new error code
- Modifies the HMAC signing process
- Changes OfflinePass validation rules
- Adds or modifies a configuration key
- Introduces a new compliance profile

You do NOT need a PCR for:
- Fixing a typo in spec text
- Correcting a JSON Schema that doesn't match the spec
- Adding a missing example payload
- Improving documentation or guides
- Adding test cases for existing behavior

---

## Protocol Change Request Template

When opening a PCR Issue, use this template:

```markdown
## Protocol Change Request: [Short Title]

### Category
<!-- Editorial / Minor / Major / Breaking -->

### Summary
<!-- 1-2 sentences describing the change -->

### Motivation
<!-- Why is this change needed? What problem does it solve? -->

### Affected Components
<!-- Check all that apply -->
- [ ] Spec chapter(s): <!-- which chapters -->
- [ ] JSON Schema(s): <!-- which schemas -->
- [ ] Example payload(s)
- [ ] Flow document(s)
- [ ] Conformance test(s)
- [ ] Implementor's guide

### Affected Implementations
<!-- Who needs to update their code? -->
- [ ] Station (SSP)
- [ ] Server (CSMS)
- [ ] User Agent (App/Web)
- [ ] MQTT Broker configuration

### Proposal

#### Current Behavior
<!-- What happens today -->

#### Proposed Behavior
<!-- What should happen after the change -->

#### Wire Format Change
<!-- If applicable, show the before/after JSON structure -->

```json
// BEFORE
{
  "existingField": "value"
}

// AFTER
{
  "existingField": "value",
  "newField": "value"
}
```

### Backward Compatibility
<!-- Is this backward compatible? If not, what is the migration path? -->

### Alternatives Considered
<!-- What other approaches were considered and why were they rejected? -->

### Security Impact
<!-- Does this change affect security? Crypto? Authentication? -->

### References
<!-- Links to related issues, external specs, or discussions -->
```

---

## Workflow

### For Editorial Changes (no PCR)

1. Fork the repository
2. Create a branch: `fix/description` or `docs/description`
3. Make your changes
4. Submit a Pull Request
5. One maintainer review → merge

### For Protocol Changes (PCR required)

1. **Open a PCR Issue** using the template above
2. Wait for discussion and acceptance (label changes to `pcr:accepted`)
3. Fork the repository
4. Create a branch: `pcr/NNN-short-description` (where NNN is the issue number)
5. Implement ALL of the following (as applicable):
   - Spec text changes
   - JSON Schema additions/modifications
   - Example payload additions/modifications
   - Flow document updates
   - Conformance test cases
   - Implementor's guide updates
   - CHANGELOG.md entry
6. Submit a Pull Request referencing the PCR Issue
7. Review (1 maintainer for Minor, 2 for Major/Breaking)
8. Merge

### The "Everything in Sync" Rule

Every protocol change MUST keep these artifacts in sync:

```
Spec text  ←→  JSON Schema  ←→  Example payload  ←→  Conformance test
```

If you add a new field to a message:
- Update the spec chapter (field definition, description, constraints)
- Update the JSON Schema (add the field with type, constraints, required/optional)
- Update the example payload (show the field with a realistic value)
- Add or update a conformance test (validate the field)
- Update the implementor's guide if it affects implementation advice

A PR that changes only the schema but not the spec (or vice versa) will be rejected.

---

## Coding Style

### Specification Text

**Normative language:** Use RFC 2119 / RFC 8174 keywords consistently:
- **MUST** / **MUST NOT** — absolute requirement
- **SHOULD** / **SHOULD NOT** — recommended with documented exceptions
- **MAY** / **OPTIONAL** — permissible but not required

Bold and uppercase when normative: "The station **MUST** send a BootNotification REQUEST."

**Formatting conventions:**
- Message names in **bold**: **BootNotification**, **StartService**
- Field names in `code`: `messageId`, `bayId`, `status`
- Error codes in `code`: `3001 BAY_BUSY`
- Identifier patterns in `code`: `stn_{uuid}`, `bay_{uuid}`
- File names in `code`: `boot-notification-request.schema.json`
- References as `[MSG-XXX]`: [MSG-001] BootNotification, [MSG-005] StartService
- Chapters as `[Chapter NN](link)` or `[§N](#section)`

**Table formatting:**
- Use `|:-:|` for centered columns (numbers, counts)
- Use `|------|` for left-aligned columns (text)
- Keep tables compact — avoid long descriptions in cells

### JSON Schemas

**Standard:** JSON Schema Draft 2020-12 (`"$schema": "https://json-schema.org/draft/2020-12/schema"`)

**`$id` namespace:** `https://ospp-standard.org/schemas/v1/{category}/{filename}`

**File naming:**
- MQTT: `{action-name-kebab}-request.schema.json` / `{action-name-kebab}-response.schema.json`
- MQTT events: `{action-name-kebab}.schema.json`
- BLE: `{message-name-kebab}.schema.json`
- Common: `{type-name-kebab}.schema.json`

**Schema conventions:**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://ospp-standard.org/schemas/v1/mqtt/start-service-request.schema.json",
  "title": "StartServiceRequest",
  "description": "One-line description of what this payload represents.",
  "type": "object",
  "required": ["field1", "field2"],
  "additionalProperties": false,
  "properties": {
    "field1": {
      "$ref": "../common/station-id.schema.json"
    },
    "field2": {
      "type": "string",
      "enum": ["ValueA", "ValueB"],
      "description": "What this field means"
    }
  }
}
```

**Rules:**
- `additionalProperties: false` on ALL object schemas (strict validation)
- `required` array lists all mandatory fields
- `$ref` for shared types (relative paths: `../common/station-id.schema.json`)
- `description` on every property
- Identifiers: `pattern` regex matching the `{prefix}_{uuid}` format
- Timestamps: `format: "date-time"` (ISO 8601 UTC with milliseconds)
- Monetary values: `type: "integer"` (smallest unit — credits are atomic)
- Enums: All string enumerations use PascalCase (e.g., `"Accepted"`, `"PerMinute"`, `"PowerOn"`)
- No `default` values in schemas (defaults are spec-defined, not schema-enforced)
- No `examples` in schemas (examples live in `examples/payloads/`)

### Example Payloads

**File naming:** `{action-name-kebab}.{type}.json` — e.g., `boot-notification.request.json`, `status-notification.event.json`

**Content rules:**
- Valid JSON, well-formatted (2-space indent)
- MUST validate against the corresponding schema
- Use realistic, production-quality data (not "test123" or "placeholder")
- Use RFC 2606 example domains (`example.com`, `example.org`) for scenario data
- Consistent identifiers across files:
  - Station: `stn_a1b2c3d4`
  - Bay 1: `bay_c1d2e3f4a5b6`
  - Session: `sess_f7e8d9c0`
  - User: `sub_alice2026`
- Timestamps: `2026-02-13T10:XX:XX.000Z` (consistent date)
- Base64 strings: realistic length (40+ characters), not obviously fake

### Flow Documents

**File naming:** `{NN}-{short-name}.md` — e.g., `01-boot-sequence.md`, `07-session-stop.md`

**Required sections:**
1. `# Flow NN: Title` — descriptive title
2. `## Scenario` — narrative paragraph (who, what, where, why)
3. `## Participants` — table of actors with identifiers
4. `## Pre-conditions` — bullet list
5. `## Timeline` — timestamped event list
6. `## Step-by-Step Detail` — numbered steps with full JSON payloads inline
7. `## Message Sequence Diagram` — ASCII art showing all participants
8. `## Key Design Decisions` — numbered list explaining why

Each step should include:
- What happens (technical)
- The complete JSON payload (in a fenced code block)
- What the user sees (UI description, where applicable)

---

## Review Process

### Review Criteria

Every PR is reviewed for:

1. **Correctness** — Does the change match the spec intent? Are schemas accurate?
2. **Completeness** — Are all artifacts updated (spec, schema, example, test, guide)?
3. **Backward compatibility** — Does this break existing implementations?
4. **Security** — Does this introduce or weaken any security guarantee?
5. **Consistency** — Does this follow naming conventions, coding style, and existing patterns?

### Review Requirements

| Change Type | Reviewers Required | Approval |
|-------------|:------------------:|----------|
| Editorial (typo, clarification) | 1 maintainer | Approve |
| Minor (new optional field, new error code) | 1 maintainer | Approve |
| Major (new message, behavior change) | 2 maintainers | Both approve |
| Breaking (wire format, required field change) | 2 maintainers + discussion | Both approve + CHANGELOG + migration notes |

### Review Timeline

- Maintainers aim to provide initial feedback within **5 business days**
- Complex PCRs may take longer — the Issue will be updated with status
- If no response after 10 business days, ping the maintainers in the Issue

### Merge Policy

- All CI checks must pass (schema validation, example validation, link checking)
- No merge conflicts
- CHANGELOG.md updated (for non-editorial changes)
- Squash merge for single-purpose PRs
- Merge commit for multi-commit PRs where history is valuable

---

## Breaking Changes

A change is **breaking** if it requires existing implementations to update their code to remain compliant. Examples:

- Adding a new **required** field to a message
- Removing or renaming an existing field
- Changing the type or constraints of an existing field
- Changing message direction or type (REQUEST → EVENT)
- Changing a timeout value
- Modifying the HMAC signing algorithm or canonical form
- Changing OfflinePass validation rules
- Removing an error code

Breaking changes require:

1. `pcr:breaking` label on the Issue
2. Discussion period (minimum 2 weeks)
3. Two maintainer approvals
4. CHANGELOG.md entry under `### Changed` or `### Removed`
5. Migration notes in the PR description
6. VERSIONING.md update if the change affects versioning policy
7. Major version bump discussion (if accumulated breaking changes warrant it)

**Preferred alternatives to breaking changes:**
- Add a new optional field instead of changing an existing one
- Add a new message action instead of modifying an existing one
- Deprecate (with spec note) before removing
- Use the `protocolVersion` field for version-gated behavior

---

## Developer Certificate of Origin

By contributing to OSPP, you certify that:

1. Your contribution is your original work, or you have the right to submit it
2. You agree to license it under **Apache-2.0** (see [LICENSE](LICENSE))
3. You understand that your contribution is public and a record of it is maintained

You do not need to sign a CLA. The DCO is implicit in your PR submission.

---

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). We are committed to providing a welcoming and inclusive experience for everyone.

Please report unacceptable behavior to conduct@ospp-standard.org.

---

## Questions?

- Open a [Discussion](https://github.com/ospp-org/ospp/discussions) for general questions
- Open an [Issue](https://github.com/ospp-org/ospp/issues) for bugs or change requests
- Read the [Implementor's Guide](guides/implementors-guide.md) for technical questions
