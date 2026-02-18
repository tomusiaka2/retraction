import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { buildAdjustedOutput } from '../src/output';
import { adjustGcodeLines } from '../src/adjuster';

function readLines(file: string): string[] {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/);
}

(function run() {
  const fixtureDir = path.resolve(__dirname, 'fixtures');
  const inputPath = path.join(__dirname, 'retraction-test.gcode');
  const expectedPath = path.join(fixtureDir, 'retraction-test.expected.gcode');

  const inputLines = readLines(inputPath);
  const expectedLines = readLines(expectedPath);

  const build = buildAdjustedOutput(inputLines, {
    minRetract: 2,
    maxRetract: 5,
    minTravel: 10,
    maxTravel: 100,
    inputName: path.basename(inputPath),
  });

  const actualLines = build.outputLines;

  try {
    assert.deepStrictEqual(actualLines, expectedLines);
    console.log('PASS retraction-test.gcode matches expected output');
  } catch (err) {
    console.error('FAIL retraction-test.gcode differs from expected');
    throw err;
  }

  // Verify all retract/deretract segments conserve extrusion length
  const eRe = /E(-?(?:\d+(?:\.\d+)?|\.\d+))/i;
  const isMoveLine = (line: string) => /^G0?1\s/i.test(line.trim());
  const segments: Array<{ neg: number; pos: number }> = [];
  let negSum = 0;
  expectedLines.forEach((line) => {
    if (!isMoveLine(line)) return;
    const m = eRe.exec(line);
    if (!m) return;
    const val = Number(m[1]);
    if (Number.isNaN(val)) return;

    if (val < 0) {
      negSum += Math.abs(val);
    } else if (val > 0 && negSum > 0) {
      segments.push({ neg: negSum, pos: val });
      negSum = 0;
    }
  });

  assert.ok(segments.length > 0, 'Expected at least one retract segment');
  segments.forEach(({ neg, pos }, idx) => {
    const diff = Math.abs(neg - pos);
    assert.ok(diff < 1e-3, `Segment ${idx + 1} mismatch: retract ${neg} vs deretract ${pos}`);
  });
  console.log(`PASS ${segments.length} retract/deretract segments conserve length`);

    const inlineInput = [
      'G1 X0 Y0 F6000',
      'G1 E-5.00000 F1800',
      'G1 X110 Y0 F7200',
      'G1 E5.00000 F1800',
    ];

    const inlineAdjusted = adjustGcodeLines(inlineInput, {
      minRetract: 2,
      maxRetract: 5,
      minTravel: 10,
      maxTravel: 100,
      decimalPlaces: 5,
      inlineDuringTravel: true,
    });

    assert.deepStrictEqual(inlineAdjusted, [
      'G1 X0 Y0 F6000',
      'G1 E-2.00000 F1800',
      'G1 X110 Y0 F7200 E-3.00000',
      'G1 E5.00000 F1800',
    ]);
    console.log('PASS inline retraction keeps travel single move with remaining retract');

    const inlineWithZ = adjustGcodeLines([
      'G1 X0 Y0 F6000',
      'G1 E-5.00000 F900',
      'G1 Z1.00 F7200',
      'G1 X50.0 Y0.0 F7200',
      'G1 E5.00000 F900',
    ], {
      minRetract: 2,
      maxRetract: 5,
      minTravel: 10,
      maxTravel: 100,
      decimalPlaces: 5,
      inlineDuringTravel: true,
    });

    assert.deepStrictEqual(inlineWithZ, [
      'G1 X0 Y0 F6000',
      'G1 E-2.00000 F900',
      'G1 Z1.00 F7200',
      'G1 X50.0 Y0.0 F7200 E-1.33333',
      'G1 E3.33333 F900',
    ]);
    console.log('PASS inline retract skips Z travel and applies to next XY move');

    const inlineWithWipe = adjustGcodeLines([
      'G1 X0 Y0 F6000',
      'G1 E-2.50000 F1500',
      ';WIPE_START',
      'G1 X0.5 Y0 F3000 E-0.50000',
      ';WIPE_END',
      'G1 X30 Y0 F7200',
      'G1 E5.00000 F1500',
    ], {
      minRetract: 2,
      maxRetract: 5,
      minTravel: 10,
      maxTravel: 100,
      decimalPlaces: 5,
      inlineDuringTravel: true,
    });

    assert.deepStrictEqual(inlineWithWipe, [
      'G1 X0 Y0 F6000',
      'G1 E-1.50000 F1500',
      ';WIPE_START',
      'G1 X0.5 Y0 F3000 E-0.50000',
      ';WIPE_END',
      'G1 X30 Y0 F7200 E-0.65000',
      'G1 E2.65000 F1500',
    ]);
    console.log('PASS inline retract respects wipes and inlines remainder onto travel');

    const inlineAtMin = adjustGcodeLines([
      'G1 X0 Y0 F6000',
      'G1 E-5.00000 F1500',
      'G1 X10 Y0 F7200',
      'G1 E5.00000 F1500',
    ], {
      minRetract: 3,
      maxRetract: 6,
      minTravel: 10,
      maxTravel: 100,
      decimalPlaces: 5,
      inlineDuringTravel: true,
    });

    assert.deepStrictEqual(inlineAtMin, [
      'G1 X0 Y0 F6000',
      'G1 E-3.00000 F1500',
      'G1 X10 Y0 F7200',
      'G1 E3.00000 F1500',
    ]);
    console.log('PASS inline retract stays stationary when target equals min');

    const inlineFixture = buildAdjustedOutput(inputLines, {
      minRetract: 2,
      maxRetract: 5,
      minTravel: 10,
      maxTravel: 100,
      inlineDuringTravel: true,
      inputName: path.basename(inputPath),
    }).outputLines;

    const layer2Idx = inlineFixture.indexOf('M117 Layer number: 2');
    assert.ok(layer2Idx >= 0, 'Layer 2 marker not found in inline fixture');
    const wipeEndIdx = inlineFixture.indexOf(';WIPE_END', layer2Idx);
    assert.ok(wipeEndIdx > layer2Idx, 'WIPE_END not found after layer 2');
    const travelWithRetractIdx = inlineFixture.findIndex((line, idx) => idx > wipeEndIdx && /E-/.test(line) && /X/.test(line));
    assert.ok(travelWithRetractIdx > wipeEndIdx, 'Travel with inline retract not found after wipe');
    assert.strictEqual(inlineFixture[travelWithRetractIdx], 'G1 X169.456 Y110.925 E-3.00000');
    assert.strictEqual(inlineFixture[travelWithRetractIdx + 1], 'G1 E5.00000 F360');
    console.log('PASS inline fixture uses min retract lead and inlines remainder on travel after wipe');

    const noWipePath = path.join(__dirname, 'retraction-test-no-wipe.gcode');
    const noWipeExpectedPath = path.join(path.dirname(__dirname), 'test', 'fixtures', 'retraction-test-no-wipe.expected.gcode');
    const noWipeLines = readLines(noWipePath);
    const noWipeExpected = readLines(noWipeExpectedPath);
    const noWipeBuild = buildAdjustedOutput(noWipeLines, {
      minRetract: 2,
      maxRetract: 5,
      minTravel: 10,
      maxTravel: 100,
      decimalPlaces: 5,
      inlineDuringTravel: true,
      inputName: path.basename(noWipePath),
    });

    assert.deepStrictEqual(noWipeBuild.outputLines, noWipeExpected);
    console.log('PASS retraction-test-no-wipe.gcode matches expected output');
})();
