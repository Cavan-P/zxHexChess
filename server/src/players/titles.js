// Titles - made up, but in the spirit of real chess titles. Players earn them from their best
// rating once it's established (20+ games) and keep them, like the real thing. Bots carry the
// title that matches their current rating.
//
// Like real chess there are women's titles too (HWGM and friends), set lower in the same way a
// real WGM sits at FM level. Anyone using them shows whichever title is higher, and the women's
// one on a tie (a woman rated at both HM and HWGM level goes by HWGM).
const TITLES = [
    { code: 'HL', name: 'Hex Legend', min: 2200 },
    { code: 'HGM', name: 'Hex Grandmaster', min: 1800 },
    { code: 'HIM', name: 'Hex International Master', min: 1600 },
    { code: 'HM', name: 'Hex Master', min: 1400 },
    { code: 'HCM', name: 'Hex Candidate Master', min: 1200 }
]

const WOMEN_TITLES = [
    { code: 'HWGM', name: 'Hex Woman Grandmaster', min: 1400 },
    { code: 'HWIM', name: 'Hex Woman International Master', min: 1200 },
    { code: 'HWM', name: 'Hex Woman Master', min: 1000 },
    { code: 'HWCM', name: 'Hex Woman Candidate Master', min: 800 }
]

const pick = (list, rating) => list.find(t => rating >= t.min) || null

// `set` is 'open' (the default) or 'women'.
const titleFor = (rating, set = 'open') => {
    const open = pick(TITLES, rating)
    const women = set == 'women' ? pick(WOMEN_TITLES, rating) : null
    const best = women && (!open || women.min >= open.min) ? women : open
    return best ? { code: best.code, name: best.name } : null
}

module.exports = { TITLES, WOMEN_TITLES, titleFor }
