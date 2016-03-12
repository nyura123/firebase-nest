# firebase-nest
utility to easily join multiple firebase paths and nested data into a single subscription.

# Motivation
Apps often have the need to subscribe and unsubscribe from multiple firbease paths, as well as 
dynamically subscribe to additional paths as some data changes. For example, you might want
to subscribe to several sources on user login (get user profile, get user friends, get user recent feed);
and you might want to pull each friend's profile.
Normally, you have to do a lot of dynamic subscription management, remembering to subscribe and unsubscribe
from multiple firebase refs as your app state changes, and also as the master data (e.g. friend lists) changes.

# Features
This lib allows an app to specify a logical data source as a list of subscription specifications ("subs"), each of which can have optional nested subs.

Multiple subs for the same data are ref-counted, and firebase refs are shared among them.

The subs can be easily composed and reused, as in the example below.

# Usage

1. `npm install firebase-nest --save`

2.  Initialize
```
import createNestedFirebaseSubscriber from 'firebase-nest';

var {subscribeSubs} = createNestedFirebaseSubscriber({
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
    },
    subscribedRegistry: {} //will be populated by the subscriber
});
```

3. Create your subscription specifications, for example
```
var user1Subs =
[
        {
            subKey: 'userDetail_user1', //can use any naming scheme you want to identify your logical sources
            asValue: true, //or asList: true
            //optional: forEachChild: {childSubs: ...} to specify how to subscribe to data for each child

            //custom fields - can be anything you want, will be passed into callbacks, see example below
            path: 'https://your-firebase.com/users/' + userKey
        }
    ];
```
Each sub needs to have a logical key ("subKey"), for example 'recent_feed_user1'. This is the key used for ref counting.
4. Start listening to data
```
const unsub = subscribeSubs(user1Subs);
```
5. Eventually unsub must be called to unsubscribe. 
```
unsub();
```

# Full Example

```
import createNestedFirebaseSubscriber from 'firebase-nest';

import Firebase from 'firebase';

var {subscribeSubs} = createNestedFirebaseSubscriber({
    onData: function(type, snapshot, sub) {
        console.log("onData type="+type+" key="+snapshot.key()+" path="+sub.path+" subKey="+sub.subKey);
    },
    onSubscribed: function(sub) {
        console.log("subscribed "+sub.path+" subKey="+sub.subKey);
    },
    onUnsubscribed: function(subKey) {
        console.log("unsubscribed subKey="+subKey);
    },
    resolveFirebaseQuery: function(sub) {
        //you can add ref.orderByChild, startAt/endAt, equalTo, etc. or any other firebase query params here
        //based on the passed-in sub.
        //e.g. new Firebase(sub.path).orderByChild(sub.orderByChild).startAt(sub.startAtTs)

        //Use our custom sub fields
        return new Firebase(sub.path);
    },
    subscribedRegistry: {} //will be populated by the subscriber
});

function userDetailSubCreator(userKey) {
    return [
        {
            subKey: 'userDetail_' + userKey,
            asValue: true,

            //custom fields
            path: 'https://your-firebase.com/users/' + userKey
        }
    ];
}

function friendListSubCreator(userKey) {
    return [
        {
            subKey: 'friends_'+userKey,
            asList: true,
            forEachChild: {childSubs: userDetailSubCreator},

            //custom fields
            path: 'https://your-firebase.com/friends/'+userKey
        }
    ];
}

var unsub = subscribeSubs(friendListSubCreator("user1"));

//eventually....
setTimeout(()=unsub(), 10000);

```

# asReduxMiddleware.js shows how this can be easily adapted to work as a redux middleware
