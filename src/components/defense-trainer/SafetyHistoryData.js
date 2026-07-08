import { getTileAsText } from '../../scripts/TileConversions';
import { WAIT_TYPE } from '../../scripts/KillerDuckyDefense';
import HistoryData from '../../models/HistoryData';

const WAIT_TYPE_KEYS = {
    [WAIT_TYPE.ryanmen]: "ryanmen",
    [WAIT_TYPE.kanchan]: "kanchan",
    [WAIT_TYPE.penchan]: "penchan",
    [WAIT_TYPE.tanki]: "tanki",
    [WAIT_TYPE.shanpon]: "shanpon",
};

/**
 * Renders a wait breakdown (see DefenseCalculator.js::buildWaitBreakdown) as a
 * comma-separated list of "shape (type rate%)" entries, e.g.
 * "6p8p (ryanmen 45.2%), 7p7p (shanpon 12.1%)". Mirrors Haipai's per-wait
 * tooltip breakdown, but flattened into plain text for the history log.
 */
function formatWaitBreakdown(t, breakdown, verbose) {
    if (!breakdown || breakdown.length === 0) return t("defense.waitBreakdown.none");

    return breakdown.map(wait => {
        let tiles = wait.tiles.map(tile => getTileAsText(t, tile, verbose)).join(verbose ? " " : "");
        let type = t(`defense.waitBreakdown.${WAIT_TYPE_KEYS[wait.type]}`);
        return t("defense.waitBreakdown.entry", { tiles, type, rate: wait.rate.toFixed(1) });
    }).join(", ");
}

export default class SafetyHistoryData extends HistoryData {
    /** A history object for the defense trainer, which tells the deal-in chance of a given discard. */
    constructor(chosenTile = -1, chosenSafety = -1, bestTile = -1, bestSafety = -1, drawnTile = -1, message = undefined, chosenBreakdown = [], bestBreakdown = []) {
        super(message);
        this.chosenTile = chosenTile;
        this.chosenSafety = chosenSafety;
        this.bestTile = bestTile;
        this.bestSafety = bestSafety;
        this.drawnTile = drawnTile;
        /** Per-wait-shape breakdown of chosenSafety/bestSafety, from DefenseCalculator.js::combineWaitBreakdowns. */
        this.chosenBreakdown = chosenBreakdown;
        this.bestBreakdown = bestBreakdown;
    }

    getMessage(t, concise, verbose, spoilers) {
        let result = t(`history.concise.discard`, { tile: getTileAsText(t, this.chosenTile, verbose) });

        result += ". ";

        result += t("defense.chosenDealIn", {
            tile: getTileAsText(t, this.chosenTile, verbose),
            rating: this.chosenSafety.toFixed(2),
            breakdown: formatWaitBreakdown(t, this.chosenBreakdown, verbose)
        });

        if (this.chosenSafety === this.bestSafety) {
            result += t("analyzer.correctSafety");
        } else {
            result += t("defense.bestDealIn", {
                tile: getTileAsText(t, this.bestTile, verbose),
                rating: this.bestSafety.toFixed(2),
                breakdown: formatWaitBreakdown(t, this.bestBreakdown, verbose)
            });
        }

        if (this.drawnTile >= 0) {
            result += t("history.verbose.draw", { tile: getTileAsText(t, this.drawnTile, verbose) });
        }

        result += super.getMessage(t);
        return result;
    }

    getClassName() {
        let className = "";

        if (this.chosenSafety === this.bestSafety) {
            className = "bg-success text-white";
        }
        else if (this.chosenSafety <= this.bestSafety + 2) {
            className = "bg-warning";
        }
        else {
            className = "bg-danger text-white";
        }

        return className;
    }
}