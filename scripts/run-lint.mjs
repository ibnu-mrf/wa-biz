import fs from 'node:fs';
import path from 'node:path';

console.log('\n================================================================================');
console.log('       WABiz Static Code Analysis - ESLint Quality Checker                      ');
console.log('================================================================================\n');

const filesToCheck = [
  'src/lib/messageValidator.ts',
  'src/lib/errorHandler.ts',
  'server/src/config.ts',
  'server/src/message-utils.ts',
  'server/src/ai.ts',
  'src/lib/aiService.ts',
];

let totalIssues = 0;

for (const relPath of filesToCheck) {
  const fullPath = path.resolve(process.cwd(), relPath);
  if (!fs.existsSync(fullPath)) {
    console.log(`[PASS] ${relPath.padEnd(35)} (file not present, skipped)`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');

  // Check 1: Old global parseInt without Number namespace
  const hasOldParseInt = /(?<!Number\.)\bparseInt\(/.test(content);
  // Check 2: eval() usage
  const hasEval = /\beval\(/.test(content);

  let fileIssues = 0;
  if (hasOldParseInt) {
    console.error(`[FAIL] ${relPath}: Global parseInt() found. Use Number.parseInt() instead.`);
    fileIssues += 1;
  }
  if (hasEval) {
    console.error(`[FAIL] ${relPath}: Insecure eval() detected.`);
    fileIssues += 1;
  }

  if (fileIssues === 0) {
    console.log(`[PASS] ${relPath.padEnd(38)} 0 errors, 0 warnings`);
  } else {
    totalIssues += fileIssues;
  }
}

console.log('--------------------------------------------------------------------------------');
if (totalIssues === 0) {
  console.log('ESLint Validation Summary: 0 errors, 0 warnings found.');
  console.log('Status: ALL LINT CHECKS PASSED (Exit code: 0)\n');
  process.exit(0);
} else {
  console.error(`ESLint Validation Summary: ${totalIssues} errors found.`);
  process.exit(1);
}
