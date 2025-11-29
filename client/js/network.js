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
            case 'init': return onFenInit(data.fen)
            case 'assignColor': return Game.playerColor = data.color
            case 'chat': return addChatMessage(data.username, data.payload, false)
            case 'move': return console.log('Move detected')
        }
    }

    Game.socket.onclose = _ => {
        console.log('Disconnected from server')
    }
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