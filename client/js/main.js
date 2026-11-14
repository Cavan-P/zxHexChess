import { setupRouter } from './router.js'
import { setupAchievements } from './achievements.js'
// ------ IMPORTS ------

import { Game } from './game.js'
import { setupRoomMenu } from './roomMenu.js'
import { setupInput } from './setupInput.js'
import { setupNetwork, sendChatMessage, describeResult } from './network.js'
import { drawBoard, populateBoardFromFen, BOARD_WIDTH, BOARD_HEIGHT } from './board.js'
import { setSystemMessage } from './utils.js'
import { setupProfile, requestLeaderboard } from './profile.js'
import { setupThemePicker } from './theme.js'
import { setupReview } from './review.js'
import { setupLab } from './lab.js'
import { play } from './sound.js'

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

setupThemePicker()
setupReview()
setupLab()
setupProfile()
setupAchievements()
setupRouter()
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
    if(Game.viewPly != null){
        const n = Game.viewPly
        const label = n == 0 ? 'the starting position' : `move ${Math.ceil(n / 2)}${n % 2 ? '' : '…'}`
        return [`Viewing ${label}. Tap the board or ⏭ to return.`, '']
    }
    if(Game.state == 'gameOver' && Game.result) return [describeResult(Game.result).detail, 'over']

    const inCheck = Game.check != null && Game.cells[Game.check]?.occupiedBy == (Game.turn == 'white' ? 'K' : 'k')
    const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
    const opponent = seated ? (Game.playerColor == 'white' ? 'black' : 'white') : null

    if(opponent && Game.presence && !Game.presence[opponent]){
        const code = document.getElementById('room-display')?.textContent
        if(Game.opponentAway) return ['Waiting for your opponent to reconnect…', '']
        return [Game.isPublic ? `Waiting for an opponent. Your game is listed under Open games (code ${code}).` : `Waiting for an opponent. Share code ${code}.`, '']
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

    const c = Game.clock
    if(c && c.running == Game.playerColor){
        const ms = c.remaining[Game.playerColor] - (performance.now() - Game.clockReceivedAt)
        if(ms < lowThreshold(c)) return [`${inCheck ? 'Check! ' : ''}Your move: ${formatClock(ms)} left!`, 'check']
    }

    return inCheck ? ['Check! Your move.', 'check'] : ['Your move', 'turn']
}

const statusEl = document.getElementById('system-text')
let lastTone = null
let lastTurn = null
let lastFen = null

const updateStatus = _ => {
    const [text, tone] = status()
    setSystemMessage(text)

    if(tone != lastTone){
        statusEl.classList.remove('is-turn', 'is-check', 'is-over')
        if(tone) statusEl.classList.add(`is-${tone}`)
        lastTone = tone
    }

    // Re-render the player rows (turn indicator, captured pieces, material) when anything changes.
    if(Game.turn != lastTurn || Game.fen != lastFen){
        lastTurn = Game.turn
        lastFen = Game.fen
        Game.updatePlayers?.()
    }
}

// ------ Coordinates ------

// Gliński files run a-l (no j); ranks are chevrons, numbered 1-11 from White's side.
const FILES = 'abcdefghikl'
const cellFile = c => FILES[c.q + 5]
const cellRank = c => 6 - c.r - Math.max(0, c.q)

// Each file is labelled beside its rank-1 cell, and each rank beside its end cell on the viewer's left. Labels are drawn upright in screen space, outside the board's rotation.
const drawCoordinates = ctx => {
    const black = Game.playerColor == 'black'
    const { x: cx, y: cy } = Game.boardCenter
    const view = c => black ? { x: 2 * cx - c.x, y: 2 * cy - c.y } : { x: c.x, y: c.y }

    ctx.save()
    ctx.fillStyle = Game.palette.label
    ctx.font = '600 19px Inter, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Files are labelled at their rank-1 end: along the bottom for White, along the top for Black
    // (the far ends of the files share cells with the rank labels, so they'd collide).
    for(const file of FILES){
        const cells = Game.cells.filter(c => cellFile(c) == file)
        const end = cells.reduce((a, b) => cellRank(b) < cellRank(a) ? b : a)
        const p = view(end)
        ctx.fillText(file, p.x, p.y + (black ? -56 : 56))
    }

    for(let rank = 1; rank <= 11; rank++){
        const cells = Game.cells.filter(c => cellRank(c) == rank)
        const end = cells.reduce((a, b) => (black ? b.x > a.x : b.x < a.x) ? b : a)
        const p = view(end)
        // Ranks 1-6 end on the straight side; 7-11 on the slanted edge above (or below, as Black).
        const [dx, dy] = rank <= 6 ? [-62, 0] : [-50, black ? 29 : -29]
        ctx.fillText(String(rank), p.x + dx, p.y + dy)
    }

    ctx.restore()
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

    // Dark, middle and light cells: flat colours or wood textures from the active theme.
    drawBoard(Game.palette.cells, 0, 0)

    // Draw the dragged piece last so it stays on top.
    Game.pieces.sort((a, b) => a.isDragging - b.isDragging)

    Game.cells.forEach(cell => cell.update())

    const hoveredOccupied = Game.cells.some(cell => cell.hovering && cell.occupied && cell.occupiedByMyColor(Game.playerColor))
    Game.canvas.style.cursor = hoveredOccupied ? 'pointer' : 'default'

    Game.cells.forEach(cell => cell.display(false, false, false, Game.playerColor))
    Game.pieces.forEach(piece => piece.update())
    Game.pieces.forEach(piece => piece.display(false, Game.playerColor))

    ctx.restore()

    if(Game.palette.coords) drawCoordinates(ctx)

    if(Game.playerColor) updateStatus()
}

// "4:59", or "9.4" in the last ten seconds.
const formatClock = ms => {
    if(ms < 10000) return (Math.max(0, ms) / 1000).toFixed(1)
    const total = Math.ceil(ms / 1000)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// Pieces glide more quickly as time gets short (and from the start in bullet), so the board
// never makes you wait. Smaller = faster: 5 is the normal glide, 1 is instant.
const updateAnimationSpeed = _ => {
    const c = Game.clock
    if(!c || Game.state != 'playing'){ Game.slideDivisor = null; return }

    const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
    const remaining = color => c.remaining[color] - (c.running == color ? performance.now() - Game.clockReceivedAt : 0)
    const ms = seated ? remaining(Game.playerColor) : Math.min(remaining('white'), remaining('black'))

    let divisor = c.initialMs <= 2 * 60000 ? 3 : 5
    if(ms < 30000) divisor = Math.min(divisor, 3)
    if(ms < 10000) divisor = 1.6
    Game.slideDivisor = divisor
}

// "Low on time" scales with the time control: a tenth of the starting time, kept between 10 and
// 30 seconds (10s in 1+0, 18s in 3+0, 30s from 5 minutes up). "Critical" is the last stretch.
const lowThreshold = c => Math.max(10000, Math.min(30000, c.initialMs * 0.1))
const criticalThreshold = c => Math.min(10000, lowThreshold(c) / 2)

const layoutEl = document.getElementById('layout')
let lastTickSecond = null
let warnedThisGame = null

const updateClocks = _ => {
    updateAnimationSpeed()
    const c = Game.clock
    const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
    let mine = null

    if(c){
        for(const node of document.querySelectorAll('.clock[data-color]')){
            const color = node.dataset.color
            const running = c.running == color && Game.state == 'playing'
            const ms = c.remaining[color] - (running ? performance.now() - Game.clockReceivedAt : 0)
            const text = formatClock(ms)
            if(node.textContent != text) node.textContent = text
            node.classList.toggle('is-running', running)
            node.classList.toggle('is-low', ms < lowThreshold(c))
            node.classList.toggle('is-critical', ms < criticalThreshold(c))
            if(seated && color == Game.playerColor) mine = { ms, running }
        }
    }

    // The obvious cue: only for your own clock, and only while it's running.
    const low = mine?.running && mine.ms < lowThreshold(c)
    const critical = low && mine.ms < criticalThreshold(c)
    layoutEl.classList.toggle('time-low', Boolean(low))
    layoutEl.classList.toggle('time-critical', Boolean(critical))

    if(!low){ lastTickSecond = null; return }

    // One warning when you first drop into low time each game, then a tick every second at the end.
    const gameKey = document.getElementById('room-display')?.textContent
    if(warnedThisGame != gameKey){
        warnedThisGame = gameKey
        play('warning')
    }
    if(critical){
        const second = Math.ceil(mine.ms / 1000)
        if(second != lastTickSecond && second > 0){
            lastTickSecond = second
            play('tick')
        }
    }
}

const loop = _ => {
    render()
    updateClocks()
    requestAnimationFrame(loop)
}

requestAnimationFrame(loop)

window.addEventListener('beforeunload', _ => {
    if(Game.socket?.readyState == WebSocket.OPEN){
        Game.socket.close()
    }
})
