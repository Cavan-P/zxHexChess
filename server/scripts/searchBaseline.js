// A fingerprint of what the search does, for checking that speed work changes nothing else.
//
// Runs fixed-depth searches (no time limit, no randomness) on a fixed set of positions and records,
// for each one, the move found and how many positions were evaluated along the way. An optimization
// that only makes the engine faster (a new board representation, hashing, make/unmake) must give the
// exact same move AND the exact same evaluation count - any difference means the search tree changed.
//
//   node scripts/searchBaseline.js           # compare against test/fixtures/searchBaseline.json
//   node scripts/searchBaseline.js --write   # record a new baseline (only when a change is meant to alter the search)
//
// test/searchBaseline.test.js runs the comparison as part of npm test.
const fs = require('fs')
const path = require('path')
const { iterativeDeepening, evaluateWeighted, searchStats, PRESET_WEIGHTS } = require('../src/ai/engine')
const { parseFen } = require('../src/game/moves')
const { readEvolvedBot } = require('../src/ai/evolve')
const { samplePositions } = require('./evalBaseline')

const FIXTURE = path.join(__dirname, '../test/fixtures/searchBaseline.json')
const TEXEL = path.join(__dirname, '../data/texel/positions.jsonl')

// Half random-play positions (odd, tactical, lots of hanging pieces), half from real strong games.
// The strong-game positions are stored in the fixture itself, so the baseline doesn't depend on the
// texel data (which is gitignored and gets regenerated).
const pickPositions = _ => {
    const random = samplePositions(12, 1234).map(p => ({ ...p, source: 'random' }))
    const lines = fs.readFileSync(TEXEL, 'utf8').split('\n').filter(Boolean)
    const strong = Array.from({ length: 12 }, (_, i) => JSON.parse(lines[Math.floor((i + 0.5) * lines.length / 12)]))
        .map(p => ({ fen: p.fen, turn: p.turn, enPassant: null, source: 'game' }))
    return [...random, ...strong]
}

// Two setups that cover both evaluation paths and both search modes:
//   ada    - a frozen Ada snapshot (extended evaluation terms), searched like a strong bot (check
//            extensions, late move reductions, quiescence)
//   master - the hand-made master preset, plain alpha-beta + quiescence
const SETUPS = {
    ada: { depth: 4, weights: _ => readEvolvedBot('adaKesslerV4').genome, opts: w => ({ variety: 0, extendChecks: true, prune: 'lmr', checkBonus: w.checkBonus }) },
    master: { depth: 3, weights: _ => PRESET_WEIGHTS.master, opts: _ => ({ variety: 0, extendChecks: false, prune: false }) }
}

// The search shuffles root moves with Math.random (so ties are broken at random in real games).
// For a repeatable fingerprint, Math.random is swapped for a seeded generator, restarted for every
// search. An optimized engine must still draw random numbers the same way to match - which it will,
// as long as the root shuffle is left alone.
const seeded = seed => _ => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296

const run = positions => {
    const results = {}
    const realRandom = Math.random
    try {
        for(const [name, setup] of Object.entries(SETUPS)){
            const weights = setup.weights()
            results[name] = positions.map((p, i) => {
                // `evals` counts evaluations the search asked for (cached or not), so it fingerprints
                // the search tree; `computed` is how many actually ran after the evaluation cache.
                const evaluate = (b, c, ep, tm) => evaluateWeighted(b, c, ep, weights, tm)
                const before = { ...searchStats }
                Math.random = seeded(1000 + i)
                const t = Date.now()
                const move = iterativeDeepening(parseFen(p.fen), p.turn, p.enPassant, setup.depth, 1e9, evaluate, null, [], true, 0, setup.opts(weights))
                const evals = searchStats.evalRequests - before.evalRequests
                return { move: move ? `${move.from}-${move.to}` : null, evals, computed: evals - (searchStats.evalCacheHits - before.evalCacheHits), ms: Date.now() - t }
            })
        }
    }
    finally { Math.random = realRandom }
    return results
}

const compare = (baseline, results) => {
    const diffs = []
    for(const name of Object.keys(SETUPS)){
        baseline.results[name].forEach((want, i) => {
            const got = results[name][i]
            if(got.move != want.move || got.evals != want.evals) diffs.push({ setup: name, position: i, want: { move: want.move, evals: want.evals }, got: { move: got.move, evals: got.evals } })
        })
    }
    return diffs
}

module.exports = { run, compare, FIXTURE }

if(require.main == module){
    if(process.argv.includes('--write')){
        const positions = pickPositions()
        const results = run(positions)
        const strip = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.map(({ move, evals }) => ({ move, evals }))]))
        fs.writeFileSync(FIXTURE, JSON.stringify({ positions, results: strip(results) }, null, 1) + '\n')
        for(const [name, rs] of Object.entries(results)) console.log(`${name}: ${rs.reduce((a, r) => a + r.evals, 0).toLocaleString()} evals in ${rs.reduce((a, r) => a + r.ms, 0)} ms`)
        console.log(`Wrote ${FIXTURE}`)
    }
    else {
        const baseline = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
        const results = run(baseline.positions)
        const diffs = compare(baseline, results)
        for(const [name, rs] of Object.entries(results)){
            const evals = rs.reduce((a, r) => a + r.evals, 0), computed = rs.reduce((a, r) => a + r.computed, 0)
            console.log(`${name}: ${evals.toLocaleString()} evals (${computed.toLocaleString()} computed, ${Math.round(100 * (1 - computed / evals))}% from cache) in ${rs.reduce((a, r) => a + r.ms, 0)} ms`)
        }
        if(diffs.length){ console.log(`\n${diffs.length} position(s) differ from the baseline:`); console.table(diffs.map(d => ({ setup: d.setup, position: d.position, want: `${d.want.move} (${d.want.evals})`, got: `${d.got.move} (${d.got.evals})` }))); process.exit(1) }
        console.log('Search matches the baseline exactly.')
    }
}
