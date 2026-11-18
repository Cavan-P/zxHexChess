// Texel tuning: fits an evolved bot's evaluation weights directly to game results, instead of by
// playing games between variants. For each recorded position (scripts/collectPositions.js) the
// evaluation is turned into a predicted score with a sigmoid, and the weights are nudged, one knob
// at a time, to make those predictions match how the games actually ended. It handles dozens of
// knobs far better than evolution, which only gets one noisy signal per game.
//
//   npm run tune -- [--from adaKessler] [--max 200000] [--passes 30] [--write]
//
// Without --write it only prints the tuned weights. With --write it saves them into the bot's file
// (keeping its id and Elo record), ready to be measured.
//
// The improvement loop:
//   1. npm run collect -- 2000                 positions from strong games (run in the background)
//   2. npm run tune -- --write                 fit Ada's weights to them
//   3. Lab: a short training run from Ada      evolution fine-tunes what tuning can't see
//   4. npm run match -- adaKessler adaKesslerV1 200
//   5. Better? Freeze a snapshot in the Lab, then repeat from 1 (new games, better positions).
const fs = require('fs')
const os = require('os')
const path = require('path')
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')

const DATA = process.env.TEXEL_DATA || path.join(__dirname, '../data/texel/positions.jsonl')

// Predicted White score from an evaluation (in pawns).
const sigmoid = (score, K) => 1 / (1 + Math.pow(10, -K * score / 4))

if(!isMainThread){
    // ---- Worker: holds one shard of the positions, returns its summed squared error. ----
    const { evaluateWeighted } = require('../src/ai/engine')
    const { parseFen } = require('../src/game/moves')
    const { shard, shards, max } = workerData

    // Boards share their cell objects (one per cell + piece), so 100k+ positions fit in memory.
    const canonical = new Map()
    const compact = board => board.map(c => {
        const key = c.cell * 16 + ' PNBRQKpnbrqk'.indexOf(c.piece || ' ')
        let cell = canonical.get(key)
        if(!cell){ cell = Object.freeze(c); canonical.set(key, cell) }
        return cell
    })

    const positions = []
    const lines = fs.readFileSync(DATA, 'utf8').split('\n')
    for(let i = shard; i < lines.length && i < max; i += shards){
        if(!lines[i]) continue
        const { fen, turn, r } = JSON.parse(lines[i])
        positions.push({ board: compact(parseFen(fen)), turn, r })
    }

    parentPort.on('message', ({ id, weights, K }) => {
        let sum = 0
        for(const p of positions){
            const e = sigmoid(evaluateWeighted(p.board, 'white', null, weights, p.turn), K) - p.r
            sum += e * e
        }
        parentPort.postMessage({ id, sum, count: positions.length })
    })
    parentPort.postMessage({ ready: true, count: positions.length })
    return
}

// ---- Main thread ----
const { SPEC, withNeutrals, flatten, unflatten } = require('../src/ai/genome')
const { readEvolvedBot, materializeGenome } = require('../src/ai/evolve')

const args = process.argv.slice(2)
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback }
const fromId = opt('from', 'adaKessler')
const max = +opt('max', 200000)
const maxPasses = +opt('passes', 30)
const write = args.includes('--write')

const main = async _ => {
    if(!fs.existsSync(DATA)) throw new Error(`No positions yet - run "npm run collect" first (${DATA})`)
    const source = readEvolvedBot(fromId)
    if(!source) throw new Error(`${fromId} isn't a trained bot`)
    if(source.labOnly) throw new Error(`${fromId} is a frozen snapshot - tune the original bot instead`)

    const shards = Math.max(1, Math.min(8, os.cpus().length - 1))
    const workers = Array.from({ length: shards }, (_, shard) => new Worker(__filename, { workerData: { shard, shards, max } }))
    const counts = await Promise.all(workers.map(w => new Promise(res => w.once('message', m => res(m.count)))))
    const total = counts.reduce((a, b) => a + b, 0)
    console.log(`Tuning ${source.name} on ${total.toLocaleString()} positions (${shards} threads, ${SPEC.length} knobs)`)
    if(total < 1000) console.log('Warning: very few positions - results will be noisy. Collect more first.')

    let nextId = 0
    const error = (weights, K) => {
        const id = nextId++
        return Promise.all(workers.map(w => new Promise(res => {
            const onMsg = m => { if(m.id == id){ w.off('message', onMsg); res(m.sum) } }
            w.on('message', onMsg)
            w.postMessage({ id, weights, K })
        }))).then(sums => sums.reduce((a, b) => a + b, 0) / total)
    }

    let values = flatten(withNeutrals(source.genome))

    // Scale: the K that makes the current weights' evaluations best match the results.
    let K = 1
    for(let lo = 0.05, hi = 5, i = 0; i < 25; i++){
        const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
        const [e1, e2] = await Promise.all([error(unflatten(values), m1), error(unflatten(values), m2)])
        if(e1 < e2) hi = m2; else lo = m1
        K = (lo + hi) / 2
    }
    let best = await error(unflatten(values), K)
    const startError = best
    console.log(`K = ${K.toFixed(3)}, starting error ${best.toFixed(6)}\n`)

    // Local search: try each knob a step up, then down; keep whatever lowers the error. Steps
    // halve for knobs that stopped improving; stop when every step is tiny or passes run out.
    const steps = SPEC.map(s => s.spread / 2)
    for(let pass = 1; pass <= maxPasses; pass++){
        let improved = 0
        for(let i = 0; i < SPEC.length; i++){
            let moved = false
            for(const dir of [1, -1]){
                const trial = values.slice()
                trial[i] = Math.min(SPEC[i].max, Math.max(SPEC[i].min, trial[i] + dir * steps[i]))
                if(trial[i] == values[i]) continue
                const e = await error(unflatten(trial), K)
                if(e < best){ best = e; values = trial; moved = true; break }
            }
            if(moved) improved++
            else steps[i] /= 2
        }
        console.log(`pass ${pass}: error ${best.toFixed(6)} (${improved} knobs moved)`)
        if(steps.every((st, i) => st < SPEC[i].spread / 64)) break
    }

    const tuned = unflatten(values)
    console.log(`\nError ${startError.toFixed(6)} -> ${best.toFixed(6)}\n`)
    const before = flatten(withNeutrals(source.genome))
    SPEC.forEach((s, i) => {
        if(Math.abs(values[i] - before[i]) > 1e-9) console.log(`  ${s.key.padEnd(24)} ${before[i].toFixed(4).padStart(9)} -> ${values[i].toFixed(4)}`)
    })

    if(write){
        const created = materializeGenome(tuned, { continueFrom: source, generations: 0, populationSize: source.populationSize, playDepth: source.playDepth, playMs: source.playMs })
        console.log(`\nSaved to ${path.relative(process.cwd(), created.filePath)}. Measure it: npm run match -- ${created.id} <snapshot id> 200`)
    }
    else console.log('\n(Dry run - add --write to save these weights into the bot.)')

    for(const w of workers) w.terminate()
}

main().catch(e => { console.error(e.message); process.exitCode = 1 })
