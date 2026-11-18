const test = require('node:test')
const assert = require('node:assert')
const { evaluateWeighted } = require('../src/ai/engine')
const { parseFen } = require('../src/game/moves')
const { presets, positions, scores } = require('./fixtures/evalBaseline.json')

// Every hand-written bot and Ada v1 must evaluate exactly as they did before the evaluator gained
// new terms (see scripts/evalBaseline.js). New terms are only switched on by weights that set them.
test('existing weight presets evaluate exactly as the recorded baseline', _ => {
    for(const [name, weights] of Object.entries(presets)){
        positions.forEach((p, i) => {
            const board = parseFen(p.fen)
            ;['white', 'black'].forEach((color, c) => {
                const got = evaluateWeighted(board, color, p.enPassant, weights, p.turn)
                assert.ok(Math.abs(got - scores[name][i][c]) < 1e-9, `${name} changed on ${p.fen} (${color}): ${scores[name][i][c]} -> ${got}`)
            })
        })
    }
})
