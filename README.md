# firebase-nest
Utility to join multiple firebase paths and nested data into a single subscription.

# Motivation
Apps often have the need to subscribe and unsubscribe from multiple firebase paths, as well as 
dynamically subscribe to additional paths as some data changes. For example, you might want
to subscribe to several sources on user login (get user profile, get user friends, get user recent feed);
and you might want to pull each friend's profile.
Normally, you have to do a lot of dynamic subscription management, remembering to subscribe and unsubscribe
from multiple firebase refs as your app state changes, and also as the master data (e.g. friend lists) changes.

# Features

1. Declarative subscriptions

   This lib allows an app to specify a logical data source as an array of declarative subscription specifications ("subs").

1. Promises

   `subscribeSubsWithPromise` allows to know when initial data, including async child subscriptions, is loaded.
   
1. Dynamic nested subscriptions

   A sub corresponds to a firebase ref/query, and can have a `forEachChild` that specifies how to subscribe to data
for each child.

1. RefCounted firebase refs

   Support registering multiple subscriptions to the same source (identified by `subKey`). Underlying firebase on/off is only called once on the first subscribe/last unsubscribe.

1. Composition

   the subs can be easily composed and reused, as in the examples below.

1. Firebase query API support.

   A sub is mapped to a Firebase ref/query (through `resolveFirebaseQuery` callback), so `orderByChild`, `startAt`, `equalTo` etc. and all other firebase queries are supported.

1. Value or List `onData` callbacks.

Subs with `asValue`=true result in FB_VALUE callbacks:
```js
onData('FB_VALUE', snapshot, sub)
 ```

Subs with `asList`=true result in

  ```js
  onData('FB_INIT_VAL', snapshot, sub)
  ```

  then
  ```js
  onData('FB_CHILD_ADDED', snapshot, sub) //and FB_CHILD_REMOVED/CHANGED, as well as FB_CHILD_WILL_REMOVE/WILL_CHANGE
  ```

# Usage

1. `npm install firebase-nest --save`

1.  Initialize the subscriber - generally should be a global/singleton

   ```js
import createNestedFirebaseSubscriber from 'firebase-nest';

const {subscribeSubs} = createNestedFirebaseSubscriber({
    onData: function(type, snapshot, sub) {
      //type will be FB_VALUE if subscribed as value (sub.asValue==true). 
      // otherwise, if subscribed as list (sub.asList==true), type will be FB_INIT_VAL, then FB_CHILD_ADDED/REMOVED/CHANGED.
      
      //snapshot is the incoming firebase data
      
      //sub is the original sub that was used to subscribe to this path
      
      //can store the data in local state or anything you want
    },
    onSubscribed: function(sub) {
      //Can optionally do tracking or logging here
    },
    onUnsubscribed: function(subKey) {
      //Can optionally do tracking or logging here
    },
    resolveFirebaseQuery: function(sub) {
        //Translate a sub to a firebase ref/query, for example
        return new Firebase(sub.path);
    }
});
```

3. Create your subscription specifications, for example

 ```js
const user1Subs =
[
        {
            subKey: 'userDetail_user1', //can use any naming scheme you want to identify your logical sources
            asValue: true, //or asList: true
            //optional: forEachChild: {childSubs: ...} to specify how to subscribe to data for each child

            //custom fields - can be anything you want, will be passed into onData & resolveFirebaseQuery callbacks
            path: 'https://your-firebase.com/users/user1'
        }
    ];
```
Each sub needs to have a logical key ("subKey"), for example 'recent_feed_user1'. This is the key used for ref counting.

4. Start listening to data

 ```js
const unsub = subscribeSubs(user1Subs);
```

5. Eventually unsub must be called to unsubscribe. 

 ```js
unsub();
```

# Mobx example
See https://github.com/nyura123/firebase-nest/blob/master/examples/MobxComponentExample.js for how to add
 dynamic firebase subscriptions and data to a React component.


# Full Example

```js
const nestedSubscriber = require('firebase-nest');
const Firebase = require('firebase');

const {subscribeSubs} = nestedSubscriber({
    onData: function(type,snapshot,sub){
        console.log("got data, type="+type+", key="+snapshot.key()+" sub.subKey="+sub.subKey);
    },
    onSubscribed: function(){},
    onUnsubscribed: function(){},
    resolveFirebaseQuery: function(sub){return new Firebase(sub.path);}
});

function dinosaurScoreAndDetailSubCreator(dinosaurKey) {
    return [
        {
            subKey:"dinosaurScore_"+dinosaurKey,
            path:"https://dinosaur-facts.firebaseio.com/scores/"+dinosaurKey,
            asList:true //will work with asValue as well. asList generally has better performance for large datasets with small changes
        },
        {
            subKey:"dinosaurDetail_"+dinosaurKey,
            path:"https://dinosaur-facts.firebaseio.com/dinosaurs/"+dinosaurKey,
            asValue:true
        }
    ];
};
function allDinosaursSubCreator() {
    return [{
        subKey: "allDinosaurs",
        path: "https://dinosaur-facts.firebaseio.com/dinosaurs",
        forEachChild: {childSubs: dinosaurScoreAndDetailSubCreator},
        //asValue will work as well. asList generally has better performance for large datasets with small changes
        asList: true
    }];
}

//A single subscription to subscribe to list of all dinosaurs, and detail/score for each one
const unsub = subscribeSubs(allDinosaursSubCreator());

//Eventually unsub() must be called
```

# autoSubscriber can be used to automatically subscribe React components.
A component has to implement 2 methods:
getSubs(props, state) that returns a sub or an array of subs
subscribeSubs(subs, props, state) that actually performs the subscription - normally just calls nestedSubscriber's subscribeSubs

```js
import createNestedFirebaseSubscriber, { autoSubscriber } from 'firebase-nest';

import React from 'react';
import Firebase from 'firebase';

let dinosaurs;
let reactiveComponent;

const {subscribeSubs, subscribedRegistry} = createNestedFirebaseSubscriber({
    onData: function (type, snapshot, sub) {
        dinosaurs = snapshot.val();

        //Example only - use something like redux dispatch or set mobx observable data to trigger component rendering.
        if (reactiveComponent) {
            reactiveComponent.setState();
        }
    },
    onWillSubscribe: function (sub) {},
    onWillUnsubscribe: function (subKey) {},
    onSubscribed: function (sub) {},
    onUnsubscribed: function (subKey) {},
    resolveFirebaseQuery: function (sub) {
        return new Firebase(sub.path);
    }
});

const globalSubscribeSubs = subscribeSubs;

//Example usage
const fbRoot = "https://dinosaur-facts.firebaseio.com";

export var DinosaurList = autoSubscriber(class extends React.Component {
    static getSubs(props, state) {
        //In practice, you would use helper functions instead of hardcoding the sub spec format here
        return {
            subKey: 'dinosaurs',
            asValue: true,

            //custom fields used by
            params: {name: 'dinosaurs'},
            path: fbRoot+"/dinosaurs"
        };
    }
    static subscribeSubs(subs, props, state) {
        return globalSubscribeSubs(subs);
    }
    componentDidMount() {
        //this is just an example of making a component reactive to data.
        //In practice, we can connect components to data via something like redux connect or mobx observer.
        reactiveComponent = this;
    }
    render() {
        return (
            <div>
                {Object.keys(dinosaurs || {}).map(dinosaurKey=>{
                    return <div key={dinosaurKey}>{dinosaurKey}</div>
                })}
            </div>
        );
    }
});
```

# asReduxMiddleware.js 

```js
import createNestedFirebaseSubscriber from 'firebase-nest';

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


//Firebase data callbacks will be dispatched as FB_VALUE or FB_INIT_VAL,FB_CHILD_ADDED/REMOVED/CHANGED actions
function setupSubscriber(dispatch) {
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
        }
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
```
