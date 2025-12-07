import { Game } from "./game.js"
import { addChatMessage } from "./chat.js"

const host = window.location.hostname

export const setupNetwork = onFenInit => {
    Game.socket = new WebSocket(`ws://${host}:8000`)

    Game.socket.onopen = _ => {
        console.log('Connected')
    }

    Game.socket.onmessage = msg => {
        const data = JSON.parse(msg.data)

        switch(data.type){
            case 'roomCreated':
                Game.onRoomCreated?.(data.code)
                setRoomCodeDisplay(data.code)
                return
            
            case 'roomJoined':
                Game.onRoomJoined?.()
                if(data.code) setRoomCodeDisplay(data.code)
                return
            
            case 'error':
                Game.onRoomError?.(data.message)
                return
            
            case 'init': return onFenInit(data.fen)

            case 'assignColor':
                Game.playerColor = data.color
                return

            case 'chat': return addChatMessage(data.username, data.payload, false)

            case 'move': 
                Game.pendingMove = null
                const { from, to, fen} = data

                const piece = Game.pieces.find(p => p.currentCell.num == from)
                if(!piece){
                    console.error('Could not find piece for move', data)
                    return
                }

                const targetCell = Game.cells.find(c => c.num == to)
                if(!targetCell){
                    console.error('Target cell not found', to)
                    return
                }

                if(data.captured){

                    const capturedColor = data.captured == data.captured.toUpperCase() ? 'white' : 'black'
                    const capturedCell = data.capturedCell

                    Game.pieces = Game.pieces.filter(p => {
                        const pieceColor = p.piece.toUpperCase() == p.piece ? 'white' : 'black'

                        const isSameCell = p.currentCell.num == capturedCell
                        const isSameType = p.piece.toLowerCase() == data.captured.toLowerCase()
                        const isSameColor = pieceColor == capturedColor

                        return !(isSameCell && isSameType && isSameColor)
                    })
                }

                piece.currentCell.occupied = false
                piece.currentCell.occupiedBy = ''

                targetCell.occupied = true
                targetCell.occupiedBy = piece.piece

                piece.x = targetCell.x
                piece.y = targetCell.y
                piece.currentCell = targetCell

                Game.fen = fen

                Game.draggedPiece = null
                Game.cells.forEach(cell => cell.isLegalTarget = false)
                Game.legalMoves = []

                return

            case 'legalMoves': 
                Game.legalMoves = data.moves
                return Game.onLegalMoves?.(data.from, data.moves)

            case 'illegalMove': 
                console.log('Illegal move detected', data?.reason)

                if(Game.pendingMove){
                    const { piece, originalX, originalY } = Game.pendingMove
                    piece.x = originalX
                    piece.y = originalY
                    piece.currentCell = piece.originalCell
                }

                Game.pendingMove = null
                Game.cells.forEach(cell => cell.isLegalTarget = false)
                Game.legalMoves = []
                Game.draggedPiece = null
                return
        }
    }

    Game.socket.onclose = _ => {
        console.log('Disconnected from server')
    }
}

export const sendRoomCreate = _ => {
    Game.socket.send(JSON.stringify({
        type: 'createRoom'
    }))
}

export const sendRoomJoin = code => {
    Game.socket.send(JSON.stringify({
        type: 'joinRoom',
        code
    }))
}

export const sendChatMessage = msg => {
    if(!Game.socket || Game.socket.readyState != WebSocket.OPEN) return

    Game.socket.send(JSON.stringify({
        type: 'chat',
        username: Game.username,
        payload: msg
    }))

    addChatMessage(Game.username, msg, true)
}

export const setRoomCodeDisplay = code => {
    const el = document.getElementById("room-display")
    if (el) el.textContent = "Room: " + code
}