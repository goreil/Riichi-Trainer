import React from 'react';
import { useTranslation } from 'react-i18next';
import { getTileImage, getTileAsText } from '../../scripts/TileConversions';
import './UkeireHistoryVisual.css';

/** Tile index of the face-down tile, used to hide the best discard when spoilers are off. */
const HIDDEN_TILE = 30;

/**
 * One accepted tile, drawn as a small tile image with a xN count badge,
 * mirroring the ukeire chips in the haipai review UI.
 */
function TileChip({ tile, count, isUnique, isFuriten, t, verbose }) {
    let className = "uhv-chip";
    if (isUnique) className += " uhv-chip-unique";
    if (isFuriten) className += " uhv-chip-furiten";

    let title = getTileAsText(t, tile, verbose);
    if (count != null) title += ` ×${count}`;
    if (isFuriten) title += ` — ${t("history.verbose.furitenWarning").trim()}`;

    return (
        <span className={className} title={title}>
            <img className="uhv-chip-img" src={getTileImage(tile)} alt={getTileAsText(t, tile, verbose)} />
            {count != null ? <span className="uhv-chip-count">×{count}</span> : null}
        </span>
    );
}

/**
 * One discard option: marker ("You" / "Best"), the discarded tile,
 * the total acceptance, and the accepting tiles as chips. Tiles the other
 * discard doesn't accept are highlighted as the difference between the two.
 */
function DiscardRow({ marker, markerClass, tile, ukeire, otherTiles, discards, counts, hideTiles, note, t, verbose }) {
    let chips = null;
    let uniqueCount = 0;

    if (!hideTiles && ukeire && ukeire.tiles.length > 0) {
        let otherSet = otherTiles ? new Set(otherTiles) : null;

        chips = ukeire.tiles.map((acceptedTile) => {
            let isUnique = otherSet ? !otherSet.has(acceptedTile) : false;
            let count = counts ? counts[acceptedTile] : null;
            if (isUnique && count != null) uniqueCount += count;

            return (
                <TileChip key={acceptedTile}
                    tile={acceptedTile}
                    count={count}
                    isUnique={isUnique}
                    isFuriten={discards ? discards.includes(acceptedTile) : false}
                    t={t} verbose={verbose} />
            );
        });
    }

    return (
        <div className="uhv-row">
            <span className={`uhv-marker ${markerClass}`}>{marker}</span>
            <img className="uhv-discard-img"
                src={getTileImage(hideTiles ? HIDDEN_TILE : tile)}
                alt={getTileAsText(t, hideTiles ? HIDDEN_TILE : tile, verbose)}
                title={getTileAsText(t, hideTiles ? HIDDEN_TILE : tile, verbose)} />
            {ukeire ? <span className="uhv-count">{t("history.visual.tileCount", { count: ukeire.value })}</span> : null}
            {uniqueCount > 0
                ? <span className="uhv-gain" title={t("history.visual.uniqueTooltip")}>+{uniqueCount}</span>
                : null}
            {chips ? <span className="uhv-chips">{chips}</span> : null}
            {note ? <span className="uhv-note">{note}</span> : null}
        </div>
    );
}

/**
 * Visual replacement for the ukeire trainer's verbose history text:
 * shows the chosen discard (and the best one, when the choice was suboptimal)
 * with their accepted tiles side by side, haipai-style.
 */
function UkeireHistoryVisual(props) {
    let { t } = useTranslation();
    let data = props.data;

    let chosen = data.chosenUkeire;
    let best = data.bestUkeire;
    let wentBack = chosen.value <= 0 && data.shanten > 0;
    let suboptimal = chosen.value < best.value;

    let notes = [];

    if (data.shanten <= 0 && data.handUkeire.value === 0) {
        notes.push(t("history.verbose.exceptionalNoten").trim());
    }

    if (data.isFuriten()) {
        notes.push(t(data.shanten <= 0 ? "history.verbose.furiten" : "history.verbose.furitenWarning").trim());
    }

    if (data.shanten > 0 && data.drawnTile === -1) {
        notes.push(t("history.verbose.exhausted").trim());
    }

    if (data.message) {
        notes.push(data.message.generateString(t));
    }

    return (
        <div className="uhv">
            <DiscardRow
                marker={t("history.visual.you")}
                markerClass="uhv-marker-you"
                tile={data.chosenTile}
                ukeire={wentBack ? null : chosen}
                otherTiles={suboptimal && props.spoilers ? best.tiles : null}
                discards={data.discards}
                counts={data.remainingCounts}
                hideTiles={false}
                note={wentBack ? t("history.concise.loweredShanten").trim() : (suboptimal ? null : t("history.verbose.best").trim())}
                t={t} verbose={props.verbose} />
            {suboptimal ?
                <DiscardRow
                    marker={t("history.visual.best")}
                    markerClass="uhv-marker-best"
                    tile={data.bestTile}
                    ukeire={best}
                    otherTiles={props.spoilers && !wentBack ? chosen.tiles : null}
                    discards={null}
                    counts={data.remainingCounts}
                    hideTiles={!props.spoilers}
                    note={null}
                    t={t} verbose={props.verbose} />
                : null}
            {data.shanten > 0 && data.drawnTile !== -1 ?
                <div className="uhv-row uhv-draw-row">
                    <span className="uhv-draw-label">{t("history.visual.draw")}</span>
                    <img className="uhv-discard-img"
                        src={getTileImage(data.drawnTile)}
                        alt={getTileAsText(t, data.drawnTile, props.verbose)}
                        title={getTileAsText(t, data.drawnTile, props.verbose)} />
                </div>
                : null}
            {notes.map((note, index) => <div className="uhv-note-row" key={index}>{note}</div>)}
        </div>
    );
}

export default UkeireHistoryVisual;
