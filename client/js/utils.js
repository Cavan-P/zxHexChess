export const pointInHexagon = (point, center, size) => {
    let sqrt3 = Math.sqrt(3)

    let dx = (point.x - center.x) / size
    let dy = (point.y - center.y) / size

    return dy > -sqrt3 / 2          &&
           dy < sqrt3 / 2           &&
           sqrt3 * dx + sqrt3 > dy  &&
           sqrt3 * dx - sqrt3 < dy  &&
           -sqrt3 * dx + sqrt3 > dy &&
           -sqrt3 * dx - sqrt3 < dy
}

export const Smooth = (pos, dest, time) => {
    return (dest - pos) / time
}