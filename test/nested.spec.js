import test from 'tape';

import createNestedFirebaseSubscriber from './../nestedFirebaseSubscriber';
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
    }
};


function setupSubscriber() {
    var receivedData = {};

    var subscribeRegistry = {};
    var {subscribeSubs} = createNestedFirebaseSubscriber({
        onData: function (type, snapshot, sub) {
            if (!receivedData[sub.params.name]) receivedData[sub.params.name] = {};
            receivedData[sub.params.name][sub.params.key] = snapshot.val();
        },
        onSubscribed: function (sub) {},
        onUnsubscribed: function (subKey) {},
        resolveFirebaseQuery: function (sub) {
            return new MockFirebase(sub.params.key, mockFirebaseData[sub.params.name][sub.params.key]);
        },
        subscribedRegistry: subscribeRegistry
    });


    return {subscribeSubs, subscribeRegistry, receivedData};
}

test('test refCount after subscribing/unsubscribing with same or different subKeys', (assert) => {
    const {subscribeSubs, subscribeRegistry} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    var unsub1 = subscribeSubs(sub1);
    assert.equal(subscribeRegistry[sub1[0].subKey].refCount, 1, "ref count for user1 friends is 1 after first subscription");

    var sub2 = friendListWithDetailSubCreator("user1");
    var unsub2 = subscribeSubs(sub2);
    assert.equal(subscribeRegistry[sub2[0].subKey].refCount, 2, "ref count for user1 friends is 2 after second subscription");

    var sub3 = friendListWithDetailSubCreator("user2");
    var unsub3 = subscribeSubs(sub3);
    assert.equal(subscribeRegistry[sub3[0].subKey].refCount, 1, "ref count for user2 friends is 1 after first subscription");

    unsub2();
    assert.equal(subscribeRegistry[sub1[0].subKey].refCount, 1, "ref count for user1 friends is 1 after 1 unsubscribe");

    unsub1();
    assert.equal((subscribeRegistry[sub1[0].subKey]||{}).refCount, undefined, "ref count for user1 friends is undefined after 1 unsubscribe");

    assert.end();
});


test('test subscribes to user details in a friends list', (assert) => {
    const {subscribeSubs, receivedData} = setupSubscriber();

    var sub1 = friendListWithDetailSubCreator("user1");
    var unsub1 = subscribeSubs(sub1);
    setTimeout(()=>{
        assert.notEqual(receivedData.friends, undefined, "received friends list");
        assert.notEqual(receivedData.friends["user1"], undefined, "received user1 friends list");
        assert.notEqual(receivedData.users, undefined, "received user1 friends' user details");
        Object.keys(receivedData.friends["user1"]).forEach(userKey=>{
            assert.notEqual(receivedData.users[userKey], undefined, "received "+userKey+" user detail");
        });
        assert.end();
    }, 100);
});

//same as test2, but subscribe to friends list as value, not list
test('test subscribes to user details in a friends list (with subs[0].asValue == true)', (assert) => {
    const {subscribeSubs, receivedData} = setupSubscriber();

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
        assert.end();
    }, 100);
});

