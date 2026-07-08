// Deal-in probability engine ported from KillerDucky's killer_mortal_gui
// (https://github.com/killerducky/killer_mortal_gui, MIT licensed), by way of
// the Haipai project's static/js/prep/defense_kd.js. It enumerates every
// live wait shape an opponent's riichi could be on, weights each by its
// empirical likelihood (wait type, suji/matagi/ura reads, dora greed), and
// turns that into a per-tile deal-in probability.
//
// Tile encoding here is the upstream convention (NOT this repo's Constants.js
// hand-array indexing): suit*10 + n, with 11-19 man, 21-29 pin, 31-39 sou,
// 41-47 honors. Red fives are 51/52/53 and normalise to 15/25/35 via
// normRedFive. See DefenseCalculator.js for conversion to/from this repo's
// tile indexing.

export const WAIT_TYPE = Object.freeze({
    ryanmen: 0,
    kanchan: 1,
    penchan: 2,
    tanki: 3,
    shanpon: 4,
});

// Tuning weights, copied verbatim from GlobalState in upstream index.js.
export const WEIGHTS = Object.freeze({
    ryanmen: 3.5,
    honorTankiShanpon: 1.7,
    nonHonorTankiShanpon: 1.0,
    kanchan: 0.21,
    kanchanRiichiSujiTrap: 2.6,
    uraSuji: 1.3,
    matagiSujiEarly: 0.6,
    matagiSujiRiichi: 1.2,
    doraGreed: 1.2,
    akaDiscard: 0.14,
});

export function normRedFive(t) {
    if (t < 51) return t;
    if (t === 51) return 15;
    if (t === 52) return 25;
    if (t === 53) return 35;
    return null;
}

export function generateWaits() {
    const waits = [];
    for (const [a, b] of [[2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8]]) {
        for (let suit = 1; suit <= 3; suit++) {
            waits.push({
                type: WAIT_TYPE.ryanmen,
                tiles: [suit * 10 + a, suit * 10 + b],
                waitsOn: [suit * 10 + a - 1, suit * 10 + b + 1],
            });
        }
    }
    for (const [a, b] of [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7], [6, 8], [7, 9]]) {
        for (let suit = 1; suit <= 3; suit++) {
            waits.push({
                type: WAIT_TYPE.kanchan,
                tiles: [suit * 10 + a, suit * 10 + b],
                waitsOn: [suit * 10 + a + 1],
            });
        }
    }
    for (const [a, b, c] of [[1, 2, 3], [8, 9, 7]]) {
        for (let suit = 1; suit <= 3; suit++) {
            waits.push({
                type: WAIT_TYPE.penchan,
                tiles: [suit * 10 + a, suit * 10 + b],
                waitsOn: [suit * 10 + c],
            });
        }
    }
    for (let n = 1; n <= 9; n++) {
        for (const wtype of [WAIT_TYPE.tanki, WAIT_TYPE.shanpon]) {
            for (let suit = 1; suit <= 4; suit++) {
                if (suit === 4 && n > 7) continue;
                const tile = suit * 10 + n;
                const tiles = wtype === WAIT_TYPE.tanki ? [tile] : [tile, tile];
                waits.push({ type: wtype, tiles, waitsOn: [tile] });
            }
        }
    }
    return waits;
}

// `dora` is the live dora set (normalised upstream tiles): an array or Set of
// every dora the opponent could be greedy for, incl. kan-dora. A single tile
// or null are accepted for back-compat. The doraGreed bump is applied once
// per wait when it involves ANY live dora.
export function calcCombos(waits, genbutsu, discardsToRiichi, unseenTiles, dora, weights) {
    weights = weights || WEIGHTS;
    const doraSet = dora == null ? null
        : (dora instanceof Set ? dora : new Set(Array.isArray(dora) ? dora : [dora]));
    const genbutsuNorm = new Set();
    for (const t of genbutsu) genbutsuNorm.add(normRedFive(t));
    const dtrNorm = discardsToRiichi.map(normRedFive);
    const riichiTile = dtrNorm.length ? dtrNorm[dtrNorm.length - 1] : null;

    const combos = { all: 0.0 };

    for (const wait of waits) {
        let skip = false;
        for (const t of wait.waitsOn) {
            if (genbutsuNorm.has(t)) { skip = true; break; }
        }
        if (skip) continue;

        let w = 1.0;
        const numUnseen = [];
        for (let i = 0; i < wait.tiles.length; i++) {
            const t = wait.tiles[i];
            const count = unseenTiles[t] || 0;
            const n = (i > 0 && wait.type === WAIT_TYPE.shanpon)
                ? Math.max(0, count - 1) : count;
            w *= n;
            numUnseen.push(n);
        }
        wait.numUnseen = numUnseen;
        if (wait.type === WAIT_TYPE.shanpon) {
            w /= wait.tiles.length;
        }
        wait.rawCombos = w;
        const factors = [];

        if (wait.type === WAIT_TYPE.ryanmen) {
            let ura = false;
            for (const d of dtrNorm) {
                if (wait.tiles.includes(d)) continue;
                const m = d % 10;
                if (m >= 4 && m <= 6) {
                    for (const wt of wait.tiles) {
                        if (Math.abs(d - wt) === 2) { ura = true; break; }
                    }
                }
                if (ura) break;
            }
            let matagiEarly = false;
            let matagiRiichi = false;
            for (const d of dtrNorm) {
                if (wait.tiles.includes(d)) {
                    if (d === riichiTile) matagiRiichi = true;
                    else matagiEarly = true;
                }
            }
            factors.push({ label: "ryanmen", mult: weights.ryanmen });
            w *= weights.ryanmen;
            if (ura) { factors.push({ label: "ura suji", mult: weights.uraSuji }); w *= weights.uraSuji; }
            if (matagiEarly) { factors.push({ label: "matagi suji (early cut)", mult: weights.matagiSujiEarly }); w *= weights.matagiSujiEarly; }
            if (matagiRiichi) { factors.push({ label: "matagi suji (riichi cut)", mult: weights.matagiSujiRiichi }); w *= weights.matagiSujiRiichi; }
        } else if (wait.type === WAIT_TYPE.tanki || wait.type === WAIT_TYPE.shanpon) {
            if (wait.tiles[0] > 40) {
                factors.push({ label: "honor tanki/shanpon", mult: weights.honorTankiShanpon });
                w *= weights.honorTankiShanpon;
            } else {
                factors.push({ label: "tanki/shanpon", mult: weights.nonHonorTankiShanpon });
                w *= weights.nonHonorTankiShanpon;
            }
        } else if (wait.type === WAIT_TYPE.kanchan) {
            const rm = riichiTile != null ? riichiTile % 10 : -1;
            if (riichiTile != null && rm >= 4 && rm <= 6
                && Math.abs(wait.waitsOn[0] - riichiTile) === 3) {
                factors.push({ label: "suji-trap kanchan", mult: weights.kanchanRiichiSujiTrap });
                w *= weights.kanchanRiichiSujiTrap;
            } else {
                factors.push({ label: "kanchan", mult: weights.kanchan });
                w *= weights.kanchan;
            }
        } else if (wait.type === WAIT_TYPE.penchan) {
            factors.push({ label: "penchan", mult: 1 }); // anchors at 1.0
        }

        const involved = new Set([...wait.tiles, ...wait.waitsOn]);
        if (doraSet) {
            for (const t of involved) {
                if (doraSet.has(t)) {
                    factors.push({ label: "dora involved", mult: weights.doraGreed });
                    w *= weights.doraGreed;
                    break;
                }
            }
        }

        for (const d of discardsToRiichi) {
            if (d > 50 && involved.has(normRedFive(d))) {
                factors.push({ label: "red 5 discarded", mult: weights.akaDiscard });
                w *= weights.akaDiscard;
                break;
            }
        }

        combos.all += w;
        if (wait.type === WAIT_TYPE.shanpon) {
            factors.push({ label: "shanpon (either pair tile can complete)", mult: 2 });
            w *= 2; // after denominator
        }
        wait.factors = factors;
        wait.combos = w;

        for (const t of wait.waitsOn) {
            if (!combos[t]) combos[t] = { all: 0.0, types: [] };
            combos[t].all += w;
            combos[t].types.push(wait);
        }
    }

    return combos;
}

export function dealinProbability(tile, combos) {
    const t = normRedFive(tile);
    if (combos.all <= 0 || !combos[t]) return 0.0;
    return combos[t].all / combos.all;
}
