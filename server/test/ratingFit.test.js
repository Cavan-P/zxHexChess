const { test } = require('node:test')
const assert = require('node:assert')
const { fitRatings } = require('../src/ai/ratingFit')

// Deterministic PRNG so the simulated tournaments are the same every run.
const rng = seed => _ => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32

const simulate = (truth, gamesPerPair, whiteAdv = 0, seed = 1) => {
    const rand = rng(seed)
    const ids = Object.keys(truth)
    const games = []
    for(let i = 0; i < ids.length; i++) for(let j = i + 1; j < ids.length; j++) for(let g = 0; g < gamesPerPair; g++){
        const [white, black] = g % 2 ? [ids[i], ids[j]] : [ids[j], ids[i]]
        const p = 1 / (1 + 10 ** (-(truth[white] - truth[black] + whiteAdv) / 400))
        games.push({ white, black, score: rand() < p ? 1 : 0 })
    }
    return games
}

test('recovers known ratings with the anchor pinned', _ => {
    const truth = { anchor: 400, a: 200, b: 700, c: 1000, d: 1300 }
    const { ratings } = fitRatings({ games: simulate(truth, 200), anchorId: 'anchor', anchorElo: 400 })
    assert.strictEqual(ratings.anchor.elo, 400)
    assert.strictEqual(ratings.anchor.se, 0)
    for(const id of ['a', 'b', 'c', 'd']){
        assert.ok(Math.abs(ratings[id].elo - truth[id]) < 3 * ratings[id].se + 10, `${id}: got ${ratings[id].elo.toFixed(0)} ± ${ratings[id].se.toFixed(0)}, expected ${truth[id]}`)
    }
})

test('estimates the first-move advantage', _ => {
    const truth = { anchor: 400, a: 500, b: 600 }
    const { whiteAdvantage } = fitRatings({ games: simulate(truth, 1000, 60), anchorId: 'anchor', anchorElo: 400 })
    assert.ok(Math.abs(whiteAdvantage.elo - 60) < 3 * whiteAdvantage.se + 5, `got ${whiteAdvantage.elo}`)
})

test('does not depend on game order', _ => {
    const games = simulate({ anchor: 400, a: 300, b: 800 }, 30)
    const forward = fitRatings({ games, anchorId: 'anchor' }).ratings
    const reversed = fitRatings({ games: [...games].reverse(), anchorId: 'anchor' }).ratings
    for(const id of ['a', 'b']) assert.ok(Math.abs(forward[id].elo - reversed[id].elo) < 1e-6)
})

test('a bot that never wins gets a finite, very low rating', _ => {
    const games = []
    for(let i = 0; i < 50; i++) games.push({ white: i % 2 ? 'anchor' : 'hopeless', black: i % 2 ? 'hopeless' : 'anchor', score: i % 2 ? 1 : 0 })
    for(let i = 0; i < 50; i++) games.push({ white: 'anchor', black: 'peer', score: i % 2 })
    const { ratings } = fitRatings({ games, anchorId: 'anchor' })
    assert.ok(Number.isFinite(ratings.hopeless.elo))
    assert.ok(ratings.hopeless.elo < 0, `got ${ratings.hopeless.elo}`)
    assert.ok(Math.abs(ratings.peer.elo - 400) < 40)
})

test('bots with no path to the anchor are reported, not rated', _ => {
    const games = [
        { white: 'anchor', black: 'a', score: 1 }, { white: 'a', black: 'anchor', score: 1 },
        { white: 'x', black: 'y', score: 1 }, { white: 'y', black: 'x', score: 0 }
    ]
    const result = fitRatings({ games, anchorId: 'anchor' })
    assert.deepStrictEqual(result.unconnected.sort(), ['x', 'y'])
    assert.ok(!('x' in result.ratings))
    assert.ok('a' in result.ratings)
})
