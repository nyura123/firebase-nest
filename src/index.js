
//list data
export const FB_INIT_VAL = 'FB_INIT_VAL';
export const FB_CHILD_ADDED = 'FB_CHILD_ADDED';
export const FB_CHILD_WILL_REMOVE = 'FB_CHILD_WILL_REMOVE';
export const FB_CHILD_REMOVED = 'FB_CHILD_REMOVED';
export const FB_CHILD_WILL_CHANGE = 'FB_CHILD_WILL_CHANGE';
export const FB_CHILD_CHANGED = 'FB_CHILD_CHANGED';
//value data
export const FB_VALUE = 'FB_VALUE';

export default function createSubscriber({onData, onSubscribed, onUnsubscribed,
    resolveFirebaseQuery,subscribedRegistry}) {
    if (!onData || !onSubscribed || !onUnsubscribed || !resolveFirebaseQuery || !subscribedRegistry) {
        console.error("createNestedFirebaseSubscriber: missing one of onData, onSubscribed, onUnsubscribed, resolveFirebaseQuery, subscribedRegistry");
        return;
    }

    function subscribeToChildData(sub, childKey) {
        if (!sub.forEachChild) return;
        if (!sub.forEachChild.childSubs) {
            console.error("ERROR: forEachChild must have a childSubs key - a function that returns a subs array and takes a childKey and other optional args specifified in forEachChild.args")
        }
        var childSubs = sub.forEachChild.childSubs(childKey, ...(sub.forEachChild.args||[])) || [];
        subscribedRegistry[sub.subKey].childSubKeys[childKey] = (childSubs).map(sub=>sub.subKey);
        subscribeSubs(childSubs);
    }

    function check(type, sub) {
        if (!subscribedRegistry[sub.subKey]) {
            console.error("Error on for "+sub.subKey+", got "+type+" firebase callback but not subscribed!");
        }
    }

    function executeListSubscribeAction(sub) {
        if (subscribedRegistry[sub.subKey]) {
            //Already subscribed, just increment ref count
            subscribedRegistry[sub.subKey].refCount++;
            return;
        }

        var ref = resolveFirebaseQuery(sub);
        var gotInitVal = false;
        subscribedRegistry[sub.subKey] = {
            refCount: 1,
            ref: ref,
            childSubKeys: {},
            refHandles: {}
        };
        subscribedRegistry[sub.subKey].refHandles.child_added = ref.on('child_added', function(snapshot) {
            if (!gotInitVal) return;
            check('child_added', sub);
            onData(FB_CHILD_ADDED, snapshot, sub);
            subscribeToChildData(sub, snapshot.key());
        });
        subscribedRegistry[sub.subKey].refHandles.child_changed = ref.on('child_changed', function(snapshot) {
            if (!gotInitVal) return;
            check('child_changed', sub);
            onData(FB_CHILD_WILL_CHANGE, snapshot, sub);
            onData(FB_CHILD_CHANGED, snapshot, sub);
        });
        subscribedRegistry[sub.subKey].refHandles.child_removed = ref.on('child_removed', function(snapshot) {
            if (!gotInitVal) return;
            check('child_removed', sub);
            var childSubKeys = subscribedRegistry[sub.subKey].childSubKeys[snapshot.key()] || [];
            delete subscribedRegistry[sub.subKey].childSubKeys[snapshot.key()];
            unsubscribeSubKeys(childSubKeys);
            onData(FB_CHILD_WILL_REMOVE, snapshot, sub);
            onData(FB_CHILD_REMOVED, snapshot, sub);
        });
        ref.once('value', function(snapshot) {
            if (gotInitVal) {
                console.error("Got 'once' callback for "+snapshot.key()+" more than once")
            }
            gotInitVal = true;
            //We might've gotten unsubscribed while waiting for initial value, so check if we're still subscribed
            if (subscribedRegistry[sub.subKey]) {
                onData(FB_INIT_VAL, snapshot, sub);

                var val = snapshot.val();
                if (val && (typeof val == 'object')) {
                    Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey));
                }
            }
        });
    }

    function executeValueSubscribeAction(sub) {
        if (subscribedRegistry[sub.subKey]) {
            //Already subscribed, just increment ref count
            subscribedRegistry[sub.subKey].refCount++;
            return;
        }

        var ref = resolveFirebaseQuery(sub);

        subscribedRegistry[sub.subKey] = {
            refCount: 1,
            ref: ref,
            childSubKeys: {},
            refHandles: {}
        };
        subscribedRegistry[sub.subKey].refHandles.value = ref.on('value', function(snapshot) {
            onData(FB_VALUE, snapshot, sub);

            check('value', sub);

            //First subscribe to new value's nodes, then unsubscribe old ones - the ones in both old/new will remain
            //subscribed to firebase to avoid possibly blowing away firebase cache
            var oldChildSubKeys = Object.assign({}, subscribedRegistry[sub.subKey].childSubKeys);
            subscribedRegistry[sub.subKey].childSubKeys = {};

            var val = snapshot.val();
            if (val && (typeof val == 'object')) {
                Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey));
            }
            Object.keys(oldChildSubKeys || {}).forEach(childKey=>{
                unsubscribeSubKeys(oldChildSubKeys[childKey]);
            });
        });
    }

    function unsubscribeSubKey(subKey) {
        var info = subscribedRegistry[subKey];
        if (!info) {
            console.error("no subscriber found for subKey=" + subKey);
        } else {
            info.refCount--;
            if (info.refCount == 0) {
                Object.keys(info.refHandles).forEach(eventType=> {
                    info.ref.off(eventType, info.refHandles[eventType]);
                });
                Object.keys(info.childSubKeys || {}).forEach(childKey=> {
                    var subKeys = info.childSubKeys[childKey];
                    unsubscribeSubKeys(subKeys);
                });
                delete subscribedRegistry[subKey];
            }
        }
        onUnsubscribed(subKey);
    }

    function unsubscribeSubKeys(subKeys) {
        subKeys.forEach(subKey=>unsubscribeSubKey(subKey));
    }

    function subscribeSub(sub) {
        if (!sub.subKey) {
            console.error("subscribeSub needs an object with a string subKey field");
            console.error(sub);
            return;
        }
        if (!sub.asList && !sub.asValue) {
            console.error("subscribeSub needs an object with either asList=true or asValue=true");
            console.error(sub);
            return;
        }
        if (sub.asList) {
            executeListSubscribeAction(sub);
        } else if (sub.asValue) {
            executeValueSubscribeAction(sub);
        } else {
            console.error("??");
        }
        onSubscribed(sub);

        return function unsubscribe() {
            unsubscribeSubKey(sub.subKey);
        }
    }
    function subscribeSubs(subs) {
        if (!subs) return;
        if (!subs.forEach) {
            console.error("subscribeSubs expects an array of subs");
            console.error(subs);
            return;
        }
        var unsubs = subs.map(sub=>subscribeSub(sub));

        return function unsubscribe() {
            unsubs.forEach(unsub=>unsub());
        }
    }

    return { subscribeSubs };
};


//Subscriber for React components.
//Component must specify static getSubs(props, state)
export function autoSubscriber(subscribe, Component) {
    return class extends Component {
        getSubs(props, state) {
            var subs = Component.getSubs(props, state);
            if (subs.constructor !== Array) {
                subs = [subs];
            }
            return subs;
        }
        constructor(props) {
            super(props);
            //TODO error checking to make sure Component.getSubs exists
            this.subs = this.getSubs(props, this.state);
            this.unsub = subscribe(this.subs);
        }
        getSubKeys(subs) {
            return Object.keys(subs||{}).map(k=>subs[k].subKey).sort().join(",");
        }
        updateSubscriptions(props, state) {
            var subs = this.getSubs(props, state);
            if (this.getSubKeys(subs) !== this.getSubKeys(this.subs)) {
                //Only unsubscribe/subscribe if subKeys have changed
                this.subs = subs;
                var unsub = this.unsub;
                this.unsub = subscribe(subs);
                if (unsub) unsub();
            }
        }
        componentWillReceiveProps(props) {
            this.updateSubscriptions(props, this.state);
            if (super.componentWillReceiveProps) super.componentWillReceiveProps(props);
        }
        componentWillUpdate(props, state) {
            this.updateSubscriptions(props, state);
            if (super.componentWillUpdate) super.componentWillUpdate(props, state);
        }
        componentWillUnmount() {
            if (this.unsub) {
                this.unsub();
            }

            if (super.componentWillUnmount) super.componentWillUnmount();
        }
    }
}