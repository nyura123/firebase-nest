var nestedSubscriber = require('firebase-nest');
var Firebase = require('firebase');

const {subscribeSubs} = nestedSubscriber({
    onData: function(type,snapshot,sub){
        console.log("got data, type="+type+", key="+snapshot.key()+" sub.subKey="+sub.subKey);
    },
    onSubscribed: function(){},
    onUnsubscribed: function(){},
    resolveFirebaseQuery: function(sub){return new Firebase(sub.path);},
    subscribedRegistry: {}
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

//Eventually unsub must be called

