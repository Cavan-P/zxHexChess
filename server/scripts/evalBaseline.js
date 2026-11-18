// Writes test/fixtures/evalBaseline.json: evaluateWeighted's score for a fixed set of positions
// under every built-in weight preset and Ada v1's weights. test/evalBaseline.test.js checks the
// evaluator still reproduces these exactly, so new evaluation terms can never quietly change how
// an existing bot plays. Only regenerate this on purpose (it defines "unchanged").
//
//   node scripts/evalBaseline.js
const fs = require('fs')
const path = require('path')
const { GameState } = require('../src/game/rules')

// Deterministic pseudo-random numbers so the positions are always the same.
const rng = seed => _ => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

// Positions reached by random play from the start, sampled along the way.
const samplePositions = (count, seed = 42) => {
    const rand = rng(seed)
    const out = []
    while(out.length < count){
        const game = new GameState()
        for(let ply = 0; ply < 160 && !game.result && out.length < count; ply++){
            const moves = game.board().filter(c => c.color == game.turn).flatMap(c =>
                game.legalMovesFrom(game.turn, c.cell).map(to => ({ from: c.cell, to })))
            if(!moves.length) break
            const m = moves[Math.floor(rand() * moves.length)]
            game.play(game.turn, m.from, m.to, 'q')
            if(rand() < 0.15) out.push({ fen: game.fen, turn: game.turn, enPassant: game.enPassant || null })
        }
    }
    return out
}

module.exports = { samplePositions }

if(require.main == module){
    const { evaluateWeighted, PRESET_WEIGHTS } = require('../src/ai/engine')
    const { parseFen } = require('../src/game/moves')
    const { readEvolvedBot } = require('../src/ai/evolve')

    const presets = { ...PRESET_WEIGHTS, adaV1: readEvolvedBot('adaKesslerV1').genome }
    const positions = samplePositions(2000)
    const scores = {}
    for(const [name, weights] of Object.entries(presets)){
        scores[name] = positions.map(p => {
            const board = parseFen(p.fen)
            return ['white', 'black'].map(color => evaluateWeighted(board, color, p.enPassant, weights, p.turn))
        })
    }

    const file = path.join(__dirname, '../test/fixtures/evalBaseline.json')
    fs.writeFileSync(file, JSON.stringify({ presets, positions, scores }))
    console.log(`Wrote ${positions.length} positions x ${Object.keys(presets).length} presets to ${path.relative(process.cwd(), file)}`)
}
