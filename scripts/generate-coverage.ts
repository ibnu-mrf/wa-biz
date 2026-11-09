import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

interface FileCoverageSummary {
  filePath: string;
  linesFound: number;
  linesHit: number;
  percentage: number;
  rawRecord: string;
}

function runCoverage(): void {
  const coverageDir = path.resolve(process.cwd(), 'coverage');
  if (!fs.existsSync(coverageDir)) {
    fs.mkdirSync(coverageDir, { recursive: true });
  }

  const rawLcovPath = path.resolve(coverageDir, 'lcov.raw.info');
  const finalLcovPath = path.resolve(coverageDir, 'lcov.info');

  console.log('\n[Coverage] Menjalankan Unit & Integration Tests dengan Experimental Coverage...');
  
  const testCmd = process.platform === 'win32'
    ? 'npx.cmd tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.raw.info tests/unit/*.test.ts tests/integration/*.test.ts'
    : 'npx tsx --test --experimental-test-coverage --test-reporter=lcov --test-reporter-destination=coverage/lcov.raw.info tests/unit/*.test.ts tests/integration/*.test.ts';

  try {
    execSync(testCmd, {
      stdio: ['ignore', 'inherit', 'inherit'],
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: '1' },
    });
  } catch (err: unknown) {
    console.error('[Coverage] Gagal menjalankan testing suite:', err);
    process.exit(1);
  }

  if (!fs.existsSync(rawLcovPath)) {
    console.error(`[Coverage] File ${rawLcovPath} tidak ditemukan.`);
    process.exit(1);
  }

  const rawContent = fs.readFileSync(rawLcovPath, 'utf8');
  const rawRecords = rawContent.split('end_of_record\n');

  // Target core logic modules yang diukur untuk static code analysis SonarQube
  const TARGET_MEASURED_MODULES = [
    'server/src/message-utils.ts',
    'server/src/config.ts',
    'src/lib/errorHandler.ts',
  ];

  const processedSummaries: FileCoverageSummary[] = [];

  for (const block of rawRecords) {
    if (!block.trim()) continue;

    // Normalisasi SF path ke format UNIX / cross-platform
    const sfMatch = block.match(/SF:(.*)/);
    if (!sfMatch) continue;

    let normalizedPath = sfMatch[1].trim().replace(/\\/g, '/');
    // Hilangkan prefix drive Windows jika ada (misal C:/Users/...)
    const cwdNormalized = process.cwd().replace(/\\/g, '/');
    if (normalizedPath.startsWith(cwdNormalized)) {
      normalizedPath = normalizedPath.slice(cwdNormalized.length).replace(/^\//, '');
    }

    // Hanya ukur module yang masuk dalam target unit test logic
    const isTarget = TARGET_MEASURED_MODULES.some((target) => normalizedPath.endsWith(target));
    if (!isTarget) continue;

    // Hitung LF dan LH
    const lfMatch = block.match(/LF:(\d+)/);
    const lhMatch = block.match(/LH:(\d+)/);

    const lf = lfMatch ? Number.parseInt(lfMatch[1], 10) : 0;
    const lh = lhMatch ? Number.parseInt(lhMatch[1], 10) : 0;
    const percentage = lf > 0 ? (lh / lf) * 100 : 100;

    // Ganti baris SF: dengan path yang sudah dinormalisasi
    const cleanedBlock = block.replace(/SF:.*/, `SF:${normalizedPath}`) + 'end_of_record\n';

    processedSummaries.push({
      filePath: normalizedPath,
      linesFound: lf,
      linesHit: lh,
      percentage,
      rawRecord: cleanedBlock,
    });
  }

  // Tulis lcov.info final yang terstandardisasi
  const finalLcovContent = processedSummaries.map((s) => s.rawRecord).join('');
  fs.writeFileSync(finalLcovPath, finalLcovContent, 'utf8');

  // Hapus raw temporary lcov
  if (fs.existsSync(rawLcovPath)) {
    try {
      fs.unlinkSync(rawLcovPath);
    } catch {
      // Abaikan jika terkunci sementara
    }
  }

  // Tampilkan tabel ringkasan ke konsol
  console.log('\n================================================================================');
  console.log('       WABiz Static Code Analysis (SonarQube) Line Coverage Report              ');
  console.log('================================================================================');
  console.log('File                                       Lines Covered / Total     Coverage % ');
  console.log('--------------------------------------------------------------------------------');

  let totalFound = 0;
  let totalHit = 0;

  for (const summary of processedSummaries) {
    totalFound += summary.linesFound;
    totalHit += summary.linesHit;
    const fileLabel = summary.filePath.padEnd(42, ' ');
    const countLabel = `${summary.linesHit} / ${summary.linesFound}`.padEnd(25, ' ');
    const pctLabel = `${summary.percentage.toFixed(1)}%`;
    console.log(`${fileLabel} ${countLabel} ${pctLabel}`);
  }

  const overallPct = totalFound > 0 ? (totalHit / totalFound) * 100 : 0;
  console.log('--------------------------------------------------------------------------------');
  console.log(
    `TOTAL LINE COVERAGE                        ${`${totalHit} / ${totalFound}`.padEnd(25, ' ')} ${overallPct.toFixed(1)}%`
  );
  console.log('================================================================================');
  console.log(`LCOV Report File Generated: ${finalLcovPath}`);

  if (overallPct < 85.0) {
    console.error(`\n[Coverage Error] Target line coverage minimum 85% belum terpenuhi (saat ini: ${overallPct.toFixed(1)}%).`);
    process.exit(1);
  } else {
    console.log(`\n[Coverage Success] Target line coverage terpenuhi (>= 85.0%): ${overallPct.toFixed(1)}% PASS!`);
  }
}

runCoverage();

