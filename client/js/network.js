import { Game } from "./game.js"
import { addChatMessage } from "./chat.js"

export const setupNetwork = onFenInit => {
    Game.socket = new WebSocket('ws://localhost:8000')

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

            case 'move': return console.log('Move detected')
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