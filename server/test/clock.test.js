const test = require('node:test')
const assert = require('node:assert')
const Room = require('../src/rooms/room')
const { GameState } = require('../src/game/rules')
const { cellName, boardToFen, NUM_CELLS } = require('../src/game/moves')

const cellOf = name => [...Array(NUM_CELLS).keys()].find(i => cellName(i) == name)
const position = pieces => boardToFen([...Array(NUM_CELLS).keys()].map(i => ({
    piece: Object.entries(pieces).find(([name]) => cellOf(name) == i)?.[1] || ''
})))
const fakeSocket = _ => {
    const s = { readyState: 1, sent: [] }
    s.send = json => s.sent.push(JSON.parse(json))
    s.last = type => s.sent.filter(m => m.type == type).at(-1)
    return s
}
const timedRoom = (timeControl = '3+2') => {
    const room = new Room('CLK', { timeControl })
    const white = fakeSocket(), black = fakeSocket()
    room.addClient(white)
    room.addClient(black)
    return { room, white, black }
}

test('no clock runs before White moves; then Black runs, and the mover gets the increment', _ => {
    const { room, white, black } = timedRoom('3+2')
    assert.strictEqual(white.last('init').clock.running, null)

    room.handleMessage(white, { type: 'attemptMove', from: cellOf('f5'), to: cellOf('f6') })
    const afterWhite = white.last('move').clock
    assert.strictEqual(afterWhite.running, 'black')
    assert.strictEqual(afterWhite.remaining.white, 180000)     // first move is free, no increment

    const blackMove = room.game.board().find(c => c.color == 'black' && room.game.legalMovesFrom('black', c.cell).length)
    room.handleMessage(black, { type: 'attemptMove', from: blackMove.cell, to: room.game.legalMovesFrom('black', blackMove.cell)[0] })
    const afterBlack = black.last('move').clock
    assert.strictEqual(afterBlack.running, 'white')
    assert.ok(afterBlack.remaining.black > 180000 && afterBlack.remaining.black <= 182000, 'black got the 2s increment')
    room.destroy()
})

test('no-increment time controls exist and add nothing per move', _ => {
    for(const name of ['1+0', '3+0', '5+0', '10+0', '15+0', '30+0']) assert.strictEqual(Room.TIME_CONTROLS[name].incrementMs, 0, name)
    assert.strictEqual(Room.TIME_CONTROLS['30+20'].initialMs, 30 * 60000)
})

test('running out of time loses the game', _ => {
    const { room, white } = timedRoom()
    room.handleMessage(white, { type: 'attemptMove', from: cellOf('f5'), to: cellOf('f6') })
    room.flag('black')
    assert.deepStrictEqual(white.last('gameOver').result, { winner: 'white', reason: 'timeout', score: '1-0' })
    assert.strictEqual(white.last('gameOver').clock.remaining.black, 0)
    room.destroy()
})

test('timing out is only a draw when the opponent could never checkmate', _ => {
    // White's only extra piece is a middle-shade bishop: Black flags, but White can never mate.
    const game = new GameState({ fen: position({ g1: 'K', g10: 'k', f3: 'B', a7: 'r' }), turn: 'black' })
    assert.deepStrictEqual(game.timeout('black'), { winner: null, reason: 'timeout vs insufficient material', score: '½-½' })

    // A knight CAN mate on this board, so a flag against K+N loses.
    const game2 = new GameState({ fen: position({ g1: 'K', g10: 'k', c3: 'N', a7: 'r' }), turn: 'black' })
    assert.strictEqual(game2.timeout('black').winner, 'white')
})

test('untimed games have no clock; unknown time controls fall back to untimed', _ => {
    const { room, white } = timedRoom(null)
    assert.strictEqual(white.last('init').clock, null)
    room.destroy()
    const r2 = new Room('X', { timeControl: '7+7' })
    assert.strictEqual(r2.clock, null)
})

test('rematch: both players must ask; then a new game starts with colours swapped and the same clock', _ => {
    const matchmaker = require('../src/rooms/matchmaker')
    const room = matchmaker.createRoom({ timeControl: '5+3' })
    const white = fakeSocket(), black = fakeSocket()
    room.addClient(white); white.room = room
    room.addClient(black); black.room = room

    room.handleMessage(white, { type: 'rematch' })               // game not over yet: ignored
    assert.strictEqual(white.last('rematchOffered'), undefined)

    room.handleMessage(white, { type: 'resign' })
    room.handleMessage(white, { type: 'rematch' })
    assert.strictEqual(black.last('rematchOffered').by, 'white')
    assert.strictEqual(white.room, room)

    room.handleMessage(black, { type: 'rematch' })
    assert.notStrictEqual(white.room, room)
    assert.strictEqual(white.room, black.room)
    assert.strictEqual(white.last('assignColor').color, 'black')
    assert.strictEqual(black.last('assignColor').color, 'white')
    assert.strictEqual(white.room.clock.name, '5+3')
    assert.ok(room.destroyed, 'the old room is cleaned up')
    white.room.destroy()
})

test('rematch against a bot starts at once with colours swapped', _ => {
    const matchmaker = require('../src/rooms/matchmaker')
    // Keep bots from actually thinking (that would start worker threads and keep the test alive).
    const realSchedule = Room.prototype.scheduleBotMove
    Room.prototype.scheduleBotMove = _ => {}
    test.after(_ => { Room.prototype.scheduleBotMove = realSchedule })

    const room = matchmaker.createRoom({ bots: { black: 'timothyWells' }, botMeta: { black: { id: 'timothyWells', name: 'Timothy Wells', elo: 100 } }, timeControl: '3+2' })
    const me = fakeSocket()
    room.addClient(me); me.room = room
    room.handleMessage(me, { type: 'resign' })
    room.handleMessage(me, { type: 'rematch' })

    assert.notStrictEqual(me.room, room)
    assert.strictEqual(me.last('assignColor').color, 'black')
    assert.strictEqual(me.room.bots.white, 'timothyWells')
    assert.strictEqual(me.room.clock.name, '3+2')
    me.room.destroy()
})

test('a bot on a clock budgets its thinking time', _ => {
    const room = new Room('B', { bots: { black: 'victorKane' }, timeControl: '3+2' })
    room.clock.remaining.black = 30000
    const budget = room.botTimeBudget('black')
    assert.ok(budget > 1000 && budget < 3000, `30s left on 3+2 -> about 2.4s per move (got ${budget})`)
    room.clock.remaining.black = 600
    assert.ok(room.botTimeBudget('black') <= 300, 'nearly flagged -> hurry')
    room.destroy()
})
