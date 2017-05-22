
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

interface SubCallbacks {
    getSubs(...args);
    subscribeSubs(...args);
}

class AutoSubscriber {
    _inst: any;
    _getSubs: any;
    _subscribeSubs: any;
    _subs: any;
    _unsub: any;

    constructor(Component, inst, subCallbacks?:SubCallbacks) {
        //Support static and instance methods
        this._inst = inst;
        this._getSubs = subCallbacks && subCallbacks.getSubs ? subCallbacks.getSubs : (Component.getSubs || (inst.getSubs ? inst.getSubs.bind(inst) : undefined));
        this._subscribeSubs = subCallbacks && subCallbacks.subscribeSubs ? subCallbacks.subscribeSubs : (Component.subscribeSubs || (inst.subscribeSubs ? inst.subscribeSubs.bind(inst) : undefined));
        this.checkAndStubMethods(Component);
    }

    updateSubscriptions(props, state) {
        const subs = wrapSubs(this._getSubs(props, state));
        if (getSubKeys(subs) !== getSubKeys(this._subs)) {
            //Only unsubscribe/subscribe if subKeys have changed
            this._subs = subs;
            var unsub = this._unsub;
            const subscribeResult = this._subscribeSubs(subs, props, state);
            if (subscribeResult.unsubscribe) {
                this._unsub = subscribeResult.unsubscribe;
            }
            else {
                this._unsub = subscribeResult;
            }

            if (subscribeResult.promise) {
                this._inst.__autoSubscriberUpdateFetchingErrorState(subscribeResult.promise);
            }

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
            console.error("firebase-nest: define getSubs and subscribeSubs on " + componentName + " component or pass them to createAutoSubscriber");
            this._getSubs = (() => []);
        }
    }
}

interface ComponentType {
    componentDidMount?(...args);
    componentWillReceiveProps?(...args);
    componentDidUpdate?(...args);
    componentWillUnmount?(...args);
    render();
    setState(...args);
    state?: Object;
    props?: Object;
}

export function createAutoSubscriber(subCallbacks?:SubCallbacks) {
    return Component => autoSubscriber(Component, subCallbacks);
}

export default function autoSubscriber(Component : {new(props:any): ComponentType}, subCallbacks?:SubCallbacks) {

    return class extends Component {
        $autoSubscriber : AutoSubscriber;

        __autoSubscriberUpdateFetchingErrorState(promise) {
            this.setState && this.setState({
                _autoSubscriberFetching: true,
                _autoSubscriberError: null
            }, () => {
                promise.then(() => {
                    this.setState({
                        _autoSubscriberFetching: false
                    });
                }, (error) => {
                    this.setState({
                        _autoSubscriberFetching: false,
                        _autoSubscriberError: error
                    });
                });
            })
        }

        constructor(props) {
            super(props);
            if (!this.state) {
                this.state = {}
            }
            this.$autoSubscriber = new AutoSubscriber(Component, this, subCallbacks);
        }

        componentDidMount() {
            if (super.componentDidMount) super.componentDidMount();
            this.$autoSubscriber.updateSubscriptions(this.props, this.state);
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

        render() {
            const getSubs = this.$autoSubscriber._getSubs;

            //specifically done for mobx, to re-render based on any observables accessed in getSubs.
            //for example, if getSubs returns subs based on a logged-in observable flag.
            getSubs && getSubs(this.props, this.state);

            return super.render();
        }
    }
}