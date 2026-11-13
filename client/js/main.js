// ------ IMPORTS ------

import { Game } from './game.js'
import { setupRoomMenu } from './roomMenu.js'
import { setupInput } from './setupInput.js'
import { setupNetwork, sendChatMessage, describeResult } from './network.js'
import { drawBoard, populateBoardFromFen, BOARD_WIDTH, BOARD_HEIGHT } from './board.js'
import { setSystemMessage } from './utils.js'
import { setupProfile, requestLeaderboard } from './profile.js'

// ------ GLOBALS ------

Game.canvas = document.getElementById('canvas')
Game.ctx = Game.canvas.getContext('2d')

Game.pieceSprite = document.getElementById('pieces')

// Sizes the canvas backing store to the element (sharp on high-DPI screens) and works out
// the scale/offset that fits the logical board into it, centered.
export const resizeCanvas = _ => {
    const dpr = window.devicePixelRatio || 1
    const width = Game.canvas.clientWidth * dpr
    const height = Game.canvas.clientHeight * dpr

    Game.canvas.width = width
    Game.canvas.height = height

    const scale = Math.min(width / BOARD_WIDTH, height / BOARD_HEIGHT) * 0.97
    Game.view = {
        scale,
        dpr,
        ox: (width - BOARD_WIDTH * scale) / 2,
        oy: (height - BOARD_HEIGHT * scale) / 2
    }
}

Game.resizeCanvas = resizeCanvas
resizeCanvas()

Game.onLegalMoves = (from, moves) => {
    Game.cells.forEach(cell => {
        cell.isLegalTarget = moves.includes(cell.num)
    })
}

Game.resyncBoard = fen => populateBoardFromFen(fen)

setupProfile()
setupRoomMenu()
setupInput()
Game.onRatingsChanged = requestLeaderboard
setupNetwork(populateBoardFromFen)

// Re-fit whenever the board's box changes size (window resize, rotation, sidebar reflow).
new ResizeObserver(_ => resizeCanvas()).observe(Game.canvas)

document.getElementById('chat-form').addEventListener('submit', e => {
    e.preventDefault()

    const input = document.getElementById('chat-input')
    const text = input.value.trim()

    if(!text.length) return

    sendChatMessage(text)

    input.value = ''
})


//Populate the cells array
drawBoard(0, 1, 5, true)

Game.boardCenter = {
    x: Math.min(...Game.cells.map(cell => cell.x)) +
      (Math.max(...Game.cells.map(cell => cell.x)) - Math.min(...Game.cells.map(cell => cell.x))) / 2,

    y: Math.min(...Game.cells.map(cell => cell.y)) +
      (Math.max(...Game.cells.map(cell => cell.y)) - Math.min(...Game.cells.map(cell => cell.y))) / 2
}

// Returns [text, tone] for the status banner; tone picks its color.
const status = _ => {
    if(Game.disconnected) return ['Disconnected from server. Refresh to reconnect.', 'check']
    if(Game.state == 'gameOver' && Game.result) return [describeResult(Game.result).detail, 'over']

    const inCheck = Game.check != null && Game.cells[Game.check]?.occupiedBy == (Game.turn == 'white' ? 'K' : 'k')
    const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
    const opponent = seated ? (Game.playerColor == 'white' ? 'black' : 'white') : null

    if(opponent && Game.presence && !Game.presence[opponent]){
        const code = document.getElementById('room-display')?.textContent
        return [Game.opponentAway ? 'Waiting for your opponent to reconnect…' : `Waiting for an opponent. Share code ${code}.`, '']
    }

    if(!seated){
        const active = Game.matchInfo?.[Game.turn]
        const label = active?.type == 'bot' ? active.name : (Game.turn == 'white' ? 'White' : 'Black')
        return [`${label} is thinking…${inCheck ? ' (in check)' : ''}`, '']
    }

    if(Game.turn != Game.playerColor){
        const bot = Game.matchInfo?.[Game.turn]
        return [bot?.type == 'bot' ? `${bot.name} is thinking…` : 'Opponent is thinking…', '']
    }

    return inCheck ? ['Check! Your move.', 'check'] : ['Your move', 'turn']
}

const statusEl = document.getElementById('system-text')
let lastTone = null
let lastTurn = null

const updateStatus = _ => {
    const [text, tone] = status()
    setSystemMessage(text)

    if(tone != lastTone){
        statusEl.classList.remove('is-turn', 'is-check', 'is-over')
        if(tone) statusEl.classList.add(`is-${tone}`)
        lastTone = tone
    }

    if(Game.turn != lastTurn){
        lastTurn = Game.turn
        Game.updatePlayers?.()
    }
}

const render = _ => {
    const ctx = Game.ctx
    const { scale, ox, oy } = Game.view

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, Game.canvas.width, Game.canvas.height)
    ctx.setTransform(scale, 0, 0, scale, ox, oy)

    ctx.save()

    drawBoard(0, 1, 5)

    if(Game.playerColor == 'black'){
        ctx.translate(Game.boardCenter.x, Game.boardCenter.y)
        ctx.rotate(Math.PI)
        ctx.translate(-Game.boardCenter.x, -Game.boardCenter.y)
    }

    drawBoard([
        '#D18B47FF',     /*  Dark cell    */
        '#E8AB6FFF',     /*  Middle cell  */
        '#FFCE9EFF'],    /*  Light cell   */
        0, 0)

    // Draw the dragged piece last so it stays on top.
    Game.pieces.sort((a, b) => a.isDragging - b.isDragging)

    Game.cells.forEach(cell => cell.update())

    const hoveredOccupied = Game.cells.some(cell => cell.hovering && cell.occupied && cell.occupiedByMyColor(Game.playerColor))
    Game.canvas.style.cursor = hoveredOccupied ? 'pointer' : 'default'

    Game.cells.forEach(cell => cell.display(false, false, false, Game.playerColor))
    Game.pieces.forEach(piece => piece.update())
    Game.pieces.forEach(piece => piece.display(false, Game.playerColor))

    ctx.restore()

    if(Game.playerColor) updateStatus()
}

const loop = _ => {
    render()
    requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

window.addEventListener('beforeunload', _ => {
    if(Game.socket?.readyState == WebSocket.OPEN){
        Game.socket.close()
    }
})
