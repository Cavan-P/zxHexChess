const test = require('node:test')
const assert = require('node:assert')
const { checkGame, DEFINITIONS, materialBalance } = require('../src/players/achievements')
const { START_FEN } = require('../src/game/rules')

const player = (extra = {}) => ({ elo: 800, peak: 800, gamesPlayed: 1, botsBeaten: {}, streak: 0, ...extra })
const fakeGame = (history, result, positions = [START_FEN]) => ({ history, result, positions })
const ids = args => new Set(checkGame({ opponent: { isBot: true, rating: 500 }, ratingBefore: 800, player: player(), ...args }))

test('achievement ids are unique', _ => {
    assert.strictEqual(new Set(DEFINITIONS.map(d => d.id)).size, DEFINITIONS.length)
})

test('checkmate by a king move, quickly and without losing anything', _ => {
    const history = [
        { color: 'white', piece: 'P', from: 1, to: 2 },
        { color: 'black', piece: 'p', from: 3, to: 4 },
        { color: 'white', piece: 'K', from: 5, to: 6 }
    ]
    const got = ids({ color: 'white', game: fakeGame(history, { winner: 'white', reason: 'checkmate' }) })
    for(const id of ['mate-k', 'quick-mate', 'flawless', 'first-game']) assert.ok(got.has(id), id)
    assert.ok(!got.has('mate-q'))
    assert.ok(!got.has('live-game'))
})

test('losing a piece rules out flawless; a promotion mate counts as both', _ => {
    const history = [
        { color: 'black', piece: 'p', from: 1, to: 2, captured: 'N', capturedCell: 2 },
        { color: 'white', piece: 'P', from: 5, to: 6, promotion: 'Q' }
    ]
    const got = ids({ color: 'white', game: fakeGame(history, { winner: 'white', reason: 'checkmate' }) })
    assert.ok(got.has('mate-promo') && got.has('mate-p'))
    assert.ok(!got.has('flawless'))
})

test('clock, comeback, en passant and live-game achievements', _ => {
    // Black is a queen down at some point and still wins on time with under a second left.
    const down = START_FEN.replace('q', '1')
    const history = [{ color: 'black', piece: 'p', from: 1, to: 2, captured: 'P', capturedCell: 9 }]
    const got = ids({
        color: 'black', clockMs: 400, opponent: { isBot: false, rating: 1100 },
        game: fakeGame(history, { winner: 'black', reason: 'timeout' }, [START_FEN, down])
    })
    for(const id of ['photo-finish', 'comeback', 'flagged', 'en-passant', 'live-game', 'live-win', 'giant-killer']) assert.ok(got.has(id), id)
    assert.ok(materialBalance(down, 'black') <= -5)
})

test('record achievements: rating milestones and clearing a tier', _ => {
    const bots = [{ id: 'a', category: 'Beginner' }, { id: 'b', category: 'Beginner' }, { id: 'c', category: 'Novice' }]
    const got = ids({
        color: 'white', bots,
        player: player({ peak: 1012, elo: 950, gamesPlayed: 10, streak: 5, botsBeaten: { a: {}, b: {} } }),
        game: fakeGame([], { winner: 'white', reason: 'resignation' })
    })
    for(const id of ['rating-900', 'rating-1000', 'tier-beginner', 'clear-beginner', 'games-10', 'streak-5']) assert.ok(got.has(id), id)
    for(const id of ['rating-1100', 'tier-novice', 'clear-all']) assert.ok(!got.has(id), id)
})
