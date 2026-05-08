#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OPENCODE_CONFIG = path.join(ROOT, '.opencode', 'opencode.json');

function listSkillFiles(rootDir) {
  const skillsDir = path.join(rootDir, 'skills');
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const skillFiles = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(skillsDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      skillFiles.push(`skills/${entry.name}/SKILL.md`);
    }
  }

  return skillFiles.sort();
}

function main() {
  const skillFiles = listSkillFiles(ROOT);
  console.log(`Discovered ${skillFiles.length} skills`);

  // Read existing config as text (preserve comments and formatting)
  let configText = fs.readFileSync(OPENCODE_CONFIG, 'utf8');

  // Build new instructions array
  const baseInstructions = [
    'AGENTS.md',
    'CONTRIBUTING.md',
    'instructions/INSTRUCTIONS.md',
  ];
  const allInstructions = [...baseInstructions, ...skillFiles];
  const instructionsJson = JSON.stringify(allInstructions, null, 2);
  const newInstructionsBlock = `"instructions": ${instructionsJson}`;

  // Find "instructions" key
  const instructionsStart = configText.indexOf('"instructions"');
  if (instructionsStart === -1) {
    console.error('Could not find instructions key in config');
    process.exit(1);
  }

  // Find the start of the array
  const arrayStart = configText.indexOf('[', instructionsStart);
  if (arrayStart === -1) {
    console.error('Could not find instructions array');
    process.exit(1);
  }

  // Find the matching closing bracket by counting brackets
  let bracketCount = 0;
  let inString = false;
  let escapeNext = false;
  let i = arrayStart;

  for (; i < configText.length; i++) {
    const char = configText[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '[') bracketCount++;
      if (char === ']') {
        bracketCount--;
        if (bracketCount === 0) {
          break; // Found the matching closing bracket
        }
      }
    }
  }

  if (i === configText.length) {
    console.error('Could not find closing bracket for instructions array');
    process.exit(1);
  }

  // Replace only the instructions array
  const beforeArray = configText.substring(0, instructionsStart);
  const afterArray = configText.substring(i + 1);
  const updatedConfig = beforeArray + newInstructionsBlock + afterArray;

  // Write updated config
  fs.writeFileSync(OPENCODE_CONFIG, updatedConfig, 'utf8');
  console.log(`Updated ${OPENCODE_CONFIG}`);
  console.log(`Instructions now has ${allInstructions.length} entries`);
}

main();
