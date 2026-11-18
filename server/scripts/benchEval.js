// Speed check for the evaluator and the search: evaluations per second over a fixed position set,
// and the time a fixed-depth search takes over 20 positions.
//
//   node scripts/benchEval.js
const { evaluateWeighted, searchBot, PRESET_WEIGHTS } = require('../src/ai/engine')
const { parseFen } = require('../src/game/moves')
const { readEvolvedBot } = require('../src/ai/evolve')
const { samplePositions } = require('./evalBaseline')

const weightSets = { master: PRESET_WEIGHTS.master, adaV1: readEvolvedBot('adaKesslerV1').genome }
const ada = readEvolvedBot('adaKessler')
if(ada) weightSets.ada = ada.genome
// Every knob switched on (midpoint of its range), to see what the extended evaluation costs.
const { SPEC, unflatten } = require('../src/ai/genome')
weightSets.allKnobs = unflatten(SPEC.map(s => (s.min + s.max) / 2))

const positions = samplePositions(500, 7)
const boards = positions.map(p => parseFen(p.fen))

for(const [name, weights] of Object.entries(weightSets)){
    // Evaluations per second (warm up first).
    for(let r = 0; r < 3; r++) boards.forEach((b, i) => evaluateWeighted(b, 'white', null, weights, positions[i].turn))
    let n = 0
    const t0 = process.hrtime.bigint()
    while(Number(process.hrtime.bigint() - t0) < 2e9){
        boards.forEach((b, i) => evaluateWeighted(b, 'white', null, weights, positions[i].turn))
        n += boards.length
    }
    const evalsPerSec = n / (Number(process.hrtime.bigint() - t0) / 1e9)

    // Fixed-depth searches on the first 20 positions: total time.
    let calls = 0
    const counting = (b, c, ep, tm) => { calls++; return evaluateWeighted(b, c, ep, weights, tm) }
    const t1 = Date.now()
    positions.slice(0, 20).forEach(p => searchBot({ ...p, maxDepth: 3, timeLimitMs: 60000, quiescence: true, evaluate: counting }))
    const searchMs = Date.now() - t1

    console.log(`${name.padEnd(8)} ${Math.round(evalsPerSec).toLocaleString().padStart(10)} evals/s   search: ${searchMs} ms, ${calls.toLocaleString()} evals, ${Math.round(calls / searchMs * 1000).toLocaleString()} evals/s`)
}
