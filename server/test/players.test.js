const test = require('node:test')
const assert = require('node:assert')
const os = require('os')
const fs = require('fs')
const path = require('path')
const { PlayerStore, STARTING_ELO } = require('../src/players/playerStore')
const Room = require('../src/rooms/room')

const tempStore = _ => new PlayerStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qrs-')), 'players.json'))

const fakeSocket = profileId => {
    const socket = { readyState: 1, sent: [], profileId }
    socket.send = json => socket.sent.push(JSON.parse(json))
    socket.last = type => socket.sent.filter(m => m.type == type).at(-1)
    return socket
}

test('register, authenticate and reject a wrong token', _ => {
    const store = tempStore()
    const { player, token } = store.register('  Ada   Lovelace ')

    assert.strictEqual(player.name, 'Ada Lovelace')
    assert.strictEqual(player.elo, STARTING_ELO)
    assert.strictEqual(player.tokenHash, undefined)
    assert.ok(store.authenticate(player.id, token))
    assert.strictEqual(store.authenticate(player.id, 'nope'), null)
    assert.strictEqual(store.authenticate('missing', token), null)
})

test('names must be valid and unique (case-insensitive)', _ => {
    const store = tempStore()
    store.register('Rook')
    assert.ok(store.register('rook').error)
    assert.ok(store.register('x').error)
    assert.ok(store.register('<script>').error)
})

test('profiles persist to disk', _ => {
    const store = tempStore()
    const { player, token } = store.register('Persist')
    const reloaded = new PlayerStore(store.filePath)
    assert.ok(reloaded.authenticate(player.id, token))
})

test('an even game moves both ratings by the same amount in opposite directions', _ => {
    const store = tempStore()
    const a = store.register('Alpha').player
    const b = store.register('Bravo').player

    const res = store.recordGame(a.id, b.id, 1)
    assert.strictEqual(res[a.id].delta, 20)         // K=40 while provisional, expected score 0.5
    assert.strictEqual(res[b.id].delta, -20)
    assert.strictEqual(store.get(a.id).wins, 1)
    assert.strictEqual(store.get(b.id).losses, 1)
})

test('beating a much stronger bot gains more than beating a weaker one; bots are unaffected', _ => {
    const store = tempStore()
    const p = store.register('Climber').player
    const vsStrong = store.recordBotGame(p.id, 1600, 1).delta
    const q = store.register('Farmer').player
    const vsWeak = store.recordBotGame(q.id, 300, 1).delta
    assert.ok(vsStrong > vsWeak)
    assert.ok(vsWeak >= 0)
})

const playOpening = room => {
    // f5-f6 for White, f7... is blocked, so Black answers with a knight move: just use legal ones.
    const { cellName, NUM_CELLS } = require('../src/game/moves')
    const cellOf = n => [...Array(NUM_CELLS).keys()].find(i => cellName(i) == n)
    assert.ok(room.game.play('white', cellOf('f5'), cellOf('f6')).ok)
    const black = room.game.board().find(c => c.color == 'black' && room.game.legalMovesFrom('black', c.cell).length)
    assert.ok(room.game.play('black', black.cell, room.game.legalMovesFrom('black', black.cell)[0]).ok)
}

test('a finished human game updates both profiles and reports the change', _ => {
    const store = tempStore()
    const a = store.register('White Player').player
    const b = store.register('Black Player').player

    const room = new Room('R1', { profiles: store })
    const ws = fakeSocket(a.id), bs = fakeSocket(b.id)
    room.addClient(ws)
    room.addClient(bs)

    assert.strictEqual(bs.last('matchInfo').white.name, 'White Player')

    playOpening(room)
    room.handleMessage(bs, { type: 'resign' })

    const over = ws.last('gameOver')
    assert.strictEqual(over.ratings.white.delta, 20)
    assert.strictEqual(over.ratings.black.delta, -20)
    assert.strictEqual(ws.last('profile').player.elo, STARTING_ELO + 20)
})

test('games resigned before both sides move are unrated', _ => {
    const store = tempStore()
    const a = store.register('Quick One').player
    const b = store.register('Quick Two').player
    const room = new Room('R2', { profiles: store })
    const ws = fakeSocket(a.id), bs = fakeSocket(b.id)
    room.addClient(ws)
    room.addClient(bs)

    room.handleMessage(ws, { type: 'resign' })
    assert.strictEqual(ws.last('gameOver').ratings, null)
    assert.strictEqual(store.get(a.id).gamesPlayed, 0)
})

test('losing to a bot lowers only the player, and closing the tab mid-game still counts', _ => {
    const store = tempStore()
    const p = store.register('Tab Closer').player
    const room = new Room('R3', { profiles: store, bots: { black: 'timothyWells' }, botMeta: { black: { id: 'timothyWells', name: 'Timothy Wells', elo: 100 } } })
    room.scheduleBotMove = _ => {}       // drive both sides by hand
    const s = fakeSocket(p.id)
    room.addClient(s)

    playOpening(room)
    room.removeClient(s)

    const after = store.get(p.id)
    assert.strictEqual(after.losses, 1)
    assert.ok(after.elo < STARTING_ELO)
})
