import { WEIGHTS, generateWaits, calcCombos, dealinProbability, normRedFive } from './KillerDuckyDefense';

// generateWaits() is state-independent, so build it once.
const ALL_WAITS = generateWaits();

/**
 * Converts a tile from this repo's indexing (man 1-9, pin 11-19, sou 21-29,
 * honors 31-37, red fives at 0/10/20) to the KillerDucky engine's indexing
 * (man 11-19, pin 21-29, sou 31-39, honors 41-47, red fives at 51/52/53).
 * @param {TileIndex} tile
 */
function toKDTile(tile) {
    if (tile === 0) return 51;
    if (tile === 10) return 52;
    if (tile === 20) return 53;
    return tile + 10;
}

/**
 * Converts a KillerDucky-indexed tile back to this repo's indexing. Only used
 * on `wait.tiles`/`wait.waitsOn` values, which generateWaits() never populates
 * with a red-five encoding (51/52/53), so the inverse of `tile + 10` suffices.
 * @param {number} kdTile
 */
function fromKDTile(kdTile) {
    return kdTile - 10;
}

/**
 * Builds the KillerDucky-style "unseen tile" map from this repo's remaining
 * tiles array, folding each red five's count into its base five.
 * @param {TileCounts} remainingTiles
 */
function buildUnseenTiles(remainingTiles) {
    let unseen = {};
    for (let i = 1; i <= 37; i++) {
        if (i % 10 === 0) continue; // red-five slots are folded into their base five below

        let count = remainingTiles[i] || 0;
        if (i < 30 && i % 10 === 5) count += remainingTiles[i - 5] || 0;

        unseen[toKDTile(i)] = count;
    }
    return unseen;
}

/**
 * Converts a dora indicator tile (this repo's convention) to the actual dora
 * tile it points to.
 * @param {TileIndex} indicator
 */
export function getDoraFromIndicator(indicator) {
    let suitBase = Math.floor(indicator / 10) * 10;
    let n = indicator % 10;
    return suitBase + (n === 9 ? 1 : n + 1);
}

/**
 * Calculates the deal-in percentage (0-100) of each tile in a hand against a
 * single riichi opponent, together with the raw KillerDucky `combos` used to
 * derive them (see `buildWaitBreakdown`), using the wait-enumeration engine.
 * Tiles not present in the hand are marked `Infinity` so they never win a
 * "safest tile" search.
 * @param {TileCounts} hand The hand to evaluate.
 * @param {TileCounts} remainingTiles The tiles hidden from the hand's owner.
 * @param {Player} opponent The opponent in riichi.
 * @param {TileIndex} doraTile The live dora tile, or -1 if there is none.
 * @returns {{rates: number[], combos: Object}} `rates` mirrors `calculateDealInRates`; `combos` is KD-indexed.
 */
export function calculateDealInData(hand, remainingTiles, opponent, doraTile) {
    let genbutsu = new Set();
    for (let i = 0; i < opponent.discards.length; i++) genbutsu.add(toKDTile(opponent.discards[i]));
    for (let i = 0; i < opponent.discardsAfterRiichi.length; i++) genbutsu.add(toKDTile(opponent.discardsAfterRiichi[i]));

    let riichiIndex = opponent.riichiIndex > -1 ? opponent.riichiIndex : opponent.discards.length - 1;
    let discardsToRiichi = opponent.discards.slice(0, riichiIndex + 1).map(toKDTile);

    let unseenTiles = buildUnseenTiles(remainingTiles);
    let dora = doraTile > -1 ? [toKDTile(doraTile)] : [];

    let combos = calcCombos(ALL_WAITS, genbutsu, discardsToRiichi, unseenTiles, dora, WEIGHTS);

    let rates = Array(38).fill(Infinity);
    for (let i = 0; i < hand.length; i++) {
        if (hand[i] <= 0) continue;
        rates[i] = Math.round(dealinProbability(toKDTile(i), combos) * 10000) / 100;
    }
    return { rates, combos };
}

/**
 * Calculates the deal-in percentage (0-100) of each tile in a hand against a
 * single riichi opponent, using the KillerDucky wait-enumeration engine.
 * Tiles not present in the hand are marked `Infinity` so they never win a
 * "safest tile" search.
 * @param {TileCounts} hand The hand to evaluate.
 * @param {TileCounts} remainingTiles The tiles hidden from the hand's owner.
 * @param {Player} opponent The opponent in riichi.
 * @param {TileIndex} doraTile The live dora tile, or -1 if there is none.
 * @returns {number[]} The deal-in percentage for each tile index, or `Infinity` if not in hand.
 */
export function calculateDealInRates(hand, remainingTiles, opponent, doraTile) {
    return calculateDealInData(hand, remainingTiles, opponent, doraTile).rates;
}

/**
 * Builds the per-wait-shape breakdown of one tile's deal-in rate: every live
 * wait shape that completes on this tile against one threat's `combos`
 * (as returned by `calculateDealInData`), each with its own share of the
 * rate, sorted highest-rate first. Mirrors Haipai's
 * `defense.js::_build_wait_breakdown`.
 * @param {TileIndex} tile The tile to break down (must be present in the hand `combos` was built against).
 * @param {Object} combos The KD-indexed combos object from `calculateDealInData`.
 * @returns {Array<{type: number, tiles: TileIndex[], waitsOn: TileIndex[], rate: number, left: number[]}>}
 */
export function buildWaitBreakdown(tile, combos) {
    let kdTile = normRedFive(toKDTile(tile));
    if (!combos[kdTile] || combos.all <= 0) return [];

    let total = combos.all;
    let breakdown = combos[kdTile].types.map(wait => ({
        type: wait.type,
        tiles: wait.tiles.map(fromKDTile),
        waitsOn: wait.waitsOn.map(fromKDTile),
        rate: Math.round(wait.combos / total * 10000) / 100,
        left: (wait.numUnseen || []).slice(),
    }));

    breakdown.sort((a, b) => b.rate - a.rate);
    return breakdown;
}

/**
 * Builds the per-tile wait breakdown across every riichi opponent: for each
 * hand tile, picks whichever opponent is most dangerous for that tile (the
 * one contributing the highest individual deal-in rate) and returns that
 * opponent's wait breakdown for it. Mirrors Haipai's "most_dangerous" choice
 * in `defense.js::compute_kd_defense_data`.
 * @param {TileCounts} hand The hand to evaluate.
 * @param {Array<{rates: number[], combos: Object}>} opponentsData One entry per riichi opponent, from `calculateDealInData`.
 * @returns {Array} Length-38 array of wait breakdowns (see `buildWaitBreakdown`), `null` for tiles not in hand or with no threat.
 */
export function combineWaitBreakdowns(hand, opponentsData) {
    let breakdowns = Array(38).fill(null);

    for (let tile = 0; tile < hand.length; tile++) {
        if (hand[tile] <= 0) continue;

        let bestIndex = -1;
        let bestRate = -1;
        for (let i = 0; i < opponentsData.length; i++) {
            let rate = opponentsData[i].rates[tile];
            if (rate !== Infinity && rate > bestRate) {
                bestRate = rate;
                bestIndex = i;
            }
        }

        if (bestIndex === -1) continue;
        breakdowns[tile] = buildWaitBreakdown(tile, opponentsData[bestIndex].combos);
    }

    return breakdowns;
}

/**
 * Combines the per-opponent deal-in rates into the probability of dealing
 * into at least one of them: 1 - the product of everyone's "safe" chance.
 * @param {number[][]} rateArrays One deal-in rate array (as returned by calculateDealInRates) per riichi opponent.
 * @returns {number[]} The combined deal-in percentage for each tile index, or `Infinity` if not in hand.
 */
export function combineDealInRates(rateArrays) {
    let combined = Array(38).fill(Infinity);

    for (let i = 0; i < 38; i++) {
        if (!rateArrays.some(rates => rates[i] !== Infinity)) continue;

        let survivalChance = 1;
        for (let rates of rateArrays) {
            survivalChance *= 1 - (rates[i] === Infinity ? 0 : rates[i] / 100);
        }
        combined[i] = Math.round((1 - survivalChance) * 10000) / 100;
    }

    return combined;
}
