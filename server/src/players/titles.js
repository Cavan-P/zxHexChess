// Titles - made up, but in the spirit of real chess titles. Players earn them from their best
// rating once it's established (20+ games) and keep them, like the real thing. Bots carry the
// title that matches their current rating.
const TITLES = [
    { code: 'HL', name: 'Hex Legend', min: 2200 },
    { code: 'HGM', name: 'Hex Grandmaster', min: 1800 },
    { code: 'HIM', name: 'Hex International Master', min: 1600 },
    { code: 'HM', name: 'Hex Master', min: 1400 },
    { code: 'HCM', name: 'Hex Candidate Master', min: 1200 }
]

const titleFor = rating => {
    const t = TITLES.find(t => rating >= t.min)
    return t ? { code: t.code, name: t.name } : null
}

module.exports = { TITLES, titleFor }
