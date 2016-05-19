
//list data
export const FB_INIT_VAL = 'FB_INIT_VAL';
export const FB_CHILD_ADDED = 'FB_CHILD_ADDED';
export const FB_CHILD_WILL_REMOVE = 'FB_CHILD_WILL_REMOVE';
export const FB_CHILD_REMOVED = 'FB_CHILD_REMOVED';
export const FB_CHILD_WILL_CHANGE = 'FB_CHILD_WILL_CHANGE';
export const FB_CHILD_CHANGED = 'FB_CHILD_CHANGED';
//value data
export const FB_VALUE = 'FB_VALUE';

import importedAutoSubscriber from './autoSubscriber';
export const autoSubscriber = importedAutoSubscriber;

export default function createSubscriber({onData,
    onSubscribed,
    onUnsubscribed,
    resolveFirebaseQuery,
    onWillSubscribe,
    onWillUnsubscribe}) {
    var subscribedRegistry = {};
    if (!onData || !resolveFirebaseQuery) {
        console.error("createNestedFirebaseSubscriber: missing onData or resolveFirebaseQuery callback");
        return;
    }

    function subscribeToField(sub, forField, fieldKey, fieldVal) {
        const subscribe = (forField.subscribeSubs ? forField.subscribeSubs : subscribeSubs);
        var fieldSubs = forField.fieldSubs(fieldVal, ...(forField.args || [])) || [];
        subscribedRegistry[sub.subKey].fieldUnsubs[fieldKey] = subscribe(fieldSubs);
    }

    function subscribeToFields(sub, val) {
        const oldFieldUnsubs = Object.assign({}, subscribedRegistry[sub.subKey].fieldUnsubs || {});

        subscribedRegistry[sub.subKey].fieldUnsubs = {};

        //Subscribe based on new fields in val
        const forFields = sub.forFields || [];
        if (forFields.constructor !== Array) {
            console.error("ERROR: forFields must be an array");
        } else {
            val = val || {};
            (forFields || []).forEach(forField => {
                if (!forField.fieldKey || !forField.fieldSubs) {
                    console.error("ERROR: each element in forFields must have fieldKey and fieldSubs keys");
                    return;
                }
                const fieldVal = val[forField.fieldKey];
                if (fieldVal !== undefined) {
                    subscribeToField(sub, forField, forField.fieldKey, fieldVal);
                }
            })
        }

        //Unsubscribe old fields
        Object.keys(oldFieldUnsubs || {}).forEach(field => {
            const unsub = oldFieldUnsubs[field];
            unsub();
        });
    }

    function subscribeToChildData(sub, childKey, childVal) {
        if (!sub.forEachChild) return;
        if (!sub.forEachChild.childSubs) {
            console.error("ERROR: forEachChild must have a childSubs key - a function that returns a subs array and takes a childKey and other optional args specifified in forEachChild.args")
        }
        const subscribe = (sub.forEachChild.subscribeSubs ? sub.forEachChild.subscribeSubs : subscribeSubs);
        var childSubs = sub.forEachChild.childSubs(childKey, ...(sub.forEachChild.args||[]), childVal) || [];
        subscribedRegistry[sub.subKey].childUnsubs[childKey] = subscribe(childSubs);
    }

    function check(type, sub) {
        if (!subscribedRegistry[sub.subKey]) {
            console.error("Error on for "+sub.subKey+", got "+type+" firebase callback but not subscribed!");
            return false;
        }
        return true;
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
            childUnsubs: {},
            fieldUnsubs: {},
            refHandles: {}
        };
        subscribedRegistry[sub.subKey].refHandles.child_added = ref.on('child_added', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_added', sub)) return;
            subscribeToChildData(sub, snapshot.key(), snapshot.val());
            onData(FB_CHILD_ADDED, snapshot, sub);
        });
        subscribedRegistry[sub.subKey].refHandles.child_changed = ref.on('child_changed', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_changed', sub)) return;
            onData(FB_CHILD_WILL_CHANGE, snapshot, sub);
            onData(FB_CHILD_CHANGED, snapshot, sub);
        });
        subscribedRegistry[sub.subKey].refHandles.child_removed = ref.on('child_removed', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_removed', sub)) return;
            const childUnsub = subscribedRegistry[sub.subKey].childUnsubs[snapshot.key()];
            delete subscribedRegistry[sub.subKey].childUnsubs[snapshot.key()];
            if (childUnsub) childUnsub();
            onData(FB_CHILD_WILL_REMOVE, snapshot, sub);
            onData(FB_CHILD_REMOVED, snapshot, sub);
        });
        ref.once('value', function(snapshot) {
            if (gotInitVal) {
                console.error("Got 'once' callback for "+snapshot.key()+" more than once");
                return;
            }
            gotInitVal = true;
            //We might've gotten unsubscribed while waiting for initial value, so check if we're still subscribed
            if (subscribedRegistry[sub.subKey]) {
                var val = snapshot.val();
                if (val !== null && (typeof val == 'object')) {
                    Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey, val[childKey]));
                    subscribeToFields(sub, val);
                }

                onData(FB_INIT_VAL, snapshot, sub);
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
            childUnsubs: {},
            refHandles: {}
        };
        subscribedRegistry[sub.subKey].refHandles.value = ref.on('value', function(snapshot) {
            if (!check('value', sub)) return;

            //First subscribe to new value's nodes, then unsubscribe old ones - the ones in both old/new will remain
            //subscribed to firebase to avoid possibly blowing away firebase cache
            const oldChildUnsubs = Object.assign({}, subscribedRegistry[sub.subKey].childUnsubs);
            subscribedRegistry[sub.subKey].childUnsubs = {};

            var val = snapshot.val();
            if (val !== null && (typeof val == 'object')) {
                Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey, val[childKey]));
                subscribeToFields(sub, val);
            }
            Object.keys(oldChildUnsubs || {}).forEach(childKey=>{
                const childUnsub = oldChildUnsubs[childKey];
                childUnsub();
            });

            onData(FB_VALUE, snapshot, sub);
        });
    }

    function unsubscribeSubKey(subKey) {
        var info = subscribedRegistry[subKey];
        if (!info) {
            console.error("no subscriber found for subKey=" + subKey);
        } else {
            if (onWillUnsubscribe) onWillUnsubscribe(subKey);
            info.refCount--;
            if (info.refCount == 0) {
                delete subscribedRegistry[subKey];
                Object.keys(info.refHandles).forEach(eventType=> {
                    info.ref.off(eventType, info.refHandles[eventType]);
                });
                Object.keys(info.childUnsubs || {}).forEach(childKey=> {
                    const childUnsub = info.childUnsubs[childKey];
                    childUnsub();
                });
                Object.keys(info.fieldUnsubs || {}).forEach(fieldKey=> {
                    const fieldUnsub = info.fieldUnsubs[fieldKey];
                    fieldUnsub();
                });
            }
        }
        if (onUnsubscribed) onUnsubscribed(subKey);
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

        if (onWillSubscribe) onWillSubscribe(sub);

        if (sub.asList) {
            executeListSubscribeAction(sub);
        } else if (sub.asValue) {
            executeValueSubscribeAction(sub);
        } else {
            console.error("??");
        }

        if (onSubscribed) onSubscribed(sub);

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

    function unsubscribeAll() {
        while (Object.keys(subscribedRegistry || {}).length > 0) {
            unsubscribeSubKey(Object.keys(subscribedRegistry)[0])
        }
    }
    return { subscribeSubs, subscribedRegistry, unsubscribeAll };
};

