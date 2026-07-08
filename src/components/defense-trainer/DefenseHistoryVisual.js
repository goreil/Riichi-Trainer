import React from 'react';
import { useTranslation } from 'react-i18next';
import { getTileImage, getTileAsText } from '../../scripts/TileConversions';
import { WAIT_TYPE } from '../../scripts/KillerDuckyDefense';
import './DefenseHistoryVisual.css';

const WAIT_TYPE_KEYS = {
    [WAIT_TYPE.ryanmen]: "ryanmen",
    [WAIT_TYPE.kanchan]: "kanchan",
    [WAIT_TYPE.penchan]: "penchan",
    [WAIT_TYPE.tanki]: "tanki",
    [WAIT_TYPE.shanpon]: "shanpon",
};

/**
 * One wait shape's contribution to a tile's deal-in %: the unseen-tile count(s),
 * the shape's tiles as images, its type, and its share of the rate. Mirrors the
 * haipai review UI's per-wait breakdown pills.
 */
function WaitChip({ wait, t, verbose }) {
    let typeLabel = t(`defense.waitBreakdown.${WAIT_TYPE_KEYS[wait.type]}`);
    let leftParts = (wait.left || []).filter(n => n != null);
    let leftStr = leftParts.length ? leftParts.join("×") : null;
    let title = wait.tiles.map(tile => getTileAsText(t, tile, verbose)).join(" ") + ` ${typeLabel}: ${wait.rate.toFixed(2)}%`;

    return (
        <span className="dhv-chip" title={title}>
            {leftStr ? <span className="dhv-chip-left">{leftStr}</span> : null}
            <span className="dhv-chip-tiles">
                {wait.tiles.map((tile, index) => (
                    <img key={index} className="dhv-chip-img" src={getTileImage(tile)} alt={getTileAsText(t, tile, verbose)} />
                ))}
            </span>
            <span className="dhv-chip-type">{typeLabel}</span>
            <span className="dhv-chip-rate">{wait.rate.toFixed(1)}%</span>
        </span>
    );
}

/**
 * One discard option: marker ("You" / "Best"), the discarded tile, its combined
 * deal-in rate, and every live wait shape behind that rate as chips.
 */
function DiscardRow({ marker, markerClass, tile, rating, breakdown, t, verbose }) {
    return (
        <div className="dhv-row">
            <span className={`dhv-marker ${markerClass}`}>{marker}</span>
            <img className="dhv-discard-img"
                src={getTileImage(tile)}
                alt={getTileAsText(t, tile, verbose)}
                title={getTileAsText(t, tile, verbose)} />
            <span className="dhv-rate">{rating.toFixed(2)}%</span>
            {breakdown && breakdown.length > 0 ?
                <span className="dhv-chips">
                    {breakdown.map((wait, index) => (
                        <React.Fragment key={index}>
                            {index > 0 ? <span className="dhv-plus">+</span> : null}
                            <WaitChip wait={wait} t={t} verbose={verbose} />
                        </React.Fragment>
                    ))}
                </span>
                : <span className="dhv-note">{t("defense.waitBreakdown.none")}</span>}
        </div>
    );
}

/**
 * Visual replacement for the defense trainer's history text: shows the chosen
 * discard (and the best one, when the choice was suboptimal) with the full
 * per-wait-shape breakdown behind each one's deal-in %, haipai-style.
 */
function DefenseHistoryVisual(props) {
    let { t } = useTranslation();
    let data = props.data;
    let suboptimal = data.chosenSafety !== data.bestSafety;

    return (
        <div className="dhv">
            <DiscardRow
                marker={t("history.visual.you")}
                markerClass="dhv-marker-you"
                tile={data.chosenTile}
                rating={data.chosenSafety}
                breakdown={data.chosenBreakdown}
                t={t} verbose={props.verbose} />
            {suboptimal ?
                <DiscardRow
                    marker={t("history.visual.best")}
                    markerClass="dhv-marker-best"
                    tile={data.bestTile}
                    rating={data.bestSafety}
                    breakdown={data.bestBreakdown}
                    t={t} verbose={props.verbose} />
                : null}
            {data.drawnTile >= 0 ?
                <div className="dhv-row dhv-draw-row">
                    <span className="dhv-draw-label">{t("history.visual.draw")}</span>
                    <img className="dhv-discard-img"
                        src={getTileImage(data.drawnTile)}
                        alt={getTileAsText(t, data.drawnTile, props.verbose)}
                        title={getTileAsText(t, data.drawnTile, props.verbose)} />
                </div>
                : null}
        </div>
    );
}

export default DefenseHistoryVisual;
