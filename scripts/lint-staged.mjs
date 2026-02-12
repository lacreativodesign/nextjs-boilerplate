import { execSync } from 'node:child_process';

/**
 * Returns staged files eligible for linting/formatting.
 * @returns {string[]}
 */
function getStagedFiles() {
  const output = execSync('git diff --cached --name-only --diff-filter=ACMR', {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString()
    .trim();

  if (!output) {
    return [];
  }

  return output.split('\n').filter(Boolean);
}

/**
 * Runs command only when there are matching files.
 * @param {string} command
 * @param {string[]} files
 */
function run(command, files) {
  if (!files.length) {
    return;
  }

  execSync(`${command} ${files.map((file) => `'${file}'`).join(' ')}`, { stdio: 'inherit' });
}

function main() {
  const staged = getStagedFiles();
  const codeFiles = staged.filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file));
  const formatFiles = staged.filter((file) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css)$/.test(file));

  run('npx eslint --max-warnings=0', codeFiles);
  run('npx prettier --check', formatFiles);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
