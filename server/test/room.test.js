const test = require('node:test')
const assert = require('node:assert')
const Room = require('../src/rooms/room')
const { START_FEN } = require('../src/game/rules')

const fakeSocket = _ => {
    const socket = { readyState: 1, sent: [] }
    socket.send = json => socket.sent.push(JSON.parse(json))
    socket.last = type => socket.sent.filter(m => m.type == type).at(-1)
    return socket
}

const humanRoom = _ => {
    const room = new Room('TEST1')
    const white = fakeSocket()
    const black = fakeSocket()
    room.addClient(white)
    room.addClient(black)
    return { room, white, black }
}

test('clients cannot overwrite the board with a raw FEN', _ => {
    const { room, white } = humanRoom()
    room.handleMessage(white, { type: 'move', fen: '5k92BR96K4N993P3PP7P1P95' })
    assert.strictEqual(room.game.fen, START_FEN)
})

test('a malformed promotion message is rejected, not thrown', _ => {
    const { room, white, black } = humanRoom()
    assert.doesNotThrow(_ => room.handleMessage(black, { type: 'promotionChoice', from: 70, to: 5 }))
    assert.doesNotThrow(_ => room.handleMessage(white, { type: 'promotionChoice', from: 1, to: 2 }))
    assert.strictEqual(room.game.fen, START_FEN)
    assert.ok(white.last('illegalMove'))
})

test('chat text is length-limited and labelled by seat, not by the sender', _ => {
    const { room, white, black } = humanRoom()
    room.handleMessage(white, { type: 'chat', username: 'Admin', payload: 'x'.repeat(1000) })
    const msg = black.last('chat')
    assert.strictEqual(msg.username, 'White')
    assert.strictEqual(msg.payload.length, 300)
})

test('resign and draw agreement end the game for both players', _ => {
    let { room, white, black } = humanRoom()
    room.handleMessage(white, { type: 'resign' })
    assert.deepStrictEqual(black.last('gameOver').result, { winner: 'black', reason: 'resignation', score: '0-1' })

    ;({ room, white, black } = humanRoom())
    room.handleMessage(white, { type: 'offerDraw' })
    room.handleMessage(white, { type: 'acceptDraw' })   // can't accept your own offer
    assert.strictEqual(room.game.result, null)
    room.handleMessage(black, { type: 'acceptDraw' })
    assert.strictEqual(white.last('gameOver').result.reason, 'agreement')
})

test('the room is removed once everyone has left', _ => {
    let removed = false
    const room = new Room('TEST2', { onEmpty: _ => { removed = true } })
    const a = fakeSocket()
    room.addClient(a)
    room.removeClient(a)
    assert.ok(removed)
})
