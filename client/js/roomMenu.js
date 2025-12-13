import { Game } from './game.js'
import { sendRoomCreate, sendRoomJoin } from './network.js'

export const setupRoomMenu = _ => {
    const layout = document.getElementById("layout")
    const menu = document.getElementById("room-menu")

    const createBtn = document.getElementById("create-room-btn")
    const joinBtn   = document.getElementById("join-room-btn")
    const joinInput = document.getElementById("join-room-input")
    const statusBox = document.getElementById("room-status")
    const copyBtn = document.getElementById("copy-room-btn")

    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const text = document.getElementById("room-display").textContent.replace("Room: ", "")
            navigator.clipboard.writeText(text)
            copyBtn.textContent = "✓"
            setTimeout(() => copyBtn.textContent = "📋", 800)
        })
    }

    const showStatus = text => {
        statusBox.textContent = text
    }

    createBtn.onclick = _ => {
        showStatus('Creating room...')
        sendRoomCreate()
    }

    joinBtn.onclick = _ => {
        const code = joinInput.value.trim().toUpperCase()
        if(!code.length){
            showStatus('Enter a room code')
            return
        }
        showStatus('Joining room...')
        sendRoomJoin(code)
    }
    
    Game.onRoomCreated = code => {
        showStatus('Room created!  Share this code:')
        statusBox.innerHTML = `<strong>${code}</strong>`
    }

    Game.onRoomJoined = _ => {
        menu.classList.add('hidden')
        layout.classList.remove('hidden')

        Game.canvas.width = Game.canvas.clientWidth
        Game.canvas.height = Game.canvas.clientHeight

        window.dispatchEvent(new Event('resize'))
    }

    Game.onRoomError = msg => {
        showStatus(`Error: ${msg}`)
    }
}
