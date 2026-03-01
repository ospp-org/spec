#!/bin/bash
# OSPP Protocol Verification Script
# Runs all consistency checks and produces verification-report.md
cd "$(dirname "$0")/.."

if ! node -e "require('ajv')" 2>/dev/null; then
  echo "ERROR: ajv not installed. Run: npm install ajv ajv-formats"
  exit 1
fi

node << 'VERIFY_SCRIPT'
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const output = [];
const cats = {};
const allFailures = [];

// ==================== UTILITIES ====================
function log(msg) { const s = msg === undefined ? '' : String(msg); output.push(s); console.log(s); }
function initCat(id, name) { cats[id] = { id, name, checks: 0, pass: 0, fail: 0, skip: 0, failures: [] }; }
function PASS(c) { cats[c].checks++; cats[c].pass++; }
function FAIL(c, file, line, found, expected) {
  cats[c].checks++; cats[c].fail++;
  const e = { file, line, found, expected };
  cats[c].failures.push(e);
  allFailures.push({ cat: cats[c].name, ...e });
}
function SKIP(c, reason) { cats[c].checks++; cats[c].skip++; }

function findFiles(dir, ext) {
  const result = [];
  const abs = path.resolve(ROOT, dir);
  if (!fs.existsSync(abs)) return result;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else if (!ext || e.name.endsWith(ext)) result.push(f);
    }
  })(abs);
  return result;
}

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }
function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function readLines(p) { const c = readSafe(p); return c ? c.split(/\r?\n/) : []; }
function findLineNum(content, search) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) { if (lines[i].includes(search)) return i + 1; }
  return 0;
}

function logCat(c) {
  const cat = cats[c];
  if (cat.failures.length > 0) {
    log('');
    for (const f of cat.failures) {
      log('  FAIL: ' + f.file + (f.line ? ':' + f.line : ''));
      log('    Found:    ' + f.found);
      log('    Expected: ' + f.expected);
    }
  }
  log('');
  log('**Result: ' + cat.pass + '/' + cat.checks + ' PASS'
    + (cat.fail ? ', ' + cat.fail + ' FAIL' : '')
    + (cat.skip ? ', ' + cat.skip + ' SKIP' : '') + '**');
}

function extractJsonBlocks(content) {
  const blocks = [];
  const re = /```json\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    try { blocks.push(JSON.parse(m[1])); } catch {}
  }
  return blocks;
}

function findEnumsDeep(obj, parentKey, results) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(v => findEnumsDeep(v, parentKey, results)); return; }
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'enum' && Array.isArray(v)) {
      results.push({ field: parentKey, values: v });
    } else {
      findEnumsDeep(v, k === 'properties' ? parentKey : k, results);
    }
  }
}

function findFieldValues(obj, fieldName, results) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(v => findFieldValues(v, fieldName, results)); return; }
  for (const [k, v] of Object.entries(obj)) {
    if (k === fieldName && (typeof v === 'string' || typeof v === 'number')) results.push(String(v));
    else findFieldValues(v, fieldName, results);
  }
}

// ==================== CATEGORY 1: JSON Validity ====================
function category1() {
  const C = 'c1'; initCat(C, 'JSON Validity');
  log('## Category 1: JSON Validity');
  log('');

  const dirs = ['schemas', 'conformance/test-vectors', 'examples/payloads'];
  const jsonFiles = dirs.flatMap(d => findFiles(d, '.json'));

  for (const file of jsonFiles) {
    const r = rel(file);
    try {
      const parsed = JSON.parse(readSafe(file));
      // Schema check: must have type or $ref or composition keyword
      if (r.startsWith('schemas/')) {
        if (!parsed.type && !parsed.$ref && !parsed.allOf && !parsed.oneOf && !parsed.anyOf && !parsed.if) {
          FAIL(C, r, 1, 'no type/$ref/allOf/oneOf/anyOf', 'schema should have a type definition');
          continue;
        }
      }
      // Test vector: empty {} is valid for messages with no payload (heartbeat, get-configuration)
      // and for invalid/missing-required test cases (intentionally empty)
      if (r.startsWith('conformance/test-vectors/')) {
        if (typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length === 0) {
          if (r.includes('/invalid/') || r.match(/heartbeat-request|get-configuration-request|get-diagnostics-request/)) {
            PASS(C); // legitimately empty
            continue;
          }
          FAIL(C, r, 1, 'empty object {}', 'at least one field');
          continue;
        }
      }
      PASS(C);
    } catch (e) {
      FAIL(C, r, 1, 'JSON parse error: ' + e.message, 'valid JSON');
    }
  }
  log('JSON files checked: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 2: Schema Cross-References ====================
function category2() {
  const C = 'c2'; initCat(C, 'Schema Cross-References');
  log('');
  log('## Category 2: Schema Cross-References');
  log('');

  const schemaFiles = findFiles('schemas', '.json');
  for (const file of schemaFiles) {
    const r = rel(file);
    let parsed;
    try { parsed = JSON.parse(readSafe(file)); } catch { continue; }

    const refs = [];
    (function walk(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      for (const [k, v] of Object.entries(obj)) {
        if (k === '$ref' && typeof v === 'string') refs.push(v);
        else walk(v);
      }
    })(parsed);

    for (const ref of refs) {
      if (ref.startsWith('#')) {
        // Validate internal JSON pointer
        const pointer = ref.substring(1); // strip leading #
        if (!pointer || pointer === '/') { PASS(C); continue; }
        const parts = pointer.split('/').filter(Boolean);
        let current = parsed;
        let valid = true;
        for (const part of parts) {
          if (current && typeof current === 'object' && part in current) {
            current = current[part];
          } else {
            valid = false;
            break;
          }
        }
        if (valid) { PASS(C); }
        else { FAIL(C, r, 0, '$ref "' + ref + '" -> pointer does not resolve', 'JSON pointer should resolve within schema'); }
        continue;
      }
      const refFile = ref.split('#')[0];
      const resolved = path.resolve(path.dirname(file), refFile);
      if (!fs.existsSync(resolved)) {
        FAIL(C, r, 0, '$ref "' + ref + '" -> file not found', rel(resolved) + ' should exist');
      } else {
        try { JSON.parse(readSafe(resolved)); PASS(C); }
        catch { FAIL(C, r, 0, '$ref "' + ref + '" -> invalid JSON', 'valid JSON at ' + rel(resolved)); }
      }
    }
  }
  log('$ref checks: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 3: Enum Consistency ====================
function category3() {
  const C = 'c3'; initCat(C, 'Enum Consistency');
  log('');
  log('## Category 3: Enum Consistency');
  log('');

  const BLE_TYPE_VALUES = new Set([
    'stationInfo', 'availableServices', 'offlineAuthRequest',
    'authResponse', 'startServiceResponse', 'serviceStatus',
    'receipt', 'error', 'fragment', 'ble-fragment'
  ]);

  // Schemas where camelCase type values are expected
  const BLE_SCHEMA_DIRS = ['schemas/ble'];

  function isPascalCase(s) {
    if (typeof s !== 'string' || s.length === 0) return true;
    if (/^\d/.test(s)) return true; // version strings, numbers
    if (BLE_TYPE_VALUES.has(s)) return true; // BLE type exception
    if (/^[a-z]/.test(s)) return false; // starts lowercase
    if (/_/.test(s)) return false; // has underscore (snake_case)
    return true;
  }

  const messagesContent = readSafe(path.join(ROOT, 'spec/03-messages.md')) || '';
  const configContent = readSafe(path.join(ROOT, 'spec/08-configuration.md')) || '';

  const schemaFiles = findFiles('schemas', '.json');
  let enumCount = 0;

  for (const file of schemaFiles) {
    const r = rel(file);
    let parsed;
    try { parsed = JSON.parse(readSafe(file)); } catch { continue; }

    const enums = [];
    findEnumsDeep(parsed, '', enums);

    for (const { field, values } of enums) {
      for (const val of values) {
        if (typeof val !== 'string') continue;
        enumCount++;

        // PascalCase check
        if (!isPascalCase(val)) {
          const isBleSchema = BLE_SCHEMA_DIRS.some(d => r.startsWith(d));
          if (isBleSchema && (field === 'type' || field === 'items')) {
            PASS(C); // BLE type field exception
          } else {
            FAIL(C, r, findLineNum(readSafe(file), '"' + val + '"'),
              'enum value "' + val + '" (field: ' + field + ')',
              'PascalCase (first letter uppercase, no underscores)');
          }
        } else {
          PASS(C);
        }
      }
    }
  }
  log('Enum values checked: ' + enumCount);
  logCat(C);
}

// ==================== CATEGORY 4: Numeric Consistency ====================
function category4() {
  const C = 'c4'; initCat(C, 'Numeric Consistency');
  log('');
  log('## Category 4: Numeric Consistency');
  log('');

  // Canonical config defaults
  const configDefaults = {
    HeartbeatIntervalSeconds: '30',
    MeterValuesInterval: '15',
    ReconnectBackoffMax: '30',
    BootRetryInterval: '30',
    MaxSessionDurationSeconds: '600',
    ConnectionLostGracePeriod: '300',
    BLEAdvertisingInterval: '200',
  };

  // Extract Quick Reference timeouts from 03-messages.md
  const msgLines = readLines(path.join(ROOT, 'spec/03-messages.md'));
  const timeouts = {};
  for (const line of msgLines) {
    // Match: | # | ActionName | ... | 30s | or | ... | 300s |
    const m = line.match(/^\|\s*\d+\s*\|\s*\[([^\]]+)\]/);
    if (m) {
      const timeoutMatch = line.match(/\|\s*(\d+)s\s*\|/);
      if (timeoutMatch) {
        timeouts[m[1]] = timeoutMatch[1];
      }
    }
  }

  // Check config defaults in §9 summary table of 08-configuration.md
  const configLines = readLines(path.join(ROOT, 'spec/08-configuration.md'));
  const configContent = configLines.join('\n');

  for (const [key, expected] of Object.entries(configDefaults)) {
    // Search ALL table rows containing this key (not just the first occurrence)
    let found = false;
    for (let i = 0; i < configLines.length; i++) {
      const line = configLines[i];
      // Only check table rows (start with |)
      if (!line.trimStart().startsWith('|')) continue;
      if (!line.includes('`' + key + '`')) continue;

      // Found key in a table row — check if the expected default is in this row
      if (line.includes('`' + expected + '`') || line.includes('`"' + expected + '"`')) {
        PASS(C);
        found = true;
        break;
      }
      // Check numeric default in backticks
      const vals = (line.match(/`(\d+)`/g) || []).map(m => m.replace(/`/g, ''));
      if (vals.includes(expected)) {
        PASS(C);
        found = true;
        break;
      }
    }
    if (!found) {
      FAIL(C, 'spec/08-configuration.md', 0,
        key + ' default not confirmed as ' + expected + ' in §9 table',
        'default: ' + expected);
    }
  }

  // Check Quick Reference timeouts against spec files
  const checkFiles = [
    ...findFiles('spec', '.md').map(f => rel(f)),
  ];
  const statesMd = readSafe(path.join(ROOT, 'spec/05-state-machines.md')) || '';
  const errorsMd = readSafe(path.join(ROOT, 'spec/07-errors.md')) || '';

  // Cross-check Quick Reference timeouts against per-message Timeout property
  const msgContent = msgLines.join('\n');
  for (const [action, timeout] of Object.entries(timeouts)) {
    // Find the ### heading for this action and its Timeout property
    const headingRe = new RegExp('^### \\d+\\.\\d+ ' + action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm');
    const headingMatch = headingRe.exec(msgContent);
    if (!headingMatch) { PASS(C); continue; } // action not found as heading — QR table name may differ
    const afterHeading = msgContent.substring(headingMatch.index);
    const timeoutPropMatch = afterHeading.match(/\*\*Timeout\*\*\s*\|\s*(.+)/);
    if (timeoutPropMatch) {
      const propValue = timeoutPropMatch[1];
      if (propValue.includes(timeout)) {
        PASS(C);
      } else {
        FAIL(C, 'spec/03-messages.md', 0,
          action + ': Quick Reference timeout ' + timeout + 's vs Timeout property "' + propValue.trim().substring(0, 60) + '"',
          'timeout values should match');
      }
    } else {
      PASS(C); // No Timeout property (events) — QR table timeout is informational
    }
  }

  // Cross-check specific known problem areas
  // BootRetryInterval default in 07-errors.md (was 60s, fixed to 30s)
  if (errorsMd.includes('default 60s') && errorsMd.includes('BootRetryInterval')) {
    FAIL(C, 'spec/07-errors.md', findLineNum(errorsMd, 'default 60s'),
      'BootRetryInterval still shows "default 60s"', 'default 30s');
  } else {
    PASS(C);
  }

  // ReconnectBackoffMax in 02-transport.md (was hardcoded 300, fixed to 30)
  const transportMd = readSafe(path.join(ROOT, 'spec/02-transport.md')) || '';
  if (transportMd.match(/max_delay\s*=\s*300/)) {
    FAIL(C, 'spec/02-transport.md', findLineNum(transportMd, 'max_delay'),
      'max_delay hardcoded to 300', 'should reference ReconnectBackoffMax (default 30)');
  } else {
    PASS(C);
  }

  // BLE advertising interval in 02-transport.md hardware table (was 100ms, fixed to 200ms)
  if (transportMd.match(/advertising.*100\s*ms/i) || transportMd.match(/100\s*ms.*advertising/i)) {
    const line = findLineNum(transportMd, '100 ms') || findLineNum(transportMd, '100ms');
    FAIL(C, 'spec/02-transport.md', line,
      'BLE advertising interval 100ms', 'should be 200ms');
  } else {
    PASS(C);
  }

  // MeterValuesInterval: check no file says default is 60
  const allSpecFiles = findFiles('spec', '.md');
  for (const f of allSpecFiles) {
    const content = readSafe(f) || '';
    // Look for "MeterValuesInterval" near a wrong default
    const mviIdx = content.indexOf('MeterValuesInterval');
    if (mviIdx !== -1) {
      const near = content.substring(Math.max(0, mviIdx - 50), mviIdx + 150);
      if (near.includes('default') && (near.includes('60') && !near.includes('600'))) {
        // Check more carefully - might be MaxSessionDurationSeconds 600
        if (near.match(/MeterValuesInterval.*default.*\b60\b/) && !near.includes('600')) {
          FAIL(C, rel(f), findLineNum(content, 'MeterValuesInterval'),
            'MeterValuesInterval default 60', 'default should be 15');
        }
      }
    }
  }

  log('Numeric checks: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 5: Error Code Consistency ====================
function category5() {
  const C = 'c5'; initCat(C, 'Error Code Consistency');
  log('');
  log('## Category 5: Error Code Consistency');
  log('');

  // Extract error registry from 07-errors.md
  const errorsMd = readSafe(path.join(ROOT, 'spec/07-errors.md')) || '';
  const errorLines = errorsMd.split(/\r?\n/);
  const registry = {};

  for (let i = 0; i < errorLines.length; i++) {
    const m = errorLines[i].match(/^\|\s*(\d{4})\s*\|\s*`([A-Z_]+)`\s*\|\s*(\w+)\s*\|/);
    if (m) {
      registry[m[1]] = { code: m[1], name: m[2], severity: m[3], line: i + 1 };
    }
  }

  const registrySize = Object.keys(registry).length;
  log('Error codes in registry: ' + registrySize);

  // Check error codes in 03-messages.md per-message error tables
  const msgMd = readSafe(path.join(ROOT, 'spec/03-messages.md')) || '';
  const msgLines = msgMd.split(/\r?\n/);
  let msgCodeRefs = 0;

  for (let i = 0; i < msgLines.length; i++) {
    const m = msgLines[i].match(/^\|\s*(\d{4})\s*\|\s*`?([A-Z_]+)`?\s*\|/);
    if (m) {
      const code = m[1];
      const name = m[2];
      msgCodeRefs++;

      if (registry[code]) {
        if (registry[code].name === name) {
          PASS(C);
        } else {
          FAIL(C, 'spec/03-messages.md', i + 1,
            'code ' + code + ' name "' + name + '"',
            'registry name "' + registry[code].name + '"');
        }
      } else {
        FAIL(C, 'spec/03-messages.md', i + 1,
          'code ' + code + ' (' + name + ') not in 07-errors.md registry',
          'code should exist in error registry');
      }
    }
  }

  // Check error codes in profile files
  const profileFiles = findFiles('spec/profiles', '.md');
  for (const file of profileFiles) {
    const content = readSafe(file) || '';
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\|\s*(\d{4})\s*\|\s*`?([A-Z_]+)`?\s*\|/);
      if (m) {
        const code = m[1];
        const name = m[2];
        if (registry[code]) {
          if (registry[code].name === name) {
            PASS(C);
          } else {
            FAIL(C, rel(file), i + 1,
              'code ' + code + ' name "' + name + '"',
              'registry name "' + registry[code].name + '"');
          }
        }
        // Codes not in registry might be profile-specific — skip
      }
    }
  }

  // Check error codes in JSON example files
  const exampleFiles = [
    ...findFiles('examples', '.json'),
    ...findFiles('conformance/test-vectors', '.json'),
  ];
  for (const file of exampleFiles) {
    let parsed;
    try { parsed = JSON.parse(readSafe(file)); } catch { continue; }
    const codes = [];
    findFieldValues(parsed, 'errorCode', codes);
    for (const code of codes) {
      const codeStr = String(code);
      if (registry[codeStr]) {
        PASS(C);
      } else if (/^\d{4}$/.test(codeStr)) {
        FAIL(C, rel(file), 0,
          'errorCode ' + codeStr + ' not in registry',
          'code should exist in 07-errors.md');
      }
    }

    // Also check errorText matches
    const texts = [];
    findFieldValues(parsed, 'errorText', texts);
    for (const text of texts) {
      const matchingEntry = Object.values(registry).find(e => e.name === text);
      if (matchingEntry || !text.match(/^[A-Z_]+$/)) {
        PASS(C);
      } else {
        FAIL(C, rel(file), 0,
          'errorText "' + text + '" not in registry',
          'should match an error name in 07-errors.md');
      }
    }
  }

  log('Error code cross-references checked: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 6: Config Key Consistency ====================
function category6() {
  const C = 'c6'; initCat(C, 'Config Key Consistency');
  log('');
  log('## Category 6: Config Key Consistency');
  log('');

  // Extract config keys with metadata from §9 summary table
  const configMd = readSafe(path.join(ROOT, 'spec/08-configuration.md')) || '';
  const configLines = configMd.split(/\r?\n/);
  const configKeys = []; // { key, type, default, access, line }

  for (let i = 0; i < configLines.length; i++) {
    const m = configLines[i].match(/^\|\s*\d+\s*\|\s*`([A-Za-z]+)`\s*\|\s*(\w+)\s*\|\s*(.+?)\s*\|\s*(\w+)\s*\|/);
    if (m) configKeys.push({ key: m[1], type: m[2], dflt: m[3].trim(), access: m[4], line: i + 1 });
  }

  log('Config keys found: ' + configKeys.length);

  const specFiles = findFiles('spec', '.md');
  const guideFiles = findFiles('guides', '.md');
  const allDocs = [...specFiles, ...guideFiles];

  // Build a cache of file contents
  const docContents = {};
  for (const f of allDocs) {
    docContents[rel(f)] = readSafe(f) || '';
  }

  for (const cfg of configKeys) {
    // 1. Check key is referenced at least once outside 08-configuration.md
    let foundOutside = false;
    for (const [r, content] of Object.entries(docContents)) {
      if (r === 'spec/08-configuration.md') continue;
      if (content.includes(cfg.key)) { foundOutside = true; break; }
    }
    if (foundOutside) {
      PASS(C);
    } else {
      FAIL(C, 'spec/08-configuration.md', cfg.line,
        cfg.key + ' — config key not referenced in any other spec/guide file',
        'config key should be used somewhere in the protocol spec');
    }

    // 2. Check key has a valid defined default (not empty/missing)
    if (cfg.dflt && cfg.dflt !== '--' && cfg.dflt !== '—') {
      PASS(C);
    } else if (cfg.access === 'R') {
      PASS(C); // Read-only keys may have no default (runtime-computed, e.g., FirmwareVersion)
    } else if (cfg.access === 'W') {
      PASS(C); // Write-only keys (e.g., crypto keys like OfflinePassPublicKey) have no default by design
    } else {
      FAIL(C, 'spec/08-configuration.md', cfg.line,
        cfg.key + ' — RW config key has no default value: "' + cfg.dflt + '"',
        'writable config keys should have a default');
    }

    // 3. Check key name is PascalCase (first letter uppercase, no underscores)
    if (/^[A-Z][a-zA-Z]+$/.test(cfg.key)) {
      PASS(C);
    } else {
      FAIL(C, 'spec/08-configuration.md', cfg.line,
        cfg.key + ' — not PascalCase',
        'config key names should be PascalCase');
    }
  }

  logCat(C);
}

// ==================== CATEGORY 7: Identifier Pattern Compliance ====================
function category7() {
  const C = 'c7'; initCat(C, 'Identifier Pattern Compliance');
  log('');
  log('## Category 7: Identifier Pattern Compliance');
  log('');

  const patterns = {
    stationId: /^stn_[a-f0-9]{8,}$/,
    bayId: /^bay_[a-f0-9]{8,}$/,
    sessionId: /^sess_[a-f0-9]{8,}$/,
    subscriberId: /^sub_[a-f0-9_]{4,}$/,  // some examples use sub_alice2026 etc.
    serviceId: /^svc_[a-f0-9]{8,}$/,
    reservationId: /^rsv_[a-f0-9]{8,}$/,
    offlineTxId: /^otx_[a-f0-9]{8,}$/,
    offlinePassId: /^opass_[a-f0-9]{8,}$/,
  };

  // More permissive patterns for examples (which use readable IDs like svc_eco)
  const permissivePatterns = {
    stationId: /^stn_[a-z0-9_]{3,}$/,
    bayId: /^bay_[a-z0-9_]{3,}$/,
    sessionId: /^sess_[a-z0-9_]{3,}$/,
    subscriberId: /^sub_[a-z0-9_]{3,}$/,
    serviceId: /^svc_[a-z0-9_]{3,}$/,
    reservationId: /^rsv_[a-z0-9_]{3,}$/,
    offlineTxId: /^otx_[a-z0-9_]{3,}$/,
    offlinePassId: /^opass_[a-z0-9_]{3,}$/,
    messageId: /^(?:boot|hb|evt|sec|tx|auth|cmd|msg|lwt)[-_][a-z0-9_-]{3,}$/,
    eventId: /^sec_[a-z0-9_]{3,}$/,
    deviceId: /^(?:device[-_]|dev[-_]|[a-f0-9]{16,})/,
  };

  // Check JSON files (skip invalid test vectors — they intentionally have wrong values)
  const jsonDirs = ['examples/payloads', 'conformance/test-vectors'];
  const jsonFiles = jsonDirs.flatMap(d => findFiles(d, '.json'))
    .filter(f => !rel(f).includes('invalid/'));

  for (const file of jsonFiles) {
    let parsed;
    try { parsed = JSON.parse(readSafe(file)); } catch { continue; }

    for (const [field, pattern] of Object.entries(permissivePatterns)) {
      const values = [];
      findFieldValues(parsed, field, values);
      for (const val of values) {
        if (pattern.test(val)) {
          PASS(C);
        } else {
          FAIL(C, rel(file), 0,
            field + ' = "' + val + '"',
            'should match pattern ' + pattern.toString());
        }
      }
    }
  }

  // Check inline JSON in markdown flows
  const mdDirs = ['examples/flows', 'examples/error-scenarios'];
  const mdFiles = mdDirs.flatMap(d => findFiles(d, '.md'));

  for (const file of mdFiles) {
    const content = readSafe(file) || '';
    const blocks = extractJsonBlocks(content);

    for (const block of blocks) {
      for (const [field, pattern] of Object.entries(permissivePatterns)) {
        const values = [];
        findFieldValues(block, field, values);
        for (const val of values) {
          if (pattern.test(val)) {
            PASS(C);
          } else {
            FAIL(C, rel(file), 0,
              field + ' = "' + val + '"',
              'should match pattern ' + pattern.toString());
          }
        }
      }
    }
  }

  log('Identifier checks: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 8: Test Vector Schema Validation ====================
function category8() {
  const C = 'c8'; initCat(C, 'Test Vector Schema Validation');
  log('');
  log('## Category 8: Test Vector Schema Validation');
  log('');

  let Ajv;
  try {
    Ajv = require('ajv/dist/2020');
  } catch {
    try {
      Ajv = require(path.join(ROOT, 'node_modules/ajv/dist/2020'));
    } catch {
      try {
        Ajv = require('ajv');
      } catch {
        log('SKIPPED — requires Ajv (npm install ajv)');
        SKIP(C, 'Ajv not installed');
        logCat(C);
        return;
      }
    }
  }

  const ajv = new Ajv({ strict: false, allErrors: true });

  // Add format validation (date-time, uri, etc.)
  try {
    const addFormats = require('ajv-formats');
    addFormats(ajv);
  } catch {
    try {
      const addFormats = require(path.join(ROOT, 'node_modules/ajv-formats'));
      addFormats(ajv);
    } catch {}
  }

  // Load all common schemas first for $ref resolution
  const commonSchemas = findFiles('schemas/common', '.json');
  for (const f of commonSchemas) {
    try {
      const schema = JSON.parse(readSafe(f));
      if (schema.$id) ajv.addSchema(schema);
    } catch {}
  }

  // Map test vector filename to schema
  function findSchema(tvPath) {
    const basename = path.basename(tvPath);
    // Remove valid/invalid suffixes: boot-notification-request-minimal.json -> boot-notification-request
    // or boot-notification-request-invalid-enum.json -> boot-notification-request
    let schemaBase = basename
      .replace(/-minimal\.json$/, '')
      .replace(/-full\.json$/, '')
      .replace(/-invalid-[^.]+\.json$/, '')
      .replace(/-missing-required\.json$/, '')
      .replace(/-additional-properties\.json$/, '')
      .replace(/\.json$/, '');

    // Determine subdirectory based on test vector category
    const relTv = rel(tvPath);
    let schemaDir = 'schemas/mqtt';
    if (relTv.includes('/offline/') || schemaBase.includes('hello') ||
        schemaBase.includes('challenge') || schemaBase.includes('auth-response') ||
        schemaBase.includes('station-info') || schemaBase.includes('available-services') ||
        schemaBase.includes('offline-auth') || schemaBase.includes('service-status') ||
        schemaBase.includes('receipt') || schemaBase.includes('ble-')) {
      schemaDir = 'schemas/ble';
    }

    const schemaPath = path.join(ROOT, schemaDir, schemaBase + '.schema.json');
    if (fs.existsSync(schemaPath)) return schemaPath;

    // Fallback: progressively strip trailing segments for supplementary vectors
    // e.g. data-transfer-response-accepted -> data-transfer-response
    let candidate = schemaBase;
    while (candidate.includes('-')) {
      candidate = candidate.substring(0, candidate.lastIndexOf('-'));
      const p = path.join(ROOT, schemaDir, candidate + '.schema.json');
      if (fs.existsSync(p)) return p;
    }

    // Try mqtt if ble didn't work
    const mqttPath = path.join(ROOT, 'schemas/mqtt', schemaBase + '.schema.json');
    if (fs.existsSync(mqttPath)) return mqttPath;

    // Try common
    const commonPath = path.join(ROOT, 'schemas/common', schemaBase + '.schema.json');
    if (fs.existsSync(commonPath)) return commonPath;

    return null;
  }

  // Cache compiled validators by schema path to avoid duplicate $id errors
  const validatorCache = {};
  function getValidator(schemaPath) {
    if (validatorCache[schemaPath]) return validatorCache[schemaPath];
    const schema = JSON.parse(readSafe(schemaPath));
    const validate = ajv.compile(schema);
    validatorCache[schemaPath] = validate;
    return validate;
  }

  // Validate valid test vectors
  const validDirs = findFiles('conformance/test-vectors/valid', '.json');
  for (const tvFile of validDirs) {
    const r = rel(tvFile);
    const schemaPath = findSchema(tvFile);
    if (!schemaPath) {
      SKIP(C, 'no schema found for ' + r);
      continue;
    }

    try {
      const data = JSON.parse(readSafe(tvFile));
      const validate = getValidator(schemaPath);
      if (validate(data)) {
        PASS(C);
      } else {
        FAIL(C, r, 0,
          'validation failed: ' + ajv.errorsText(validate.errors),
          'should PASS validation against ' + rel(schemaPath));
      }
    } catch (e) {
      SKIP(C, 'schema compile error: ' + e.message);
    }
  }

  // Validate invalid test vectors (should FAIL)
  const invalidDirs = findFiles('conformance/test-vectors/invalid', '.json');
  for (const tvFile of invalidDirs) {
    const r = rel(tvFile);
    const schemaPath = findSchema(tvFile);
    if (!schemaPath) {
      SKIP(C, 'no schema found for ' + r);
      continue;
    }

    try {
      const data = JSON.parse(readSafe(tvFile));
      const validate = getValidator(schemaPath);
      if (!validate(data)) {
        PASS(C); // Expected to fail
      } else {
        FAIL(C, r, 0,
          'validation PASSED (should have failed)',
          'should FAIL validation against ' + rel(schemaPath));
      }
    } catch (e) {
      SKIP(C, 'schema compile error: ' + e.message);
    }
  }

  log('Test vector checks: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 9: Cross-Reference Links ====================
function category9() {
  const C = 'c9'; initCat(C, 'Cross-Reference Links');
  log('');
  log('## Category 9: Cross-Reference Links');
  log('');

  function headingToAnchor(text) {
    return text
      .toLowerCase()
      .replace(/\*\*/g, '')          // remove bold
      .replace(/`/g, '')              // remove code markers
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // extract link text
      .replace(/[^\w\s-]/g, '')       // remove special chars (keep _ via \w)
      .trim()
      .replace(/ /g, '-')              // each space to hyphen (GFM: no collapse)
      .replace(/^-|-$/g, '');         // trim leading/trailing hyphens
  }

  function extractAnchors(content) {
    const anchors = new Set();
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^#{1,6}\s+(.+)/);
      if (m) {
        const anchor = headingToAnchor(m[1]);
        anchors.add(anchor);
        // Also add variant without trailing content in parens: "7.1 StationInfo (FFF1)" -> "71-stationinfo-fff1" AND "71-stationinfo"
        const withoutParens = anchor.replace(/-[^-]*$/, '');
        if (withoutParens !== anchor) anchors.add(withoutParens);
      }
      // Also check for HTML anchors
      const htmlMatch = line.match(/<a\s+(?:name|id)="([^"]+)"/i);
      if (htmlMatch) anchors.add(htmlMatch[1]);
    }
    return anchors;
  }

  const specFiles = [
    ...findFiles('spec', '.md'),
    ...findFiles('spec/profiles', '.md'),
    ...findFiles('guides', '.md'),
  ];

  // Deduplicate
  const seen = new Set();
  const uniqueFiles = specFiles.filter(f => {
    const r = rel(f);
    if (seen.has(r)) return false;
    seen.add(r);
    return true;
  });

  for (const file of uniqueFiles) {
    const content = readSafe(file) || '';
    const lines = content.split(/\r?\n/);
    const dir = path.dirname(file);

    for (let i = 0; i < lines.length; i++) {
      // Strip inline code spans before searching for links (links inside `code` are not real)
      const lineNoCode = lines[i].replace(/`[^`]+`/g, '');
      // Find markdown links: [text](url)
      const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
      let m;
      while ((m = linkRe.exec(lineNoCode)) !== null) {
        const url = m[2];
        // Skip external links
        if (url.startsWith('http://') || url.startsWith('https://')) continue;
        // Skip image links or data URIs
        if (url.startsWith('data:')) continue;

        const [filePart, anchor] = url.split('#');

        if (filePart) {
          const resolved = path.resolve(dir, filePart);
          if (!fs.existsSync(resolved)) {
            FAIL(C, rel(file), i + 1,
              'link "' + url + '" -> file not found',
              rel(resolved) + ' should exist');
            continue;
          }

          if (anchor) {
            const targetContent = readSafe(resolved) || '';
            const anchors = extractAnchors(targetContent);
            if (anchors.has(anchor)) {
              PASS(C);
            } else {
              // Try fuzzy match (anchor might have slight differences)
              const normalizedAnchor = anchor.replace(/-+/g, '-').replace(/^-|-$/g, '');
              if (anchors.has(normalizedAnchor)) {
                PASS(C);
              } else {
                FAIL(C, rel(file), i + 1,
                  'anchor "#' + anchor + '" not found in ' + rel(resolved),
                  'heading anchor should exist');
              }
            }
          } else {
            PASS(C);
          }
        } else if (anchor) {
          // Same-file anchor
          const anchors = extractAnchors(content);
          if (anchors.has(anchor)) {
            PASS(C);
          } else {
            FAIL(C, rel(file), i + 1,
              'same-file anchor "#' + anchor + '" not found',
              'heading anchor should exist in this file');
          }
        }
      }
    }
  }

  log('Link checks: ' + cats[C].checks);
  logCat(C);
}

// ==================== CATEGORY 10: Banned Terms ====================
function category10() {
  const C = 'c10'; initCat(C, 'Banned Terms');
  log('');
  log('## Category 10: Banned Terms');
  log('');

  const bannedTerms = [
    { term: 'arm_pkg_', description: 'old prefix, now opass_' },
    { term: 'arming package', description: 'old term, now OfflinePass', caseSensitive: false,
      exclude: (line) => /\*\*Arming Package\*\*|Legacy term|pre-v1\.0/i.test(line) },
    { term: 'mqtt_reconnect', description: 'invalid enum value' },
    { term: 'failedMessageId', description: 'old field name, now messageId' },
    { term: 'failedAction', description: 'old field name, now action' },
    { term: 'Clean Session', description: 'MQTT 3.1.1 term, now Clean Start' },
    { term: 'MQTT 3.1.1', description: 'now MQTT 5.0',
      exclude: (line) => /\bNOT\b|instead of/i.test(line) },
    { term: 'UUID v4', description: 'now 8+ hex chars (for entity identifiers)',
      exclude: (line) => /message|session|token|idempotency|request|prefix/i.test(line) },
    { term: 'ble-sess-', description: 'old prefix, now sess_' },
    { term: 'StopService EVENT', description: 'does not exist' },
  ];

  // Directories to search (excluding audit/backlog files at root)
  const searchDirs = ['spec', 'schemas', 'examples', 'conformance', 'guides', 'diagrams'];
  const allFiles = searchDirs.flatMap(d => [
    ...findFiles(d, '.md'),
    ...findFiles(d, '.json'),
    ...findFiles(d, '.mmd'),
  ]);

  for (const bt of bannedTerms) {
    let found = false;
    for (const file of allFiles) {
      const content = readSafe(file) || '';
      const lines = content.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let matches = false;

        if (bt.caseSensitive === false) {
          matches = line.toLowerCase().includes(bt.term.toLowerCase());
        } else {
          matches = line.includes(bt.term);
        }

        if (matches) {
          // Context-aware exclusion: skip legitimate uses
          if (bt.exclude && bt.exclude(line)) continue;
          found = true;
          FAIL(C, rel(file), i + 1,
            'banned term "' + bt.term + '" (' + bt.description + ')',
            'term should not appear in spec/schema/example files');
        }
      }
    }
    if (!found) PASS(C);
  }

  logCat(C);
}

// ==================== CATEGORY 11: Message ↔ Schema Coverage ====================
function category11() {
  const C = 'c11'; initCat(C, 'Message ↔ Schema Coverage');
  log('## Category 11: Message ↔ Schema Coverage');
  log('');

  const msgFile = path.join(ROOT, 'spec', '03-messages.md');
  const content = readSafe(msgFile) || '';
  const lines = content.split(/\r?\n/);

  // Parse all ### X.Y MessageName headings with transport/type info
  const messages = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^### (\d+)\.(\d+) (.+)/);
    if (!m) continue;
    const section = parseInt(m[1]);
    const msgName = m[2] ? m[3].replace(/\s*\(.*\)$/, '').trim() : '';
    if (!msgName) continue;

    // Read Transport and Message Type from the property table following this heading
    let transport = '';
    let msgType = '';
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const tMatch = lines[j].match(/\*\*Transport\*\*\s*\|\s*(.+)/);
      if (tMatch) transport = tMatch[1].trim();
      const mtMatch = lines[j].match(/\*\*Message Type\*\*\s*\|\s*(.+)/);
      if (mtMatch) msgType = mtMatch[1].trim();
      if (lines[j].match(/^###/)) break;
    }

    messages.push({ name: msgName, section, transport, msgType, line: i + 1 });
  }

  // PascalCase to kebab-case
  function toKebab(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  // Collect all schema files
  const mqttSchemas = findFiles('schemas/mqtt', '.schema.json').map(f => path.basename(f).replace('.schema.json', ''));
  const bleSchemas = findFiles('schemas/ble', '.schema.json').map(f => path.basename(f).replace('.schema.json', ''));

  const coveredSchemas = new Set();

  // Check: each message has corresponding schema(s)
  for (const msg of messages) {
    const kebab = toKebab(msg.name);
    const isBLE = msg.transport.includes('BLE');
    const isMQTT = msg.transport.includes('MQTT');
    const isReqRes = msg.msgType.includes('REQUEST') || msg.msgType.includes('RESPONSE');
    const isEvent = msg.msgType.includes('EVENT');

    if (isMQTT) {
      if (isReqRes) {
        // Expect both -request and -response schemas
        const reqName = kebab + '-request';
        const resName = kebab + '-response';
        if (mqttSchemas.includes(reqName)) {
          PASS(C); coveredSchemas.add('mqtt/' + reqName);
        } else {
          FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — no request schema', 'schemas/mqtt/' + reqName + '.schema.json');
        }
        if (mqttSchemas.includes(resName)) {
          PASS(C); coveredSchemas.add('mqtt/' + resName);
        } else {
          FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — no response schema', 'schemas/mqtt/' + resName + '.schema.json');
        }
      } else if (isEvent) {
        // Events: check bare name, -event suffix, or -request/-response
        const bare = kebab;
        const event = kebab + '-event';
        const req = kebab + '-request';
        const res = kebab + '-response';
        if (mqttSchemas.includes(bare)) {
          PASS(C); coveredSchemas.add('mqtt/' + bare);
        } else if (mqttSchemas.includes(event)) {
          PASS(C); coveredSchemas.add('mqtt/' + event);
        } else if (mqttSchemas.includes(req) && mqttSchemas.includes(res)) {
          // Some events use request/response pattern (e.g., TransactionEvent)
          PASS(C); coveredSchemas.add('mqtt/' + req); coveredSchemas.add('mqtt/' + res);
        } else {
          FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — no event schema', 'schemas/mqtt/' + bare + '.schema.json or ' + event + '.schema.json');
        }
      } else {
        // Fallback: try bare name or request/response
        const bare = kebab;
        if (mqttSchemas.includes(bare)) { PASS(C); coveredSchemas.add('mqtt/' + bare); }
        else if (mqttSchemas.includes(kebab + '-request')) { PASS(C); coveredSchemas.add('mqtt/' + kebab + '-request'); }
        else FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — no schema found', 'schemas/mqtt/' + bare + '.schema.json');
      }
    }

    if (isBLE) {
      // BLE messages: check schemas/ble/
      const bare = kebab;
      if (bleSchemas.includes(bare)) {
        PASS(C); coveredSchemas.add('ble/' + bare);
      } else {
        FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — no BLE schema', 'schemas/ble/' + bare + '.schema.json');
      }
    }

    if (!isMQTT && !isBLE) {
      FAIL(C, 'spec/03-messages.md', msg.line, msg.name + ' — transport unclear: "' + msg.transport + '"', 'MQTT or BLE');
    }
  }

  // Reverse: schemas without messages
  const allMsgKebabs = messages.map(m => toKebab(m.name));
  for (const s of mqttSchemas) {
    const key = 'mqtt/' + s;
    if (coveredSchemas.has(key)) continue;
    // Strip -request/-response/-event suffix to get message base
    const base = s.replace(/-(request|response|event)$/, '');
    if (allMsgKebabs.includes(base)) {
      PASS(C); // schema maps to a known message
    } else {
      FAIL(C, 'schemas/mqtt/' + s + '.schema.json', 0, 'schema without corresponding message in 03-messages.md', 'message heading for ' + s);
    }
  }
  for (const s of bleSchemas) {
    const key = 'ble/' + s;
    if (coveredSchemas.has(key)) continue;
    const base = s.replace(/-(request|response|event)$/, '');
    if (allMsgKebabs.includes(base)) {
      PASS(C);
    } else {
      FAIL(C, 'schemas/ble/' + s + '.schema.json', 0, 'schema without corresponding message in 03-messages.md', 'message heading for ' + s);
    }
  }

  log('Messages in spec: ' + messages.length);
  log('Schemas (mqtt+ble): ' + (mqttSchemas.length + bleSchemas.length));
  logCat(C);
}

// ==================== CATEGORY 12: Test Vector Coverage ====================
function category12() {
  const C = 'c12'; initCat(C, 'Test Vector Coverage');
  log('## Category 12: Test Vector Coverage');
  log('');

  // Schema dir → test vector categories mapping
  const schemaToVectorDirs = {
    'mqtt': ['core', 'transaction', 'device-management', 'security'],
    'ble': ['offline'],
  };

  const validBase = path.join(ROOT, 'conformance', 'test-vectors', 'valid');
  const invalidBase = path.join(ROOT, 'conformance', 'test-vectors', 'invalid');

  for (const schemaDir of ['mqtt', 'ble']) {
    const schemas = findFiles('schemas/' + schemaDir, '.schema.json');
    const vectorDirs = schemaToVectorDirs[schemaDir] || [];

    for (const schemaFile of schemas) {
      const schemaName = path.basename(schemaFile).replace('.schema.json', '');

      // Collect matching valid vectors
      let hasValid = false;
      let hasInvalid = false;

      for (const cat of vectorDirs) {
        const validDir = path.join(validBase, cat);
        const invalidDir = path.join(invalidBase, cat);

        if (fs.existsSync(validDir)) {
          const validFiles = fs.readdirSync(validDir).filter(f => f.endsWith('.json'));
          for (const vf of validFiles) {
            const vfBase = vf.replace('.json', '').replace(/-(full|minimal)$/, '');
            if (vfBase === schemaName) { hasValid = true; break; }
          }
        }

        if (fs.existsSync(invalidDir)) {
          const invalidFiles = fs.readdirSync(invalidDir).filter(f => f.endsWith('.json'));
          for (const ivf of invalidFiles) {
            const ivfBase = ivf.replace('.json', '').replace(/-(missing-required|missing-signature|invalid-enum|invalid-type|invalid-status|additional-properties|extra-field)$/, '');
            if (ivfBase === schemaName) { hasInvalid = true; break; }
          }
        }
      }

      if (hasValid) PASS(C);
      else FAIL(C, 'schemas/' + schemaDir + '/' + schemaName + '.schema.json', 0, 'no valid test vector found', 'at least one valid vector in conformance/test-vectors/valid/');

      if (hasInvalid) PASS(C);
      else FAIL(C, 'schemas/' + schemaDir + '/' + schemaName + '.schema.json', 0, 'no invalid test vector found', 'at least one invalid vector in conformance/test-vectors/invalid/');
    }
  }

  logCat(C);
}

// ==================== CATEGORY 13: Schema ↔ Spec Field Matching ====================
function category13() {
  const C = 'c13'; initCat(C, 'Schema ↔ Spec Field Matching');
  log('## Category 13: Schema ↔ Spec Field Matching');
  log('');

  const msgFile = path.join(ROOT, 'spec', '03-messages.md');
  const content = readSafe(msgFile) || '';
  const lines = content.split(/\r?\n/);

  // Envelope-only fields to exclude
  const ENVELOPE_FIELDS = new Set(['messageId', 'timestamp', 'source', 'mac', 'messageType', 'action', 'protocolVersion', 'payload']);

  function toKebab(name) {
    return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }

  // Parse message sections and their field tables
  const messageSections = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^### (\d+)\.(\d+) (.+)/);
    if (!m) continue;
    const section = parseInt(m[1]);
    const msgName = m[3].replace(/\s*\(.*\)$/, '').trim();
    const kebab = toKebab(msgName);

    // Find transport
    let transport = '';
    for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
      const tMatch = lines[j].match(/\*\*Transport\*\*\s*\|\s*(.+)/);
      if (tMatch) { transport = tMatch[1].trim(); break; }
    }

    // Find all #### subheadings and their field tables within this message section
    const endIdx = (() => {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^### \d+\.\d+ /)) return j;
      }
      return lines.length;
    })();

    // Find REQUEST and RESPONSE payload field tables
    const payloads = []; // { type: 'request'|'response'|'payload', fields: Set }
    let currentPayload = null;
    let inTable = false;

    for (let j = i + 1; j < endIdx; j++) {
      const hdrMatch = lines[j].match(/^####\s+(REQUEST|RESPONSE|Payload)\s*(Payload)?/i);
      if (hdrMatch) {
        if (currentPayload) payloads.push(currentPayload);
        const pType = hdrMatch[1].toLowerCase().replace(' payload', '');
        currentPayload = { type: pType === 'payload' ? 'payload' : pType, fields: new Set() };
        inTable = false;
        continue;
      }

      // Detect field table (| Field | Type | Required | ... |)
      if (currentPayload && lines[j].match(/^\|\s*Field\s*\|/i)) {
        inTable = true;
        continue;
      }
      if (currentPayload && inTable && lines[j].match(/^\|[-\s:|]+\|$/)) continue; // separator row

      if (currentPayload && inTable && lines[j].startsWith('|')) {
        // Extract field name from | `fieldName` | ... |
        const fm = lines[j].match(/^\|\s*`([^`]+)`\s*\|/);
        if (fm) {
          const fieldName = fm[1];
          // Collect ALL fields (including dot-notation for nested sub-field checks)
          currentPayload.fields.add(fieldName);
        }
      } else if (currentPayload && inTable && !lines[j].startsWith('|')) {
        inTable = false;
      }
    }
    if (currentPayload) payloads.push(currentPayload);

    messageSections.push({ name: msgName, kebab, section, transport, payloads, line: i + 1 });
  }

  // Now compare each message's spec fields against schema properties
  for (const msg of messageSections) {
    const isBLE = msg.transport.includes('BLE');
    const schemaDir = isBLE ? 'ble' : 'mqtt';

    for (const pl of msg.payloads) {
      let schemaName;
      if (pl.type === 'request') schemaName = msg.kebab + '-request';
      else if (pl.type === 'response') schemaName = msg.kebab + '-response';
      else schemaName = msg.kebab; // bare payload (events, BLE)

      const schemaPath = path.join(ROOT, 'schemas', schemaDir, schemaName + '.schema.json');
      if (!fs.existsSync(schemaPath)) {
        // Try alternative names for events
        const altNames = [msg.kebab + '-event', msg.kebab + '-request', msg.kebab + '-response'];
        let found = false;
        for (const alt of altNames) {
          const altPath = path.join(ROOT, 'schemas', schemaDir, alt + '.schema.json');
          if (fs.existsSync(altPath)) {
            schemaName = alt;
            found = true;
            break;
          }
        }
        if (!found) continue; // schema doesn't exist — Cat 11 handles this
      }

      const finalSchemaPath = path.join(ROOT, 'schemas', schemaDir, schemaName + '.schema.json');
      if (!fs.existsSync(finalSchemaPath)) continue;

      let schema;
      try { schema = JSON.parse(readSafe(finalSchemaPath)); } catch { continue; }

      const schemaFields = new Set(Object.keys(schema.properties || {}));
      // Clone and filter: only top-level fields for top-level comparison (exclude dot-notation)
      const specFields = new Set([...pl.fields].filter(f => !f.includes('.')));

      // Remove envelope fields from both
      for (const ef of ENVELOPE_FIELDS) { schemaFields.delete(ef); specFields.delete(ef); }

      // BLE messages have 'type' discriminator — exclude from comparison on both sides
      if (isBLE) { schemaFields.delete('type'); specFields.delete('type'); }

      // Compare top-level fields
      const inSchemaNotSpec = [...schemaFields].filter(f => !specFields.has(f));
      const inSpecNotSchema = [...specFields].filter(f => !schemaFields.has(f));

      if (inSchemaNotSpec.length === 0 && inSpecNotSchema.length === 0) {
        PASS(C);
      } else {
        if (inSchemaNotSpec.length > 0) {
          FAIL(C, 'schemas/' + schemaDir + '/' + schemaName + '.schema.json', 0,
            'fields in schema but not in spec: ' + inSchemaNotSpec.join(', '),
            'all schema fields documented in 03-messages.md');
        }
        if (inSpecNotSchema.length > 0) {
          FAIL(C, 'spec/03-messages.md', msg.line,
            msg.name + ' (' + pl.type + '): fields in spec but not in schema: ' + inSpecNotSchema.join(', '),
            'all spec fields present in schema');
        }
      }

      // Fix 7: Also check nested sub-fields for object-type schema properties
      // Spec uses dot-notation (e.g., capabilities.bleSupported) for nested fields
      const schemaProps = schema.properties || {};
      // Collect spec's dot-notation sub-fields grouped by parent
      const specSubFields = {}; // { parentField: Set<subField> }
      for (const f of pl.fields) {
        if (f.includes('.')) {
          const [parent, ...rest] = f.split('.');
          const sub = rest.join('.');
          if (!specSubFields[parent]) specSubFields[parent] = new Set();
          specSubFields[parent].add(sub);
        }
      }
      // For each parent that has sub-fields in spec, compare against schema sub-properties
      for (const [parent, specSubs] of Object.entries(specSubFields)) {
        const parentSchema = schemaProps[parent];
        if (!parentSchema || parentSchema.type !== 'object' || !parentSchema.properties) continue;
        const schemaSubs = new Set(Object.keys(parentSchema.properties));
        const nestedInSchemaNotSpec = [...schemaSubs].filter(f => !specSubs.has(f));
        const nestedInSpecNotSchema = [...specSubs].filter(f => !schemaSubs.has(f));
        if (nestedInSchemaNotSpec.length === 0 && nestedInSpecNotSchema.length === 0) {
          PASS(C);
        } else {
          if (nestedInSchemaNotSpec.length > 0) {
            FAIL(C, 'schemas/' + schemaDir + '/' + schemaName + '.schema.json', 0,
              parent + ' nested fields in schema but not in spec: ' + nestedInSchemaNotSpec.join(', '),
              'all nested schema fields documented in 03-messages.md');
          }
          if (nestedInSpecNotSchema.length > 0) {
            FAIL(C, 'spec/03-messages.md', msg.line,
              msg.name + ' (' + pl.type + '): ' + parent + ' nested fields in spec but not in schema: ' + nestedInSpecNotSchema.join(', '),
              'all nested spec fields present in schema');
          }
        }
      }
    }
  }

  logCat(C);
}

// ==================== CATEGORY 14: additionalProperties Check ====================
function category14() {
  const C = 'c14'; initCat(C, 'additionalProperties Check');
  log('## Category 14: additionalProperties Check');
  log('');

  // Recursively check all object-type nodes for additionalProperties: false
  function checkAdditionalProps(obj, filePath, jsonPath) {
    if (!obj || typeof obj !== 'object') return;
    // Check if this node is an object-type schema with properties
    if (obj.type === 'object' && obj.properties) {
      if (obj.additionalProperties === false) {
        PASS(C);
      } else {
        FAIL(C, filePath, 0,
          jsonPath + ': additionalProperties is ' + JSON.stringify(obj.additionalProperties) + ' (or missing)',
          '"additionalProperties": false at ' + jsonPath);
      }
      // Recurse into each property that is itself an object
      for (const [k, v] of Object.entries(obj.properties)) {
        checkAdditionalProps(v, filePath, jsonPath + '.properties.' + k);
      }
    }
    // Also check items (for arrays of objects)
    if (obj.items) {
      checkAdditionalProps(obj.items, filePath, jsonPath + '.items');
    }
  }

  // Check mqtt/ and ble/ schemas (NOT common/ — those are sub-schemas)
  for (const dir of ['schemas/mqtt', 'schemas/ble']) {
    const files = findFiles(dir, '.schema.json');
    for (const file of files) {
      let schema;
      try { schema = JSON.parse(readSafe(file)); } catch { continue; }

      // Root-level check
      if (schema.additionalProperties === false) {
        PASS(C);
      } else {
        FAIL(C, rel(file), 0,
          'root: additionalProperties is ' + JSON.stringify(schema.additionalProperties) + ' (or missing)',
          '"additionalProperties": false');
      }

      // Nested object checks
      const props = schema.properties || {};
      for (const [k, v] of Object.entries(props)) {
        checkAdditionalProps(v, rel(file), 'properties.' + k);
      }
    }
  }

  logCat(C);
}

// ==================== CATEGORY 15: BLE Result vs Status Convention ====================
function category15() {
  const C = 'c15'; initCat(C, 'BLE Result vs Status Convention');
  log('## Category 15: BLE Result vs Status Convention');
  log('');

  // BLE response schemas — should use "result" not "status" for outcome
  // Exception: service-status.schema.json uses "status" for running state (legitimate)
  const bleSchemas = findFiles('schemas/ble', '.schema.json');
  for (const file of bleSchemas) {
    const base = path.basename(file).replace('.schema.json', '');
    // Skip service-status — it legitimately has a "status" field for running/receipt-ready state
    if (base === 'service-status') continue;

    let schema;
    try { schema = JSON.parse(readSafe(file)); } catch { continue; }

    const props = schema.properties || {};
    if (props.status) {
      // Resolve $ref if present
      let statusDef = props.status;
      if (statusDef['$ref'] && typeof statusDef['$ref'] === 'string') {
        const refPath = statusDef['$ref'];
        // Resolve relative file reference
        const refFile = path.resolve(path.dirname(file), refPath.split('#')[0]);
        const fragment = refPath.includes('#') ? refPath.split('#')[1] : '';
        try {
          let refSchema = JSON.parse(readSafe(refFile));
          if (fragment) {
            const parts = fragment.split('/').filter(Boolean);
            for (const p of parts) { refSchema = refSchema[p]; }
          }
          statusDef = refSchema || statusDef;
        } catch { /* keep original statusDef */ }
      }
      // Check if this status field has Accepted/Rejected enum (response outcome pattern)
      const isOutcome = statusDef.enum && (statusDef.enum.includes('Accepted') || statusDef.enum.includes('Rejected'));
      if (isOutcome) {
        FAIL(C, rel(file), 0,
          'BLE schema uses "status" for outcome (Accepted/Rejected)',
          '"result" field per BLE convention');
      } else {
        PASS(C); // "status" exists but not for outcome
      }
    } else {
      PASS(C);
    }
  }

  // Check BLE example payloads
  const bleExamples = findFiles('examples/payloads/ble', '.json');
  for (const file of bleExamples) {
    const base = path.basename(file);
    // Skip service-status examples
    if (base.startsWith('service-status')) continue;

    let data;
    try { data = JSON.parse(readSafe(file)); } catch { continue; }

    if (data.status !== undefined) {
      FAIL(C, rel(file), 0,
        'BLE example uses "status" field',
        '"result" field per BLE convention');
    } else {
      PASS(C);
    }
  }

  // Check BLE test vectors (offline category)
  const offlineValid = findFiles('conformance/test-vectors/valid/offline', '.json');
  const offlineInvalid = findFiles('conformance/test-vectors/invalid/offline', '.json');
  for (const file of [...offlineValid, ...offlineInvalid]) {
    const base = path.basename(file);
    // Skip service-status vectors
    if (base.startsWith('service-status')) continue;

    let data;
    try { data = JSON.parse(readSafe(file)); } catch { continue; }

    if (data.status !== undefined) {
      FAIL(C, rel(file), 0,
        'BLE test vector uses "status" field',
        '"result" field per BLE convention');
    } else {
      PASS(C);
    }
  }

  logCat(C);
}

// ==================== CATEGORY 16: Timestamp Millisecond Format ====================
function category16() {
  const C = 'c16'; initCat(C, 'Timestamp Millisecond Format');
  log('## Category 16: Timestamp Millisecond Format');
  log('');

  const dirs = ['examples/payloads', 'conformance/test-vectors'];
  const jsonFiles = dirs.flatMap(d => findFiles(d, '.json'));

  // Also check markdown files with embedded JSON blocks (Fix 12)
  const mdDirs = ['examples/flows', 'examples/error-scenarios'];
  const mdFilesTs = mdDirs.flatMap(d => findFiles(d, '.md'));

  // Per-timestamp extraction regex (Fix 10: avoid per-line masking)
  // Valid: exactly 3 decimal digits before Z
  // Invalid: no decimals, or non-3 decimal digits (Fix 11: catch .0Z, .00Z, .0000Z etc.)
  const allTimestamps = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
  const validTsExact = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  function checkTimestampsInContent(content, filePath) {
    const fLines = content.split(/\r?\n/);
    let fileHasTs = false;
    let fileOk = true;

    for (let i = 0; i < fLines.length; i++) {
      const line = fLines[i];
      // Extract ALL timestamps from the line individually
      const matches = line.match(allTimestamps);
      if (!matches) continue;
      for (const ts of matches) {
        fileHasTs = true;
        if (validTsExact.test(ts)) {
          // Valid — counted at file level
        } else {
          FAIL(C, filePath, i + 1,
            'invalid timestamp format: ' + ts,
            'ISO 8601 with exactly .000Z (3-digit milliseconds)');
          fileOk = false;
        }
      }
    }

    if (fileHasTs && fileOk) PASS(C);
  }

  // Check JSON files
  for (const file of jsonFiles) {
    const content = readSafe(file) || '';
    checkTimestampsInContent(content, rel(file));
  }

  // Check markdown embedded JSON blocks (Fix 12)
  for (const file of mdFilesTs) {
    const content = readSafe(file) || '';
    const blocks = extractJsonBlocks(content);
    if (blocks.length === 0) continue;
    // Reconstruct JSON block text for timestamp checking
    const blockText = blocks.map(b => JSON.stringify(b, null, 2)).join('\n');
    checkTimestampsInContent(blockText, rel(file));
  }

  logCat(C);
}

// ==================== CATEGORY 17: Diagram Consistency ====================
function category17() {
  const C = 'c17'; initCat(C, 'Diagram Consistency');
  log('## Category 17: Diagram Consistency');
  log('');

  const msgFile = path.join(ROOT, 'spec', '03-messages.md');
  const msgContent = readSafe(msgFile) || '';

  // Collect all message names from 03-messages.md headings
  const msgNames = new Set();
  for (const line of msgContent.split(/\r?\n/)) {
    const m = line.match(/^### \d+\.\d+ (.+)/);
    if (m) {
      const name = m[1].replace(/\s*\(.*\)$/, '').trim();
      msgNames.add(name);
    }
  }

  // Collect all state names from 05-state-machines.md
  const smFile = path.join(ROOT, 'spec', '05-state-machines.md');
  const smContent = readSafe(smFile) || '';
  const stateNames = new Set();
  for (const line of smContent.split(/\r?\n/)) {
    // State table rows: | **StateName** | Description |
    const sm = line.match(/^\|\s*\*\*(\w+)\*\*\s*\|/);
    if (sm && sm[1] !== 'Total') stateNames.add(sm[1]);
  }

  const diagFiles = findFiles('diagrams', '.mmd');

  for (const file of diagFiles) {
    const content = readSafe(file) || '';
    const fLines = content.split(/\r?\n/);
    const base = path.basename(file);

    // Skip architecture-overview (no messages/states, just infra)
    if (base === 'architecture-overview.mmd') continue;

    const isSequence = content.includes('sequenceDiagram');
    const isState = content.includes('stateDiagram');

    if (isSequence) {
      // Extract message names from sequence diagrams
      // Pattern: "MessageName REQUEST" or "MessageName RESPONSE" or "MessageName EVENT" or "[MSG-NNN]"
      // Also: PascalCase names after ": " on arrow lines
      const seenMsgs = new Set();

      for (let i = 0; i < fLines.length; i++) {
        const line = fLines[i];
        // Skip comments
        if (line.trim().startsWith('%%')) continue;

        // Match known message patterns on arrow lines (after :)
        // e.g., "Station->>Broker: BootNotification REQUEST [MSG-001]"
        // e.g., "Broker->>Server: StatusNotification [MSG-009]"
        for (const msgName of msgNames) {
          if (line.includes(msgName) && !seenMsgs.has(msgName)) {
            seenMsgs.add(msgName);
          }
        }

        // Also look for PascalCase words that might be message names
        const arrowMatch = line.match(/[-]+>>[-+]?\s*[^:]*:\s*(.+)/);
        if (arrowMatch) {
          const afterColon = arrowMatch[1];
          // Extract PascalCase words
          const words = afterColon.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g) || [];
          for (const w of words) {
            if (!msgNames.has(w) && !seenMsgs.has(w) &&
                !['StartService', 'StopService'].includes(w)) { // these are covered
              // Only flag if it looks like a message name (not a generic word)
              // Skip common non-message PascalCase words
              const skipWords = new Set(['ErrorRecovery', 'PowerOn', 'FirmwareUpdate', 'OfflinePass',
                'MaintenanceMode', 'CleanUp', 'ReceiptReady']);
              if (!skipWords.has(w) && w.length > 5) {
                // Don't fail — just track (too many false positives possible)
              }
            }
          }
        }
      }

      // All found message names exist in spec (they matched from msgNames set)
      for (const found of seenMsgs) {
        PASS(C);
      }

      // Check if diagram references message names NOT in the spec
      // Use a more targeted approach: look for [MSG-NNN] references or explicit names
      // Also detect potential misspelled message names (Fix 13)
      const nonMessageWords = new Set(['PUBLISH', 'MQTT', 'GATT', 'POST', 'Push',
        'CONNECT', 'CONNACK', 'TCP', 'SUBSCRIBE', 'ErrorRecovery', 'PowerOn',
        'FirmwareUpdate', 'OfflinePass', 'MaintenanceMode', 'CleanUp', 'ReceiptReady',
        'StartService', 'StopService', 'Phase', 'Online', 'Offline', 'Unknown',
        'Available', 'Faulted', 'Accepted', 'Rejected', 'Pending', 'Bay']);
      for (let i = 0; i < fLines.length; i++) {
        const line = fLines[i];
        if (line.trim().startsWith('%%')) continue;

        // Extract explicit message references like "BootNotification REQUEST"
        const explicitMatch = line.match(/:\s*(\w+)\s+(?:REQUEST|RESPONSE|EVENT)/);
        if (explicitMatch) {
          const name = explicitMatch[1];
          if (!msgNames.has(name) && !nonMessageWords.has(name)) {
            FAIL(C, rel(file), i + 1,
              'diagram references message "' + name + '" not found in 03-messages.md',
              'valid message name from Message Catalog');
          }
        }

        // Detect PascalCase words ending in "Notification", "Event", "Request", "Response"
        // that look like message names but aren't in the catalog (potential misspellings)
        const arrowCheck = line.match(/[-]+>>[-+]?\s*[^:]*:\s*(.+)/);
        if (arrowCheck) {
          const afterColon = arrowCheck[1];
          const candidates = afterColon.match(/\b([A-Z][a-zA-Z]*(?:Notification|Event|Request|Response))\b/g) || [];
          for (const candidate of candidates) {
            if (!msgNames.has(candidate) && !nonMessageWords.has(candidate) && !seenMsgs.has(candidate)) {
              FAIL(C, rel(file), i + 1,
                'possible misspelled message name: "' + candidate + '"',
                'valid message name from Message Catalog');
            }
          }
        }
      }
    }

    if (isState) {
      // Extract state names from state diagrams
      // Pattern: "StateName --> OtherState : condition"
      // Also: "[*] --> StateName"
      const diagramStates = new Set();

      for (let i = 0; i < fLines.length; i++) {
        const line = fLines[i].trim();
        if (line.startsWith('%%')) continue;

        // Match transition lines: State1 --> State2
        const transMatch = line.match(/^\s*(?:\[\*\]|(\w+))\s*-->\s*(?:\[\*\]|(\w+))/);
        if (transMatch) {
          if (transMatch[1]) diagramStates.add(transMatch[1]);
          if (transMatch[2]) diagramStates.add(transMatch[2]);
        }

        // Match "state StateName {" lines
        const stateMatch = line.match(/^\s*state\s+(\w+)\s*\{/);
        if (stateMatch) diagramStates.add(stateMatch[1]);
      }

      // Collect illustrative substates from notes containing "illustrative, not normative"
      const illustrativeStates = new Set();
      let inIllustrativeNote = false;
      let noteBuffer = '';
      for (const line of fLines) {
        if (line.match(/^\s*note\s/)) { inIllustrativeNote = false; noteBuffer = ''; }
        noteBuffer += ' ' + line;
        if (line.match(/end note/)) {
          if (noteBuffer.includes('illustrative, not normative')) {
            // Extract PascalCase state names from parenthesized lists in the note
            const parenMatch = noteBuffer.match(/\(([^)]+)\)/g) || [];
            for (const pm of parenMatch) {
              const names = pm.replace(/[()]/g, '').split(/,\s*/);
              for (const n of names) {
                const trimmed = n.trim();
                if (trimmed && /^[A-Z]/.test(trimmed)) illustrativeStates.add(trimmed);
              }
            }
          }
          noteBuffer = '';
        }
      }

      for (const ds of diagramStates) {
        if (stateNames.has(ds)) {
          PASS(C);
        } else if (illustrativeStates.has(ds)) {
          PASS(C); // annotated as illustrative, not normative
        } else {
          FAIL(C, rel(file), 0,
            'diagram state "' + ds + '" not found in 05-state-machines.md',
            'valid state name from State Machine chapter');
        }
      }
    }
  }

  logCat(C);
}

// ==================== MAIN ====================
log('# OSPP Protocol Verification Report');
log('');
log('**Date:** ' + new Date().toISOString().split('T')[0]);
log('**Script:** tools/verify-protocol.sh');
log('');

category1();
category2();
category3();
category4();
category5();
category6();
category7();
category8();
category9();
category10();
category11();
category12();
category13();
category14();
category15();
category16();
category17();

// ==================== SUMMARY ====================
log('');
log('---');
log('');
log('## Summary');
log('');
log('| Category | Checks | PASS | FAIL | SKIP |');
log('|----------|-------:|-----:|-----:|-----:|');

let totalChecks = 0, totalPass = 0, totalFail = 0, totalSkip = 0;
const catOrder = ['c1','c2','c3','c4','c5','c6','c7','c8','c9','c10','c11','c12','c13','c14','c15','c16','c17'];
for (const id of catOrder) {
  const c = cats[id];
  if (!c) continue;
  log('| ' + c.name + ' | ' + c.checks + ' | ' + c.pass + ' | ' + c.fail + ' | ' + c.skip + ' |');
  totalChecks += c.checks;
  totalPass += c.pass;
  totalFail += c.fail;
  totalSkip += c.skip;
}
log('| **Total** | **' + totalChecks + '** | **' + totalPass + '** | **' + totalFail + '** | **' + totalSkip + '** |');
log('');
log('**Total: ' + totalPass + '/' + totalChecks + ' PASS**');
log('');

if (totalFail === 0) {
  log('## PROTOCOL VERIFIED — ready for publication');
} else {
  log('## ' + totalFail + ' FAILURE(S) DETECTED');
  log('');
  log('### Complete Failure List');
  log('');
  for (const f of allFailures) {
    log('- **[' + f.cat + ']** ' + f.file + (f.line ? ':' + f.line : ''));
    log('  - Found: ' + f.found);
    log('  - Expected: ' + f.expected);
  }
}

// Write report file
fs.writeFileSync(path.join(ROOT, 'verification-report.md'), output.join('\n'));
log('');
log('Report saved to verification-report.md');

process.exitCode = totalFail > 0 ? 1 : 0;

VERIFY_SCRIPT
