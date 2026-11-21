const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const { run, compare, FIXTURE } = require('../scripts/searchBaseline')

// Speed work on the engine must not change what it finds. If this fails after a change that was
// meant to alter the search (new pruning, new eval term), re-record with
// `node scripts/searchBaseline.js --write`; if the change was only meant to be faster, it's a bug.
test('search finds the same moves with the same tree as the recorded baseline', _ => {
    const baseline = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
    const diffs = compare(baseline, run(baseline.positions))
    assert.deepStrictEqual(diffs, [], `${diffs.length} position(s) differ - see node scripts/searchBaseline.js`)
})
