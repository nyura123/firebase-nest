
//list data
const FB_INIT_VAL = 'FB_INIT_VAL';
const FB_CHILD_ADDED = 'FB_CHILD_ADDED';
const FB_CHILD_WILL_REMOVE = 'FB_CHILD_WILL_REMOVE';
const FB_CHILD_REMOVED = 'FB_CHILD_REMOVED';
const FB_CHILD_WILL_CHANGE = 'FB_CHILD_WILL_CHANGE';
const FB_CHILD_CHANGED = 'FB_CHILD_CHANGED';
//value data
const FB_VALUE = 'FB_VALUE';

module.exports = function (config) {
    const onData = config.onData;
    const onSubscribed = config.onSubscribed;
    const onUnsubscribed = config.onUnsubscribed;
    const resolveFirebaseQuery = config.resolveFirebaseQuery;
    const subscribedRegistry = config.subscribedRegistry;

    if (!onData || !onSubscribed || !onUnsubscribed || !resolveFirebaseQuery || !subscribedRegistry) {
        console.error("createNestedFirebaseSubscriber: missing one of onData, onSubscribed, onUnsubscribed, resolveFirebaseQuery, subscribedRegistry");
        return;
    }

    function subscribeToChildData(sub, childKey) {
        if (!sub.forEachChild) return;
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
                Object.keys(snapshot.val() || {}).forEach(childKey=>subscribeToChildData(sub, childKey));
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
            Object.keys(snapshot.val()||{}).forEach(childKey=>subscribeToChildData(sub, childKey));
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

    return { subscribeSubs: subscribeSubs };
};