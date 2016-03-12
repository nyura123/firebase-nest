
import createNestedFirebaseSubscriber from './nestedFirebaseSubscriber';

import Firebase from 'firebase';

//example subscribe specs (subs)
function userDetailSubCreator(userKey) {
    return [
        {
            subKey: 'userDetail_' + userKey,
            asValue: true,

            params: {name: 'users', key: userKey},
            path: "https://my/path/to/users/"+userKey
        }
    ];
}
function friendListWithDetailSubCreator(userKey) {
    return [
        {
            subKey: 'friendListWithUserDetail_'+userKey,
            asList: true,
            forEachChild: {childSubs: userDetailSubCreator},

            params: {name: 'friends', key: userKey},
            path: "https://my/path/to/friends/"+userKey
        }
    ];
}
function userFeed(userKey) {
    return [
        {
            subKey: 'feed'+userKey,
            asList: true,
            forEachChild: {childSubs: userDetailSubCreator},

            params: {name: 'feed', key: userKey},
            path: "https://my/path/to/feed/"+userKey
        }
    ];
}
function recentLikes(userKey, now) {
    return [
        {
            subKey: 'recent_likes_'+userKey,
            asList: true,
            forEachChild: {childSubs: userDetailSubCreator},

            params: {name: 'likes', key: userKey, orderByChild: "likedTs", startAtTs: now - 24*60*60*1000},
            path: "https://my/path/to/likes/"+userKey
        }
    ];
}
function userFeedAndFriends(userKey, now) {
    return [userFeed(userKey), friendListWithDetailSubCreator(userKey), recentLikes[userKey, now]];
}


//example actions - can easily compose subscriptions
function subscribeToUserDetail(userKey) {
    return {type: "FIREBASE_SUBSCRIBE", subs: userDetailSubCreator(userKey)};
}
function subscribeToFriendsWithDetails(userKey) {
    return {type: "FIREBASE_SUBSCRIBE", subs: friendListWithDetailSubCreator(userKey)};
}
function subscribeToUserFeedAndFriends(userKey, now) {
    return {type: "FIREBASE_SUBSCRIBE", subs: userFeedAndFriends(userKey, now)};
}


//Firebase data callbacks will be dispatched as FIREBASE_DATA actions
function setupSubscriber(dispatch) {
    var subscribeRegistry = {};
    return createNestedFirebaseSubscriber({
        onData: function (type, snapshot, sub) {
            //This can be consumed by reducers to build up data
            dispatch({type, sub, key: snapshot.key(), val: snapshot.val()});
        },
        onSubscribed: function (sub) {
            dispatch({type: "FB_SUBSCRIBED", sub});
        },
        onUnsubscribed: function (subKey) {
            dispatch({type: "FB_UNSUBSCRIBED", subKey});
        },
        resolveFirebaseQuery: function (sub) {
            //Can add arbitrary params to sub in the sub specs above, and then use them to do additional
            //firebase filtering/sorting, e.g. new Firebase(sub.path).orderByChild(sub.orderByChild).startAt(sub.startAt)
            return new Firebase(sub.path);
        },
        subscribedRegistry: subscribeRegistry
    });
}

export default function middleware({dispatch}) {
    const {subscribeSubs} = setupSubscriber(dispatch);

    return function (next) {
        return function (action) {
            switch (action.type) {
                case "FIREBASE_SUBSCRIBE":
                    if (action.subs) {
                        next(action);

                        //NOTE: dispatching subscribe actions should *return* the unsubscribe function

                        return subscribeSubs(action.subs);
                    } else {
                        console.error("Missing sub/subs field in "+action.type+" action");
                        return next(action);
                    }
                    break;
                default:
                    return next(action);
                    break;
            }
        };
    }
}

//Usage
//var unsub = dispatch(subscribeToUserFeedAndFriends("user1", new Date().getTime()));
//  will subscribe to all the data, including any nested data. Independently, other parts of the app can subscribe to same nested data.
//unsub();
// will unsubscribe from all the data for the user1, including any nested data
