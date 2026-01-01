import { Game } from './game.js'
import { sendRoomCreate, sendRoomJoin, sendStartBotGame, sendBotVsBot } from './network.js'

export const setupRoomMenu = _ => {
    const layout = document.getElementById("layout")
    const menu = document.getElementById("room-menu")

    const createBtn = document.getElementById("create-room-btn")
    const joinBtn   = document.getElementById("join-room-btn")
    const joinInput = document.getElementById("join-room-input")
    const statusBox = document.getElementById("room-status")
    const copyBtn = document.getElementById("copy-room-btn")

    const promoUi = document.getElementById('promotion-ui')

    const returnHomeBtn = document.getElementById('return-home')


    if (copyBtn) {
        copyBtn.addEventListener("click", _ => {
            const text = document.getElementById("room-display").textContent.replace("Room: ", "")
            navigator.clipboard.writeText(text)
            copyBtn.textContent = "Copied!"
            setTimeout(_ => copyBtn.textContent = "Copy", 1000)
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

    promoUi.onclick = e => {
        const piece = e.target.dataset.piece
        if(!piece) return

        const from = +promoUi.dataset.from
        const to = +promoUi.dataset.to

        Game.socket.send(JSON.stringify({
            type: 'promotionChoice',
            from,
            to,
            promotion: piece
        }))

        promoUi.classList.add('hidden')
    }

    returnHomeBtn.onclick = _ => {
        layout.classList.add('hidden')
        document.getElementById('game-over-overlay').classList.add('hidden')
        menu.classList.remove('hidden')

        Game.state = 'idle'
        Game.gameOver = null
        Game.turn = null
        Game.fen = null
        Game.check = null
        Game.playerColor = null

        Game.draggedPiece = null
        Game.pendingMove = null
        Game.legalMoves = []
        Game.lastMove = null

        Game.cells?.forEach(c => {
            c.isLegalTarget = false
            c.occupied = false
            c.occupiedBy = ''
        })

        Game.pieces = []

        Game.socket.send(JSON.stringify({ type: 'leaveRoom' }))

        //if(Game.socket && Game.socket.readyState == WebSocket.OPEN) Game.socket.close()
    }

    Game.onBotListReceived = bots => {
        //console.log(`[roomMenu.js] received bot list:`, bots)

        const categoryOrder = [
            'Beginner',
            'Novice',
            'Apprentice',
            'Intermediate',
            'Advanced',
            'Expert',
            'Master',

            //Fun categories
            'Category A',
            'Category B'
        ]

        const container = document.querySelector('#local .grid')
        //console.log('bot container element', container)
        container.innerHTML = ''

        const grouped = {}

        bots.forEach(bot => {
            if(!grouped[bot.category]) grouped[bot.category] = []
            grouped[bot.category].push(bot)
        })

        categoryOrder.forEach(category => {
            const list = grouped[category]
            if(!list) return

            const header = document.createElement('h2')
            header.textContent = category
            header.className = 'text-xl font-bold col-span-full mt-8 mb-2 text-center text-(--text-main)'

            container.appendChild(header)

            list.sort((a, b) => a.elo - b.elo)

            for(const bot of list){
                const btn = document.createElement('button')
                btn.className = 'group relative flex flex-col items-center bg-(--bg-panel) border border-(--border-soft) rounded-lg p-4 hover:border-(--accent-primary) hover:bg-(--border-strong) hover:cursor-pointer transition'
                btn.innerHTML = `
                    <div class="mb-3">
                        ${bot.image ? `<img src="${bot.image}" class="w-12 h-12 object-contain" />` : `<i class="fa-solid fa-3x ${bot.icon}"></i>` }
                    </div>
                    <div class="text-center">
                        <span class="text-(--text-main) font-semibold">${bot.name}</span>
                        <span class="text-(--text-muted) font-light">(${bot.elo})</span>
                    </div>
                    <div class="pointer-events-none absolute bottom-full mb-3 w-56 rounded-md border border-(--border-soft) bg-(--bg-panel) p-3 text-sm text-(--text-muted) opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100">
                        ${bot.description}
                    </div>
                `

                btn.addEventListener('click', _ => {
                    sendStartBotGame(bot.id)
                })

                container.appendChild(btn)
            }
        })
    }

    document.getElementById('bot-vs-bot').onclick = _ => {
        sendBotVsBot('Learner', 'Competitive')
    }
    
    
    Game.onRoomCreated = code => {
        showStatus('Room created!  Share this code:')
        statusBox.innerHTML = `<strong>${code}</strong>`
    }

    Game.onRoomJoined = _ => {
        menu.classList.add('hidden')
        layout.classList.remove('hidden')

        //console.log(layout)

        requestAnimationFrame(_ => {
            requestAnimationFrame(_ => {
                Game.canvas.width = Game.canvas.clientWidth
                Game.canvas.height = Game.canvas.clientHeight
            })
        })


        console.log('Client joined room!')
    }

    Game.onRoomError = msg => {
        showStatus(`Error: ${msg}`)
    }
}
