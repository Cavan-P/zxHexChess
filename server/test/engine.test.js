const test = require('node:test')
const assert = require('node:assert')
const { kingAttacked, iterativeDeepening, evaluateMaterial, evaluatePositional } = require('../src/ai/engine')
const { GameState } = require('../src/game/rules')
const { parseFen, boardToFen, isKingAttacked, cellName, NUM_CELLS } = require('../src/game/moves')

const cellOf = name => [...Array(NUM_CELLS).keys()].find(i => cellName(i) == name)
const position = pieces => boardToFen([...Array(NUM_CELLS).keys()].map(i => ({
    piece: Object.entries(pieces).find(([name]) => cellOf(name) == i)?.[1] || ''
})))

// Deterministic pseudo-random numbers so failures are reproducible.
const rng = seed => _ => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

test('fast king-attack check agrees with the rules engine on random positions', _ => {
    const rand = rng(7)
    const pool = 'pppnnbbrrq'
    let checked = 0, attacked = 0

    for(let n = 0; n < 600; n++){
        const cells = Array(NUM_CELLS).fill('')
        const free = _ => { let i; do { i = Math.floor(rand() * NUM_CELLS) } while(cells[i]); return i }
        cells[free()] = 'K'
        cells[free()] = 'k'
        const count = 2 + Math.floor(rand() * 14)
        for(let i = 0; i < count; i++){
            const p = pool[Math.floor(rand() * pool.length)]
            cells[free()] = rand() < 0.5 ? p.toUpperCase() : p
        }

        const board = parseFen(boardToFen(cells.map(piece => ({ piece }))))
        for(const color of ['white', 'black']){
            const expected = isKingAttacked(board, color, null)
            assert.strictEqual(kingAttacked(board, color), expected, `mismatch for ${color} in ${boardToFen(board)}`)
            checked++
            if(expected) attacked++
        }
    }

    assert.ok(attacked > 50, `test should include plenty of checks (got ${attacked}/${checked})`)
})

test('finds mate in one whenever one exists', _ => {
    const bm = require('../src/ai/botManager')
    const kyle = bm.getBotByName('kyleMorton')
    const rand = rng(11)
    const original = Math.random
    Math.random = rand                       // make the games reproducible
    let found = 0

    try {
        for(let n = 0; n < 60 && found < 5; n++){
            const game = new GameState()
            for(let ply = 0; ply < 120 && !game.result; ply++){
                // Is there a mating move here?
                const board = game.board()
                const mates = board.filter(c => c.color == game.turn).flatMap(c =>
                    game.legalMovesFrom(game.turn, c.cell).map(to => ({ from: c.cell, to }))
                ).filter(m => {
                    const g = new GameState({ fen: game.fen, turn: game.turn })
                    g.play(game.turn, m.from, m.to, 'q')
                    return g.result?.reason == 'checkmate'
                })

                if(mates.length){
                    const move = iterativeDeepening(board, game.turn, game.enPassant, 2, 5000, evaluateMaterial)
                    const g = new GameState({ fen: game.fen, turn: game.turn })
                    g.play(game.turn, move.from, move.to, 'q')
                    assert.strictEqual(g.result?.reason, 'checkmate', `missed mate in ${game.fen} (${game.turn})`)
                    found++
                    break
                }

                const mv = kyle({ fen: game.fen, turn: game.turn, enPassant: game.enPassant })
                game.play(game.turn, mv.from, mv.to, 'q')
            }
        }
    }
    finally { Math.random = original }

    assert.ok(found >= 3, `expected several mate-in-one positions, found ${found}`)
})

test('takes a free queen and does not hang its own', _ => {
    // White rook can take an undefended black queen.
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', a1: 'R', a5: 'q' }) })
    const move = iterativeDeepening(game.board(), 'white', null, 3, 5000, evaluatePositional)
    assert.strictEqual(cellName(move.to), 'a5')
})

test('never returns an illegal move', _ => {
    const rand = rng(3)
    const game = new GameState()
    for(let ply = 0; ply < 30 && !game.result; ply++){
        const move = iterativeDeepening(game.board(), game.turn, game.enPassant, 2, 2000, evaluateMaterial)
        assert.ok(game.legalMovesFrom(game.turn, move.from).includes(move.to), `illegal ${cellName(move.from)}-${cellName(move.to)}`)
        game.play(game.turn, move.from, move.to, 'q')
    }
})

test('loop detection: a piece returning to a recent cell is flagged, fresh cells and captures are not', _ => {
    const { revisitsCell } = require('../src/ai/heuristics')
    const board = parseFen(position({ g1: 'K', g10: 'k', a2: 'R', a5: 'p' }))
    const [a1, a2, a3, a5] = ['a1', 'a2', 'a3', 'a5'].map(cellOf)

    // The rook went a1 -> a3 -> a2 over its last two moves.
    const recent = [{ from: a1, to: a3 }, { from: a3, to: a2 }]
    assert.strictEqual(revisitsCell(board, { from: a2, to: a3 }, recent), 1)   // A->B->A
    assert.strictEqual(revisitsCell(board, { from: a2, to: a1 }, recent), 1)   // A->B->C->A
    assert.strictEqual(revisitsCell(board, { from: a2, to: cellOf('b2') }, recent), 0)
    assert.strictEqual(revisitsCell(board, { from: a2, to: a5 }, recent), 0)   // a capture is never a loop
})

test('engine bots do not loop pieces in a long game between equals', _ => {
    const bm = require('../src/ai/botManager')
    const nina = bm.getBotByName('ninaWhitfield'), derek = bm.getBotByName('derekSanders')
    const game = new GameState()
    const visits = new Map()          // cell -> own-move index the current occupant arrived
    let loops = 0, ownMoves = 0

    while(!game.result && game.history.length < 80){
        const bot = game.turn == 'white' ? nina : derek
        const move = bot({ fen: game.fen, turn: game.turn, enPassant: game.enPassant, seen: game.seenPositions(), recentOwnMoves: game.recentMovesBy(game.turn) })
        const recent = game.recentMovesBy(game.turn, 6)
        if(require('../src/ai/heuristics').revisitsCell(game.board(), move, recent)) loops++
        ownMoves++
        game.play(game.turn, move.from, move.to, move.promotion || 'q')
    }

    assert.ok(loops <= ownMoves * 0.05, `${loops} looping moves out of ${ownMoves}`)
})

test('the fast table-driven move generator matches the rules engine exactly', _ => {
    const { fastMoves } = require('../src/ai/fastMoves')
    const { generateLegalMoves } = require('../src/game/moves')
    const rand = rng(99)
    const letters = 'pnbrqkPNBRQK'
    let compared = 0

    for(let n = 0; n < 400; n++){
        const cells = Array(NUM_CELLS).fill('').map(_ => rand() < 0.35 ? letters[Math.floor(rand() * 12)] : '')
        const board = parseFen(boardToFen(cells.map(piece => ({ piece }))))
        if(n % 3 == 0) board.forEach(c => { if(c.piece && rand() < 0.5) c.color = 'neutral' })
        const ep = rand() < 0.3 ? { captureCell: Math.floor(rand() * NUM_CELLS), pawnCell: 0, color: rand() < 0.5 ? 'white' : 'black' } : null

        for(let i = 0; i < NUM_CELLS; i++){
            if(!board[i].piece) continue
            for(const color of ['white', 'black']){
                const sort = list => [...list].sort((a, b) => a - b).join()
                assert.strictEqual(sort(fastMoves(board, i, color, ep)), sort(generateLegalMoves(board, i, color, ep)), `${board[i].piece} on ${cellName(i)} as ${color}`)
                compared++
            }
        }
    }
    assert.ok(compared > 10000)
})

test('opening variety: strong bots vary their first move but never pass up a mate', _ => {
    const { searchBot, evaluateMaster } = require('../src/ai/engine')
    const start = new GameState()
    const firsts = new Set()
    for(let i = 0; i < 8; i++){
        const mv = searchBot({ fen: start.fen, turn: 'white', enPassant: null, ply: 0, maxDepth: 4, timeLimitMs: 300, evaluate: evaluateMaster })
        assert.ok(start.legalMovesFrom('white', mv.from).includes(mv.to))
        firsts.add(`${mv.from}-${mv.to}`)
    }
    assert.ok(firsts.size > 1, 'expected more than one opening move')

    // Mate-in-one positions from quick games between weak bots: variety must never skip the mate.
    const kyle = require('../src/ai/botManager').getBotByName('kyleMorton')
    const original = Math.random
    Math.random = rng(21)
    let checked = 0
    try {
        for(let n = 0; n < 60 && checked < 3; n++){
            const game = new GameState()
            for(let ply = 0; ply < 120 && !game.result; ply++){
                const hasMate = game.board().filter(c => c.color == game.turn).some(c => game.legalMovesFrom(game.turn, c.cell).some(to => {
                    const g = new GameState({ fen: game.fen, turn: game.turn }); g.play(game.turn, c.cell, to, 'q'); return g.result?.reason == 'checkmate'
                }))
                if(hasMate){
                    const mv = searchBot({ fen: game.fen, turn: game.turn, enPassant: game.enPassant, ply: 0, maxDepth: 4, timeLimitMs: 2000, evaluate: evaluateMaster })
                    const g = new GameState({ fen: game.fen, turn: game.turn }); g.play(game.turn, mv.from, mv.to, 'q')
                    assert.strictEqual(g.result?.reason, 'checkmate', `variety skipped a mate in ${game.fen}`)
                    checked++
                    break
                }
                const mv = kyle({ fen: game.fen, turn: game.turn, enPassant: game.enPassant })
                game.play(game.turn, mv.from, mv.to, 'q')
            }
        }
    }
    finally { Math.random = original }
    assert.ok(checked >= 2, `expected some mate-in-one positions, found ${checked}`)
})
