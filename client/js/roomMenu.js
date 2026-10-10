import { Game } from './game.js'
import { sendRoomCreate, sendRoomJoin, sendStartBotGame, sendBotVsBot, sendStartTournament, sendStartTraining } from './network.js'

const categoryOrder = [
    'Beginner',
    'Novice',
    'Apprentice',
    'Intermediate',
    'Advanced',
    'Expert',
    'Master',
    'Evolved',

    //Fun categories
    'Category A',
    'Category B'
]

const renderBotCard = (bot, { selected = false, onClick } = {}) => {
    const btn = document.createElement('button')
    btn.className = `group relative flex flex-col items-center bg-(--bg-panel) border rounded-lg p-4 hover:border-(--accent-primary) hover:bg-(--border-strong) hover:cursor-pointer transition ${selected ? 'border-(--accent-primary) ring-2 ring-(--accent-primary)' : 'border-(--border-soft)'}`
    btn.innerHTML = `
        <div class="mb-3">
            ${bot.image ? `<img src="${bot.image}" class="w-12 h-12 object-contain" />` : `<i class="fa-solid fa-3x ${bot.icon}"></i>` }
        </div>
        <div class="text-center">
            <span class="text-(--text-main) font-semibold">${bot.name}</span>
            <span class="text-(--text-muted) font-light">(${bot.elo})</span>
        </div>
        <div class="pointer-events-none absolute bottom-full mb-3 w-56 rounded-md border border-(--border-soft) bg-(--bg-panel) p-3 text-sm text-(--text-muted) opacity-0 scale-95 transition-all duration-150 group-hover:opacity-100 group-hover:scale-100 z-10">
            ${bot.description}
        </div>
    `

    if(onClick) btn.addEventListener('click', _ => onClick(bot))

    return btn
}

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
        Game.matchInfo = null
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

    const groupByCategory = bots => {
        const grouped = {}
        bots.forEach(bot => {
            if(!grouped[bot.category]) grouped[bot.category] = []
            grouped[bot.category].push(bot)
        })
        return grouped
    }

    Game.onBotListReceived = bots => {
        Game.botList = bots

        const container = document.querySelector('#local .grid')
        container.innerHTML = ''

        const grouped = groupByCategory(bots)

        categoryOrder.forEach(category => {
            const list = grouped[category]
            if(!list) return

            const header = document.createElement('h2')
            header.textContent = category
            header.className = 'text-xl font-bold col-span-full mt-8 mb-2 text-center text-(--text-main)'
            container.appendChild(header)

            list.sort((a, b) => a.elo - b.elo)

            for(const bot of list){
                container.appendChild(renderBotCard(bot, { onClick: b => sendStartBotGame(b.id) }))
            }
        })

        renderBotVsBotPanel()
        renderTournamentGrid()
    }

    // ------ Panel toggling ------

    const panels = {
        battle: document.getElementById('bot-vs-bot-panel'),
        tournament: document.getElementById('tournament-panel'),
        training: document.getElementById('training-panel')
    }

    const togglePanel = key => {
        Object.entries(panels).forEach(([k, el]) => {
            if(!el) return
            if(k == key) el.classList.toggle('hidden')
            else el.classList.add('hidden')
        })
    }

    document.getElementById('bot-vs-bot-btn').onclick = _ => togglePanel('battle')
    document.getElementById('tournament-btn').onclick = _ => togglePanel('tournament')
    document.getElementById('train-bot-btn').onclick = _ => togglePanel('training')

    // ------ Bot vs Bot picker ------

    const bvbSelection = { white: null, black: null }

    const renderBotVsBotPanel = _ => {
        const whiteGrid = document.getElementById('bvb-white-grid')
        const blackGrid = document.getElementById('bvb-black-grid')
        const startBtn = document.getElementById('bvb-start-btn')
        if(!whiteGrid || !blackGrid) return

        whiteGrid.innerHTML = ''
        blackGrid.innerHTML = ''

        Game.botList.forEach(bot => {
            whiteGrid.appendChild(renderBotCard(bot, {
                selected: bvbSelection.white == bot.id,
                onClick: b => { bvbSelection.white = b.id; renderBotVsBotPanel() }
            }))
            blackGrid.appendChild(renderBotCard(bot, {
                selected: bvbSelection.black == bot.id,
                onClick: b => { bvbSelection.black = b.id; renderBotVsBotPanel() }
            }))
        })

        if(startBtn) startBtn.disabled = !(bvbSelection.white && bvbSelection.black)
    }

    document.getElementById('bvb-start-btn').onclick = _ => {
        if(!bvbSelection.white || !bvbSelection.black) return
        sendBotVsBot(bvbSelection.white, bvbSelection.black)
    }

    // ------ Tournament ------

    const tournamentSelection = new Set()

    const renderTournamentGrid = _ => {
        const grid = document.getElementById('tournament-grid')
        if(!grid) return

        if(!tournamentSelection.size){
            Game.botList.forEach(b => tournamentSelection.add(b.id))
        }

        grid.innerHTML = ''
        Game.botList.forEach(bot => {
            grid.appendChild(renderBotCard(bot, {
                selected: tournamentSelection.has(bot.id),
                onClick: b => {
                    if(tournamentSelection.has(b.id)) tournamentSelection.delete(b.id)
                    else tournamentSelection.add(b.id)
                    renderTournamentGrid()
                }
            }))
        })
    }

    document.getElementById('tournament-start-btn').onclick = _ => {
        const ids = [...tournamentSelection]
        if(ids.length < 2) return

        const games = +document.getElementById('tournament-games').value || 2

        document.getElementById('tournament-log').innerHTML = ''
        document.getElementById('tournament-standings').innerHTML = ''

        sendStartTournament(ids, games)
    }

    Game.onTournamentProgress = data => {
        const log = document.getElementById('tournament-log')
        if(!log) return

        const { white, black, result, gamesPlayed, totalGames } = data
        const whiteName = Game.botList.find(b => b.id == white)?.name || white
        const blackName = Game.botList.find(b => b.id == black)?.name || black
        const outcome = result.result == 'draw'
            ? 'Draw'
            : (result.result == 'white' ? `${whiteName} wins` : `${blackName} wins`)

        const line = document.createElement('div')
        line.textContent = `[${gamesPlayed}/${totalGames}] ${whiteName} vs ${blackName}: ${outcome} (${result.reason})`
        log.appendChild(line)
        log.scrollTop = log.scrollHeight
    }

    Game.onTournamentComplete = data => {
        const standingsEl = document.getElementById('tournament-standings')
        if(standingsEl){
            const rows = Object.entries(data.standings)
                .map(([id, r]) => ({ id, name: Game.botList.find(b => b.id == id)?.name || id, ...r }))
                .filter(r => tournamentSelection.has(r.id))
                .sort((a, b) => b.elo - a.elo)

            standingsEl.innerHTML = '<div class="font-bold mb-1">Final Standings</div>' +
                rows.map(r => `<div class="flex justify-between"><span>${r.name}</span><span>${r.elo} (${r.wins}W ${r.losses}L ${r.draws}D)</span></div>`).join('')
        }

        Game.socket.send(JSON.stringify({ type: 'getBotList' }))
    }

    // ------ Training ------

    document.getElementById('train-start-btn').onclick = _ => {
        const generations = +document.getElementById('train-generations').value || 6
        const population = +document.getElementById('train-population').value || 8
        const games = +document.getElementById('train-games').value || 1

        document.getElementById('train-log').innerHTML = ''

        sendStartTraining(generations, population, games)
    }

    Game.onTrainingProgress = data => {
        const log = document.getElementById('train-log')
        if(!log) return

        const line = document.createElement('div')
        line.textContent = `Generation ${data.generation}/${data.generations}: best this gen ${data.bestFitnessThisGen}, best ever ${data.bestFitnessEver}`
        log.appendChild(line)
        log.scrollTop = log.scrollHeight
    }

    Game.onTrainingComplete = data => {
        const log = document.getElementById('train-log')
        if(log){
            const line = document.createElement('div')
            line.className = 'font-bold text-(--text-main)'
            line.textContent = `Done! New bot created: ${data.bot.name}`
            log.appendChild(line)
            log.scrollTop = log.scrollHeight
        }

        Game.onBotListReceived?.(data.bots)
    }

    // ------ Matchup display ------

    Game.onMatchInfo = info => {
        const el = document.getElementById('matchup-info')
        if(!el) return

        const label = (side, color) => {
            if(side.type == 'bot') return `${side.name} (${side.elo})`
            if(Game.playerColor == color) return 'You'
            return color == 'white' ? 'White' : 'Black'
        }

        el.textContent = `White: ${label(info.white, 'white')}  vs  Black: ${label(info.black, 'black')}`
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
