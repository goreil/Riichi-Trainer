import React from 'react';
import { withTranslation } from "react-i18next";
import { Container, Row, Col, Button, Collapse, Card, CardBody } from 'reactstrap';
import DiscardTable from '../components/DiscardTable';
import Hand from '../components/Hand';
import History from '../components/History';
import Player from "../models/Player";
import { ALL_TILES_REMAINING, PLAYER_NAMES } from "../Constants";
import { generateHand } from "../scripts/GenerateHand";
import { shuffleArray, randomInt, removeRandomItem, getRandomItem } from "../scripts/Utils";
import calculateMinimumShanten from "../scripts/ShantenCalculator";
import { calculateDiscardUkeire } from "../scripts/UkeireCalculator";
import { evaluateBestDiscard } from "../scripts/Evaluations";
import { calculateDealInRates, calculateDealInData, combineDealInRates, combineWaitBreakdowns, getDoraFromIndicator } from "../scripts/DefenseCalculator";
import { convertHandToTileIndexArray, convertHandToTenhouString } from "../scripts/HandConversions";
import SafetyHistoryData from '../components/defense-trainer/SafetyHistoryData';
import HistoryData from '../models/HistoryData';
import LocalizedMessage from '../models/LocalizedMessage';
import LocalizedMessageChain from '../models/LocalizedMessageChain';
import DefenseSettings from '../components/defense-trainer/DefenseSettings';

class DefenseState extends React.Component {
    constructor(props) {
        super(props);
        this.onTileClicked = this.onTileClicked.bind(this);
        this.onSettingsChanged = this.onSettingsChanged.bind(this);
        this.updateTime = this.onUpdateTime.bind(this);
        this.timerUpdate = null;
        this.timer = null;
        this.state = {
            lastDraw: 0,
            isComplete: false,
            /** @type Player[] */
            players: [],
            history: [],
            tilePool: [],
            discardCount: 0,
            dora: 0,
            chartCollapsed: true,
            settings: {
                verbose: true,
                extraConcise: false,
                numberOfRiichis: 1,
                minimumTurnsBeforeRiichi: 4,
                tilesInHand: 13,
            },
            currentTime: 0,
            currentBonus: 0,
        }
    }

    componentDidMount() {
        // Ensure settings are loaded before starting a new hand.
        this.setState({}, () => this.onNewHand());
    }

    componentWillUnmount() {
        if (this.timer != null) {
            clearTimeout(this.timer);
            clearInterval(this.timerUpdate);
        }
    }

    onSettingsChanged(settings) {
        if (!settings.useTimer) {
            if (this.timer != null) {
                clearTimeout(this.timer);
                clearInterval(this.timerUpdate);
            }
        }

        this.setState({
            settings: settings
        });
    }

    /** Generates a fresh game state. */
    onNewHand() {
        if (this.timer != null) {
            clearTimeout(this.timer);
            clearInterval(this.timerUpdate);
        }

        /** @type {Player[]} */
        let players = [];
        let tilePool = [];

        let remainingTiles = ALL_TILES_REMAINING.slice();
        let dora = randomInt(10, 1) + randomInt(3) * 10;
        remainingTiles[dora]--;

        // Pick numberOfRiichis random players to be in riichi.
        let riichiPlayers = shuffleArray([1, 2, 3]).slice(0, this.state.settings.numberOfRiichis);
        let playerSeat = randomInt(4);

        // Generate players with random hands
        for (let i = 0; i < 4; i++) {
            let player = new Player();
            let shanten = 0;

            do {
                let generationResult = generateHand(remainingTiles);
                remainingTiles = generationResult.availableTiles;
                player.hand = generationResult.hand;
                tilePool = generationResult.tilePool;
                shanten = calculateMinimumShanten(player.hand);
            } while (shanten < 1);

            player.name = PLAYER_NAMES[i];
            player.seat = (playerSeat + i) % 4;

            // If this is one of the players who calls riichi, bring their hand to tenpai
            if (riichiPlayers.indexOf(i) > -1) {
                let finishResult = this.finishHand(player, tilePool, remainingTiles);
                tilePool = finishResult.tilePool;
                remainingTiles = finishResult.remainingTiles;
            }

            players.push(player);
        }

        let minDiscards = Math.min(...riichiPlayers.map(player => players[player].discards.length));
        let maxDiscards = Math.max(...riichiPlayers.map(player => players[player].discards.length));

        // Bring all the riichi players to the same number of discards
        for (let i = 0; i < riichiPlayers.length; i++) {
            let currentPlayer = players[riichiPlayers[i]];
            let riichiIndex = currentPlayer.riichiIndex;

            for (let j = riichiIndex; j < maxDiscards; j++) {
                for (let k = 0; k < riichiPlayers.length; k++) {
                    if (k === i) continue;

                    let otherPlayer = players[riichiPlayers[k]];

                    if (otherPlayer.discards.length <= j) continue;

                    if (j > riichiIndex ||
                        (j === riichiIndex && currentPlayer.takesTurnBefore(otherPlayer))) {
                        currentPlayer.discardsAfterRiichi.push(otherPlayer.discards[j]);
                    }
                }
            }
        }

        // Fill the discards of each player.
        players.forEach((player) => {
            // Discards made before any riichi
            while (player.discards.length < minDiscards - 1) {
                let tile = removeRandomItem(tilePool);
                player.discards.push(tile);
            }

            // Discard made on the same turn as the first riichi
            if (!player.isInRiichi() && player.discards.length < minDiscards) {
                if (riichiPlayers.some((index => players[index].takesTurnBefore(player)))) {
                    // Someone declared riichi before this player discarded
                    this.drawTilesToFourteen(player, tilePool);
                    let discard = this.discardSafestTile(player, players, dora);

                    for (let j = 0; j < riichiPlayers.length; j++) {
                        if (players[riichiPlayers[j]].takesTurnBefore(player)) {
                            players[riichiPlayers[j]].discardsAfterRiichi.push(discard);
                        }
                    }
                } else {
                    // This player discarded before any riichis happened
                    this.drawTilesToFourteen(player, tilePool);
                    this.discardMostEfficientTile(player, players, tilePool);
                }
            }

            // Discards made after the first riichi
            while (player.discards.length < maxDiscards) {
                let discard;

                if (player.isInRiichi()) {
                    // This player can't change their hand
                    discard = removeRandomItem(tilePool);
                    player.discards.push(discard);

                } else {
                    // Fold vs the first (and maybe second) riichi
                    this.drawTilesToFourteen(player, tilePool);
                    discard = this.discardSafestTile(player, players, dora);
                }

                for (let j = 0; j < riichiPlayers.length; j++) {
                    let otherPlayer = players[riichiPlayers[j]];
                    if (player.discards.length - 1 > otherPlayer.riichiIndex ||
                        (player.discards.length - 1 === otherPlayer.riichiIndex && otherPlayer.takesTurnBefore(player))) {
                        otherPlayer.discardsAfterRiichi.push(discard);
                    }
                }
            }
        });

        // playerSeat -> dealerIndex: 0 -> 0, 1 -> 3, 2 -> 2, 3 -> 1
        let dealerIndex = (4 - playerSeat) % 4;

        // Discard a tile for the players whose turn comes before the user's
        for (let i = dealerIndex; i > 0; i = (i + 1) % 4) {
            let discard = -1;

            if (players[i].isInRiichi()) {
                discard = removeRandomItem(tilePool);
                players[i].discards.push(discard);
            } else {
                this.drawTilesToFourteen(players[i], tilePool);
                discard = this.discardSafestTile(players[i], players, dora);
            }

            this.tileDiscardedAfterRiichi(discard, players);
        }

        // Remove safe tiles from the player's hand without adding them to the discards
        let tileCount = convertHandToTileIndexArray(players[0].hand).length;
        while (tileCount > this.state.settings.tilesInHand) {
            let dealInRates = this.getDealInRates(players[0], players, dora);
            let bestSafety = Math.min(...dealInRates);
            let bestChoice = dealInRates.indexOf(bestSafety);
            players[0].hand[bestChoice]--;
            tileCount--;
        }

        // Dead wall
        for (let i = 0; i < 13; i++) {
            removeRandomItem(tilePool);
        }

        let shuffle = convertHandToTileIndexArray(players[0].hand);
        shuffle = shuffleArray(shuffle);

        this.setState({
            players: players,
            tilePool: tilePool,
            history: [new HistoryData(new LocalizedMessage("trainer.start", { hand: convertHandToTenhouString(players[0].hand) }))],
            discardCount: 0,
            dora: dora,
            lastDraw: shuffle.pop(),
            isComplete: false,
            currentTime: this.state.settings.time,
            currentBonus: this.state.settings.extraTime
        });

        if (this.state.settings.useTimer) {
            this.timer = setTimeout(
                () => {
                    this.onTileClicked({ target: { name: this.state.lastDraw } });
                    this.setState({

                        currentBonus: 0
                    });
                },
                (this.state.settings.time + this.state.settings.extraTime) * 1000
            );
            this.timerUpdate = setInterval(this.updateTime, 100);
        }
    }

    /**
     * 
     * @param {Player} player The player who is discarding.
     * @param {Player[]} players The players in the game.
     * @returns {TileIndex} The tile the player discarded.
     */
    discardMostEfficientTile(player, players) {
        let ukeire = calculateDiscardUkeire(player.hand, this.getTilesHiddenFromPlayer(player, players), calculateMinimumShanten);
        let bestTile = evaluateBestDiscard(ukeire);
        player.discardTile(bestTile);
        return bestTile;
    }

    /**
     * Discards the safest tile from the player's hand and returns it.
     * @param {Player} player The player who is discarding.
     * @param {Player[]} players The players in the game.
     * @param {TileIndex} dora The current dora indicator.
     * @returns {TileIndex} The tile the player discarded.
     */
    discardSafestTile(player, players, dora) {
        let dealInRates = this.getDealInRates(player, players, dora);
        let bestSafety = Math.min(...dealInRates);
        let bestChoice = dealInRates.indexOf(bestSafety);

        player.discardTile(bestChoice);
        return bestChoice;
    }

    /**
     * Draws tiles until the player's hand has 14 tiles.
     * @param {Player} player The player to draw tiles.
     * @param {TileIndex[]} tilePool The tiles in the wall.
     */
    drawTilesToFourteen(player, tilePool) {
        let tilesInHand = player.hand.reduce((a, b) => a + b, 0);
        for (let i = tilesInHand; i <= 14; i++) {
            player.hand[removeRandomItem(tilePool)]++;
        }
    }

    /**
     * Counts how many of each tile a player can't see.
     * @param {Player} player The player to view from.
     * @param {Player[]} players The players in the game.
     * @returns {TileCounts} The number of each tile that can't be seen by the player.
     */
    getTilesHiddenFromPlayer(player, players) {
        let visibleTiles = ALL_TILES_REMAINING.slice();

        for (let i = 0; i < player.hand.length; i++) {
            visibleTiles[i] -= player.hand[i];
        }

        for (let p = 0; p < players.length; p++) {
            for (let i = 0; i < players[p].discards.length; i++) {
                visibleTiles[players[p].discards[i]]--;
            }
        }

        return visibleTiles;
    }

    /**
     * Calculates the combined deal-in percentage for each tile in the given player's hand,
     * using the KillerDucky wait-enumeration engine (see DefenseCalculator.js) against every
     * opponent currently in riichi.
     * @param {Player} player The player with the hand to check.
     * @param {Player[]} players The players in the game.
     * @param {TileIndex} dora The current dora indicator.
     * @returns {number[]} The combined deal-in percentage for each tile in the hand; `Infinity` for tiles not in hand.
     */
    getDealInRates(player, players, dora) {
        let doraTile = getDoraFromIndicator(dora);
        let hiddenTiles = this.getTilesHiddenFromPlayer(player, players);
        let rates = [];

        for (let i = 0; i < players.length; i++) {
            if (players[i].isInRiichi()) {
                rates.push(calculateDealInRates(player.hand, hiddenTiles, players[i], doraTile));
            }
        }

        return combineDealInRates(rates);
    }

    /**
     * Builds the per-wait-shape breakdown behind each hand tile's combined deal-in
     * percentage (see `getDealInRates`), picking whichever riichi opponent is most
     * dangerous for that tile. Used to show the "why" behind the % in the history.
     * @param {Player} player The player with the hand to check.
     * @param {Player[]} players The players in the game.
     * @param {TileIndex} dora The current dora indicator.
     * @returns {Array} Length-38 array of wait breakdowns; `null` for tiles not in hand or with no threat.
     */
    getDealInBreakdown(player, players, dora) {
        let doraTile = getDoraFromIndicator(dora);
        let hiddenTiles = this.getTilesHiddenFromPlayer(player, players);
        let opponentsData = [];

        for (let i = 0; i < players.length; i++) {
            if (players[i].isInRiichi()) {
                opponentsData.push(calculateDealInData(player.hand, hiddenTiles, players[i], doraTile));
            }
        }

        return combineWaitBreakdowns(player.hand, opponentsData);
    }

    /**
     * Brings the player's hand to tenpai after some useless turns.
     * @param {Player} player 
     * @param {TileIndex[]} tilePool 
     * @param {TileCounts} remainingTiles 
     */
    finishHand(player, tilePool, remainingTiles) {
        let shanten = calculateMinimumShanten(player.hand);
        // We do this manually instead of using the function because we care about the ukeire counts.
        let ukeire = calculateDiscardUkeire(player.hand, remainingTiles, calculateMinimumShanten, shanten);
        let bestTile = evaluateBestDiscard(ukeire);
        let uselessTurns = this.state.settings.minimumTurnsBeforeRiichi + randomInt(5);
        let drawnTile = 0;
        player.discardTile(bestTile);

        for (let i = 0; i <= uselessTurns - shanten; i++) {
            // Draw a useless tile.
            while (true) {
                drawnTile = removeRandomItem(tilePool);

                if (ukeire[bestTile].tiles.includes(drawnTile)) {
                    tilePool.push(drawnTile);
                } else {
                    break;
                }
            }

            remainingTiles[drawnTile]--;
            player.hand[drawnTile]++;

            ukeire = calculateDiscardUkeire(player.hand, remainingTiles, calculateMinimumShanten, shanten);
            bestTile = evaluateBestDiscard(ukeire);
            player.discardTile(bestTile);
        }

        while (shanten > 0) {
            while (true) {
                drawnTile = getRandomItem(ukeire[bestTile].tiles);

                if (tilePool.includes(drawnTile)) {
                    break;
                }
            }

            remainingTiles[drawnTile]--;
            player.hand[drawnTile]++;

            shanten = calculateMinimumShanten(player.hand);

            if (shanten === 0) player.riichiTile = -2;

            ukeire = calculateDiscardUkeire(player.hand, remainingTiles, calculateMinimumShanten, shanten);
            bestTile = evaluateBestDiscard(ukeire);
            player.discardTile(bestTile);
        }

        return {
            player: player,
            tilePool: convertHandToTileIndexArray(remainingTiles),
            remainingTiles: remainingTiles
        }
    }

    onTileClicked(event) {
        if (this.timer != null) {
            clearTimeout(this.timer);
            clearInterval(this.timerUpdate);
        }

        let { t } = this.props;
        let isComplete = this.state.isComplete;
        if (isComplete) return;

        let chosenTile = parseInt(event.target.name);
        let players = this.state.players.slice();
        let dealInRates = this.getDealInRates(players[0], players, this.state.dora);
        let waitBreakdown = this.getDealInBreakdown(players[0], players, this.state.dora);
        players[0].discardTile(chosenTile);
        this.tileDiscardedAfterRiichi(chosenTile, players);

        let tilePool = this.state.tilePool.slice();

        for (let i = 1; i < players.length; i++) {
            if (tilePool.length === 0) break;

            let discard = -1;

            if (players[i].isInRiichi()) {
                discard = removeRandomItem(tilePool);
                players[i].discards.push(discard);
            } else {
                this.drawTilesToFourteen(players[i], tilePool);
                discard = this.discardSafestTile(players[i], players, this.state.dora);
            }

            this.tileDiscardedAfterRiichi(discard, players);
        }

        let draw = -1;
        let history = this.state.history.slice();

        if (tilePool.length === 0) {
            isComplete = true;
            let hands = new LocalizedMessageChain();
            hands.appendLocalizedMessage("defense.finalHands");
            for (let i = 0; i < players.length; i++) {
                hands.appendLineBreak();
                hands.appendLocalizedMessage("defense.hand", {
                    player: t(players[i].name),
                    hand: convertHandToTenhouString(players[i].hand)
                });
            }
            history.unshift(new HistoryData(hands));
        } else {
            draw = removeRandomItem(tilePool);
            players[0].hand[draw]++;

            if (this.state.settings.useTimer) {
                this.timer = setTimeout(
                    () => {
                        this.onTileClicked({ target: { name: this.state.lastDraw } });
                        this.setState({
                            currentBonus: 0
                        });
                    },
                    (this.state.settings.time + this.state.currentBonus) * 1000
                );
                this.timerUpdate = setInterval(this.updateTime, 100);
            }
        }

        let bestSafety = Math.min(...dealInRates);
        let bestTile = dealInRates.indexOf(bestSafety);

        history.unshift(new SafetyHistoryData(
            chosenTile,
            dealInRates[chosenTile],
            bestTile,
            bestSafety,
            draw,
            undefined,
            waitBreakdown[chosenTile],
            waitBreakdown[bestTile]
        ));

        this.setState({
            players: players,
            tilePool: tilePool,
            discardCount: this.state.discardCount + 1,
            lastDraw: draw,
            history: history,
            isComplete: isComplete,
            currentTime: this.state.settings.time,
        });
    }

    onUpdateTime() {
        if (this.state.currentTime > 0.1) {
            this.setState({
                currentTime: Math.max(this.state.currentTime - 0.1, 0)
            });
        } else {
            this.setState({
                currentBonus: Math.max(this.state.currentBonus - 0.1, 0)
            });
        }
    }

    /**
     * Adds the given tile to the "discardsAfterRiichi" of each riichi'd player.
     * @param {TileIndex} tile The tile discarded.
     * @param {Player[]} players The players in the game.
     */
    tileDiscardedAfterRiichi(tile, players) {
        for (let i = 1; i < players.length; i++) {
            if (players[i].isInRiichi()) {
                players[i].discardsAfterRiichi.push(tile);
            }
        }
    }

    toggleChart() {
        this.setState({
            chartCollapsed: !this.state.chartCollapsed
        });
    }

    render() {
        let { t } = this.props;

        return (
            <Container>
                <DefenseSettings onChange={this.onSettingsChanged} />
                <Container>
                    <Button color="primary" onClick={() => this.toggleChart()}>{t("defense.safetyRatings")}</Button>
                    <Collapse isOpen={!this.state.chartCollapsed}>
                        <Card><CardBody>
                            <Row>{t("defense.averagedSafetyRating")}</Row>
                            <Row>
                                <span>{t("defense.dealInAttribution")} <a href="https://github.com/killerducky/killer_mortal_gui" target="_blank" rel="noopener noreferrer">killer_mortal_gui</a> (MIT License).</span>
                            </Row>
                        </CardBody></Card>
                    </Collapse>
                </Container>
                {this.state.players.length &&
                    <React.Fragment>
                        <Row className="mb-2 mt-2">
                            <span>{t("defense.instructions")}</span>
                        </Row>
                        <DiscardTable players={this.state.players} discardCount={this.state.discardCount} wallCount={this.state.tilePool && this.state.tilePool.length} showIndexes={this.state.settings.showIndexes} />
                        <Hand tiles={this.state.players[0].hand}
                            lastDraw={this.state.lastDraw}
                            onTileClick={this.onTileClicked}
                            showIndexes={this.state.settings.showIndexes} />
                        <Row className="mt-2">
                            <Col xs="6" sm="3" md="3" lg="2">
                                <Button className="btn-block" color={this.state.isComplete ? "success" : "warning"} onClick={() => this.onNewHand()}>{t("trainer.newHandButtonLabel")}</Button>
                            </Col>
                        </Row>
                        {this.state.settings.useTimer ?
                            <Row className="mt-2" style={{ justifyContent: 'flex-end', marginRight: 1 }}><span>{this.state.currentTime.toFixed(1)} + {this.state.currentBonus.toFixed(1)}</span></Row>
                            : ""
                        }
                        <Row className="mt-2 no-gutters">
                            <History history={this.state.history} concise={this.state.settings.extraConcise} verbose={this.state.settings.verbose} spoilers={this.state.settings.spoilers} />
                        </Row>
                    </React.Fragment>
                }
            </Container>
        );
    }
}
export default withTranslation()(DefenseState);