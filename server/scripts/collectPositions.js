// Collects training positions for Texel tuning (scripts/texelTune.js): plays fast games between
// strong evaluation genomes and records every quiet position with how the game ended.
//
//   npm run collect -- [games=500] [--depth 4] [--ms 200]
//
// Appends to data/texel/positions.jsonl, one { fen, turn, r } per line, where r is White's score
// (1 win, 0.5 draw, 0 loss). Run it in the background for as long as you like - more positions
// make tuning more reliable (aim for 100k+); each finished game is saved as it ends.
//
// Players: Ada and her frozen snapshots, the master/positional presets the top hand-written bots
// use, and mutated variants of Ada so the games cover a wider range of positions. Depth 4+ turns on
// opening variety, so games don't repeat. Skipped: the first 8 plies (book-like openings),
// positions in check, and positions right after a capture (not quiet - a recapture is pending).
const fs = require('fs')
const path = require('path')
const { playTrainingGame, shutdown, POOL_SIZE } = require('../src/ai/trainPool')
const { PRESET_WEIGHTS, kingAttacked } = require('../src/ai/engine')
const { readEvolvedBot } = require('../src/ai/evolve')
const { mutate } = require('../src/ai/genome')
const { parseFen } = require('../src/game/moves')

const args = process.argv.slice(2)
const flag = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? +args[i + 1] : fallback }
const games = Math.max(1, Math.floor(+args.find(a => /^\d+$/.test(a)) || 500))
const depth = flag('depth', 4)
const timeMs = flag('ms', 200)

const OUT = process.env.TEXEL_DATA || path.join(__dirname, '../data/texel/positions.jsonl')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const evolved = fs.readdirSync(path.join(__dirname, '../src/ai/strategies/evolved'))
    .map(f => readEvolvedBot(f.replace(/\.js$/, ''))).filter(Boolean)
const ada = evolved.find(b => b.id == 'adaKessler')
const players = [
    ...evolved.map(b => ({ name: b.name, genome: b.genome })),
    { name: 'master preset', genome: PRESET_WEIGHTS.master },
    { name: 'positional preset', genome: PRESET_WEIGHTS.positional },
    ...(ada ? Array.from({ length: 4 }, (_, i) => ({ name: `Ada variant ${i + 1}`, genome: mutate(ada.genome, 0.5) })) : [])
]

const SKIP_PLIES = 8
const pieceCount = fen => (fen.split(' ')[0].match(/[a-zA-Z]/g) || []).length

let done = 0, saved = 0
const started = Date.now()

const playOne = async g => {
    const a = players[Math.floor(Math.random() * players.length)]
    let b
    do { b = players[Math.floor(Math.random() * players.length)] } while(b == a && players.length > 1)
    const [white, black] = g % 2 == 0 ? [a, b] : [b, a]

    const moves = []
    const { result, plies } = await playTrainingGame({
        white: white.genome, black: black.genome, depth, timeMs, quiescence: true, maxPlies: 300, noProgressLimit: 100
    }, m => moves.push(m))

    const r = !result.winner ? 0.5 : result.winner == 'white' ? 1 : 0
    const lines = []
    let prevCount = null
    for(const m of moves){
        const count = pieceCount(m.fen)
        const captured = prevCount != null && count < prevCount
        prevCount = count
        if(m.ply <= SKIP_PLIES || captured) continue
        const turn = m.ply % 2 == 0 ? 'white' : 'black'     // White moves first: after an even ply it's White's turn
        if(kingAttacked(parseFen(m.fen), turn)) continue
        lines.push(JSON.stringify({ fen: m.fen, turn, r }))
    }
    if(lines.length) fs.appendFileSync(OUT, lines.join('\n') + '\n')
    saved += lines.length
    done++

    const rate = done / ((Date.now() - started) / 3600000)
    console.log(`[${done}/${games}] ${white.name} vs ${black.name}: ${result.winner || 'draw'} (${result.reason}, ${plies} plies) +${lines.length} positions · ${saved} saved · ~${Math.round(rate)} games/h`)
}

const main = async _ => {
    console.log(`Collecting from ${games} games (depth ${depth}, ${timeMs} ms/move, ${POOL_SIZE} at a time) into ${path.relative(process.cwd(), OUT)}`)
    console.log(`Players: ${players.map(p => p.name).join(', ')}\n`)
    await Promise.all(Array.from({ length: games }, (_, g) => playOne(g)))
    const total = fs.readFileSync(OUT, 'utf8').split('\n').filter(Boolean).length
    console.log(`\nDone: ${saved} new positions, ${total} in the file.`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(shutdown)
