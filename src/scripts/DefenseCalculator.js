import { WEIGHTS, generateWaits, calcCombos, dealinProbability } from './KillerDuckyDefense';

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
    return rates;
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
