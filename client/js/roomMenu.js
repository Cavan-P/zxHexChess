import { Game } from './game.js'
import { addSystemMessage } from './chat.js'
import { ratingLabel, requestLeaderboard, getBeatenBots, markBotBeaten } from './profile.js'
import { sendRematch, sendRoomCreate, sendRoomJoin, sendStartBotGame, sendBotVsBot, sendStartTournament, sendStartTraining, sendResign, sendOfferDraw, sendAcceptDraw, sendDeclineDraw, sendLeaveRoom } from './network.js'

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

const el = (tag, className = '', text = '') => {
    const node = document.createElement(tag)
    if(className) node.className = className
    if(text) node.textContent = text
    return node
}

const safeIcon = icon => /^[a-z0-9- ]+$/i.test(icon || '') ? icon : 'fa-chess-pawn'

// Bot cards are built with DOM APIs (not innerHTML) and show the description inline,
// so they work on touch screens where hover tooltips don't.
const renderBotCard = (bot, { selected = false, compact = false, beaten = false, onClick } = {}) => {
    const card = el('button', `bot-card${selected ? ' is-selected' : ''}${beaten ? ' is-beaten' : ''}`)
    card.type = 'button'

    const avatar = el('span', 'bot-avatar relative')
    avatar.append(el('i', `fa-solid ${safeIcon(bot.icon)}`))

    if(beaten){
        const badge = el('span', 'beaten-badge')
        badge.title = `You've beaten ${bot.name}`
        badge.append(el('i', 'fa-solid fa-check'))
        avatar.append(badge)
        card.setAttribute('aria-label', `${bot.name}, beaten`)
    }

    const body = el('span', 'min-w-0 flex-1')
    const top = el('span', 'flex items-center justify-between gap-2')
    top.append(el('span', 'truncate font-semibold text-(--text-strong)', bot.name), el('span', 'elo-badge', String(bot.elo)))
    body.append(top)

    if(!compact && bot.description){
        body.append(el('span', 'mt-1 text-sm leading-snug text-(--text-main)', bot.description))
    }

    card.append(avatar, body)
    if(onClick) card.addEventListener('click', _ => onClick(bot))
    return card
}

// Time controls, "minutes + seconds per move". Must match TIME_CONTROLS in server/src/rooms/room.js.
const TIME_CONTROL_GROUPS = [
    { label: 'Bullet', items: ['1+0', '2+1'] },
    { label: 'Blitz', items: ['3+0', '3+2', '5+0', '5+3'] },
    { label: 'Rapid', items: ['10+0', '10+5', '15+0', '15+10'] },
    { label: 'Classical', items: ['30+0', '30+20'] }
]

const describeTimeControl = name => {
    const [minutes, seconds] = name.split('+').map(Number)
    return `${name}  ·  ${minutes} min${seconds ? ` + ${seconds}s per move` : ''}`
}

const SPRITE_COLUMNS = { k: 0, q: 1, b: 2, n: 3, r: 4, p: 5 }

// Gliński starting army, and piece values for the material count.
const START_COUNT = { p: 9, n: 2, b: 3, r: 2, q: 1 }
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 }
const CAPTURE_ORDER = ['q', 'r', 'b', 'n', 'p']

// From the position alone: which enemy pieces each side has captured, and each side's material
// total. Promotions can leave a side with "more" of a piece than it started with; that never
// shows as a captured piece, but the material score still counts it correctly.
const materialFromFen = fen => {
    const count = { white: { p: 0, n: 0, b: 0, r: 0, q: 0 }, black: { p: 0, n: 0, b: 0, r: 0, q: 0 } }
    for(const ch of fen || ''){
        const lower = ch.toLowerCase()
        if(!(lower in START_COUNT)) continue
        count[ch == lower ? 'black' : 'white'][lower]++
    }

    const total = color => Object.entries(count[color]).reduce((sum, [p, n]) => sum + n * VALUES[p], 0)
    const capturedBy = color => {
        const enemy = color == 'white' ? 'black' : 'white'
        return CAPTURE_ORDER.flatMap(p => Array(Math.max(0, START_COUNT[p] - count[enemy][p])).fill(p))
    }

    return {
        white: { captured: capturedBy('white'), total: total('white') },
        black: { captured: capturedBy('black'), total: total('black') }
    }
}

// Paints a piece from the sprite sheet into an element (used by the promotion dialog).
const paintSprite = (node, piece, color) => {
    const col = SPRITE_COLUMNS[piece]
    Object.assign(node.style, {
        display: 'block',
        width: '72%',
        height: '72%',
        backgroundImage: 'url(./img/pieces.png)',
        backgroundSize: '600% 200%',
        backgroundPosition: `${col * 20}% ${color == 'black' ? 100 : 0}%`
    })
}

export const setupRoomMenu = _ => {
    const layout = document.getElementById("layout")
    const menu = document.getElementById("room-menu")

    const createBtn = document.getElementById("create-room-btn")
    const joinForm = document.getElementById("join-form")
    const joinInput = document.getElementById("join-room-input")
    const statusBox = document.getElementById("room-status")
    const copyBtn = document.getElementById("copy-room-btn")

    const promoUi = document.getElementById('promotion-ui')
    const returnHomeBtn = document.getElementById('return-home')

    copyBtn.addEventListener("click", _ => {
        navigator.clipboard?.writeText(document.getElementById("room-display").textContent)
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i>'
        setTimeout(_ => copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>', 1200)
    })

    const showStatus = text => {
        statusBox.textContent = text
    }

    // ------ Time controls ------

    // Each picker remembers its last choice in this browser.
    const timeControlPicker = (id, fallback = '') => {
        const select = document.getElementById(id)
        select.append(new Option('No clock', ''))
        for(const group of TIME_CONTROL_GROUPS){
            const optgroup = document.createElement('optgroup')
            optgroup.label = group.label
            for(const name of group.items) optgroup.append(new Option(describeTimeControl(name), name))
            select.append(optgroup)
        }
        const key = `qrs.tc.${id}`
        try { select.value = localStorage.getItem(key) ?? fallback } catch(e){ select.value = fallback }
        if(select.selectedIndex < 0) select.value = fallback
        select.onchange = _ => { try { localStorage.setItem(key, select.value) } catch(e){} }
        return _ => select.value || null
    }

    const friendTimeControl = timeControlPicker('tc-friend')
    const botTimeControl = timeControlPicker('tc-bot')
    const battleTimeControl = timeControlPicker('tc-battle')

    createBtn.onclick = _ => {
        showStatus('')
        sendRoomCreate(friendTimeControl())
    }

    joinForm.onsubmit = e => {
        e.preventDefault()
        const code = joinInput.value.trim().toUpperCase()
        if(!code.length) return showStatus('Enter a room code to join.')
        showStatus('')
        sendRoomJoin(code)
    }

    // ------ Promotion ------

    Game.onPromotionRequired = _ => {
        const color = Game.playerColor == 'black' ? 'black' : 'white'
        promoUi.querySelectorAll('[data-sprite]').forEach(node => paintSprite(node, node.dataset.sprite, color))
    }

    promoUi.onclick = e => {
        const option = e.target.closest('[data-piece]')
        if(!option) return

        Game.socket.send(JSON.stringify({
            type: 'promotionChoice',
            from: +promoUi.dataset.from,
            to: +promoUi.dataset.to,
            promotion: option.dataset.piece
        }))

        promoUi.classList.add('hidden')
    }

    // ------ In-game controls ------

    const gameOverOverlay = document.getElementById('game-over-overlay')
    const resignBtn = document.getElementById('resign-btn')
    const drawBtn = document.getElementById('draw-btn')
    const leaveBtn = document.getElementById('leave-btn')
    const drawOfferBox = document.getElementById('draw-offer')
    const moveList = document.getElementById('move-list')
    const controls = document.getElementById('game-controls')

    const isPlaying = _ => Game.state == 'playing' && (Game.playerColor == 'white' || Game.playerColor == 'black')
    const isBotGame = _ => Game.matchInfo?.white?.type == 'bot' || Game.matchInfo?.black?.type == 'bot'

    const setButton = (btn, icon, label) => {
        btn.replaceChildren(el('i', icon), el('span', '', label))
    }

    const rematchBtn = document.getElementById('rematch-btn')
    const rematchModalBtn = document.getElementById('rematch-modal-btn')
    const rematchOfferBox = document.getElementById('rematch-offer')

    const updateControls = _ => {
        const playing = isPlaying()
        const showDraw = playing && !isBotGame()

        controls.classList.toggle('hidden', !playing)
        controls.classList.toggle('grid-cols-2', showDraw)
        resignBtn.classList.toggle('hidden', !playing)
        drawBtn.classList.toggle('hidden', !showDraw)

        setButton(leaveBtn, playing ? 'fa-solid fa-arrow-right-from-bracket' : 'fa-solid fa-house', playing ? 'Leave' : 'Home')

        const iOffered = Game.drawOffer && Game.drawOffer == Game.playerColor
        drawBtn.disabled = Boolean(Game.drawOffer)
        setButton(drawBtn, 'fa-solid fa-handshake', iOffered ? 'Draw offered' : 'Offer draw')

        const theyOffered = playing && Game.drawOffer && Game.drawOffer != Game.playerColor
        drawOfferBox.classList.toggle('hidden', !theyOffered)

        // Rematch: after the game, for players (and for anyone watching a bot battle).
        const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
        const botBattle = Game.matchInfo?.white?.type == 'bot' && Game.matchInfo?.black?.type == 'bot'
        const over = Game.state == 'gameOver'
        const canRematch = over && (seated || botBattle)
        const opponent = Game.playerColor == 'white' ? 'black' : 'white'
        const opponentGone = seated && !isBotGame() && Game.presence && !Game.presence[opponent]
        const iAsked = Game.rematchOffer && Game.rematchOffer == Game.playerColor

        for(const btn of [rematchBtn, rematchModalBtn]){
            btn.classList.toggle('hidden', !canRematch)
            btn.disabled = Boolean(iAsked || opponentGone)
            setButton(btn, 'fa-solid fa-rotate', opponentGone ? 'Opponent left' : iAsked ? 'Waiting for opponent…' : 'Rematch')
        }
        rematchOfferBox.classList.toggle('hidden', !(over && seated && Game.rematchOffer && !iAsked && !opponentGone))
    }

    const requestRematch = _ => {
        if(!isBotGame() && (Game.playerColor == 'white' || Game.playerColor == 'black')) Game.rematchOffer = Game.playerColor
        sendRematch()
        updateControls()
    }

    Game.onDrawOfferChanged = updateControls
    Game.onGameOver = _ => {
        updateControls()
        updatePlayers()

        // Beat a bot? Remember it so its card gets a checkmark.
        const opponent = Game.playerColor == 'white' ? 'black' : 'white'
        const bot = Game.matchInfo?.[opponent]
        const seated = Game.playerColor == 'white' || Game.playerColor == 'black'
        if(seated && bot?.type == 'bot' && Game.result?.winner == Game.playerColor){
            markBotBeaten(bot.id)
            renderBotGrid()
        }
    }

    // ------ Players ------

    const updatePlayers = _ => {
        const info = Game.matchInfo
        if(!info) return

        const bottomColor = Game.playerColor == 'black' ? 'black' : 'white'
        const topColor = bottomColor == 'white' ? 'black' : 'white'
        const seated = Game.playerColor == 'white' || Game.playerColor == 'black'

        const material = materialFromFen(Game.fen)

        // A row of little icons for the pieces this side has taken, plus "+N" if it's ahead.
        const capturedStrip = color => {
            const enemy = color == 'white' ? 'black' : 'white'
            const { captured, total } = material[color]
            const lead = total - material[enemy].total

            const strip = el('span', 'captured-strip')
            let previous = null
            for(const piece of captured){
                const icon = el('span', `captured-piece${piece == previous ? ' is-stacked' : ''}${enemy == 'white' ? ' is-white' : ''}`)
                icon.title = piece
                paintSprite(icon, piece, enemy)
                Object.assign(icon.style, { width: '', height: '', display: '' })
                strip.append(icon)
                previous = piece
            }
            if(lead > 0) strip.append(el('span', 'material-lead', `+${lead}`))
            return strip
        }

        const renderRow = (row, color) => {
            const side = info[color]
            const present = Game.presence ? Game.presence[color] : true

            const isMe = Game.playerColor == color
            let name
            if(side.type == 'bot') name = side.name
            else if(!present) name = isMe ? 'You' : 'Waiting for opponent…'
            else if(side.name) name = isMe ? `${side.name} (you)` : side.name
            else if(isMe) name = 'You'
            else name = seated ? 'Opponent' : (color == 'white' ? 'White' : 'Black')

            const swatch = el('span', 'swatch')
            swatch.style.background = color == 'white' ? '#fffaf3' : '#2b1b0f'

            const label = el('span', `min-w-0 truncate text-sm font-semibold ${side.type != 'bot' && !present ? 'text-(--text-muted) italic font-medium' : 'text-(--text-strong)'}`, name)

            const text = el('span', 'flex min-w-0 flex-col')
            text.append(label, capturedStrip(color))

            row.replaceChildren(swatch, text)
            if(side.elo != null && present) row.append(el('span', 'elo-badge', ratingLabel(side.elo, side.provisional)))
            if(Game.clock){
                const clock = el('span', 'clock')
                clock.dataset.color = color
                row.append(clock)
            }
            else row.append(el('span', 'turn-dot'))

            row.classList.toggle('is-turn', Game.state == 'playing' && Game.turn == color)
        }

        renderRow(document.getElementById('player-top'), topColor)
        renderRow(document.getElementById('player-bottom'), bottomColor)
    }

    Game.updatePlayers = updatePlayers
    Game.onMatchInfo = updatePlayers

    // ------ Bot speech bubble ------

    const bubble = document.getElementById('bot-bubble')
    let bubbleTimer = null

    Game.onBotSpeech = ({ username, payload, color }) => {
        // The bubble sits beside the speaking bot's side of the board.
        const bottomColor = Game.playerColor == 'black' ? 'black' : 'white'
        const atBottom = color == bottomColor

        bubble.classList.toggle('is-bottom', atBottom)
        bubble.classList.toggle('is-top', !atBottom)

        const icon = Game.matchInfo?.[color]?.icon
        document.getElementById('bot-bubble-avatar').replaceChildren(el('i', `fa-solid ${safeIcon(icon)}`))
        document.getElementById('bot-bubble-name').textContent = username
        document.getElementById('bot-bubble-text').textContent = payload

        bubble.classList.add('is-visible')
        clearTimeout(bubbleTimer)
        bubbleTimer = setTimeout(_ => bubble.classList.remove('is-visible'), 3500 + payload.length * 45)
    }

    // ------ Move list ------

    let history = []

    const renderMoveList = _ => {
        moveList.replaceChildren()

        if(!history.length){
            moveList.append(el('li', 'col-span-3 py-1 font-sans text-(--text-muted)', 'No moves yet'))
            return
        }

        for(let i = 0; i < history.length; i += 2){
            const isLastRow = i + 2 >= history.length
            moveList.append(
                el('li', 'text-right text-(--text-muted)', `${i / 2 + 1}.`),
                el('span', isLastRow && history.length % 2 == 1 ? 'bg-(--accent-primary)/50 font-semibold' : '', history[i]),
                el('span', isLastRow && history.length % 2 == 0 ? 'bg-(--accent-primary)/50 font-semibold' : '', history[i + 1] || '')
            )
        }

        moveList.scrollTop = moveList.scrollHeight
    }

    Game.onHistory = moves => { history = [...moves]; renderMoveList() }
    Game.onMovePlayed = notation => { if(notation){ history.push(notation); renderMoveList() } }

    resignBtn.onclick = _ => {
        if(isPlaying() && confirm('Resign this game?')) sendResign()
    }

    drawBtn.onclick = _ => {
        if(isPlaying() && !Game.drawOffer) sendOfferDraw()
    }

    document.getElementById('draw-accept-btn').onclick = _ => sendAcceptDraw()
    document.getElementById('draw-decline-btn').onclick = _ => sendDeclineDraw()

    document.getElementById('view-board').onclick = _ => gameOverOverlay.classList.add('hidden')
    rematchBtn.onclick = requestRematch
    rematchModalBtn.onclick = requestRematch
    document.getElementById('rematch-accept-btn').onclick = requestRematch

    const returnHome = _ => {
        layout.classList.add('hidden')
        gameOverOverlay.classList.add('hidden')
        promoUi.classList.add('hidden')
        menu.classList.remove('hidden')
        window.scrollTo(0, 0)

        sendLeaveRoom()
        requestLeaderboard()

        Game.state = 'idle'
        Game.result = null
        Game.drawOffer = null
        Game.opponentAway = false
        Game.presence = null
        history = []
        renderMoveList()
        document.getElementById('chat-box').replaceChildren()
        showStatus('')
        Game.turn = null
        Game.clock = null
        Game.fen = null
        Game.check = null
        Game.matchInfo = null
        Game.playerColor = null

        Game.draggedPiece = null
        Game.selectedPiece = null
        Game.pendingMove = null
        Game.legalMoves = []
        Game.lastMove = null

        Game.cells?.forEach(c => {
            c.isLegalTarget = false
            c.occupied = false
            c.occupiedBy = ''
        })

        Game.pieces = []
        bubble.classList.remove('is-visible')
    }

    returnHomeBtn.onclick = returnHome

    leaveBtn.onclick = _ => {
        if(isPlaying() && history.length && !confirm('Leaving now resigns the game. Leave anyway?')) return
        returnHome()
    }

    // ------ Bot color choice ------

    let botColorChoice = 'white'

    const colorButtons = [...document.querySelectorAll('.bot-color-btn')]
    const renderColorChoice = _ => colorButtons.forEach(btn => {
        const active = btn.dataset.color == botColorChoice
        btn.classList.toggle('is-active', active)
        btn.setAttribute('aria-pressed', active)
    })
    colorButtons.forEach(btn => btn.onclick = _ => { botColorChoice = btn.dataset.color; renderColorChoice() })
    renderColorChoice()

    const pickBotColor = _ => botColorChoice == 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : botColorChoice


    // ------ Bot list ------

    const sortBots = bots => {
        const rank = c => { const i = categoryOrder.indexOf(c); return i < 0 ? categoryOrder.length : i }
        return [...bots].sort((a, b) => rank(a.category) - rank(b.category) || a.elo - b.elo)
    }

    Game.onBotListReceived = bots => {
        Game.botList = sortBots(bots)

        document.getElementById('tournament-btn').classList.toggle('hidden', !Game.labEnabled)
        document.getElementById('train-bot-btn').classList.toggle('hidden', !Game.labEnabled)

        renderBotGrid()
        renderBotVsBotPanel()
        renderTournamentGrid()
    }

    const renderBotGrid = _ => {
        const beaten = getBeatenBots()
        const beatenCount = Game.botList.filter(b => beaten.has(b.id)).length
        const tiers = new Set(Game.botList.map(b => b.category)).size

        document.getElementById('bot-count').textContent = beatenCount
            ? `${Game.botList.length} opponents across ${tiers} skill levels · ${beatenCount} beaten`
            : `${Game.botList.length} opponents across ${tiers} skill levels.`

        const container = document.getElementById('bot-grid')
        container.replaceChildren()

        let currentCategory = null
        for(const bot of Game.botList){
            if(bot.category != currentCategory){
                currentCategory = bot.category
                const inTier = Game.botList.filter(b => b.category == currentCategory)
                const tierBeaten = inTier.filter(b => beaten.has(b.id)).length
                const heading = el('h3', 'tier-heading', currentCategory)
                if(tierBeaten) heading.append(el('span', `tier-progress${tierBeaten == inTier.length ? ' is-complete' : ''}`, `${tierBeaten}/${inTier.length}`))
                container.append(heading)
            }
            container.append(renderBotCard(bot, { beaten: beaten.has(bot.id), onClick: b => sendStartBotGame(b.id, pickBotColor(), botTimeControl()) }))
        }
    }

    Game.refreshBotGrid = _ => { if(Game.botList?.length) renderBotGrid() }

    // ------ Panel toggling ------

    const panels = {
        battle: document.getElementById('bot-vs-bot-panel'),
        tournament: document.getElementById('tournament-panel'),
        training: document.getElementById('training-panel')
    }

    const togglePanel = key => {
        Object.entries(panels).forEach(([k, panel]) => {
            if(k == key) panel.classList.toggle('hidden')
            else panel.classList.add('hidden')
        })

        if(!panels[key].classList.contains('hidden')){
            panels[key].scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
    }

    document.getElementById('bot-vs-bot-btn').onclick = _ => togglePanel('battle')
    document.getElementById('tournament-btn').onclick = _ => togglePanel('tournament')
    document.getElementById('train-bot-btn').onclick = _ => togglePanel('training')

    // ------ Bot vs Bot picker ------

    const bvbSelection = { white: null, black: null }

    const renderBotVsBotPanel = _ => {
        const whiteGrid = document.getElementById('bvb-white-grid')
        const blackGrid = document.getElementById('bvb-black-grid')

        whiteGrid.replaceChildren()
        blackGrid.replaceChildren()

        Game.botList.forEach(bot => {
            whiteGrid.append(renderBotCard(bot, {
                compact: true,
                selected: bvbSelection.white == bot.id,
                onClick: b => { bvbSelection.white = b.id; renderBotVsBotPanel() }
            }))
            blackGrid.append(renderBotCard(bot, {
                compact: true,
                selected: bvbSelection.black == bot.id,
                onClick: b => { bvbSelection.black = b.id; renderBotVsBotPanel() }
            }))
        })

        document.getElementById('bvb-start-btn').disabled = !(bvbSelection.white && bvbSelection.black)
    }

    document.getElementById('bvb-start-btn').onclick = _ => {
        if(!bvbSelection.white || !bvbSelection.black) return
        sendBotVsBot(bvbSelection.white, bvbSelection.black, battleTimeControl())
    }

    // ------ Tournament ------

    const tournamentSelection = new Set()

    const renderTournamentGrid = _ => {
        const grid = document.getElementById('tournament-grid')

        if(!tournamentSelection.size){
            Game.botList.forEach(b => tournamentSelection.add(b.id))
        }

        grid.replaceChildren()
        Game.botList.forEach(bot => {
            grid.append(renderBotCard(bot, {
                compact: true,
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

        document.getElementById('tournament-log').replaceChildren()
        document.getElementById('tournament-standings').replaceChildren()

        sendStartTournament(ids, games)
    }

    const botName = id => Game.botList.find(b => b.id == id)?.name || id

    Game.onTournamentProgress = data => {
        const log = document.getElementById('tournament-log')

        const { white, black, result, gamesPlayed, totalGames } = data
        const outcome = result.result == 'draw'
            ? 'Draw'
            : `${botName(result.result == 'white' ? white : black)} wins`

        log.append(el('div', '', `[${gamesPlayed}/${totalGames}] ${botName(white)} vs ${botName(black)}: ${outcome} (${result.reason})`))
        log.scrollTop = log.scrollHeight
    }

    Game.onTournamentComplete = data => {
        const standingsEl = document.getElementById('tournament-standings')
        const rows = Object.entries(data.standings)
            .map(([id, r]) => ({ id, name: botName(id), ...r }))
            .filter(r => tournamentSelection.has(r.id))
            .sort((a, b) => b.elo - a.elo)

        standingsEl.replaceChildren(el('div', 'mb-1 font-semibold text-(--text-strong)', 'Final standings'))
        for(const r of rows){
            const row = el('div', 'flex justify-between border-b border-(--border-soft) py-1')
            row.append(el('span', '', r.name), el('span', 'tabular-nums', `${r.elo} (${r.wins}W ${r.losses}L ${r.draws}D)`))
            standingsEl.append(row)
        }

        Game.socket.send(JSON.stringify({ type: 'getBotList' }))
    }

    // ------ Training ------

    document.getElementById('train-start-btn').onclick = _ => {
        const generations = +document.getElementById('train-generations').value || 6
        const population = +document.getElementById('train-population').value || 8
        const games = +document.getElementById('train-games').value || 1

        document.getElementById('train-log').replaceChildren()

        sendStartTraining(generations, population, games)
    }

    Game.onTrainingProgress = data => {
        const log = document.getElementById('train-log')
        log.append(el('div', '', `Generation ${data.generation}/${data.generations}: best this gen ${data.bestFitnessThisGen}, best ever ${data.bestFitnessEver}`))
        log.scrollTop = log.scrollHeight
    }

    Game.onTrainingComplete = data => {
        const log = document.getElementById('train-log')
        log.append(el('div', 'font-semibold text-(--text-strong)', `Done! New bot created: ${data.bot.name}`))
        log.scrollTop = log.scrollHeight

        Game.onBotListReceived?.(data.bots)
    }

    // ------ Room lifecycle ------

    Game.onRoomCreated = _ => showStatus('')

    Game.onRoomJoined = (data = {}) => {
        menu.classList.add('hidden')
        layout.classList.remove('hidden')
        gameOverOverlay.classList.add('hidden')
        if(!data.rematch) window.scrollTo(0, 0)

        Game.state = 'playing'
        Game.rematchOffer = null
        Game.drawOffer = null
        Game.check = null
        if(data.rematch){
            const you = Game.playerColor == 'white' || Game.playerColor == 'black' ? ` You have ${Game.playerColor == 'white' ? 'White' : 'Black'}.` : ''
            addSystemMessage(`Rematch started.${you}`)
        }
        updatePlayers()
        updateControls()

        // The canvas only has a size once the layout is visible.
        requestAnimationFrame(_ => Game.resizeCanvas?.())
    }

    Game.onRoomError = msg => {
        showStatus(msg == 'Room not found' ? 'No game with that code. Check it and try again.' : msg)
    }

    renderMoveList()
}
