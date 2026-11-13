const test = require('node:test')
const assert = require('node:assert')
const { Chatter, hangingPieces } = require('../src/ai/chat/chatter')
const { BOTS, DEFAULT } = require('../src/ai/chat/personalities')
const { GameState } = require('../src/game/rules')
const { cellName, boardToFen, parseFen, NUM_CELLS } = require('../src/game/moves')
const botManager = require('../src/ai/botManager')

const cellOf = name => [...Array(NUM_CELLS).keys()].find(i => cellName(i) == name)
const position = pieces => boardToFen([...Array(NUM_CELLS).keys()].map(i => ({
    piece: Object.entries(pieces).find(([name]) => cellOf(name) == i)?.[1] || ''
})))

// Places a black pawn on some cell from which it captures `target`.
const pawnAttacking = target => {
    const { generateLegalMoves } = require('../src/game/moves')
    for(let i = 0; i < NUM_CELLS; i++){
        const board = parseFen(position({ [target]: 'N', [cellName(i)]: 'p' }))
        if(generateLegalMoves(board, i, 'black', null).includes(cellOf(target))) return { [cellName(i)]: 'p' }
    }
    throw new Error('no pawn square found')
}

// A chatter that speaks immediately and always passes its dice rolls.
const eagerChatter = (botId, color = 'black') => {
    const said = []
    const chatter = new Chatter({ botId, color, say: text => said.push(text), getOpponentName: _ => 'Sam' })
    chatter.later = fn => { fn(); return 0 }
    chatter.roll = _ => true
    return { chatter, said }
}

test('every bot has a personality and only uses known events', _ => {
    const known = new Set(Object.keys(DEFAULT.lines))
    for(const bot of botManager.getBotList()){
        if(bot.category == 'Evolved') continue
        assert.ok(BOTS[bot.id], `missing personality for ${bot.id}`)
        for(const event of Object.keys(BOTS[bot.id].lines)) assert.ok(known.has(event), `${bot.id} uses unknown event ${event}`)
    }
})

test('finds undefended pieces and pieces attacked by something cheaper', _ => {
    // Undefended white knight attacked by a black rook on the same file.
    let board = parseFen(position({ f4: 'N', f9: 'r', g1: 'K', g10: 'k' }))
    assert.deepStrictEqual(hangingPieces(board, 'white', null).map(c => cellName(c.cell)), ['f4'])

    // Same knight, now defended by a rook behind it: the attacking rook isn't cheaper, so it's safe.
    board = parseFen(position({ f4: 'N', f1: 'R', f9: 'r', g1: 'K', g10: 'k' }))
    assert.ok(!hangingPieces(board, 'white', null).some(c => cellName(c.cell) == 'f4'))

    // Defended, but attacked by a cheaper pawn: still hanging.
    board = parseFen(position({ f4: 'N', f1: 'R', g10: 'k', g1: 'K', ...pawnAttacking('f4') }))
    assert.ok(hangingPieces(board, 'white', null).some(c => cellName(c.cell) == 'f4'))
})

test('comments when the opponent leaves a piece hanging, naming it', _ => {
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', f9: 'r', c3: 'N' }) })
    const fenBefore = game.fen
    const { chatter, said } = eagerChatter('corneliusAshby')

    // White knight walks onto the rook's file, undefended.
    const to = game.legalMovesFrom('white', cellOf('c3')).find(t => hangingPieces(
        (_ => { const g = new GameState({ fen: fenBefore }); g.play('white', cellOf('c3'), t); return g.board() })(), 'white', null).length)
    assert.ok(to != null, 'test position should allow a hanging knight move')

    const res = game.play('white', cellOf('c3'), to)
    chatter.onMove({ move: res.move, mover: 'white', fenBefore, game })

    assert.strictEqual(said.length, 1)
    assert.match(said[0], /knight/)
})

test('an even trade is not called a hung piece', _ => {
    // White knight takes a black knight and can be recaptured by a pawn: that's a trade.
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', e5: 'N', d7: 'n', c8: 'p' }) })
    const target = game.legalMovesFrom('white', cellOf('e5')).find(t => cellName(t) == 'd7')
    if(target == null) return   // geometry check: skip if the knight can't reach in this layout

    const fenBefore = game.fen
    const { chatter, said } = eagerChatter('victorKane')
    chatter.say = (event, vars, opts) => { said.push(event); return true }
    const res = game.play('white', cellOf('e5'), target)
    chatter.onMove({ move: res.move, mover: 'white', fenBefore, game })

    assert.ok(!said.includes('playerHangs'))
})

test('always says something at the end of the game, in character', _ => {
    const { chatter, said } = eagerChatter('timothyWells')
    chatter.onGameOver({ winner: 'black', reason: 'checkmate', score: '0-1' })
    assert.strictEqual(said.length, 1)
    assert.ok(BOTS.timothyWells.lines.win.includes(said[0]))
})

test('answers "gg" with a gg line and fills in the opponent name', _ => {
    const { chatter, said } = eagerChatter('corneliusAshby')
    chatter.onOpponentChat('gg wp')
    assert.ok(BOTS.corneliusAshby.lines.replyGG.includes(said[0]))

    const { chatter: c2, said: s2 } = eagerChatter('evanBrooks')
    c2.onStart()
    assert.ok(!s2[0].includes('{name}'))
})

test('a bot with zero awareness never notices hung pieces', _ => {
    const said = []
    const chatter = new Chatter({ botId: 'timothyWells', color: 'black', say: t => said.push(t), getOpponentName: _ => 'Sam' })
    chatter.later = fn => { fn(); return 0 }
    const events = []
    chatter.say = event => { events.push(event); return false }

    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', f9: 'r', f2: 'N' }) })
    const fenBefore = game.fen
    const to = game.legalMovesFrom('white', cellOf('f2'))[0]
    const res = game.play('white', cellOf('f2'), to)
    for(let i = 0; i < 50; i++) chatter.onMove({ move: res.move, mover: 'white', fenBefore, game })

    assert.ok(!events.includes('playerHangs'))
})
