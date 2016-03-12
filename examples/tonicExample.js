var nestedSubscriber = require('firebase-nest');
var Firebase = require('firebase');

var {subscribeSubs} = nestedSubscriber({
    onData: function(type,snapshot,s){
        console.log("got data, type="+type+", key="+snapshot.key()+" s.path="+s.path);
    },
    onSubscribed: function(){},
    onUnsubscribed: function(){},
    resolveFirebaseQuery: function(s){return new Firebase(s.path);},
    subscribedRegistry: {}
});

var unsub1 = subscribeSubs([
    {
        subKey:"testingDinosaurs",path:"https://dinosaur-facts.firebaseio.com/dinosaurs",asValue:true
    }
]);

var unsub2 = subscribeSubs([
    {
        subKey:"testingScores",path:"https://dinosaur-facts.firebaseio.com/scores",asList:true
    }
]);
