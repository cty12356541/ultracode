#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__filename, '..', '..');

const ALLOW_PARTIAL_REPO =
  process.argv.includes('--allow-partial-repo') ||
  process.env.ULTRACODE_ALLOW_PARTIAL_REPO === '1';

// Salted SHA-256 fingerprints of scrubbed private tokens (16-hex prefixes; zero plaintext).
const FINGERPRINT_SALT = 'ultracode-public-guard-v2:';
const FORBIDDEN_HASHES = new Set([
  '171ce3cb8556e53a',
  '1ce256a760a9910d',
  '2338fc5d45c2d980',
  '25bc758aae77a2e6',
  '30974e3990699124',
  '40b0aa6b099dd489',
  '40c5660e4f371b9e',
  '42e7303a87f5d91a',
  '44b4453f4bb55928',
  '4a688822a612ba67',
  '4ad0d445e56dca3c',
  '5ed2ae0cb896e800',
  '71048e9e36554035',
  '855099f59d8963dc',
  '903c17d287d237b2',
  '94937deab8062018',
  '99f88ee43c638dce', // synthetic self-check canary fingerprint
  'b2a06985fcdefad1',
  'b4ee676630c231d0',
  'b60e27b098143632',
  'c885cd05f357c667',
  'caad92b08c300bff',
  'cdc3e2b54de72f88',
  'ddecd9948d2561c3',
  'f281979f5fb23179',
]);

const STRUCTURAL_LEAK_PATTERNS = [
  {
    name: 'hardcoded-win-user-path',
    regex: new RegExp('[A-Za-z]:[\\\\/]+' + 'Users[\\\\/]+[^\\s\\\\/]+', 'i'),
  },
  {
    name: 'hardcoded-macos-user-path',
    regex: new RegExp('(?<![A-Za-z0-9_])/' + 'Users/[^/\\s]+/'),
  },
  {
    name: 'hardcoded-linux-home-path',
    regex: new RegExp('(?<![A-Za-z0-9_])/' + 'home/[^/\\s]+/', 'i'),
  },
  {
    name: 'rfc1918-private-ipv4',
    regex:
      /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/,
  },
];

function fingerprintToken(lowerCandidate) {
  return crypto
    .createHash('sha256')
    .update(FINGERPRINT_SALT + lowerCandidate, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function extractCandidatesFromLine(line) {
  const out = new Set();
  const lower = line.toLowerCase();

  for (const m of lower.matchAll(/--[a-z0-9]+-/g)) {
    out.add(m[0]);
  }

  for (const m of lower.matchAll(/[a-z0-9]+(?:[:._-][a-z0-9]+)*/g)) {
    const full = m[0];
    out.add(full);

    const byPunct = full.split(/[:.-]+/).filter(Boolean);
    for (const seg of byPunct) {
      out.add(seg);
      const underParts = seg.split('_').filter(Boolean);
      for (let i = 0; i < underParts.length; i++) {
        out.add(underParts[i]);
        const strippedPart = underParts[i].replace(/^[0-9]+|[0-9]+$/g, '');
        if (strippedPart) out.add(strippedPart);
        if (i + 1 < underParts.length) {
          out.add(`${underParts[i]}_${underParts[i + 1]}`);
        }
      }
      const strippedSeg = seg.replace(/^[0-9]+|[0-9]+$/g, '');
      if (strippedSeg) out.add(strippedSeg);
    }

    const delimMatches = [...full.matchAll(/[a-z0-9]+/g)];
    for (let i = 0; i < delimMatches.length; i++) {
      for (let k = i + 1; k <= Math.min(delimMatches.length - 1, i + 3); k++) {
        out.add(
          full.slice(
            delimMatches[i].index,
            delimMatches[k].index + delimMatches[k][0].length
          )
        );
      }
    }

    for (const rawSeg of full.split(/[:._-]+/)) {
      if (rawSeg) {
        out.add(rawSeg);
        const strippedRaw = rawSeg.replace(/^[0-9]+|[0-9]+$/g, '');
        if (strippedRaw) out.add(strippedRaw);
      }
    }
  }

  return out;
}

function scanLineForLeaks(line) {
  for (const { name, regex } of STRUCTURAL_LEAK_PATTERNS) {
    if (regex.test(line)) {
      return `structural rule "${name}"`;
    }
  }
  for (const cand of extractCandidatesFromLine(line)) {
    const fp = fingerprintToken(cand);
    if (FORBIDDEN_HASHES.has(fp)) {
      return `salted fingerprint ${fp}`;
    }
  }
  return null;
}

function verifyScannerSelfCheck() {
  const canaryToken = ['__uc', 'canary', 'forbidden__'].join('_');
  assert.match(
    scanLineForLeaks(`embed(${canaryToken})`) || '',
    /salted fingerprint 99f88ee43c638dce/,
    'Salted SHA-256 scanner failed canary self-check'
  );
  assert.match(
    scanLineForLeaks(['C:', 'Users', 'demo', '.gemini'].join('\\')) || '',
    /hardcoded-win-user-path/,
    'Structural scanner failed Windows user path check'
  );
  assert.match(
    scanLineForLeaks(['', 'Users', 'demo', '.gemini'].join('/')) || '',
    /hardcoded-macos-user-path/,
    'Structural scanner failed macOS user path check'
  );
  assert.match(
    scanLineForLeaks(['', 'home', 'demo', '.gemini'].join('/')) || '',
    /hardcoded-linux-home-path/,
    'Structural scanner failed Linux home path check'
  );
  assert.match(
    scanLineForLeaks(['192', '168', '6', '1'].join('.')) || '',
    /rfc1918-private-ipv4/,
    'Structural scanner failed RFC1918 IPv4 check'
  );
  assert.equal(
    scanLineForLeaks('OpenCode & Oh My OpenCode (OMO) ~/.gemini/AGENTS.md $HOME/.gemini'),
    null,
    'Scanner produced false positive on public OpenCode / portable home reference'
  );
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
]);

function walkRepoFiles(dir, relBase = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
      continue;
    }
    const absPath = path.join(dir, entry.name);
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...walkRepoFiles(absPath, relPath));
    } else if (entry.isFile()) {
      results.push({ absPath, relPath });
    }
  }
  return results;
}

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function isProbablyBinary(relPath, buf) {
  const ext = path.extname(relPath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return true;
  }
  const sampleLen = Math.min(buf.length, 4096);
  for (let i = 0; i < sampleLen; i++) {
    if (buf[i] === 0x00) {
      return true;
    }
  }
  return false;
}

function verifySanitizationAndPortability() {
  verifyScannerSelfCheck();

  const files = walkRepoFiles(REPO_ROOT);
  assert.ok(files.length > 0, 'Repository file walk returned 0 files');

  const violations = [];
  const crlfViolations = [];
  const bomViolations = [];
  let textFileCount = 0;

  for (const { absPath, relPath } of files) {
    const buf = fs.readFileSync(absPath);
    if (isProbablyBinary(relPath, buf)) {
      continue;
    }
    textFileCount++;

    if (hasUtf8Bom(buf)) {
      bomViolations.push(relPath);
    }
    if (buf.includes(0x0d)) {
      crlfViolations.push(relPath);
    }

    const text = buf.toString('utf8');
    const lines = text.split('\n');
    for (let idx = 0; idx < lines.length; idx++) {
      const hitReason = scanLineForLeaks(lines[idx]);
      if (hitReason) {
        violations.push(`${relPath}:${idx + 1} matched ${hitReason}`);
      }
    }
  }

  assert.deepEqual(
    bomViolations,
    [],
    `UTF-8 BOM detected in repository text files: ${bomViolations.join(', ')}`
  );
  assert.deepEqual(
    crlfViolations,
    [],
    `CR/CRLF line endings detected in repository text files: ${crlfViolations.join(', ')}`
  );
  assert.deepEqual(
    violations,
    [],
    `Sensitive / non-portable patterns detected:\n${violations.join('\n')}`
  );

  console.log(
    `[PASS] Gate A · Salted SHA-256 sanitization & strict LF no-BOM portability (${textFileCount} text files verified, 0 leaks)`
  );
}

function verifyStructuralIntegrity() {
  // 1. Verify plugin.json
  const pluginPath = path.join(REPO_ROOT, 'plugin.json');
  assert.ok(fs.existsSync(pluginPath), 'Missing plugin.json');
  const pluginRaw = fs.readFileSync(pluginPath, 'utf8');
  const plugin = JSON.parse(pluginRaw);

  const allowedPluginKeys = new Set([
    'name',
    'displayName',
    'version',
    'description',
    'logo',
    'author',
    'homepage',
    'repository',
    'suggestedPrompts',
  ]);
  for (const key of Object.keys(plugin)) {
    assert.ok(allowedPluginKeys.has(key), `Unknown top-level field in plugin.json: "${key}"`);
  }

  assert.equal(plugin.name, 'ultracode');
  assert.equal(plugin.displayName, 'Ultracode v2 Orchestrator');
  assert.match(plugin.version, /^\d+\.\d+\.\d+$/);
  assert.ok(typeof plugin.description === 'string' && plugin.description.length >= 20);
  assert.equal(plugin.logo, 'assets/logo.svg');
  assert.equal(typeof plugin.author, 'object');
  assert.ok(plugin.author !== null && typeof plugin.author.name === 'string' && plugin.author.name.length > 0);
  assert.match(plugin.author.url, /^https:\/\//);
  assert.match(plugin.homepage, /^https:\/\//);
  assert.match(plugin.repository, /^https:\/\//);
  assert.ok(Array.isArray(plugin.suggestedPrompts), 'suggestedPrompts must be an array');
  assert.equal(plugin.suggestedPrompts.length, 3, 'suggestedPrompts must contain exactly 3 items');
  for (const prompt of plugin.suggestedPrompts) {
    assert.ok(typeof prompt === 'string' && prompt.trim().length > 0, 'Empty suggestedPrompt item');
  }

  // 2. Verify assets/logo.svg
  const logoPath = path.join(REPO_ROOT, 'assets', 'logo.svg');
  assert.ok(fs.existsSync(logoPath), 'Missing assets/logo.svg');
  const logoSvg = fs.readFileSync(logoPath, 'utf8');
  assert.match(logoSvg, /<svg\b[^>]*\bviewBox="0 0 256 256"/);
  assert.match(logoSvg, /\bwidth="256"/);
  assert.match(logoSvg, /\bheight="256"/);
  assert.match(logoSvg, /<\/svg>\s*$/);
  assert.doesNotMatch(logoSvg, /<script\b/i);

  const rectRegex = /<rect\b([^>]*)\/?>/g;
  let rectCount = 0;
  let rectMatch;
  while ((rectMatch = rectRegex.exec(logoSvg)) !== null) {
    rectCount++;
    const attrs = rectMatch[1];
    const x = Number((/\bx="([0-9.]+)"/.exec(attrs) || [])[1]);
    const y = Number((/\by="([0-9.]+)"/.exec(attrs) || [])[1]);
    const w = Number((/\bwidth="([0-9.]+)"/.exec(attrs) || [])[1]);
    const h = Number((/\bheight="([0-9.]+)"/.exec(attrs) || [])[1]);
    const sw = Number((/\bstroke-width="([0-9.]+)"/.exec(attrs) || ['', '0'])[1]);
    assert.ok(
      x - sw / 2 >= 32 && y - sw / 2 >= 32 && x + w + sw / 2 <= 224 && y + h + sw / 2 <= 224,
      `logo.svg rect exceeds 32px (12%) safe margin: x=${x}, y=${y}, w=${w}, h=${h}, stroke=${sw}`
    );
  }
  assert.ok(rectCount >= 1, 'logo.svg must include a badge base <rect>');

  // 3. Verify sibling-track files (AGENTS.global.md + skills/ultracode/*)
  const siblingTargets = [
    'AGENTS.global.md',
    'skills/ultracode/SKILL.md',
    'skills/ultracode/references/prompt-templates.md',
    'skills/ultracode/references/quality-patterns-and-playbooks.md',
  ];

  const missingSibling = siblingTargets.filter(
    (rel) => !fs.existsSync(path.join(REPO_ROOT, rel))
  );

  if (missingSibling.length > 0) {
    if (!ALLOW_PARTIAL_REPO) {
      assert.fail(
        `Missing required repository files: ${missingSibling.join(', ')}`
      );
    }
    console.log(
      `[INFO] Gate B · Partial-repo preflight active; pending sibling files: ${missingSibling.join(', ')}`
    );
  }

  const globalAgentsPath = path.join(REPO_ROOT, 'AGENTS.global.md');
  if (fs.existsSync(globalAgentsPath)) {
    const globalAgents = fs.readFileSync(globalAgentsPath, 'utf8');
    const beginIdx = globalAgents.indexOf('<!-- ultracode:begin v2 -->');
    const endIdx = globalAgents.indexOf('<!-- ultracode:end -->');
    assert.ok(beginIdx >= 0, 'AGENTS.global.md missing <!-- ultracode:begin v2 -->');
    assert.ok(endIdx > beginIdx, 'AGENTS.global.md missing matching <!-- ultracode:end -->');
  }

  const skillMdPath = path.join(REPO_ROOT, 'skills', 'ultracode', 'SKILL.md');
  if (fs.existsSync(skillMdPath)) {
    const skillMd = fs.readFileSync(skillMdPath, 'utf8');
    const fmMatch = /^---\n([\s\S]*?)\n---\n/.exec(skillMd.replace(/\r\n/g, '\n'));
    assert.ok(fmMatch, 'SKILL.md missing YAML frontmatter');
    assert.match(fmMatch[1], /^name:\s*ultracode\s*$/m, 'SKILL.md frontmatter missing name: ultracode');
    assert.match(fmMatch[1], /^description:/m, 'SKILL.md frontmatter missing description');

    const expectedCategories = [
      'visual-engineering',
      'ultrabrain',
      'deep',
      'quick',
      'audit-sweep',
      'writing-spec',
    ];
    for (const cat of expectedCategories) {
      assert.ok(skillMd.includes(cat), `SKILL.md missing semantic category "${cat}"`);
    }
  }

  const templatesPath = path.join(
    REPO_ROOT,
    'skills',
    'ultracode',
    'references',
    'prompt-templates.md'
  );
  if (fs.existsSync(templatesPath)) {
    const templatesMd = fs.readFileSync(templatesPath, 'utf8');
    const roleMatches = templatesMd.match(/^Role:\s*/gm) || [];
    assert.equal(
      roleMatches.length,
      14,
      `prompt-templates.md expected 14 Role: templates, found ${roleMatches.length}`
    );
  }

  const playbooksPath = path.join(
    REPO_ROOT,
    'skills',
    'ultracode',
    'references',
    'quality-patterns-and-playbooks.md'
  );
  if (fs.existsSync(playbooksPath)) {
    const playbooksMd = fs.readFileSync(playbooksPath, 'utf8');
    const expectedSchemas = [
      'PREFLIGHT_CRITIC_SCHEMA',
      'SCOUT_SCHEMA',
      'PROPOSAL_SCHEMA',
      'FINAL_SPEC_SCHEMA',
      'REVIEW_SCHEMA',
      'VERDICT_SCHEMA',
      'ORACLE_DIAGNOSIS_SCHEMA',
      'CHUNK_RESULT_SCHEMA',
      'REFINERY_SIGNOFF_SCHEMA',
    ];
    for (const schemaName of expectedSchemas) {
      assert.ok(
        playbooksMd.includes(schemaName),
        `quality-patterns-and-playbooks.md missing schema "${schemaName}"`
      );
    }
    for (let n = 1; n <= 7; n++) {
      const pbRegex = new RegExp(`(?:剧本\\s*${n}|Playbook\\s*${n})\\b`, 'i');
      assert.match(
        playbooksMd,
        pbRegex,
        `quality-patterns-and-playbooks.md missing Playbook / 剧本 ${n}`
      );
    }
  }

  console.log('[PASS] Gate B · Manifest, SVG geometry & skill structural integrity');
}

function locatePowerShellBinary() {
  const candidates =
    process.platform === 'win32'
      ? [
          'pwsh.exe',
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          'powershell.exe',
        ]
      : ['pwsh'];

  for (const bin of candidates) {
    const probe = spawnSync(bin, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], {
      encoding: 'utf8',
    });
    if (!probe.error && probe.status === 0) {
      return bin;
    }
  }
  return null;
}

function locateBashBinary() {
  if (process.platform === 'win32') {
    const winGitBashCandidates = [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ];
    const gitProbe = spawnSync('where.exe', ['git'], { encoding: 'utf8' });
    if (!gitProbe.error && gitProbe.status === 0) {
      const firstGit = gitProbe.stdout.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (firstGit) {
        const gitRoot = path.resolve(path.dirname(firstGit), '..');
        winGitBashCandidates.unshift(path.join(gitRoot, 'bin', 'bash.exe'));
      }
    }
    for (const candidate of winGitBashCandidates) {
      if (fs.existsSync(candidate)) {
        const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (!probe.error && probe.status === 0) {
          return candidate;
        }
      }
    }
    return null;
  }

  const probe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
  if (!probe.error && probe.status === 0) {
    return 'bash';
  }
  return null;
}

function prepareSandboxRepo(sandboxRoot) {
  const repoCopy = path.join(sandboxRoot, 'repo');
  fs.mkdirSync(path.join(repoCopy, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(repoCopy, 'skills', 'ultracode', 'references'), { recursive: true });

  fs.copyFileSync(path.join(REPO_ROOT, 'plugin.json'), path.join(repoCopy, 'plugin.json'));
  fs.copyFileSync(
    path.join(REPO_ROOT, 'assets', 'logo.svg'),
    path.join(repoCopy, 'assets', 'logo.svg')
  );
  fs.copyFileSync(path.join(REPO_ROOT, 'install.ps1'), path.join(repoCopy, 'install.ps1'));
  fs.copyFileSync(path.join(REPO_ROOT, 'install.sh'), path.join(repoCopy, 'install.sh'));

  const copyOrStub = (relPath, stubContent) => {
    const realSrc = path.join(REPO_ROOT, relPath);
    const dest = path.join(repoCopy, relPath);
    if (fs.existsSync(realSrc)) {
      fs.copyFileSync(realSrc, dest);
    } else {
      fs.writeFileSync(dest, stubContent, 'utf8');
    }
  };

  copyOrStub(
    'AGENTS.global.md',
    [
      '<!-- ultracode:begin v2 -->',
      '## Ultracode v2 Global Orchestration Rules',
      '- Flat Depth-1 star topology and zero-trust verification.',
      '<!-- ultracode:end -->',
      '',
    ].join('\n')
  );

  copyOrStub('README.md', '# Ultracode v2\n\nSandbox documentation stub.\n');

  copyOrStub(
    'skills/ultracode/SKILL.md',
    [
      '---',
      'name: ultracode',
      'description: Ultracode v2 orchestration skill.',
      '---',
      '',
      '# Ultracode v2',
      'Categories: visual-engineering, ultrabrain, deep, quick, audit-sweep, writing-spec.',
      '',
    ].join('\n')
  );

  copyOrStub(
    'skills/ultracode/references/prompt-templates.md',
    Array.from({ length: 14 }, (_, i) => `Role: "[T-${i + 1}] Worker ${i + 1}"`).join('\n') + '\n'
  );

  copyOrStub(
    'skills/ultracode/references/quality-patterns-and-playbooks.md',
    [
      'PREFLIGHT_CRITIC_SCHEMA SCOUT_SCHEMA PROPOSAL_SCHEMA FINAL_SPEC_SCHEMA',
      'REVIEW_SCHEMA VERDICT_SCHEMA ORACLE_DIAGNOSIS_SCHEMA CHUNK_RESULT_SCHEMA REFINERY_SIGNOFF_SCHEMA',
      'Playbook 1 Playbook 2 Playbook 3 Playbook 4 Playbook 5 Playbook 6 Playbook 7',
      '',
    ].join('\n')
  );

  return repoCopy;
}

function runSuiteForShell({ label, invokeInstaller, sandboxRoot, repoCopy }) {
  const shellRoot = path.join(sandboxRoot, `home-${label}`);
  fs.mkdirSync(shellRoot, { recursive: true });

  // Scenario 1: Fresh Global install + legacy skills/ultracode dedup + stale rules removal
  const home1 = path.join(shellRoot, 'case1-global');
  const legacySkillDir = path.join(home1, 'config', 'skills', 'ultracode');
  const staleRulesDir = path.join(home1, 'config', 'plugins', 'ultracode', 'rules');
  fs.mkdirSync(legacySkillDir, { recursive: true });
  fs.writeFileSync(path.join(legacySkillDir, 'SKILL.md'), 'legacy stale copy\n', 'utf8');
  fs.mkdirSync(staleRulesDir, { recursive: true });
  fs.writeFileSync(path.join(staleRulesDir, 'AGENTS.md'), 'duplicate rule injection\n', 'utf8');

  const r1 = invokeInstaller(repoCopy, 'global', { geminiHome: home1 });
  assert.equal(r1.status, 0, `[${label}] Fresh global install failed: ${r1.stderr}`);

  const agents1Path = path.join(home1, 'AGENTS.md');
  assert.ok(fs.existsSync(agents1Path), `[${label}] AGENTS.md not created`);
  const agents1Bytes = fs.readFileSync(agents1Path);
  assert.ok(!hasUtf8Bom(agents1Bytes), `[${label}] AGENTS.md must not have UTF-8 BOM`);
  assert.ok(!agents1Bytes.includes(0x0d), `[${label}] AGENTS.md must use LF only`);
  assert.match(agents1Bytes.toString('utf8'), /<!-- ultracode:begin v2 -->[\s\S]*<!-- ultracode:end -->/);

  const pluginDir1 = path.join(home1, 'config', 'plugins', 'ultracode');
  for (const rel of [
    'plugin.json',
    'assets/logo.svg',
    'README.md',
    'skills/ultracode/SKILL.md',
    'skills/ultracode/references/prompt-templates.md',
    'skills/ultracode/references/quality-patterns-and-playbooks.md',
  ]) {
    const installedFile = path.join(pluginDir1, rel);
    assert.ok(fs.existsSync(installedFile), `[${label}] Missing installed plugin file: ${rel}`);
    assert.equal(
      Buffer.compare(fs.readFileSync(installedFile), fs.readFileSync(path.join(repoCopy, rel))),
      0,
      `[${label}] Installed file bytes mismatch for ${rel}`
    );
  }
  assert.ok(!fs.existsSync(staleRulesDir), `[${label}] Failed to remove <plugin_dir>/rules`);
  assert.ok(!fs.existsSync(legacySkillDir), `[${label}] Failed to deduplicate legacy config/skills/ultracode`);

  // Scenario 2: Idempotent second run (default no-arg mode) — byte-identical
  const r2 = invokeInstaller(repoCopy, 'default', { geminiHome: home1 });
  assert.equal(r2.status, 0, `[${label}] Second idempotent run failed: ${r2.stderr}`);
  const agents1AfterSecondRun = fs.readFileSync(agents1Path);
  assert.equal(
    Buffer.compare(agents1Bytes, agents1AfterSecondRun),
    0,
    `[${label}] AGENTS.md is not byte-identical on second run`
  );

  // Scenario 3: Coexistence with existing agentdash marker block + custom user sections
  const homeCoexist = path.join(shellRoot, 'case3-coexist');
  fs.mkdirSync(homeCoexist, { recursive: true });
  const coexistSeed = [
    '# User Custom Header',
    '',
    '<!-- agentdash:begin v1 -->',
    '## agentdash global rules',
    '1. Ledger authority and strict barrier gate.',
    '<!-- agentdash:end -->',
    '',
    '## User Custom Footer',
    '- Preserve every line verbatim.',
    '',
  ].join('\n');
  const coexistAgentsPath = path.join(homeCoexist, 'AGENTS.md');
  fs.writeFileSync(coexistAgentsPath, coexistSeed, 'utf8');

  const r3a = invokeInstaller(repoCopy, 'global', { geminiHome: homeCoexist });
  assert.equal(r3a.status, 0, `[${label}] Coexistence install failed: ${r3a.stderr}`);
  const coexistAfter1 = fs.readFileSync(coexistAgentsPath);
  const coexistText1 = coexistAfter1.toString('utf8');
  assert.ok(coexistText1.includes('# User Custom Header'), `[${label}] Lost custom header`);
  assert.ok(
    coexistText1.includes('<!-- agentdash:begin v1 -->\n## agentdash global rules\n1. Ledger authority and strict barrier gate.\n<!-- agentdash:end -->'),
    `[${label}] Damaged agentdash block`
  );
  assert.ok(coexistText1.includes('## User Custom Footer\n- Preserve every line verbatim.'), `[${label}] Lost custom footer`);
  assert.match(coexistText1, /<!-- ultracode:begin v2 -->[\s\S]*<!-- ultracode:end -->/);

  const r3b = invokeInstaller(repoCopy, 'global', { geminiHome: homeCoexist });
  assert.equal(r3b.status, 0, `[${label}] Coexistence second run failed: ${r3b.stderr}`);
  assert.equal(
    Buffer.compare(coexistAfter1, fs.readFileSync(coexistAgentsPath)),
    0,
    `[${label}] Coexistence AGENTS.md not byte-identical on rerun`
  );

  // Scenario 4: Corrupt marker guards (unclosed begin, orphan end, inverted end->begin, nested begin, and Target corrupt)
  const corruptVariants = [
    {
      name: 'unclosed-begin',
      body: [
        '<!-- agentdash:begin v1 -->',
        'keep safe',
        '<!-- agentdash:end -->',
        '',
        '<!-- ultracode:begin v2 -->',
        'truncated content missing closing marker...',
        '',
      ].join('\n'),
    },
    {
      name: 'orphan-end',
      body: [
        '<!-- agentdash:begin v1 -->',
        'keep safe',
        '<!-- agentdash:end -->',
        '',
        '<!-- ultracode:end -->',
        '',
      ].join('\n'),
    },
    {
      name: 'inverted-end-before-begin',
      body: [
        '<!-- ultracode:end -->',
        'middle text',
        '<!-- ultracode:begin v2 -->',
        'tail',
        '<!-- ultracode:end -->',
        '',
      ].join('\n'),
    },
    {
      name: 'nested-begin',
      body: [
        '<!-- ultracode:begin v2 -->',
        'outer line',
        '<!-- ultracode:begin v2 -->',
        'inner line',
        '<!-- ultracode:end -->',
        '',
      ].join('\n'),
    },
  ];

  for (const variant of corruptVariants) {
    const homeCorrupt = path.join(shellRoot, `case4-${variant.name}`);
    fs.mkdirSync(homeCorrupt, { recursive: true });
    const corruptAgentsPath = path.join(homeCorrupt, 'AGENTS.md');
    fs.writeFileSync(corruptAgentsPath, variant.body, 'utf8');
    const corruptBeforeBytes = fs.readFileSync(corruptAgentsPath);

    const r4Global = invokeInstaller(repoCopy, 'global', { geminiHome: homeCorrupt });
    assert.notEqual(
      r4Global.status,
      0,
      `[${label}] Corrupt (${variant.name}) AGENTS.md must fail global install`
    );
    assert.equal(
      Buffer.compare(corruptBeforeBytes, fs.readFileSync(corruptAgentsPath)),
      0,
      `[${label}] Corrupt (${variant.name}) AGENTS.md was modified during failed global install`
    );
    assert.ok(
      !fs.existsSync(path.join(homeCorrupt, 'config', 'plugins', 'ultracode')),
      `[${label}] Corrupt (${variant.name}) guard must abort before creating plugin dir`
    );

    const r4Uninstall = invokeInstaller(repoCopy, 'uninstall', { geminiHome: homeCorrupt });
    assert.notEqual(
      r4Uninstall.status,
      0,
      `[${label}] Corrupt (${variant.name}) AGENTS.md must fail uninstall`
    );
    assert.equal(
      Buffer.compare(corruptBeforeBytes, fs.readFileSync(corruptAgentsPath)),
      0,
      `[${label}] Corrupt (${variant.name}) AGENTS.md was modified during failed uninstall`
    );
  }

  const corruptTargetWs = path.join(shellRoot, 'case4-corrupt-target-ws');
  fs.mkdirSync(corruptTargetWs, { recursive: true });
  const corruptTargetAgents = path.join(corruptTargetWs, 'AGENTS.md');
  fs.writeFileSync(
    corruptTargetAgents,
    '# Workspace Header\n<!-- ultracode:begin v2 -->\nunclosed workspace rule\n',
    'utf8'
  );
  const corruptTargetBefore = fs.readFileSync(corruptTargetAgents);
  const r4Target = invokeInstaller(repoCopy, 'target', {
    geminiHome: home1,
    targetDir: corruptTargetWs,
  });
  assert.notEqual(r4Target.status, 0, `[${label}] Corrupt target workspace AGENTS.md must fail`);
  assert.equal(
    Buffer.compare(corruptTargetBefore, fs.readFileSync(corruptTargetAgents)),
    0,
    `[${label}] Corrupt target workspace AGENTS.md was modified`
  );
  assert.ok(
    !fs.existsSync(path.join(corruptTargetWs, '.agents')),
    `[${label}] Corrupt target workspace must abort before creating .agents directory`
  );

  // Scenario 5: Skill-Only mode switching & deduplication + NoGlobalRule flag
  const r5Switch = invokeInstaller(repoCopy, 'skill-only', { geminiHome: home1 });
  assert.equal(r5Switch.status, 0, `[${label}] Skill-only switch failed: ${r5Switch.stderr}`);
  assert.ok(
    fs.existsSync(path.join(home1, 'config', 'skills', 'ultracode', 'SKILL.md')),
    `[${label}] Skill-only SKILL.md missing`
  );
  assert.ok(
    fs.existsSync(path.join(home1, 'config', 'skills', 'ultracode', 'references', 'prompt-templates.md')),
    `[${label}] Skill-only prompt-templates.md missing`
  );
  assert.ok(
    !fs.existsSync(path.join(home1, 'config', 'plugins', 'ultracode')),
    `[${label}] Skill-only mode failed to clean up config/plugins/ultracode`
  );

  const homeNoRule = path.join(shellRoot, 'case5-noglobalrule');
  const r5NoRule = invokeInstaller(repoCopy, 'skill-only-no-rule', { geminiHome: homeNoRule });
  assert.equal(r5NoRule.status, 0, `[${label}] Skill-only --no-global-rule failed: ${r5NoRule.stderr}`);
  assert.ok(!fs.existsSync(path.join(homeNoRule, 'AGENTS.md')), `[${label}] NoGlobalRule should skip AGENTS.md`);
  assert.ok(fs.existsSync(path.join(homeNoRule, 'config', 'skills', 'ultracode', 'SKILL.md')));

  // Scenario 6: Target Workspace mode (+ missing target error check + corrupt target guard)
  const missingWs = path.join(shellRoot, 'does-not-exist-ws');
  const r6Missing = invokeInstaller(repoCopy, 'target', {
    geminiHome: home1,
    targetDir: missingWs,
  });
  assert.notEqual(r6Missing.status, 0, `[${label}] Missing target workspace must exit non-zero`);

  const targetWs = path.join(shellRoot, 'case6-workspace');
  fs.mkdirSync(targetWs, { recursive: true });
  fs.writeFileSync(path.join(targetWs, 'AGENTS.md'), '# Workspace Rules\n- Keep clean.\n', 'utf8');

  const r6a = invokeInstaller(repoCopy, 'target', { geminiHome: home1, targetDir: targetWs });
  assert.equal(r6a.status, 0, `[${label}] Target workspace install failed: ${r6a.stderr}`);
  const wsAgentsBytes1 = fs.readFileSync(path.join(targetWs, 'AGENTS.md'));
  assert.ok(wsAgentsBytes1.toString('utf8').includes('# Workspace Rules\n- Keep clean.'));
  assert.match(wsAgentsBytes1.toString('utf8'), /<!-- ultracode:begin v2 -->[\s\S]*<!-- ultracode:end -->/);
  assert.ok(fs.existsSync(path.join(targetWs, '.agents', 'skills', 'ultracode', 'SKILL.md')));
  assert.ok(
    fs.existsSync(
      path.join(targetWs, '.agents', 'skills', 'ultracode', 'references', 'quality-patterns-and-playbooks.md')
    )
  );

  const r6b = invokeInstaller(repoCopy, 'target-positional', {
    geminiHome: home1,
    targetDir: targetWs,
  });
  assert.equal(r6b.status, 0, `[${label}] Target second run failed: ${r6b.stderr}`);
  assert.equal(
    Buffer.compare(wsAgentsBytes1, fs.readFileSync(path.join(targetWs, 'AGENTS.md'))),
    0,
    `[${label}] Target workspace AGENTS.md not byte-identical on rerun`
  );

  // Scenario 7: Uninstall clean strip & exact byte-for-byte preservation of agentdash block
  const homeUninstall = path.join(shellRoot, 'case7-uninstall');
  fs.mkdirSync(homeUninstall, { recursive: true });
  const agentdashOnlySeed = [
    '<!-- agentdash:begin v1 -->',
    '## agentdash task ledger rules',
    '- Strictly enforce barriers and gate timestamps.',
    '<!-- agentdash:end -->',
    '',
  ].join('\n');
  const uninstallAgentsPath = path.join(homeUninstall, 'AGENTS.md');
  fs.writeFileSync(uninstallAgentsPath, agentdashOnlySeed, 'utf8');
  const seedBytes = fs.readFileSync(uninstallAgentsPath);

  const r7Install = invokeInstaller(repoCopy, 'global', { geminiHome: homeUninstall });
  assert.equal(r7Install.status, 0, `[${label}] Pre-uninstall install failed: ${r7Install.stderr}`);
  fs.mkdirSync(path.join(homeUninstall, 'config', 'skills', 'ultracode'), { recursive: true });

  const r7Uninstall = invokeInstaller(repoCopy, 'uninstall', { geminiHome: homeUninstall });
  assert.equal(r7Uninstall.status, 0, `[${label}] Uninstall failed: ${r7Uninstall.stderr}`);
  assert.ok(!fs.existsSync(path.join(homeUninstall, 'config', 'plugins', 'ultracode')));
  assert.ok(!fs.existsSync(path.join(homeUninstall, 'config', 'skills', 'ultracode')));

  const afterUninstallBytes = fs.readFileSync(uninstallAgentsPath);
  assert.doesNotMatch(afterUninstallBytes.toString('utf8'), /ultracode:/);
  assert.equal(
    Buffer.compare(seedBytes, afterUninstallBytes),
    0,
    `[${label}] Uninstall did not restore exact byte-for-byte agentdash AGENTS.md`
  );

  // Scenario 8: Relative backslash + space + CJK + \t escape path (.\测试 空间\temp_gemini) two-run idempotency
  const relCwd = path.join(shellRoot, 'case8-relcwd');
  const relWsDisk = path.join(relCwd, '测试 空间', 'temp_ws');
  fs.mkdirSync(relWsDisk, { recursive: true });
  const relGeminiArg = '.\\测试 空间\\temp_gemini';
  const relGeminiDisk = path.join(relCwd, '测试 空间', 'temp_gemini');

  const r8Run1 = invokeInstaller(repoCopy, 'global', {
    geminiHome: relGeminiArg,
    cwdOverride: relCwd,
  });
  assert.equal(r8Run1.status, 0, `[${label}] Relative CJK+backslash Run 1 failed: ${r8Run1.stderr}`);
  const relAgentsPath = path.join(relGeminiDisk, 'AGENTS.md');
  assert.ok(fs.existsSync(relAgentsPath), `[${label}] Relative CJK+backslash AGENTS.md not created`);
  const relAgentsRun1 = fs.readFileSync(relAgentsPath);
  assert.match(
    relAgentsRun1.toString('utf8'),
    /<!-- ultracode:begin v2 -->[\s\S]*<!-- ultracode:end -->/,
    `[${label}] Relative CJK+backslash Run 1 missing ultracode block`
  );

  const r8Run2 = invokeInstaller(repoCopy, 'global', {
    geminiHome: relGeminiArg,
    cwdOverride: relCwd,
  });
  assert.equal(r8Run2.status, 0, `[${label}] Relative CJK+backslash Run 2 failed: ${r8Run2.stderr}`);
  const relAgentsRun2 = fs.readFileSync(relAgentsPath);
  assert.match(
    relAgentsRun2.toString('utf8'),
    /<!-- ultracode:begin v2 -->[\s\S]*<!-- ultracode:end -->/,
    `[${label}] Relative CJK+backslash Run 2 lost ultracode block`
  );
  assert.equal(
    Buffer.compare(relAgentsRun1, relAgentsRun2),
    0,
    `[${label}] Relative CJK+backslash Run 2 not byte-identical`
  );

  const relTargetArg = '.\\测试 空间\\temp_ws';
  const r8Ws1 = invokeInstaller(repoCopy, 'target', {
    geminiHome: home1,
    targetDir: relTargetArg,
    cwdOverride: relCwd,
  });
  assert.equal(r8Ws1.status, 0, `[${label}] Relative CJK+backslash target Run 1 failed: ${r8Ws1.stderr}`);
  const relWsAgents1 = fs.readFileSync(path.join(relWsDisk, 'AGENTS.md'));
  const r8Ws2 = invokeInstaller(repoCopy, 'target', {
    geminiHome: home1,
    targetDir: relTargetArg,
    cwdOverride: relCwd,
  });
  assert.equal(r8Ws2.status, 0, `[${label}] Relative CJK+backslash target Run 2 failed: ${r8Ws2.stderr}`);
  assert.equal(
    Buffer.compare(relWsAgents1, fs.readFileSync(path.join(relWsDisk, 'AGENTS.md'))),
    0,
    `[${label}] Relative CJK+backslash target Run 2 not byte-identical`
  );

  // Scenario 9: Filesystem root rejection, whitespace target/env handling & directory AGENTS.md/ collision
  for (const badRoot of ['/', 'C:\\']) {
    const rRootHome = invokeInstaller(repoCopy, 'global', { geminiHome: badRoot });
    assert.notEqual(
      rRootHome.status,
      0,
      `[${label}] Must reject filesystem root ULTRACODE_GEMINI_HOME="${badRoot}"`
    );
    const rRootTarget = invokeInstaller(repoCopy, 'target', {
      geminiHome: home1,
      targetDir: badRoot,
    });
    assert.notEqual(
      rRootTarget.status,
      0,
      `[${label}] Must reject filesystem root target="${badRoot}"`
    );
  }

  const rBlankTarget = invokeInstaller(repoCopy, 'target', {
    geminiHome: home1,
    targetDir: '   ',
  });
  assert.notEqual(rBlankTarget.status, 0, `[${label}] Must reject whitespace-only target "   "`);

  const fallbackUserHome = path.join(shellRoot, 'case9-fallback-user');
  fs.mkdirSync(fallbackUserHome, { recursive: true });
  const rBlankEnv = invokeInstaller(repoCopy, 'global', {
    geminiHome: '   ',
    extraEnv: {
      HOME: fallbackUserHome,
      USERPROFILE: fallbackUserHome,
    },
  });
  assert.equal(
    rBlankEnv.status,
    0,
    `[${label}] Whitespace ULTRACODE_GEMINI_HOME should fall back to HOME/.gemini: ${rBlankEnv.stderr}`
  );
  assert.ok(
    fs.existsSync(path.join(fallbackUserHome, '.gemini', 'AGENTS.md')),
    `[${label}] Fallback HOME/.gemini/AGENTS.md not created`
  );

  const collisionHome = path.join(shellRoot, 'case9-dir-collision');
  const collisionAgentsDir = path.join(collisionHome, 'AGENTS.md');
  fs.mkdirSync(collisionAgentsDir, { recursive: true });

  const rCollideGlobal = invokeInstaller(repoCopy, 'global', { geminiHome: collisionHome });
  assert.notEqual(
    rCollideGlobal.status,
    0,
    `[${label}] Directory collision AGENTS.md/ must fail global install`
  );
  assert.equal(
    fs.readdirSync(collisionAgentsDir).length,
    0,
    `[${label}] Directory collision AGENTS.md/ must not receive moved temp files`
  );

  const rCollideUninstall = invokeInstaller(repoCopy, 'uninstall', { geminiHome: collisionHome });
  assert.notEqual(
    rCollideUninstall.status,
    0,
    `[${label}] Directory collision AGENTS.md/ must fail uninstall`
  );

  // Scenario 10: Top-level config/plugins/ultracode link pointing to external repo with skills/ultracode/sentinel.txt
  const extTopPluginTarget = path.join(shellRoot, 'case10-ext-top-plugin');
  fs.mkdirSync(path.join(extTopPluginTarget, 'skills', 'ultracode'), { recursive: true });
  fs.writeFileSync(
    path.join(extTopPluginTarget, 'skills', 'ultracode', 'sentinel.txt'),
    'TOP_PLUGIN_LINK_SENTINEL_INTACT\n',
    'utf8'
  );
  const homeTopLink = path.join(shellRoot, 'case10-home-toplink');
  const topPluginLinkPath = path.join(homeTopLink, 'config', 'plugins', 'ultracode');
  fs.mkdirSync(path.dirname(topPluginLinkPath), { recursive: true });
  if (process.platform === 'win32') {
    const mkTop = spawnSync('cmd.exe', ['/c', 'mklink', '/J', topPluginLinkPath, extTopPluginTarget], {
      encoding: 'utf8',
    });
    assert.equal(mkTop.status, 0, `[${label}] mklink /J failed: ${mkTop.stderr || mkTop.stdout}`);
  } else {
    fs.symlinkSync(extTopPluginTarget, topPluginLinkPath, 'dir');
  }

  const r10Top = invokeInstaller(repoCopy, 'global', { geminiHome: homeTopLink });
  assert.equal(r10Top.status, 0, `[${label}] Top-level plugin link replace failed: ${r10Top.stderr}`);
  assert.equal(
    fs.readFileSync(path.join(extTopPluginTarget, 'skills', 'ultracode', 'sentinel.txt'), 'utf8'),
    'TOP_PLUGIN_LINK_SENTINEL_INTACT\n',
    `[${label}] Top-level plugin link target skills/ultracode/sentinel.txt was deleted or modified!`
  );
  assert.ok(
    !fs.lstatSync(topPluginLinkPath).isSymbolicLink(),
    `[${label}] config/plugins/ultracode must become a standalone real directory`
  );
  assert.ok(
    fs.existsSync(path.join(topPluginLinkPath, 'skills', 'ultracode', 'SKILL.md')),
    `[${label}] Standalone SKILL.md missing after unlinking top-level plugin link`
  );
  assert.ok(
    !fs.existsSync(path.join(topPluginLinkPath, 'skills', 'ultracode', 'sentinel.txt')),
    `[${label}] Standalone plugin dir should not retain external link sentinel`
  );

  // Scenario 11: In-Place Clone at config/plugins/ultracode (must not self-delete skills/ultracode/SKILL.md)
  const inPlaceHome = path.join(shellRoot, 'case11-inplace-home');
  const inPlaceCloneDir = path.join(inPlaceHome, 'config', 'plugins', 'ultracode');
  fs.cpSync(repoCopy, inPlaceCloneDir, { recursive: true });
  fs.mkdirSync(path.join(inPlaceCloneDir, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(inPlaceCloneDir, 'rules', 'AGENTS.md'), 'stale-rule\n', 'utf8');
  fs.mkdirSync(path.join(inPlaceHome, 'config', 'skills', 'ultracode'), { recursive: true });
  fs.writeFileSync(path.join(inPlaceHome, 'config', 'skills', 'ultracode', 'SKILL.md'), 'legacy\n', 'utf8');

  const r11InPlace = invokeInstaller(inPlaceCloneDir, 'global', {
    geminiHome: inPlaceHome,
    cwdOverride: inPlaceCloneDir,
  });
  assert.equal(r11InPlace.status, 0, `[${label}] In-place clone install failed: ${r11InPlace.stderr}`);
  assert.ok(
    fs.existsSync(path.join(inPlaceCloneDir, 'skills', 'ultracode', 'SKILL.md')),
    `[${label}] In-place clone self-deleted skills/ultracode/SKILL.md!`
  );
  assert.equal(
    Buffer.compare(
      fs.readFileSync(path.join(inPlaceCloneDir, 'skills', 'ultracode', 'SKILL.md')),
      fs.readFileSync(path.join(repoCopy, 'skills', 'ultracode', 'SKILL.md'))
    ),
    0,
    `[${label}] In-place clone corrupted SKILL.md bytes`
  );
  assert.ok(fs.existsSync(path.join(inPlaceHome, 'AGENTS.md')), `[${label}] In-place clone missing AGENTS.md`);
  assert.ok(!fs.existsSync(path.join(inPlaceCloneDir, 'rules')), `[${label}] In-place clone failed to remove rules/`);
  assert.ok(
    !fs.existsSync(path.join(inPlaceHome, 'config', 'skills', 'ultracode')),
    `[${label}] In-place clone failed to remove duplicate config/skills/ultracode`
  );

  console.log(
    `[PASS] Gate C (${label}) · All 11 installer modes, top-link detach, in-place clone, path escapes & guards verified`
  );
}

function verifyWindowsJunctionSafety({ psBin, sandboxRoot, repoCopy, invokePs }) {
  const jRoot = path.join(sandboxRoot, 'junction-safety');
  const extSkillSrc = path.join(jRoot, 'external-skill-source');
  const extRulesSrc = path.join(jRoot, 'external-rules-source');
  const extPluginSrc = path.join(jRoot, 'external-plugin-source');

  fs.mkdirSync(path.join(extSkillSrc, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(extSkillSrc, 'sentinel-skill.txt'), 'DO_NOT_DELETE_SKILL_SOURCE\n', 'utf8');
  fs.writeFileSync(path.join(extSkillSrc, 'nested', 'deep.txt'), 'DO_NOT_DELETE_DEEP\n', 'utf8');

  fs.mkdirSync(extRulesSrc, { recursive: true });
  fs.writeFileSync(path.join(extRulesSrc, 'sentinel-rule.txt'), 'DO_NOT_DELETE_RULE_SOURCE\n', 'utf8');

  fs.mkdirSync(extPluginSrc, { recursive: true });
  fs.writeFileSync(path.join(extPluginSrc, 'sentinel-plugin.txt'), 'DO_NOT_DELETE_PLUGIN_SOURCE\n', 'utf8');

  const createJunction = (junctionPath, targetPath) => {
    fs.mkdirSync(path.dirname(junctionPath), { recursive: true });
    const mk = spawnSync('cmd.exe', ['/c', 'mklink', '/J', junctionPath, targetPath], {
      encoding: 'utf8',
    });
    assert.equal(mk.status, 0, `mklink /J failed: ${mk.stderr || mk.stdout}`);
  };

  const assertExternalSourcesIntact = (contextLabel) => {
    assert.equal(
      fs.readFileSync(path.join(extSkillSrc, 'sentinel-skill.txt'), 'utf8'),
      'DO_NOT_DELETE_SKILL_SOURCE\n',
      `[Junction ${contextLabel}] External skill source sentinel was deleted or altered!`
    );
    assert.equal(
      fs.readFileSync(path.join(extSkillSrc, 'nested', 'deep.txt'), 'utf8'),
      'DO_NOT_DELETE_DEEP\n',
      `[Junction ${contextLabel}] External skill nested file was deleted or altered!`
    );
    assert.equal(
      fs.readFileSync(path.join(extRulesSrc, 'sentinel-rule.txt'), 'utf8'),
      'DO_NOT_DELETE_RULE_SOURCE\n',
      `[Junction ${contextLabel}] External rules source sentinel was deleted or altered!`
    );
    assert.equal(
      fs.readFileSync(path.join(extPluginSrc, 'sentinel-plugin.txt'), 'utf8'),
      'DO_NOT_DELETE_PLUGIN_SOURCE\n',
      `[Junction ${contextLabel}] External plugin source sentinel was deleted or altered!`
    );
  };

  // J1: -Global unlinks legacy config/skills/ultracode Junction & <plugin_dir>/rules Junction safely
  const jHome1 = path.join(jRoot, 'home-j1');
  createJunction(path.join(jHome1, 'config', 'skills', 'ultracode'), extSkillSrc);
  createJunction(path.join(jHome1, 'config', 'plugins', 'ultracode', 'rules'), extRulesSrc);
  const rJ1 = invokePs(repoCopy, 'global', { geminiHome: jHome1 });
  assert.equal(rJ1.status, 0, `[Junction J1 Global] failed: ${rJ1.stderr}`);
  assert.ok(!fs.existsSync(path.join(jHome1, 'config', 'skills', 'ultracode')));
  assert.ok(!fs.existsSync(path.join(jHome1, 'config', 'plugins', 'ultracode', 'rules')));
  assertExternalSourcesIntact('J1 -Global');

  // J2: -SkillOnly replaces config/skills/ultracode Junction & unlinks config/plugins/ultracode Junction safely
  const jHome2 = path.join(jRoot, 'home-j2');
  createJunction(path.join(jHome2, 'config', 'skills', 'ultracode'), extSkillSrc);
  createJunction(path.join(jHome2, 'config', 'plugins', 'ultracode'), extPluginSrc);
  const rJ2 = invokePs(repoCopy, 'skill-only', { geminiHome: jHome2 });
  assert.equal(rJ2.status, 0, `[Junction J2 SkillOnly] failed: ${rJ2.stderr}`);
  assert.ok(!fs.existsSync(path.join(jHome2, 'config', 'plugins', 'ultracode')));
  assert.ok(fs.existsSync(path.join(jHome2, 'config', 'skills', 'ultracode', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(jHome2, 'config', 'skills', 'ultracode', 'sentinel-skill.txt')));
  assertExternalSourcesIntact('J2 -SkillOnly');

  // J3: -Uninstall unlinks both config/plugins/ultracode & config/skills/ultracode Junctions safely
  const jHome3 = path.join(jRoot, 'home-j3');
  createJunction(path.join(jHome3, 'config', 'plugins', 'ultracode'), extPluginSrc);
  createJunction(path.join(jHome3, 'config', 'skills', 'ultracode'), extSkillSrc);
  const rJ3 = invokePs(repoCopy, 'uninstall', { geminiHome: jHome3 });
  assert.equal(rJ3.status, 0, `[Junction J3 Uninstall] failed: ${rJ3.stderr}`);
  assert.ok(!fs.existsSync(path.join(jHome3, 'config', 'plugins', 'ultracode')));
  assert.ok(!fs.existsSync(path.join(jHome3, 'config', 'skills', 'ultracode')));
  assertExternalSourcesIntact('J3 -Uninstall');

  console.log('[PASS] Gate C (win32-junction) · NTFS Junction non-traversal verified across Global, SkillOnly & Uninstall');
}

function verifyInstallerSandboxMatrix() {
  const psBin = locatePowerShellBinary();
  const bashBin = locateBashBinary();

  if (process.platform === 'win32') {
    assert.ok(psBin, 'PowerShell binary not found on Windows');
    assert.ok(bashBin, 'Git Bash binary not found on Windows');
  } else {
    assert.ok(bashBin, 'Bash binary not found');
  }

  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'uc-verify-sandbox-'));
  try {
    const repoCopy = prepareSandboxRepo(sandboxRoot);

    const invokePs = (repoDir, mode, { geminiHome, targetDir, cwdOverride, extraEnv }) => {
      const script = path.join(repoDir, 'install.ps1');
      const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script];
      if (mode === 'global') args.push('-Global');
      else if (mode === 'skill-only') args.push('-SkillOnly');
      else if (mode === 'skill-only-no-rule') args.push('-SkillOnly', '-NoGlobalRule');
      else if (mode === 'target' || mode === 'target-positional') args.push('-Target', targetDir);
      else if (mode === 'uninstall') args.push('-Uninstall');

      return spawnSync(psBin, args, {
        cwd: cwdOverride || repoDir,
        env: { ...process.env, ...(extraEnv || {}), ULTRACODE_GEMINI_HOME: geminiHome },
        encoding: 'utf8',
      });
    };

    const invokeBash = (repoDir, mode, { geminiHome, targetDir, cwdOverride, extraEnv }) => {
      const script = path.join(repoDir, 'install.sh').replace(/\\/g, '/');
      const args = [script];
      if (mode === 'global') args.push('--global');
      else if (mode === 'skill-only') args.push('--skill-only');
      else if (mode === 'skill-only-no-rule') args.push('--skill-only', '--no-global-rule');
      else if (mode === 'target') args.push('--target', targetDir);
      else if (mode === 'target-positional') args.push(targetDir);
      else if (mode === 'uninstall') args.push('--uninstall');

      return spawnSync(bashBin, args, {
        cwd: cwdOverride || repoDir,
        env: { ...process.env, ...(extraEnv || {}), ULTRACODE_GEMINI_HOME: geminiHome },
        encoding: 'utf8',
      });
    };

    if (psBin) {
      runSuiteForShell({
        label: 'powershell',
        invokeInstaller: invokePs,
        sandboxRoot,
        repoCopy,
      });

      if (process.platform === 'win32') {
        verifyWindowsJunctionSafety({
          psBin,
          sandboxRoot,
          repoCopy,
          invokePs,
        });
      }
    }

    if (bashBin) {
      runSuiteForShell({
        label: 'bash',
        invokeInstaller: invokeBash,
        sandboxRoot,
        repoCopy,
      });
    }

    if (psBin && bashBin) {
      const interopHome = path.join(sandboxRoot, 'interop-home');
      fs.mkdirSync(interopHome, { recursive: true });
      fs.writeFileSync(
        path.join(interopHome, 'AGENTS.md'),
        '<!-- agentdash:begin v1 -->\ncross-shell seed\n<!-- agentdash:end -->\n',
        'utf8'
      );

      const resPs = invokePs(repoCopy, 'global', { geminiHome: interopHome });
      assert.equal(resPs.status, 0, `Cross-shell PS1 step failed: ${resPs.stderr}`);
      const afterPsBytes = fs.readFileSync(path.join(interopHome, 'AGENTS.md'));

      const resBash = invokeBash(repoCopy, 'global', { geminiHome: interopHome });
      assert.equal(resBash.status, 0, `Cross-shell Bash step failed: ${resBash.stderr}`);
      const afterBashBytes = fs.readFileSync(path.join(interopHome, 'AGENTS.md'));

      assert.equal(
        Buffer.compare(afterPsBytes, afterBashBytes),
        0,
        'Cross-shell interop mismatch: install.ps1 and install.sh produced different AGENTS.md bytes'
      );
      console.log('[PASS] Gate C (cross-shell) · PowerShell <-> Git Bash byte-identical interop verified');
    }
  } finally {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

try {
  verifySanitizationAndPortability();
  verifyStructuralIntegrity();
  verifyInstallerSandboxMatrix();
  console.log('[ULTRACODE VERIFY SUITE] ALL GATES PASSED');
  process.exit(0);
} catch (err) {
  console.error('[ULTRACODE VERIFY SUITE] FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
}
