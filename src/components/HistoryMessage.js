import React from 'react';
import { ListGroupItem, Collapse, Row } from 'reactstrap';
import { withTranslation } from 'react-i18next';
import UkeireHistoryData from './ukeire-quiz/UkeireHistoryData';
import UkeireHistoryVisual from './ukeire-quiz/UkeireHistoryVisual';

class HistoryMessage extends React.Component {
    /* PROPS
        data (HistoryData),
        verbose,
        concise,
        spoilers
    */
    constructor(props) {
        super(props);
        this.state = { collapsed: true };
    }

    componentDidMount() {
        this.setState({
            collapsed: false
        });
    }

    render() {
        let { t } = this.props;
        if (!this.props.data) return <ListGroupItem></ListGroupItem>;

        let content;

        if (!this.props.concise && this.props.data instanceof UkeireHistoryData) {
            // The concise setting keeps the old compact text; otherwise ukeire
            // entries get the visual discard comparison.
            content = <UkeireHistoryVisual data={this.props.data} spoilers={this.props.spoilers} verbose={this.props.verbose} />;
        } else {
            let message = this.props.data.getMessage(t, this.props.concise, this.props.verbose, this.props.spoilers);
            content = message.split("<br/>").map((message, index) => <Row key={index}>{message}</Row>);
        }

        return (
            <Collapse isOpen={!this.state.collapsed}>
                <ListGroupItem className={this.props.data.getClassName()}>
                    {content}
                    {this.props.data.hand ? <a className="tenhouLink" href={"http://tenhou.net/2/?q=" + this.props.data.hand} target="_blank" rel="noopener noreferrer">
                        {t("history.tenhouLinkText")}
                    </a> : ""}
                </ListGroupItem>
            </Collapse>
        );
    }
}

export default withTranslation()(HistoryMessage);