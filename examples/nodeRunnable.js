const createSubscriber = require('firebase-nest');
const Firebase = require('firebase');
const fb = new Firebase('https://docs-examples.firebaseio.com');
const subscriber = createSubscriber.default({
    resolveFirebaseQuery: function(sub) {
        return fb.child(sub.path);
    },
    onData(type, snapshot, sub) {
        console.log('onData: type='+type+', subKey='+sub.subKey+', fbKey='+snapshot.key());
    }
});
console.log("subscribing to message data...");
const subInfo = subscriber.subscribeSubsWithPromise([{
    subKey: 'chats',
    asList: true,
    path: 'samplechat/messages',
    forEachChild: {
        childSubs: function(messageKey, messageData) {
            return [{
                subKey: 'user_'+messageData.uid,
                asValue: true,
                path: 'users/'+messageData.uid
            }];
        }
    }
}]);
subInfo.promise.then(() => {
    console.log('initial data loaded');
});

