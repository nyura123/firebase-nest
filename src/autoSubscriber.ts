
/* AutoSubscriber

 Subscriber for React components.
 Component must specify getSubs(props, state) and subscribeSubs(subs, props, state). Both can be static.

 */

function wrapSubs(subs) {
    if (subs && subs.constructor !== Array) {
        subs = [subs];
    }
    return subs || [];
}

function getSubKeys(subs) {
    return Object.keys(subs || {}).map(k=>subs[k].subKey).sort().join(",");
}

class AutoSubscriber {
    _getSubs: any;
    _subscribeSubs: any;
    _subs: any;
    _unsub: any;

    constructor(Component, inst) {
        //Support static and instance methods
        this._getSubs = Component.getSubs || inst.getSubs;
        this._subscribeSubs = Component.subscribeSubs || (inst.subscribeSubs ? inst.subscribeSubs.bind(inst) : undefined);
        this.checkAndStubMethods(Component);
        this.updateSubscriptions(inst.props, inst.state);
    }

    updateSubscriptions(props, state) {
        const subs = wrapSubs(this._getSubs(props, state));
        if (getSubKeys(subs) !== getSubKeys(this._subs)) {
            //Only unsubscribe/subscribe if subKeys have changed
            this._subs = subs;
            var unsub = this._unsub;
            this._unsub = this._subscribeSubs(subs, props, state);

            //Unsubscribe from old subscriptions
            if (unsub) unsub();
        }
    }

    unsubscribe() {
        if (this._unsub) {
            this._unsub();
            this._unsub = null;
        }
    }

    checkAndStubMethods(Component) {
        if (!this._getSubs || !this._subscribeSubs) {
            const componentName = Component.displayName || Component.name || "unknown component";
            console.error("Define getSubs and subscribeSubs on " + componentName + " to use firebase-nest autoSubscriber");
            this._getSubs = (() => []);
        }
    }
}

interface ComponentType {
    componentDidMount?(...args);
    componentWillReceiveProps?(...args);
    componentDidUpdate?(...args);
    componentWillUnmount?(...args);
    state?: Object;
    props?: Object;
}

export default function autoSubscriber(Component : {new(): ComponentType}) {

    return class extends Component {
        $autoSubscriber : AutoSubscriber;

        componentDidMount() {
            if (super.componentDidMount) super.componentDidMount();
            this.$autoSubscriber = new AutoSubscriber(Component, this);
        }

        //If a component is receiving new props, check and possibly update its subscriptions
        componentWillReceiveProps(props) {
            if (super.componentWillReceiveProps) super.componentWillReceiveProps(props);
            this.$autoSubscriber.updateSubscriptions(props, this.state);
        }

        //If a component has updated (has received new props or state), check and possibly update its subscriptions
        componentDidUpdate() {
            if (super.componentDidUpdate) super.componentDidUpdate();
            this.$autoSubscriber.updateSubscriptions(this.props, this.state);
        }

        componentWillUnmount() {
            if (super.componentWillUnmount) super.componentWillUnmount();
            this.$autoSubscriber.unsubscribe();
            this.$autoSubscriber = null;
        }
    }
}