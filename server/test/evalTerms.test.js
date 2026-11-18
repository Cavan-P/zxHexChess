const test = require('node:test')
const assert = require('node:assert')
const { evaluateWeighted, DEFAULT_WEIGHTS } = require('../src/ai/engine')
const { withNeutrals, mutate, flatten, unflatten, SPEC } = require('../src/ai/genome')
const { parseFen, boardToFen, coordToIndex, NUM_CELLS } = require('../src/game/moves')

// A board from { 'q,r': piece } (s = -q - r).
const board = pieces => {
    const cells = Array(NUM_CELLS).fill('')
    for(const [key, piece] of Object.entries(pieces)){
        const [q, r] = key.split(',').map(Number)
        cells[coordToIndex(q, r, -q - r)] = piece
    }
    return parseFen(boardToFen(cells.map(piece => ({ piece }))))
}

const base = withNeutrals(DEFAULT_WEIGHTS)
const setKey = (obj, key, value) => {
    const parts = key.split('.')
    let o = obj
    for(const k of parts.slice(0, -1)) o = o[k]
    o[parts.at(-1)] = value
}
// How much switching one knob on changes White's evaluation of a position. A tapered knob is set
// for both the middlegame and the endgame, unless an `end.` key is given explicitly.
const delta = (pieces, key, value, toMove = 'black') => {
    const on = structuredClone(base)
    setKey(on, key, value)
    if(!key.startsWith('end.') && SPEC.some(s => s.key == `end.${key}`)) setKey(on, `end.${key}`, value)
    const b = board(pieces)
    return evaluateWeighted(b, 'white', null, on, toMove) - evaluateWeighted(b, 'white', null, base, toMove)
}

// Kings tucked in opposite corners, out of the way.
const kings = { '0,5': 'K', '0,-5': 'k' }
// Enough officers on the board that middlegame-only terms count.
const officers = { '-4,5': 'R', '4,1': 'R', '-4,-1': 'r', '4,-5': 'r', '-3,5': 'Q', '3,-5': 'q' }

test('genome: neutral-filled defaults evaluate like the defaults, and mutation stays in range', _ => {
    const b = board({ ...kings, ...officers, '0,1': 'P', '1,-2': 'n' })
    assert.ok(Math.abs(evaluateWeighted(b, 'white', null, base, 'black') - evaluateWeighted(b, 'white', null, DEFAULT_WEIGHTS, 'black')) < 1e-9)

    let g = base
    for(let i = 0; i < 200; i++) g = mutate(g)
    flatten(g).forEach((v, i) => assert.ok(v >= SPEC[i].min && v <= SPEC[i].max, `${SPEC[i].key}=${v} out of range`))
    assert.deepStrictEqual(flatten(unflatten(flatten(g))), flatten(g))
})

test('passed pawns score only when no enemy pawn can stop them', _ => {
    assert.ok(delta({ ...kings, '0,0': 'P' }, 'passedPawnWeight', 0.02) > 0)
    assert.strictEqual(delta({ ...kings, '0,0': 'P', '0,-3': 'p' }, 'passedPawnWeight', 0.02), 0)   // blocked ahead on its file
    assert.strictEqual(delta({ ...kings, '0,0': 'P', '1,-3': 'p' }, 'passedPawnWeight', 0.02), 0)   // can be captured on the way
    // An enemy pawn behind it doesn't matter (that pawn is itself blocked by (0,4), so it isn't passed).
    const lone = delta({ ...kings, '0,0': 'P', '0,4': 'P', '0,3': 'p' }, 'passedPawnWeight', 0.02)
    assert.ok(Math.abs(lone - delta({ ...kings, '0,0': 'P' }, 'passedPawnWeight', 0.02)) < 1e-9)
    // Further up the board is worth more.
    assert.ok(delta({ ...kings, '0,-3': 'P' }, 'passedPawnWeight', 0.02) > delta({ ...kings, '0,1': 'P' }, 'passedPawnWeight', 0.02))
})

test('pawn structure: isolated and doubled pawns cost, protected pawns gain', _ => {
    assert.ok(delta({ ...kings, '0,1': 'P' }, 'isolatedPawnWeight', 0.2) < 0)
    assert.strictEqual(delta({ ...kings, '0,1': 'P', '1,1': 'P' }, 'isolatedPawnWeight', 0.2), 0)
    assert.ok(delta({ ...kings, '0,1': 'P', '0,2': 'P' }, 'doubledPawnWeight', 0.2) < 0)
    assert.ok(delta({ ...kings, '0,0': 'P', '-1,1': 'P' }, 'protectedPawnWeight', 0.1) > 0)          // (-1,1) + (1,-1) = (0,0)
    assert.strictEqual(delta({ ...kings, '0,0': 'P', '0,2': 'P' }, 'protectedPawnWeight', 0.1), 0)
})

test('king safety: pawn shield and attackers around the king', _ => {
    assert.ok(delta({ ...kings, ...officers, '0,4': 'P' }, 'kingShieldWeight', 0.2) > 0)
    assert.ok(delta({ ...kings, ...officers, '1,3': 'q' }, 'kingDangerWeight', 0.01) < 0)
    // Shield and danger fade out with no officers left.
    assert.strictEqual(delta({ ...kings, '0,4': 'P' }, 'kingShieldWeight', 0.2), 0)
    // In the endgame a central king is good.
    assert.ok(delta({ '0,0': 'K', '0,-5': 'k' }, 'kingCentralityEnd', 0.1) > 0)
    assert.strictEqual(delta({ ...kings, ...officers, '0,0': 'B' }, 'kingCentralityEnd', 0.1), 0)
})

test('pieces: bishop set, open lines for rooks, knight outposts', _ => {
    // Three bishops on three different tones ((q - r) mod 3 = 0, 1, 2).
    assert.ok(delta({ ...kings, '0,0': 'B', '1,0': 'B', '2,0': 'B' }, 'bishopSetWeight', 0.5) > 0)
    assert.strictEqual(delta({ ...kings, '0,0': 'B', '1,0': 'B', '3,0': 'B' }, 'bishopSetWeight', 0.5), 0)
    assert.ok(delta({ ...kings, '0,0': 'R' }, 'rookOpenWeight', 0.05) > 0)
    assert.ok(delta({ ...kings, '0,0': 'R', '0,-3': 'p' }, 'rookHalfOpenWeight', 0.05) > 0)
    // Knight on the enemy side, protected by a pawn, that no black pawn can ever attack.
    assert.ok(delta({ ...kings, '0,-1': 'N', '-1,0': 'P' }, 'knightOutpostWeight', 0.3) > 0)
    assert.strictEqual(delta({ ...kings, '0,-1': 'N', '-1,0': 'P', '1,-4': 'p' }, 'knightOutpostWeight', 0.3), 0)
})

test('dynamics: threats, tempo, trading down when ahead', _ => {
    // White knight attacked by a black pawn (black pawns capture along (1,0) and (-1,1)).
    assert.ok(delta({ ...kings, '0,0': 'N', '-1,0': 'p' }, 'threatWeight', 0.2) < 0)
    assert.ok(delta({ ...kings }, 'tempoWeight', 0.1, 'white') > 0)
    assert.ok(delta({ ...kings }, 'tempoWeight', 0.1, 'black') < 0)
    assert.ok(delta({ ...kings, '0,0': 'R', '1,1': 'P', '-2,-2': 'p' }, 'tradeDownWeight', 0.5) > 0)
})

test('tapered evaluation uses endgame values once material is gone', _ => {
    const endgame = { ...kings, '0,0': 'P' }
    assert.ok(Math.abs(delta(endgame, 'end.pieceValues.p', 2) - 1) < 1e-9)           // all endgame: pawn 1 -> 2
    assert.ok(Math.abs(delta({ ...endgame, ...officers, '2,-2': 'R', '-2,2': 'r', '1,3': 'B', '-1,-3': 'b' }, 'end.pieceValues.p', 2)) < 1)
})

test('per-piece mobility and centrality bonuses', _ => {
    assert.ok(delta({ ...kings, '0,0': 'R' }, 'mobilityBonus.r', 0.02) > 0)
    assert.ok(delta({ ...kings, '0,0': 'N' }, 'centralityBonus.n', 0.05) > 0)
    assert.strictEqual(delta({ ...kings, '0,0': 'N' }, 'centralityBonus.r', 0.05), 0)
})
