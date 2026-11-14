import { requestLeaderboard } from './profile.js'

// Pages on the home screen: #/ (home), #/play, #/bots, #/leaderboard, #/rules. Everything is one
// HTML file; switching pages just shows a different section, so games, sockets and settings
// all carry on as normal. The old single-page anchors (#local, #ladder...) still work.
const PAGES = ['home', 'play', 'bots', 'leaderboard', 'rules']
const TITLES = { home: 'QRS Chess · Hexagonal Chess Online', play: 'Play a friend · QRS Chess', bots: 'Bots · QRS Chess', leaderboard: 'Leaderboard · QRS Chess', rules: 'How to play · QRS Chess' }
const LEGACY = { local: 'bots', ladder: 'leaderboard', rules: 'rules', 'open-games': 'play', multiplayer: 'play' }

const $ = id => document.getElementById(id)

const pageFromHash = _ => {
    const hash = location.hash.replace(/^#\/?/, '')
    if(PAGES.includes(hash)) return hash
    if(LEGACY[hash]) return LEGACY[hash]
    return 'home'
}

let current = null

const setMenuOpen = open => {
    $('nav-menu').classList.toggle('hidden', !open)
    $('nav-menu-btn').setAttribute('aria-expanded', String(open))
    $('nav-menu-btn').querySelector('i').className = `fa-solid ${open ? 'fa-xmark' : 'fa-bars'}`
}

const show = _ => {
    const page = pageFromHash()
    // Tidy up legacy anchors into proper page links.
    if(LEGACY[location.hash.slice(1)]) history.replaceState(null, '', `#/${page}`)

    document.querySelectorAll('[data-page]').forEach(el => el.hidden = el.dataset.page != page)
    document.querySelectorAll('[data-nav]').forEach(a => {
        const active = a.dataset.nav == page
        a.classList.toggle('is-active', active)
        if(active) a.setAttribute('aria-current', 'page')
        else a.removeAttribute('aria-current')
    })
    document.title = TITLES[page]
    setMenuOpen(false)

    if(page != current){
        window.scrollTo(0, 0)
        if(page == 'leaderboard') requestLeaderboard()
    }
    current = page
}

export const goTo = page => { location.hash = `#/${page}` }

export const setupRouter = _ => {
    window.addEventListener('hashchange', show)
    $('nav-menu-btn').onclick = e => {
        e.stopPropagation()
        setMenuOpen($('nav-menu').classList.contains('hidden'))
    }
    document.addEventListener('click', e => {
        if(!$('nav-menu').classList.contains('hidden') && !e.target.closest('#nav-menu')) setMenuOpen(false)
    })
    document.addEventListener('keydown', e => { if(e.key == 'Escape') setMenuOpen(false) })
    show()
}
