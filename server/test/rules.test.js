const test = require('node:test')
const assert = require('node:assert')
const { GameState } = require('../src/game/rules')
const { cellName, boardToFen, promotionCells, NUM_CELLS } = require('../src/game/moves')

const cellOf = name => [...Array(NUM_CELLS).keys()].find(i => cellName(i) == name)

// Builds a FEN from { a5: 'P', g1: 'K', ... }
const position = pieces => boardToFen([...Array(NUM_CELLS).keys()].map(i => ({
    piece: Object.entries(pieces).find(([name]) => cellOf(name) == i)?.[1] || ''
})))

test('promotion zone is the full far edge, corners included', _ => {
    assert.deepStrictEqual(promotionCells.white.map(cellName).sort(), ['a6', 'b7', 'c8', 'd9', 'e10', 'f11', 'g10', 'h9', 'i8', 'k7', 'l6'].sort())
    assert.deepStrictEqual(promotionCells.black.map(cellName).sort(), ['a1', 'b1', 'c1', 'd1', 'e1', 'f1', 'g1', 'h1', 'i1', 'k1', 'l1'].sort())
})

test('a pawn reaching a corner cell must choose a valid promotion piece', _ => {
    const game = new GameState({ fen: position({ a5: 'P', g1: 'K', g10: 'k' }) })
    const [from, to] = [cellOf('a5'), cellOf('a6')]

    assert.strictEqual(game.play('white', from, to).needsPromotion, true)
    assert.strictEqual(game.play('white', from, to, 'k').ok, false)
    assert.strictEqual(game.play('white', from, to, undefined).ok, false)

    const res = game.play('white', from, to, 'q')
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.move.notation, 'a5-a6=Q')
})

test('rejects moves out of turn, of the wrong color, or with garbage input', _ => {
    const game = new GameState()
    assert.strictEqual(game.play('black', cellOf('f7'), cellOf('f6')).ok, false)
    assert.strictEqual(game.play('white', 'x', undefined).ok, false)
    assert.strictEqual(game.play('white', 999, -1).ok, false)
    assert.strictEqual(game.play('white', cellOf('f7'), cellOf('f6')).ok, false)
    assert.strictEqual(game.play('white', cellOf('f5'), cellOf('f6')).ok, true)
})

test('stalemate is a ¾ win for the stalemating side', _ => {
    const game = new GameState({ fen: '5k92BR96K4N993P3PP7P1P95' })
    game.play('white', cellOf('f7'), cellOf('h6'))
    assert.deepStrictEqual(game.result, { winner: 'white', reason: 'stalemate', score: '¾-¼' })
})

test('threefold repetition draws', _ => {
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', a1: 'R', l11: 'r' }) })
    const shuffle = [['white', 'g1', 'g2'], ['black', 'g10', 'g9'], ['white', 'g2', 'g1'], ['black', 'g9', 'g10']]

    for(let i = 0; i < 2; i++){
        for(const [color, from, to] of shuffle) assert.ok(game.play(color, cellOf(from), cellOf(to)).ok)
    }

    assert.strictEqual(game.result?.reason, 'threefold repetition')
})

test('insufficient material follows Gliński geometry, not square-board rules', _ => {
    const afterQuietMove = pieces => {
        const game = new GameState({ fen: position({ g1: 'K', g10: 'k', ...pieces }) })
        game.play('white', cellOf('g1'), cellOf('g2'))
        return game.result?.reason || null
    }

    // Dead draws: only middle-shade bishops (f3/f9 shade, same as the centre f6) besides the kings.
    assert.strictEqual(afterQuietMove({}), 'insufficient material')
    assert.strictEqual(afterQuietMove({ f3: 'B' }), 'insufficient material')
    assert.strictEqual(afterQuietMove({ f3: 'B', f9: 'b' }), 'insufficient material')
    assert.strictEqual(afterQuietMove({ f3: 'B', f6: 'B' }), 'insufficient material')

    // Mate is still possible (a corner king has only five moves), so play goes on.
    assert.strictEqual(afterQuietMove({ c3: 'N' }), null)
    assert.strictEqual(afterQuietMove({ f2: 'B' }), null)      // dark-shade bishop
    assert.strictEqual(afterQuietMove({ f1: 'B' }), null)      // light-shade bishop
    assert.strictEqual(afterQuietMove({ f3: 'B', a4: 'p' }), null)
})

test('a lone king really can be mated by king + knight and king + light/dark bishop', _ => {
    const { getGameStatus, parseFen } = require('../src/game/moves')
    for(const extra of [{ d8: 'N' }, { e9: 'B' }]){
        const board = parseFen(position({ f11: 'k', f9: 'K', ...extra }))
        assert.strictEqual(getGameStatus(board, 'black', null), 'checkmate')
    }
})

test('50-move rule draws after 100 quiet plies', _ => {
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', a1: 'R', l11: 'r' }) })
    game.halfmoveClock = 99
    game.play('white', cellOf('a1'), cellOf('a2'))
    assert.strictEqual(game.result?.reason, '50-move rule')
})
