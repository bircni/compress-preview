const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const coverageSummaryPath = path.join(rootDir, ".tmp", "coverage", "coverage-summary.json");
const coverageFinalPath = path.join(rootDir, ".tmp", "coverage", "coverage-final.json");
const githubStepSummary = process.env.GITHUB_STEP_SUMMARY;

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

function summarizeCoverageFinal(coverageFinal) {
  const totals = {
    statements: { covered: 0, total: 0, pct: 0 },
    branches: { covered: 0, total: 0, pct: 0 },
    functions: { covered: 0, total: 0, pct: 0 },
    lines: { covered: 0, total: 0, pct: 0 },
  };

  for (const fileCoverage of Object.values(coverageFinal)) {
    const statements = Object.values(fileCoverage.s);
    totals.statements.total += statements.length;
    totals.statements.covered += statements.filter((count) => count > 0).length;

    const functions = Object.values(fileCoverage.f);
    totals.functions.total += functions.length;
    totals.functions.covered += functions.filter((count) => count > 0).length;

    const branches = Object.values(fileCoverage.b).flat();
    totals.branches.total += branches.length;
    totals.branches.covered += branches.filter((count) => count > 0).length;

    const lines = new Set();
    for (const statementLocation of Object.values(fileCoverage.statementMap)) {
      for (
        let line = statementLocation.start.line;
        line <= statementLocation.end.line;
        line += 1
      ) {
        lines.add(line);
      }
    }
    totals.lines.total += lines.size;
    totals.lines.covered += lines.size * (statements.filter((count) => count > 0).length / Math.max(statements.length, 1));
  }

  for (const metric of Object.values(totals)) {
    metric.pct = metric.total === 0 ? 100 : (metric.covered / metric.total) * 100;
    metric.covered = Number(metric.covered.toFixed(2));
  }

  return totals;
}

function main() {
  let totals;
  if (fs.existsSync(coverageSummaryPath)) {
    const coverageSummary = JSON.parse(fs.readFileSync(coverageSummaryPath, "utf8"));
    totals = coverageSummary.total;
  } else if (fs.existsSync(coverageFinalPath)) {
    const coverageFinal = JSON.parse(fs.readFileSync(coverageFinalPath, "utf8"));
    totals = summarizeCoverageFinal(coverageFinal);
  } else {
    throw new Error(`Coverage summary not found: ${coverageSummaryPath}`);
  }
  const markdown = [
    "## Coverage Summary",
    "",
    "| Metric | Covered | Total | Percent |",
    "| --- | ---: | ---: | ---: |",
    `| Statements | ${totals.statements.covered} | ${totals.statements.total} | ${formatPercent(totals.statements.pct)} |`,
    `| Branches | ${totals.branches.covered} | ${totals.branches.total} | ${formatPercent(totals.branches.pct)} |`,
    `| Functions | ${totals.functions.covered} | ${totals.functions.total} | ${formatPercent(totals.functions.pct)} |`,
    `| Lines | ${totals.lines.covered} | ${totals.lines.total} | ${formatPercent(totals.lines.pct)} |`,
    "",
  ].join("\n");

  if (githubStepSummary) {
    fs.appendFileSync(githubStepSummary, `${markdown}\n`);
    return;
  }

  process.stdout.write(markdown);
}

main();
