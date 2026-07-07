import React from 'react';
import { Container, Collapse, Card, CardBody, Button, Row, Col, Table } from 'reactstrap';
import { withTranslation } from 'react-i18next';

/** Computes the displayed metrics for a single session (or summed totals). */
function metricsOf(session) {
    let averageDiscards = session.discards / session.tenpai;
    if (!isFinite(averageDiscards)) averageDiscards = 0;
    averageDiscards = Math.round(averageDiscards * 10) / 10;

    let optimalRate = session.optimalDiscards / session.discards;
    if (!isFinite(optimalRate)) optimalRate = 0;
    optimalRate = Math.round(optimalRate * 100);

    let efficiency = session.efficiency / session.possibleEfficiency;
    if (!isFinite(efficiency)) efficiency = 0;
    efficiency = Math.round(efficiency * 100);

    let shantenRate = session.shantenIncreases / session.discards;
    if (!isFinite(shantenRate)) shantenRate = 0;
    shantenRate = Math.round(shantenRate * 100);

    return { averageDiscards, optimalRate, efficiency, shantenRate };
}

/** Sums an array of sessions into one aggregate session. */
function sumSessions(sessions) {
    return sessions.reduce((acc, s) => ({
        start: null,
        discards: acc.discards + (s.discards || 0),
        tenpai: acc.tenpai + (s.tenpai || 0),
        efficiency: acc.efficiency + (s.efficiency || 0),
        possibleEfficiency: acc.possibleEfficiency + (s.possibleEfficiency || 0),
        optimalDiscards: acc.optimalDiscards + (s.optimalDiscards || 0),
        shantenIncreases: acc.shantenIncreases + (s.shantenIncreases || 0)
    }), {
        start: null, discards: 0, tenpai: 0, efficiency: 0,
        possibleEfficiency: 0, optimalDiscards: 0, shantenIncreases: 0
    });
}

/** Tiny dependency-free SVG bar chart for visualising a trend across sessions. */
function SparkBars({ values, labels, max, color }) {
    if (!values || values.length === 0) return null;

    let top = max || Math.max(...values, 1);
    let barW = 12, gap = 4, h = 44;
    let width = values.length * (barW + gap);

    return (
        <svg width={width} height={h} style={{ display: "block", maxWidth: "100%" }}>
            {values.map((v, i) => {
                let barH = top > 0 ? Math.max((v / top) * h, v > 0 ? 1 : 0) : 0;
                return (
                    <rect key={i} x={i * (barW + gap)} y={h - barH} width={barW} height={barH} fill={color} rx="1">
                        <title>{(labels && labels[i]) ? labels[i] + ": " : ""}{v}</title>
                    </rect>
                );
            })}
        </svg>
    );
}

class StatsDisplay extends React.Component {
    constructor(props) {
        super(props);
        this.toggleStats = this.toggleStats.bind(this);
        this.toggleConfirm = this.toggleConfirm.bind(this);
        this.state = {
            statsCollapsed: true,
            confirmCollapsed: true
        };
    }

    toggleStats() {
        this.setState({ statsCollapsed: !this.state.statsCollapsed });
    }

    toggleConfirm() {
        this.setState({ confirmCollapsed: !this.state.confirmCollapsed });
    }

    /** Renders the four headline metrics for a session as a set of rows. */
    renderMetricRows(session) {
        let { t } = this.props;
        let m = metricsOf(session);

        return (
            <React.Fragment>
                <Row>{t("stats.average", { average: m.averageDiscards })}</Row>
                <Row>{t("stats.optimalRate", { percent: m.optimalRate, achieved: session.optimalDiscards, total: session.discards })}</Row>
                <Row>{t("stats.overall", { percent: m.efficiency, achieved: session.efficiency, total: session.possibleEfficiency })}</Row>
                <Row>{t("stats.shanten", { count: session.shantenIncreases, percent: m.shantenRate, total: session.discards })}</Row>
            </React.Fragment>
        );
    }

    formatDate(session) {
        let { t } = this.props;
        if (!session.start) return t("stats.previousTotals");
        try {
            return new Date(session.start).toLocaleString();
        } catch {
            return "" + session.start;
        }
    }

    render() {
        let { t } = this.props;
        let sessions = this.props.sessions || [];
        let current = sessions.length > 0 ? sessions[sessions.length - 1] : null;
        let allTime = sumSessions(sessions);

        // Chronological order (oldest -> newest) so trends read left to right.
        let labels = sessions.map(s => this.formatDate(s));
        let trendMetrics = sessions.map(s => metricsOf(s));

        // History table, newest first.
        let historyRows = sessions.map((s, i) => ({ s, m: trendMetrics[i], label: labels[i], current: i === sessions.length - 1 }));
        historyRows.reverse();

        return (
            <Container>
                <Button color="primary" onClick={this.toggleStats}>{t("stats.buttonLabel")}</Button>
                <Collapse isOpen={!this.state.statsCollapsed}>
                    <Card><CardBody>
                        <Row><i>{t("stats.info")}</i></Row>

                        <Row className="mt-3"><Col xs="12"><h5>{t("stats.currentSession")}</h5></Col></Row>
                        {current && <Col xs="12">{this.renderMetricRows(current)}</Col>}

                        <Row className="mt-3"><Col xs="12"><h5>{t("stats.allTime")}</h5></Col></Row>
                        <Col xs="12">
                            <Row>{t("stats.ready", { count: allTime.tenpai })}</Row>
                            <Row>{t("stats.discards", { count: allTime.discards })}</Row>
                            {this.renderMetricRows(allTime)}
                        </Col>

                        {sessions.length > 1 &&
                            <React.Fragment>
                                <Row className="mt-3"><Col xs="12"><h5>{t("stats.trends")}</h5></Col></Row>
                                <Row>
                                    <Col xs="12" md="6" className="mb-2">
                                        <div>{t("stats.trendOptimal")}</div>
                                        <SparkBars values={trendMetrics.map(m => m.optimalRate)} labels={labels} max={100} color="#28a745" />
                                    </Col>
                                    <Col xs="12" md="6" className="mb-2">
                                        <div>{t("stats.trendEfficiency")}</div>
                                        <SparkBars values={trendMetrics.map(m => m.efficiency)} labels={labels} max={100} color="#007bff" />
                                    </Col>
                                    <Col xs="12" md="6" className="mb-2">
                                        <div>{t("stats.trendAverage")}</div>
                                        <SparkBars values={trendMetrics.map(m => m.averageDiscards)} labels={labels} color="#6f42c1" />
                                    </Col>
                                    <Col xs="12" md="6" className="mb-2">
                                        <div>{t("stats.trendShanten")}</div>
                                        <SparkBars values={trendMetrics.map(m => m.shantenRate)} labels={labels} max={100} color="#dc3545" />
                                    </Col>
                                </Row>
                            </React.Fragment>
                        }

                        <Row className="mt-3"><Col xs="12"><h5>{t("stats.sessionHistory")}</h5></Col></Row>
                        {sessions.length <= 1 && <Row><Col xs="12">{t("stats.noSessions")}</Col></Row>}
                        {sessions.length > 1 &&
                            <Table size="sm" responsive>
                                <thead>
                                    <tr>
                                        <th>{t("stats.colDate")}</th>
                                        <th>{t("stats.colReady")}</th>
                                        <th>{t("stats.colAverage")}</th>
                                        <th>{t("stats.colOptimal")}</th>
                                        <th>{t("stats.colEfficiency")}</th>
                                        <th>{t("stats.colShanten")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {historyRows.map((row, i) => (
                                        <tr key={i} style={row.current ? { fontWeight: "bold" } : undefined}>
                                            <td>{row.label}</td>
                                            <td>{row.s.tenpai}</td>
                                            <td>{row.m.averageDiscards}</td>
                                            <td>{row.m.optimalRate}%</td>
                                            <td>{row.m.efficiency}%</td>
                                            <td>{row.s.shantenIncreases} ({row.m.shantenRate}%)</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        }

                        <Row className="mt-4">
                            <Button color="danger" onClick={this.toggleConfirm}>{t("stats.reset")}</Button>
                        </Row>
                        <Row>
                            <Collapse isOpen={!this.state.confirmCollapsed}>
                                <Card><CardBody>
                                    <Row>{t("stats.confirmation")}</Row>
                                    <Row>
                                        <Button color="danger" onClick={() => { this.toggleConfirm(); this.props.onReset(); }}>{t("stats.yes")}</Button>
                                        <Col xs="1" />
                                        <Button color="success" onClick={this.toggleConfirm}>{t("stats.no")}</Button>
                                    </Row>
                                </CardBody></Card>
                            </Collapse>
                        </Row>
                    </CardBody></Card>
                </Collapse>
            </Container>
        );
    }
}

export default withTranslation()(StatsDisplay);
