import { Game } from './game.js'

// The browser keeps { playerId, token } so the server can recognise this player next visit.
const STORAGE_KEY = 'qrs.profile'
const SKIP_KEY = 'qrs.profileSkipped'
const BEATEN_KEY = 'qrs.botsBeaten'

const storage = {
    get(key){ try { return JSON.parse(localStorage.getItem(key)) } catch(e){ return null } },
    set(key, value){ try { localStorage.setItem(key, JSON.stringify(value)) } catch(e){} },
    remove(key){ try { localStorage.removeItem(key) } catch(e){} }
}

const send = msg => {
    if(Game.socket?.readyState == WebSocket.OPEN) Game.socket.send(JSON.stringify(msg))
}

const $ = id => document.getElementById(id)

const initial = name => (name || '?').trim().charAt(0).toUpperCase()

// Bots this player has beaten: from their profile, plus any wins saved in this browser
// (so players who skipped making a profile still get their checkmarks).
export const getBeatenBots = _ => new Set([
    ...Object.keys(Game.profile?.botsBeaten || {}),
    ...(storage.get(BEATEN_KEY) || [])
])

export const markBotBeaten = botId => {
    const local = new Set(storage.get(BEATEN_KEY) || [])
    local.add(botId)
    storage.set(BEATEN_KEY, [...local])
}

// A small "HGM"-style badge for a title (or nothing). Hover shows the full name.
export const titleBadge = title => {
    if(!title) return null
    const badge = document.createElement('span')
    badge.className = 'title-badge'
    badge.textContent = title.code
    badge.title = title.name
    return badge
}

export const ratingLabel = (elo, provisional) => `${elo}${provisional ? '?' : ''}`

// ------ Rating history chart ------

const renderChart = history => {
    const svg = $('profile-chart')
    const ns = 'http://www.w3.org/2000/svg'
    svg.replaceChildren()

    if(!history || history.length < 2){
        const text = document.createElementNS(ns, 'text')
        text.setAttribute('x', '150')
        text.setAttribute('y', '44')
        text.setAttribute('text-anchor', 'middle')
        text.setAttribute('font-size', '11')
        text.style.fill = 'var(--text-muted)'
        text.textContent = 'Play a game to start your graph'
        svg.append(text)
        return
    }

    const values = history.map(h => h.elo)
    const min = Math.min(...values) - 10
    const max = Math.max(...values) + 10
    const x = i => (i / (values.length - 1)) * 292 + 4
    const y = v => 74 - ((v - min) / (max - min)) * 66

    const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)

    const area = document.createElementNS(ns, 'path')
    area.setAttribute('d', `M${points[0]} L${points.join(' L')} L${x(values.length - 1)},80 L${x(0)},80 Z`)
    area.style.fill = 'color-mix(in srgb, var(--accent-primary) 35%, transparent)'

    const line = document.createElementNS(ns, 'polyline')
    line.setAttribute('points', points.join(' '))
    line.setAttribute('fill', 'none')
    line.style.stroke = 'var(--accent-deep)'
    line.setAttribute('stroke-width', '2')
    line.setAttribute('vector-effect', 'non-scaling-stroke')
    line.setAttribute('stroke-linejoin', 'round')

    svg.append(area, line)
}

// ------ Profile modal ------

const modal = $('profile-modal')

const openSignup = _ => {
    $('profile-signup-form').classList.remove('hidden')
    $('profile-view').classList.add('hidden')
    $('profile-signup-error').textContent = ''
    modal.classList.remove('hidden')
    setTimeout(_ => $('profile-name-input').focus(), 50)
}

const openProfile = _ => {
    const p = Game.profile
    if(!p) return openSignup()

    $('profile-signup-form').classList.add('hidden')
    $('profile-view').classList.remove('hidden')

    $('profile-avatar').textContent = initial(p.name)
    $('profile-name').replaceChildren(...[titleBadge(p.title), document.createTextNode(p.name)].filter(Boolean))
    $('profile-subtitle').textContent = p.title
        ? p.title.name
        : p.provisional
            ? `Provisional rating · ${Math.max(0, 20 - p.gamesPlayed)} more games to settle`
            : 'Established rating · titles start at 1200'
    $('profile-elo').textContent = p.elo
    $('profile-peak').textContent = p.peak
    $('profile-games').textContent = p.gamesPlayed
    $('profile-record').textContent = `${p.wins}W · ${p.losses}L · ${p.draws}D`
    $('profile-rename-input').value = ''
    $('profile-rename-error').textContent = ''
    renderChart(p.history)

    modal.classList.remove('hidden')
}

const closeModal = _ => modal.classList.add('hidden')

const renderChip = _ => {
    const p = Game.profile
    $('profile-chip').classList.toggle('hidden', !p)
    $('profile-signup').classList.toggle('hidden', Boolean(p))
    if(!p) return

    $('profile-chip-avatar').textContent = initial(p.name)
    $('profile-chip-name').replaceChildren(...[titleBadge(p.title), document.createTextNode(p.name)].filter(Boolean))
    $('profile-chip-elo').textContent = ratingLabel(p.elo, p.provisional)
}

// ------ Leaderboard ------

const renderLeaderboard = players => {
    const list = $('leaderboard')
    list.replaceChildren()

    if(!players.length){
        const empty = document.createElement('li')
        empty.className = 'px-4 py-8 text-center text-sm text-(--text-muted)'
        empty.textContent = 'No rated games yet. Finish a game to claim the top spot.'
        list.append(empty)
        return
    }

    players.forEach((p, i) => {
        const row = document.createElement('li')
        const isMe = p.id == Game.profile?.id
        row.className = `flex items-center gap-3 px-4 py-2.5 text-sm ${isMe ? 'bg-(--accent-primary)/25' : ''}`

        const rank = document.createElement('span')
        rank.className = `w-7 flex-none text-center font-semibold tabular-nums ${i < 3 ? 'text-(--accent-deep)' : 'text-(--text-muted)'}`
        rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1)

        const avatar = document.createElement('span')
        avatar.className = 'grid h-7 w-7 flex-none place-items-center rounded-full bg-(--bg-sunken) text-xs font-bold text-(--text-strong)'
        avatar.textContent = initial(p.name)

        const name = document.createElement('span')
        name.className = 'min-w-0 flex-1 truncate font-medium text-(--text-strong)'
        name.replaceChildren(...[titleBadge(p.title), document.createTextNode(isMe ? `${p.name} (you)` : p.name)].filter(Boolean))

        const games = document.createElement('span')
        games.className = 'hidden text-xs text-(--text-muted) sm:inline'
        games.textContent = `${p.gamesPlayed} game${p.gamesPlayed == 1 ? '' : 's'}`

        const elo = document.createElement('span')
        elo.className = 'w-14 flex-none text-right font-bold tabular-nums text-(--text-strong)'
        elo.textContent = ratingLabel(p.elo, p.provisional)

        row.append(rank, avatar, name, games, elo)
        list.append(row)
    })
}

export const requestLeaderboard = _ => send({ type: 'getLeaderboard' })

// ------ Wiring ------

export const setupProfile = _ => {
    $('profile-chip').onclick = openProfile
    $('profile-signup').onclick = openSignup
    $('profile-close').onclick = closeModal
    modal.addEventListener('click', e => { if(e.target == modal) closeModal() })
    document.addEventListener('keydown', e => { if(e.key == 'Escape') closeModal() })

    $('profile-skip').onclick = _ => {
        storage.set(SKIP_KEY, true)
        closeModal()
    }

    $('profile-signup-form').onsubmit = e => {
        e.preventDefault()
        const name = $('profile-name-input').value.trim()
        if(name.length < 2) return $('profile-signup-error').textContent = 'Pick a name with at least 2 characters.'
        send({ type: 'register', name })
    }

    $('profile-rename-form').onsubmit = e => {
        e.preventDefault()
        const name = $('profile-rename-input').value.trim()
        if(name) send({ type: 'rename', name })
    }

    // Called by network.js once the socket opens.
    Game.onConnected = _ => {
        const saved = storage.get(STORAGE_KEY)
        if(saved?.playerId && saved?.token) send({ type: 'hello', playerId: saved.playerId, token: saved.token })
        else if(!storage.get(SKIP_KEY)) openSignup()
        renderChip()
        requestLeaderboard()
    }

    Game.onProfile = player => {
        Game.profile = player
        renderChip()
        if(!$('profile-view').classList.contains('hidden') && !modal.classList.contains('hidden')) openProfile()
        Game.updatePlayers?.()
        Game.refreshBotGrid?.()
    }

    Game.onRegistered = (player, token) => {
        storage.set(STORAGE_KEY, { playerId: player.id, token })
        storage.remove(SKIP_KEY)
        Game.onProfile(player)
        closeModal()
        requestLeaderboard()
    }

    // The saved profile no longer exists on the server (e.g. the server's data was reset).
    Game.onProfileInvalid = _ => {
        storage.remove(STORAGE_KEY)
        Game.profile = null
        renderChip()
        openSignup()
    }

    Game.onProfileError = message => {
        const target = $('profile-view').classList.contains('hidden') ? 'profile-signup-error' : 'profile-rename-error'
        $(target).textContent = message
    }

    Game.onLeaderboard = renderLeaderboard

    renderChip()
}
