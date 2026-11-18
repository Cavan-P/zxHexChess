import { Game } from './game.js'
import { drawHexagon } from './hexagon.js'
import { sendWatchLab } from './network.js'

// The lab: a live grid of every game in the current generation of bot training, or of every game
// in a tournament. Click a game to watch it large. The server streams positions a few times a second.

const $ = id => document.getElementById(id)

const START_FEN = 'bqknbnr2rp1b1p1p2p2p1p3pp4p993P4PP3P1P2P2P1P1B1PR2RNBNQKB'

const SPRITES = { p: [1000, 200], P: [1000, 0], r: [800, 200], R: [800, 0], n: [600, 200], N: [600, 0], b: [400, 200], B: [400, 0], q: [200, 200], Q: [200, 0], k: [0, 200], K: [0, 0] }

const state = {
    open: false,
    mode: null,              // 'training' | 'tournament'
    names: {},               // tournament: bot id -> { name, elo }
    running: false,
    generation: 0,
    generations: 0,
    settings: null,
    games: new Map(),
    tiles: new Map(),        // id -> { root, canvas, caption }
    history: [],
    focused: null,
    lastBot: null
}

// ------ Drawing ------

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const fenCells = fen => {
    const out = []
    for(const ch of fen || '') {
        if(/\d/.test(ch)) for(let i = 0; i < +ch; i++) out.push('')
        else out.push(ch)
    }
    return out
}

// Board geometry comes from the main board's cells (logical coordinates), scaled to the canvas.
const geometry = _ => {
    const xs = Game.cells.map(c => c.x), ys = Game.cells.map(c => c.y)
    const size = Game.cellSize
    return { minX: Math.min(...xs) - size, maxX: Math.max(...xs) + size, minY: Math.min(...ys) - size, maxY: Math.max(...ys) + size, size }
}

const drawBoard = (canvas, game) => {
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth * dpr, h = canvas.clientHeight * dpr
    if(!w || !h) return
    if(canvas.width != w || canvas.height != h){ canvas.width = w; canvas.height = h }

    const ctx = canvas.getContext('2d')
    const g = geometry()
    const scale = Math.min(w / (g.maxX - g.minX), h / (g.maxY - g.minY))
    const ox = (w - (g.maxX - g.minX) * scale) / 2 - g.minX * scale
    const oy = (h - (g.maxY - g.minY) * scale) / 2 - g.minY * scale

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.setTransform(scale, 0, 0, scale, ox, oy)

    const shades = [cssVar('--board-dark'), cssVar('--board-mid'), cssVar('--board-light')]
    const highlight = `rgba(${cssVar('--highlight-rgb')}, 0.7)`
    const cells = fenCells(game?.fen || START_FEN)
    const starting = !game

    // Rows cycle through the three shades, like the main board.
    const rowOf = new Map()
    ;[...new Set(Game.cells.map(c => Math.round(c.y)))].sort((a, b) => a - b).forEach((y, i) => rowOf.set(y, i))

    for(const cell of Game.cells){
        const shade = shades[rowOf.get(Math.round(cell.y)) % 3]
        drawHexagon(cell.x, cell.y, g.size, shade, true, cssVar('--board-edge'), 1.5, ctx)
        if(game && (cell.num == game.from || cell.num == game.to)) drawHexagon(cell.x, cell.y, g.size, highlight, false, 'black', 0, ctx)
    }

    if(starting) return
    const sprite = Game.pieceSprite
    const piece = g.size * 1.25
    for(const cell of Game.cells){
        const p = cells[cell.num]
        if(!p) continue
        const [sx, sy] = SPRITES[p]
        ctx.drawImage(sprite, sx, sy, 200, 200, cell.x - piece / 2, cell.y - piece / 2, piece, piece)
    }
}

// ------ Text ------

const tournament = _ => state.mode == 'tournament'
// Players are variation numbers in training and bot ids in a tournament.
const variant = p => tournament() ? state.names[p]?.name || p : `#${p + 1}`
const resultText = game => {
    if(!game.done) return game.ply ? `move ${Math.ceil(game.ply / 2)}` : 'queued (waiting for a free worker)'
    const r = game.result
    if(!r?.winner) return `draw · ${r?.reason || ''}`
    return `${variant(r.winner == 'white' ? game.white : game.black)} wins · ${r.reason}`
}

// Latest Elo for each bot in the tournament: its rating after its most recent finished game.
const liveRatings = _ => {
    const elo = Object.fromEntries(Object.entries(state.names).map(([id, n]) => [id, n.elo]))
    for(const h of state.history) for(const [id, r] of Object.entries(h.ratings || {})) elo[id] = r.elo
    return elo
}

// ------ Tiles ------

const buildGrid = _ => {
    const grid = $('lab-grid')
    grid.replaceChildren()
    state.tiles.clear()

    for(const game of state.games.values()){
        const root = document.createElement('button')
        root.type = 'button'
        root.className = 'lab-tile card flex flex-col gap-1 p-2 text-left'

        const canvas = document.createElement('canvas')
        canvas.className = 'aspect-[880/950] w-full'
        const title = document.createElement('span')
        title.className = 'text-xs font-semibold text-(--text-strong)'
        title.textContent = `${variant(game.white)} vs ${variant(game.black)}`
        const caption = document.createElement('span')
        caption.className = 'truncate text-[0.7rem] text-(--text-muted)'

        root.append(canvas, title, caption)
        root.onclick = _ => { state.pinned = true; focus(game.id) }
        grid.append(root)
        state.tiles.set(game.id, { root, canvas, caption })
    }

    $('lab-empty').classList.toggle('hidden', state.games.size > 0)
    requestAnimationFrame(_ => { for(const id of state.tiles.keys()) drawTile(id) })
}

const drawTile = id => {
    const tile = state.tiles.get(id), game = state.games.get(id)
    if(!tile || !game) return
    drawBoard(tile.canvas, game)
    tile.caption.textContent = resultText(game)
    tile.root.classList.toggle('is-done', game.done)
    tile.root.classList.toggle('is-selected', id == state.focused)
    if(id == state.focused){
        // Unless you picked this game yourself, follow the action once it finishes.
        if(game.done && !state.pinned){
            const next = [...state.games.values()].find(g => !g.done && g.ply > 0)
            if(next) return focus(next.id)
        }
        drawFocus()
    }
}

const focus = id => {
    const previous = state.focused
    state.focused = id
    if(previous) drawTile(previous)
    drawTile(id)
}

const drawFocus = _ => {
    const game = state.games.get(state.focused)
    drawBoard($('lab-focus'), game)
    $('lab-focus-caption').textContent = game ? `${variant(game.white)} (White) vs ${variant(game.black)} (Black) · ${resultText(game)}` : 'Click any game'
}

// ------ Header, standings, history ------

const renderHeader = _ => {
    const games = [...state.games.values()]
    const done = games.filter(g => g.done).length
    $('lab-title').textContent = tournament() ? 'Tournament' : 'Training lab'

    if(tournament()){
        const playing = games.filter(g => !g.done && g.ply > 0).length
        $('lab-status').textContent = state.running
            ? `${done} of ${games.length} games finished · ${playing} being played now`
            : `Tournament finished · ${games.length} games`
        $('lab-progress').style.width = `${games.length ? Math.round(done / games.length * 100) : 0}%`
        $('lab-banner').classList.add('hidden')
        return
    }

    const status = state.running
        ? `${state.settings?.playoff ? 'Final playoff between generation winners' : `Generation ${state.generation} of ${state.generations}`} · ${done} of ${games.length} games finished${state.settings?.continuing ? ` · continuing ${state.settings.continuing}` : ''}${state.settings?.watchable ? ' · watchable pace' : ''}`
        : state.lastBot ? 'Training finished.' : 'Not training right now.'
    $('lab-status').textContent = status

    // The playoff is shown as one extra step after the last generation.
    const steps = state.generations + 1
    const step = state.settings?.playoff ? state.generations : state.generation - 1
    const total = state.generations ? (step + (games.length ? done / games.length : 0)) / steps : 0
    $('lab-progress').style.width = `${Math.round((state.running ? total : state.lastBot ? 1 : 0) * 100)}%`

    const banner = $('lab-banner')
    banner.classList.toggle('hidden', !state.lastBot)
    if(state.lastBot) banner.textContent = `Done! The best variation is now a bot called ${state.lastBot.name}. Find it in the Evolved tier on the home page (it'll need a tournament for a real rating).`
}

const renderStandings = _ => {
    $('lab-standings-title').textContent = tournament() ? 'Standings (points · Elo now)' : state.settings?.playoff ? 'Playoff (generation winners)' : 'Variations this generation'
    const elo = tournament() ? liveRatings() : null

    // Live points from finished games (draws count half): this generation, or the whole tournament.
    const points = new Map()
    for(const g of state.games.values()){
        for(const v of [g.white, g.black]) if(!points.has(v)) points.set(v, 0)
        if(!g.done) continue
        if(!g.result?.winner){ points.set(g.white, points.get(g.white) + 0.5); points.set(g.black, points.get(g.black) + 0.5) }
        else { const w = g.result.winner == 'white' ? g.white : g.black; points.set(w, points.get(w) + 1) }
    }
    const list = $('lab-standings')
    list.replaceChildren()
    ;[...points.entries()].sort((a, b) => b[1] - a[1]).forEach(([v, p], i) => {
        const row = document.createElement('li')
        row.className = 'flex justify-between'
        row.innerHTML = `<span></span><span class="font-semibold tabular-nums"></span>`
        row.firstChild.textContent = tournament() ? `${i + 1}. ${variant(v)}` : `${i + 1}. Variation ${variant(v)}`
        row.lastChild.textContent = tournament() ? `${p} · ${elo[v] ?? '?'}` : p
        list.append(row)
    })
}

const renderHistory = _ => {
    $('lab-history-title').textContent = tournament() ? 'Results' : 'Generations'
    const list = $('lab-history')
    list.replaceChildren()
    for(const h of state.history) list.append(historyRow(h))
    if(!state.history.length){
        const row = document.createElement('li')
        row.className = 'font-sans text-(--text-muted)'
        row.textContent = tournament() ? 'Results appear here as each game finishes.' : 'Results appear here as each generation finishes.'
        list.append(row)
    }
}

const historyRow = h => {
    const row = document.createElement('li')
    if(!tournament()){
        row.textContent = h.playoff
            ? `Playoff: winner ${h.bestFitnessThisGen} pts`
            : `Gen ${h.generation}: best ${h.bestFitnessThisGen} pts (best so far ${h.bestFitnessEver})`
        return row
    }
    const r = h.result
    const outcome = r.result == 'draw' ? 'draw' : `${variant(r.result == 'white' ? h.white : h.black)} wins`
    row.textContent = `[${h.gamesPlayed}/${h.totalGames}] ${variant(h.white)} vs ${variant(h.black)}: ${outcome} (${r.reason})`
    return row
}

// ------ Messages from the server ------

const onLab = msg => {
    if(msg.type == 'labState'){
        Object.assign(state, { mode: msg.mode, names: msg.names || {}, running: msg.running, generation: msg.generation, generations: msg.generations, settings: msg.settings, history: msg.history || [], lastBot: msg.lastBot })
        state.games = new Map(msg.games.map(g => [g.id, g]))
        if(!state.games.has(state.focused)){ state.focused = msg.games[0]?.id ?? null; state.pinned = false }
        if(state.open){ buildGrid(); renderHeader(); renderStandings(); renderHistory(); drawFocus() }
        return
    }

    if(msg.type == 'labUpdate'){
        for(const g of msg.games) state.games.set(g.id, g)
        if(!state.open) return
        for(const g of msg.games) drawTile(g.id)
        renderHeader()
        renderStandings()
        return
    }

    if(msg.type == 'labProgress'){
        state.history.push(msg)
        if(!state.open) return
        if(tournament()){
            // Append rather than rebuilding: a tournament can have hundreds of results.
            const list = $('lab-history')
            if(state.history.length == 1) list.replaceChildren()
            list.append(historyRow(msg))
            list.scrollTop = list.scrollHeight
            renderStandings()
        }
        else renderHistory()
    }
}

// ------ Opening and closing ------

export const setupLab = _ => {
    Game.onLab = onLab

    Game.openLab = _ => {
        state.open = true
        $('room-menu').classList.add('hidden')
        $('lab-view').classList.remove('hidden')
        window.scrollTo(0, 0)
        sendWatchLab(true)
    }

    $('lab-back').onclick = _ => {
        state.open = false
        sendWatchLab(false)
        $('lab-view').classList.add('hidden')
        $('room-menu').classList.remove('hidden')
    }

    window.addEventListener('resize', _ => {
        if(!state.open) return
        for(const id of state.tiles.keys()) drawTile(id)
        drawFocus()
    })
}
