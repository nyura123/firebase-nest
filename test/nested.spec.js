import test from 'tape';

import createNestedFirebaseSubscriber from '../src/index.js';
import MockFirebase from './MockFirebase';

function userDetailSubCreator(userKey) {
    return [
        {
            subKey: 'userDetail_' + userKey,
            asValue: true,

            params: {name: 'users', key: userKey}
        }
    ];
}

function friendListWithDetailSubCreator(userKey) {
    return [
        {
            subKey: 'friendListWithUserDetail_'+userKey,
            asList: true,
            forEachChild: {childSubs: userDetailSubCreator},

            params: {name: 'friends', key: userKey}
        }
    ];
}

function friendListAndDetailSubCreator(userKey) {
    return friendListWithFriendListCreator(userKey)
        .concat(userDetailSubCreator(userKey));
}

function friendListWithFriendListCreator(userKey) {
    return [
        {
            subKey: 'friendListWithFriendList_'+userKey,
            asList: true,
            forEachChild: {childSubs: friendListAndDetailSubCreator},

            params: {name: 'friends', key: userKey}
        }
    ];
}

var mockFirebaseData = {
    friends: {
        user1: {user2: true, user3: true},
        user2: {user1: true},
        user3: {user1: true}
    },

    users: {
        user1: {first: "Zany", last: "Dan"},
        user2: {first: "Blue", last: "Man"},
        user3: {first: "Lady", last: "Madonna"}
    },

    someValue: {
        someValue: {
            field1: 'user1',
            field2: {userKey: 'user2', subField1: 'val2', subField2: 'val3'},
            field3: 0
        }
    }
};

function setupSubscriber(onError) {
    var receivedData = {};

    var {subscribeSubs, subscribedRegistry, subscribeSubsWithPromise} = createNestedFirebaseSubscriber({
        onData: function (type, snapshot, sub) {
            if (!receivedData[sub.params.name]) receivedData[sub.params.name] = {};
            receivedData[sub.params.name][sub.params.key] = snapshot.val();
        },
        onSubscribed: function (sub) {},
        onUnsubscribed: function (subKey) {},
        resolveFirebaseQuery: function (sub) {
            return new MockFirebase(sub.params.key, mockFirebaseData[sub.params.name][sub.params.key], sub.asValue);
        },
        onError
    });


    return {subscribeSubs, subscribedRegistry, receivedData, subscribeSubsWithPromise};
}

test('test refCount after subscribing/unsubscribing with same or different subKeys', (assert) => {
    const {subscribeSubs, subscribedRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    var unsub1 = subscribeSubs(sub1);
    assert.equal(subscribedRegistry[sub1[0].subKey].refCount, 1, "ref count for user1 friends is 1 after first subscription");

    var sub2 = friendListWithDetailSubCreator("user1");
    var unsub2 = subscribeSubs(sub2);
    assert.equal(subscribedRegistry[sub2[0].subKey].refCount, 2, "ref count for user1 friends is 2 after second subscription");

    var sub3 = friendListWithDetailSubCreator("user2");
    var unsub3 = subscribeSubs(sub3);
    assert.equal(subscribedRegistry[sub3[0].subKey].refCount, 1, "ref count for user2 friends is 1 after first subscription");

    unsub2();
    assert.equal(subscribedRegistry[sub1[0].subKey].refCount, 1, "ref count for user1 friends is 1 after 1 unsubscribe");

    unsub1();
    assert.equal((subscribedRegistry[sub1[0].subKey]||{}).refCount, undefined, "ref count for user1 friends is undefined after 1 unsubscribe");

    assert.end();
});


test('test subscribes to user details in a friends list', (assert) => {
    const {subscribeSubs, receivedData, subscribedRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    var unsub1 = subscribeSubs(sub1);
    setTimeout(()=>{
        assert.notEqual(receivedData.friends, undefined, "received friends list");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
        Object.keys(receivedData.friends["user1"]).forEach(userKey=>{
            assert.notEqual(receivedData.users[userKey], undefined, "received "+userKey+" user detail");
        });

        unsub1();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");

        assert.end();
    }, 100);
});

//same as test2, but subscribe to friends list as value, not list
test('test subscribes to user details in a friends list (with subs[0].asValue == true)', (assert) => {
    const {subscribeSubs, receivedData, subscribedRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].asList = false;
    sub1[0].asValue = true;
    var unsub1 = subscribeSubs(sub1);
    setTimeout(()=>{
        assert.notEqual(receivedData.friends, undefined, "received friends data");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
        Object.keys(receivedData.friends["user1"]).forEach(userKey=>{
            assert.notEqual(receivedData.users[userKey], undefined, "received "+userKey+" user detail");
        });
        unsub1();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");
        assert.end();
    }, 100);
});

test('childSubs args get passed to child action creators', (assert) => {
    const {subscribeSubs, subscribedRegistry} = setupSubscriber();

    let childSubsCalled = false;
    function childSubs(childKey, arg1, arg2) {
        childSubsCalled = true;
        assert.equal(arg1,"arg1Val","arg1 got passed to child sub");
        assert.equal(arg2,"arg2Val","arg2 got passed to child sub");
        return userDetailSubCreator(childKey);
    }

    var sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].forEachChild = {childSubs: childSubs, args: ["arg1Val", "arg2Val"]};
    const unsub = subscribeSubs(sub1);

    setTimeout(()=> {
        assert.equal(childSubsCalled, true, "childSubs subscribe called");
        unsub();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");

        assert.end();
    }, 100);
});


test('childSubs child val get passed to child action creators', (assert) => {
    const {subscribeSubs, subscribedRegistry} = setupSubscriber();

    let childSubsCalledUser2 = false;
    let childSubsCalledUser3 = false;
    function childSubs(childKey, arg1, arg2, childVal) {
        if (childKey == 'user2') childSubsCalledUser2 = true;
        if (childKey == 'user3') childSubsCalledUser3 = true;
        assert.notEqual(childVal, undefined, "childVal got passed to childSubs");
        return userDetailSubCreator(childKey);
    }

    var sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].forEachChild = {childSubs: childSubs, args: ["arg1Val", "arg2Val"]};
    const unsub = subscribeSubs(sub1);

    setTimeout(()=> {
        assert.equal(childSubsCalledUser2, true, "childSubs subscribe called for user2");
        assert.equal(childSubsCalledUser3, true, "childSubs subscribe called for user3");
        unsub();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");

        assert.end();
    }, 100);
});

test('fieldSubs get subscribed to with the right args', (assert) => {
    const {subscribeSubs, subscribedRegistry, receivedData} = setupSubscriber();

    let fieldSub1Called = false, fieldSub2Called = false, fieldSub3Called = false;

    function field1Subs(fieldVal, arg1, arg2) {
        fieldSub1Called = true;
        assert.equal(fieldVal, 'user1', 'fieldVal got passed to field1Subs');
        assert.equal(arg1,1,"arg1 got passed to field sub");
        assert.equal(arg2,2,"arg2 got passed to field sub");
        return friendListWithDetailSubCreator(fieldVal);
    }
    function field2Subs(fieldVal, arg1, arg2) {
        fieldSub2Called = true;
        assert.equal(typeof fieldVal, 'object', 'fieldVal got passed to field2Subs');
        assert.equal(fieldVal.userKey, 'user2');
        assert.equal(fieldVal.subField1, 'val2');
        assert.equal(fieldVal.subField2, 'val3');
        assert.equal(arg1,3,"arg1 got passed to field sub");
        assert.equal(arg2,4,"arg2 got passed to field sub");
        return userDetailSubCreator(fieldVal.userKey);
    }
    function field3Subs(fieldVal, arg1, arg2) {
        fieldSub3Called = true;
        assert.equal(fieldVal, 0, 'fieldVal got passed to field3Subs');
        assert.equal(arg1,5,"arg1 got passed to field sub");
        assert.equal(arg2,6,"arg2 got passed to field sub");
        return [];
    }

    function valueSubCreator() {
        return [
            {
                subKey: 'someValue',
                asValue: true,
                forFields: [
                    {fieldKey: 'field1', fieldSubs: field1Subs, args: [1, 2]},
                    {fieldKey: 'field2', fieldSubs: field2Subs, args: [3, 4]},
                    {fieldKey: 'field3', fieldSubs: field3Subs, args: [5, 6]}
                ],

                params: {key: 'someValue', name: 'someValue'}
            }
        ]
    }

    const unsub = subscribeSubs(valueSubCreator());

    setTimeout(()=> {
        assert.equal(fieldSub1Called, true, "field1Sub subscribe called");
        assert.equal(fieldSub2Called, true, "field2Sub subscribe called");
        assert.equal(fieldSub3Called, true, "field3Sub subscribe called");

        unsub();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");

        assert.equal(((receivedData.someValue || {}).someValue || {}).field1, 'user1', "received value field1");
        assert.equal((((receivedData.someValue || {}).someValue || {}).field2 || {}).userKey, 'user2', "received value field2");
        assert.equal(((receivedData.someValue || {}).someValue || {}).field3, 0, "received value field1");

        assert.equal(((receivedData.users || {}).user2 || {}).first, 'Blue', "received users user2 data");
        assert.equal(((receivedData.users || {}).user3 || {}).first, 'Lady', "received users user3 data");
        assert.equal((receivedData.users || {}).user1, undefined, "didn't subscribe/receive users user1 data");
        assert.notEqual(((receivedData.friends || {}).user1 || {}).user2, undefined, "received user1 friend user2");
        assert.notEqual(((receivedData.friends || {}).user1 || {}).user2, undefined, "received user1 friend user3");

        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
        Object.keys(receivedData.friends["user1"]).forEach(userKey=>{
            assert.notEqual(receivedData.users[userKey], undefined, "received "+userKey+" user detail");
        });

        assert.end();
    }, 100);

});

test('resolves loaded promise', (assert) => {
    const {subscribeSubsWithPromise, receivedData, subscribedRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].asList = false;
    sub1[0].asValue = true;
    const {unsubscribe, promise} = subscribeSubsWithPromise(sub1);

    promise.then(() => {
        assert.notEqual(receivedData.friends, undefined, "received friends data");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
        Object.keys(receivedData.friends["user1"]).forEach(userKey=> {
            assert.notEqual(receivedData.users[userKey], undefined, "received " + userKey + " user detail");
        });
        unsubscribe();

        assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");
        assert.end();
    });
});


test('promise resolves immediately if data already loaded', (assert) => {
    const {subscribeSubsWithPromise, receivedData, subscribedRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].asList = false;
    sub1[0].asValue = true;
    const {unsubscribe, promise} = subscribeSubsWithPromise(sub1);

    setTimeout(()=> {
        assert.notEqual(receivedData.friends, undefined, "received friends data");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");

        promise.then(() => {
            assert.notEqual(receivedData.friends, undefined, "received friends data");
            assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
            assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
            Object.keys(receivedData.friends["user1"]).forEach(userKey=> {
                assert.notEqual(receivedData.users[userKey], undefined, "received " + userKey + " user detail");
            });
            unsubscribe();

            assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");
            assert.end();
        });
    }, 100);
});

test('promise can be recreated after data is resubscribed', (assert) => {
    const {subscribeSubsWithPromise, receivedData, subscribedRegistry} = setupSubscriber();

    const sub1 = friendListWithDetailSubCreator("user1");
    sub1[0].asList = false;
    sub1[0].asValue = true;
    let {unsubscribe, promise} = subscribeSubsWithPromise(sub1);

    setTimeout(()=> {
        assert.notEqual(receivedData.friends, undefined, "received friends data");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");

        //unsubscribe, resubscribe
        unsubscribe();
        ({unsubscribe, promise} = subscribeSubsWithPromise(sub1));

        promise.then(() => {
            assert.notEqual(receivedData.friends, undefined, "received friends data");
            assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
            assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
            Object.keys(receivedData.friends["user1"]).forEach(userKey=> {
                assert.notEqual(receivedData.users[userKey], undefined, "received " + userKey + " user detail");
            });
            unsubscribe();

            assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");
            assert.end();
        });
    }, 100);
});

test('detects circular subscriptions', (assert) => {
    let error = null;
    const {subscribeSubsWithPromise} = setupSubscriber(
        function onError(err) {
            error = err;
        }
    );

    //1. get user1's friends user2 & user3;
    //2. get user2's friend user1; get user1's friends - cycle.
    //3. get user3's friend user1; get user1's friends - cycle.
    var sub1 = friendListWithFriendListCreator("user1");
    const {unsubscribe, promise} = subscribeSubsWithPromise(sub1);

    setTimeout(() => {
        assert.notEqual(error, null, "onError called when cycle detected");
        unsubscribe();
        //assert.equal(Object.keys(subscribedRegistry).length, 0, "subscribedRegistry empty after unsubscribe");
        assert.end();
    }, 100);
});


test('reject promise on circular subscriptions/initial values', (assert) => {
    const {subscribeSubsWithPromise} = setupSubscriber();

    //1. get user1's friends user2 & user3;
    //2. get user2's friend user1; get user1's friends - cycle.
    //3. get user3's friend user1; get user1's friends - cycle.
    var sub1 = friendListWithFriendListCreator("user1");
    const {unsubscribe, promise} = subscribeSubsWithPromise(sub1);

    promise.then(() => {
        assert.equal(true, false, 'promise should not be resolved');
    }, (error) => {
        const expectedErr = 'Cycle detected: friendListWithFriendList_user2<-friendListWithFriendList_user1<-friendListWithFriendList_user2';
        assert.equal(error, expectedErr, 'promise gets rejected with the right error');
        unsubscribe();
        assert.end()
    });
});