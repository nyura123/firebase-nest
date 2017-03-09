
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
export { createAutoSubscriber } from './autoSubscriber';

interface ForEachChild {
    childSubs: (childKey: string | number, ...args) => Array<Sub>,
    args?: Array<any>
    store?: any
}

interface ForFields {
    fieldKey: string | number,
    fieldSubs: (fieldVal: any, ...args) => Array<Sub>,
    args?: Array<any>,
    store?: any
}

export interface Sub {
    subKey: string,
    asValue?: boolean,
    asList?: boolean,
    forEachChild?: ForEachChild,
    forFields?: Array<ForFields>
}

//credit to js-promise-defer on github
function defer(deferred) {
    deferred.promise = new Promise(function (resolve, reject) {
        deferred.resolve = resolve;
        deferred.reject = reject;
    });
}

//To detect subscriber cycles, keep track of which subscribes are done from "outside" as parentSubKey="_root".
//The rest of subscribes are due to subscribing to child data.
const rootSubKey = '_root';

//Firebase 3.x: snapshot.key() has been replaced with snapshot.key
let getKey = function(snapshot) {
    if (typeof snapshot.key == 'function') {
        console.log('firebase-nest: detected pre-3.x firebase snapshot.key()');
        getKey = legacyGetKey;
        return legacyGetKey(snapshot);
    }
    console.log('firebase-nest: detected ^3.x firebase snapshot.key');
    getKey = newGetKey;
    return newGetKey(snapshot);
};
function legacyGetKey(snapshot) {
    return snapshot.key();
}
function newGetKey(snapshot) {
    return snapshot.key;
}

export default function createSubscriber({onData,
    onSubscribed,
    onUnsubscribed,
    resolveFirebaseQuery,
    onWillSubscribe,
    onWillUnsubscribe,
    onError,
    doNotDetectCycles}) {

    function reportError(error) {
        console.error(error);
        if (onError && typeof onError === 'function') {
            onError(error);
        }
    }

    //let disallowSubscriptions = false;
    const subscribedRegistry = {};
    const promisesBySubKey = {};

    const self = {
        subscribeSubsWithPromise
    };

    function loadedPromise(subKey) {
        if (promisesBySubKey[subKey]) {
            return promisesBySubKey[subKey].promise;
        }
        promisesBySubKey[subKey] = {};
        defer(promisesBySubKey[subKey]);
        return promisesBySubKey[subKey].promise;
    }

    function subsLoaded(subs : Array<Sub>) {
        return Promise.all((subs || []).map(sub => loadedPromise(sub.subKey)));
    }

    if (!onData || !resolveFirebaseQuery) {
        console.error('createNestedFirebaseSubscriber: missing onData or resolveFirebaseQuery callback');
        return;
    }

    function subscribeToField(sub : Sub, forField, fieldKey, fieldVal, promises) {
        const store = (forField.store ? forField.store : self);
        var fieldSubs = forField.fieldSubs(fieldVal, ...(forField.args || [])) || [];

        const {unsubscribe, promise} = store.subscribeSubsWithPromise(fieldSubs, sub.subKey);

        if (!subscribedRegistry[sub.subKey]) {
            //edge case - roll back subscribe if somehow our parent got unsubscribed by on* callbacks
            unsubscribe();
            return;
        };
        subscribedRegistry[sub.subKey].fieldUnsubs[fieldKey] = unsubscribe;

        if (promises) {
            promises.push(promise);
        }
    }

    function subscribeToFields(sub : Sub, val, promises?) {
        if (!subscribedRegistry[sub.subKey]) return;

        const oldFieldUnsubs = Object.assign({}, subscribedRegistry[sub.subKey].fieldUnsubs || {});

        subscribedRegistry[sub.subKey].fieldUnsubs = {};

        //Subscribe based on new fields in val
        const forFields = sub.forFields || [];
        if (forFields.constructor !== Array) {
            console.error('ERROR: forFields must be an array');
        } else {
            if (val !== null && (typeof val == 'object')) {
                val = val || {};
                (forFields || []).forEach(forField => {
                    if (!forField.fieldKey || !forField.fieldSubs) {
                        console.error('ERROR: each element in forFields must have fieldKey and fieldSubs keys');
                        return;
                    }
                    const fieldVal = val[forField.fieldKey];
                    if (fieldVal !== undefined) {
                        subscribeToField(sub, forField, forField.fieldKey, fieldVal, promises);
                    }
                })
            }
        }

        //Unsubscribe old fields
        Object.keys(oldFieldUnsubs || {}).forEach(field => {
            const unsub = oldFieldUnsubs[field];
            unsub();
        });
    }

    function subscribeToChildData(sub : Sub, childKey, childVal, promises?) {
        if (!sub.forEachChild) return;
        if (!sub.forEachChild.childSubs) {
            console.error(`ERROR: forEachChild must have a childSubs key - a function that returns a subs array and takes a 
                        childKey and other optional args specified in forEachChild.args`);
        }
        const store = (sub.forEachChild.store ? sub.forEachChild.store : self);
        var childSubs = sub.forEachChild.childSubs(childKey, ...(sub.forEachChild.args||[]), childVal) || [];

        const {unsubscribe, promise} = store.subscribeSubsWithPromise(childSubs, sub.subKey);

        if (!subscribedRegistry[sub.subKey]) {
            //roll back if parent got unsubscribed by on* callbacks
            unsubscribe();
            return;
        };
        subscribedRegistry[sub.subKey].childUnsubs[childKey] = unsubscribe;

        if (promises) {
            promises.push(promise);
        }
    }

    function check(type, sub) {
        if (!subscribedRegistry[sub.subKey]) {
            console.error('Error for '+sub.subKey+', got '+type+' firebase callback but not subscribed!');
            return false;
        }
        return true;
    }

    function handleFbError(sub) {
        return (error) => {
            if (subscribedRegistry[sub.subKey]) {
                const path = sub.path ? sub.path + ' ' : '';
                const errorCode = sub.subKey + ' ' + path + 'Firebase error: ' + ((error || {}).code || 'unknown error');

                reportError(errorCode);

                if (promisesBySubKey[sub.subKey]) {
                    promisesBySubKey[sub.subKey].reject(errorCode);
                }
            }
        }
    }

    function detectAndReportSubscribeCycle(subKey) {
        //Check whether this subKey has itself in the parent chain, and if so, reject the promise
        const trail = detectSubscribeCycle(subKey,
            Object.keys(subscribedRegistry[subKey].parentSubKeys), [subKey], {});
        if (trail) {
            const error = 'Cycle detected: ' + trail.join('<-');

            //If there's a cycle (for ex. subKey A subscribed B which subscribed A), we will never resolve, so reject the Promise
            //TODO only reject if we haven't yet resolved
            if (promisesBySubKey[subKey]) {
                promisesBySubKey[subKey].reject(error);
            }

            reportError(error);
        }
    }

    function executeListSubscribeAction(sub : Sub, parentSubKey) {
        if (subscribedRegistry[sub.subKey]) {
            //Already subscribed, just increment ref count
            subscribedRegistry[sub.subKey].refCount++;
            if (parentSubKey) {
                const parentSubKeys = subscribedRegistry[sub.subKey].parentSubKeys;
                if (!parentSubKeys[parentSubKey]) {
                    parentSubKeys[parentSubKey] = 1;
                } else {
                    parentSubKeys[parentSubKey]++;
                }
            }

            //Check whether this subKey has itself in the parent chain, and if so, reject the promise
            if (!doNotDetectCycles) {
                detectAndReportSubscribeCycle(sub.subKey);
            }

            return;
        }

        var ref = resolveFirebaseQuery(sub);
        var gotInitVal = false;
        subscribedRegistry[sub.subKey] = {
            refCount: 1,
            ref: ref,
            parentSubKeys: {},
            childUnsubs: {},
            fieldUnsubs: {},
            refHandles: {}
        };

        if (parentSubKey) {
            subscribedRegistry[sub.subKey].parentSubKeys[parentSubKey] = 1;
        }

        loadedPromise(sub.subKey);
        const thePromise = promisesBySubKey[sub.subKey];

        const errorHandler = handleFbError(sub);

        subscribedRegistry[sub.subKey].refHandles.child_added = ref.on('child_added', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_added', sub)) return;
            subscribeToChildData(sub, getKey(snapshot), snapshot.val());
            onData(FB_CHILD_ADDED, snapshot, sub);
        }, errorHandler);
        subscribedRegistry[sub.subKey].refHandles.child_changed = ref.on('child_changed', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_changed', sub)) return;

            //Since we pass snapshot.val() to childSubs, it might use it, so we need call it when snapshot.val()
            //changes
            var childUnsub = subscribedRegistry[sub.subKey].childUnsubs[getKey(snapshot)];
            subscribeToChildData(sub, getKey(snapshot), snapshot.val());
            if (childUnsub) childUnsub();

            onData(FB_CHILD_WILL_CHANGE, snapshot, sub);
            onData(FB_CHILD_CHANGED, snapshot, sub);
        }, errorHandler);
        subscribedRegistry[sub.subKey].refHandles.child_removed = ref.on('child_removed', function(snapshot) {
            if (!gotInitVal) return;
            if (!check('child_removed', sub)) return;
            const childUnsub = subscribedRegistry[sub.subKey].childUnsubs[getKey(snapshot)];
            delete subscribedRegistry[sub.subKey].childUnsubs[getKey(snapshot)];
            if (childUnsub) childUnsub();
            onData(FB_CHILD_WILL_REMOVE, snapshot, sub);
            onData(FB_CHILD_REMOVED, snapshot, sub);
        }, errorHandler);
        ref.once('value', function(snapshot) {
            if (gotInitVal) {
                console.error("Got 'once' callback for "+getKey(snapshot)+" more than once");
                return;
            }
            gotInitVal = true;

            //We might've gotten unsubscribed while waiting for initial value, so check if we're still subscribed
            if (subscribedRegistry[sub.subKey]) {
                var val = snapshot.val();

                let nestedPromises = [];

                if (val !== null && (typeof val == 'object')) {
                    Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey, val[childKey], nestedPromises));
                }

                onData(FB_INIT_VAL, snapshot, sub);

                if (!subscribedRegistry[sub.subKey]) {
                    //no longer subscribed (onData callback could've unsubscribed us)
                    return;
                }

                //Once all initial child & field promises are resolved, we can resolve ourselves
                Promise.all(nestedPromises).then(() => {
                    thePromise.resolve(sub.subKey);
                }, (error) => {
                    thePromise.reject(error);
                });
            }
        }, errorHandler);
    }

    function executeValueSubscribeAction(sub : Sub, parentSubKey) {

        if (subscribedRegistry[sub.subKey]) {
            //Already subscribed, just increment ref count
            subscribedRegistry[sub.subKey].refCount++;

            if (parentSubKey) {
                const parentSubKeys = subscribedRegistry[sub.subKey].parentSubKeys;
                if (!parentSubKeys[parentSubKey]) {
                    parentSubKeys[parentSubKey] = 1;
                } else {
                    parentSubKeys[parentSubKey]++;
                }
            }

            //Check whether this subKey has itself in the parent chain, and if so, reject the promise
            if (!doNotDetectCycles) {
                detectAndReportSubscribeCycle(sub.subKey);
            }

            return;
        }

        var ref = resolveFirebaseQuery(sub);

        subscribedRegistry[sub.subKey] = {
            refCount: 1,
            ref: ref,
            parentSubKeys: {},
            childUnsubs: {},
            fieldUnsubs: {},
            refHandles: {}
        };

        if (parentSubKey) {
            subscribedRegistry[sub.subKey].parentSubKeys[parentSubKey] = 1;
        }

        loadedPromise(sub.subKey);
        const thePromise = promisesBySubKey[sub.subKey];

        let resolved = false;

        const errorHandler = handleFbError(sub);

        subscribedRegistry[sub.subKey].refHandles.value = ref.on('value', function(snapshot) {
            if (!check('value', sub)) return;

            //First subscribe to new value's nodes, then unsubscribe old ones - the ones in both old/new will remain
            //subscribed to firebase to avoid possibly blowing away firebase cache
            const oldChildUnsubs = Object.assign({}, subscribedRegistry[sub.subKey].childUnsubs);
            subscribedRegistry[sub.subKey].childUnsubs = {};

            const nestedPromises = (resolved ? null : []);

            var val = snapshot.val();
            if (val !== null && (typeof val == 'object')) {
                Object.keys(val).forEach(childKey=>subscribeToChildData(sub, childKey, val[childKey], nestedPromises));
            }
            Object.keys(oldChildUnsubs || {}).forEach(childKey=>{
                const childUnsub = oldChildUnsubs[childKey];
                childUnsub();
            });

            subscribeToFields(sub, val, nestedPromises);

            onData(FB_VALUE, snapshot, sub);

            if (!resolved) {
                resolved = true;

                if (!subscribedRegistry[sub.subKey]) {
                    //no longer subscribed (onData callback could've unsubscribed us)
                    return;
                }

                //Once all initial child & field promises are resolved, we can resolve ourselves
                Promise.all(nestedPromises).then(() => {
                    thePromise.resolve(sub.subKey);
                }, (error) => {
                    thePromise.reject(error);
                });
            }
        }, errorHandler);
    }

    function unsubscribeSubKey(subKey, parentSubKey?) {
        // if (disallowSubscriptions) {
        //     reportError("Not allowed to unsubscribe within onSubscribed/onWillSubscribe/onUnsubscribed/onWillUnsubscribe callbacks");
        //     return false;
        // }

        var info = subscribedRegistry[subKey];
        if (!info) {
            console.error('no subscriber found for subKey=' + subKey);
        } else {
            // disallowSubscriptions = true;
            if (onWillUnsubscribe) onWillUnsubscribe(subKey);
            // disallowSubscriptions = false;
            info.refCount--;
            if (parentSubKey) {
                if (info.parentSubKeys[parentSubKey] && info.parentSubKeys[parentSubKey] > 0) {
                    info.parentSubKeys[parentSubKey]--;
                    if (info.parentSubKeys[parentSubKey] <= 0){
                        delete info.parentSubKeys[parentSubKey];
                    }
                }
            }
            if (info.refCount <= 0) {
                delete subscribedRegistry[subKey];
                delete promisesBySubKey[subKey];
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

        // disallowSubscriptions = true;
        if (onUnsubscribed) onUnsubscribed(subKey);
        // disallowSubscriptions = false;
    }

    function detectSubscribeCycle(subKey, parentSubKeys, trail, checked) {
        if (!parentSubKeys || parentSubKeys.length == 0) return false;

        let index = (parentSubKeys || []).indexOf(subKey);
        if (index >= 0) {
            return [...trail, parentSubKeys[index]];
        }

        const found = parentSubKeys.some(parentSubKey => {
            if (checked[parentSubKey]) return false;
            checked[parentSubKey] = true;
            const res = detectSubscribeCycle(subKey,
                    Object.keys((subscribedRegistry[parentSubKey] || {}).parentSubKeys || {}),
                    [...trail, parentSubKey], checked);
            if (res) {
                trail = res;
                return true;
            }
            return false;
        });

        return found ? trail : false;
    }

    function subscribeSub(sub : Sub, parentSubKey=rootSubKey) {
        // if (disallowSubscriptions) {
        //     reportError("Not allowed to subscribe within onSubscribed/onWillSubscribe/onUnsubscribed/onWillUnsubscribe callbacks");
        //     return () => false;
        // }
        if (!sub.subKey) {
            console.error('subscribeSub needs an object with a string subKey field');
            console.error(sub);
            return;
        }
        if (!sub.asList && !sub.asValue) {
            console.error('subscribeSub needs an object with either asList=true or asValue=true');
            console.error(sub);
            return;
        }

        // disallowSubscriptions = true;
        if (onWillSubscribe) onWillSubscribe(sub);
        // disallowSubscriptions = false;

        if (sub.asList) {
            executeListSubscribeAction(sub, parentSubKey);
        } else if (sub.asValue) {
            executeValueSubscribeAction(sub, parentSubKey);
        } else {
            console.error('sub must have asList or asValue = true');
        }

        // disallowSubscriptions = true;
        if (onSubscribed) onSubscribed(sub);
        // disallowSubscriptions = false;

        return function unsubscribe() {
            unsubscribeSubKey(sub.subKey, parentSubKey);
        }
    }
    function subscribeSubs(subs : Array<Sub>, parentSubKey=rootSubKey) {
        if (!subs) return;
        if (!subs.forEach) {
            console.error('subscribeSubs expects an array of subs');
            console.error(subs);
            return;
        }
        var unsubs = subs.map(sub=>subscribeSub(sub, parentSubKey));

        return function unsubscribe() {
            unsubs.forEach(unsub=>unsub());
        }
    }

    function subscribeSubsWithPromise(subs : Array<Sub>, parentSubKey=rootSubKey) {
        if (!subs) return;
        if (!subs.forEach) {
            console.error('subscribeSubs expects an array of subs');
            console.error(subs);
            return;
        }
        var unsubs = subs.map(sub =>subscribeSub(sub, parentSubKey));

        return {
            unsubscribe: function () {
                unsubs.forEach(unsub=>unsub());
            },
            promise: subsLoaded(subs)
        };
    }

    function unsubscribeAll() {
        for (let subKey in subscribedRegistry) {
            const sub = subscribedRegistry[subKey];
            const numRootSubscribes = (sub.parentSubKeys || {})[rootSubKey] || 0;
            for (let i = 0; i < numRootSubscribes; i++) {
                unsubscribeSubKey(subKey);
            }
        }
    }

    return { subscribeSubs, subscribedRegistry, unsubscribeAll, subscribeSubsWithPromise, loadedPromise };
};

