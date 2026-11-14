import { Game } from './game.js'

// Premoves: while the opponent is thinking you can queue up moves. Each queued move is shown on
// the board straight away (the piece sits on its premoved cell), and the next one is picked from
// that imagined position. When your turn starts the first one plays if it's still legal (checked
// against the server's legal-move list); if it isn't, the whole queue is dropped.

// Gliński geometry in cube coordinates (taken from the server's move generator).
const ROOK_DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]]
const BISHOP_DIRS = [[2, -1, -1], [1, 1, -2], [-1, 2, -1], [-2, 1, 1], [-1, -1, 2], [1, -2, 1]]
const KNIGHT = [[1, -3, 2], [-1, -2, 3], [1, 2, -3], [-1, 3, -2], [2, -3, 1], [3, -2, -1], [3, -1, -2], [2, 1, -3], [-2, -1, 3], [-3, 1, 2], [-3, 2, 1], [-2, 3, -1]]
const KING = [...ROOK_DIRS, ...BISHOP_DIRS]
const PAWN = {
    white: { forward: [0, -1, 1], captures: [[1, -1, 0], [-1, 0, 1]], start: [56, 61, 62, 66, 68, 71, 74, 76, 80] },
    black: { forward: [0, 1, -1], captures: [[1, 0, -1], [-1, 1, 0]], start: [10, 14, 16, 19, 22, 24, 28, 29, 34] }
}

const cellAt = (q, r, s) => Game.cells.find(c => c.q == q && c.r == r && c.s == s)
const offset = (cell, [dq, dr, ds], k = 1) => cellAt(cell.q + dq * k, cell.r + dr * k, cell.s + ds * k)

// The board as it would look after the queued premoves: cell number -> piece.
const virtualBoard = _ => {
    const board = new Map()
    Game.pieces.forEach(p => { if(p.currentCell) board.set(p.currentCell.num, p) })
    for(const { from, to } of Game.premoves || []){
        const piece = board.get(from)
        if(!piece) break
        board.delete(from)
        board.set(to, piece)
    }
    return board
}

export const virtualOccupant = cellNum => virtualBoard().get(cellNum) || null

// Where a piece could possibly go by the time it's your turn. The board will change in between, so
// sliders ignore blockers; only cells holding your own pieces are ruled out.
export const premoveTargets = piece => {
    const from = piece.homeCell()
    const color = Game.playerColor
    const targets = []
    const board = virtualBoard()
    const add = cell => { if(cell && !board.get(cell.num)?.isMyPiece(color)) targets.push(cell.num) }

    switch(piece.piece.toLowerCase()){
        case 'p': {
            const p = PAWN[color]
            add(offset(from, p.forward))
            if(p.start.includes(from.num)) add(offset(from, p.forward, 2))
            p.captures.forEach(d => add(offset(from, d)))
            break
        }
        case 'n': KNIGHT.forEach(d => add(offset(from, d))); break
        case 'k': KING.forEach(d => add(offset(from, d))); break
        default: {
            const dirs = piece.piece.toLowerCase() == 'r' ? ROOK_DIRS : piece.piece.toLowerCase() == 'b' ? BISHOP_DIRS : KING
            for(const d of dirs) for(let k = 1; ; k++){
                const cell = offset(from, d, k)
                if(!cell) break
                add(cell)
            }
        }
    }
    return targets
}

export const canPremove = _ =>
    Game.state == 'playing' && Game.viewPly == null &&
    (Game.playerColor == 'white' || Game.playerColor == 'black') && Game.turn != Game.playerColor

// Puts every piece where the premove queue says it will be (and fades pieces it would capture).
export const refreshPremoves = _ => {
    Game.premoves ||= []
    const board = virtualBoard()
    const where = new Map([...board].map(([num, piece]) => [piece, num]))

    for(const piece of Game.pieces){
        const num = where.get(piece)
        piece.premoveCaptured = num == null
        piece.premoveCell = num != null && num != piece.currentCell?.num ? Game.cells[num] : null
        if(piece.isDragging || piece == Game.pendingMove?.piece) continue
        const home = piece.homeCell()
        if(home){ piece.targetX = home.x; piece.targetY = home.y }
    }
}

export const setPremove = (from, to) => {
    Game.premoves ||= []
    Game.premoves.push({ from, to })
    refreshPremoves()
}

export const cancelPremove = _ => {
    if(!Game.premoves?.length) return
    Game.premoves = []
    refreshPremoves()
}

// Called when your turn starts: play the next queued move if it's legal now, else drop the queue.
export const executePremove = _ => {
    const premove = Game.premoves?.[0]
    if(!premove) return
    if(Game.turn != Game.playerColor || Game.state != 'playing' || Game.viewPly != null) return cancelPremove()
    if(!Game.legalMap?.[premove.from]?.includes(premove.to)) return cancelPremove()

    const piece = Game.pieces.find(p => p.currentCell?.num == premove.from)
    const cell = Game.cells[premove.to]
    if(!piece || !cell) return cancelPremove()

    Game.premoves.shift()
    refreshPremoves()
    piece.tapMoveTo(cell, 'q')     // premoved pawns promote to a queen
}
