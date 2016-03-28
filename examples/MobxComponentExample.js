import createNestedFirebaseSubscriber, { autoSubscriber } from 'firebase-nest';

import React from 'react';
import Firebase from 'firebase';

import {observable, map} from "mobx";
import {observer} from "mobx-react";

var store = observable ({
    dinosaurs: null,
    dinosaurDetails: map({}),
    dinosaurScores: map({})
});

var {subscribeSubs} = createNestedFirebaseSubscriber({
    onData: function (type, snapshot, sub) {
        if (sub.params.name == 'dinosaurs') {
            store.dinosaurs = snapshot.val();
        }
        else {
            //We have set up params.name dinosaurDetails and dinosaurScores to match the store keys above.
            //Use the mobx map API to be able to observe new/removed keys
            store[sub.params.name].set(sub.params.key, snapshot.val());
        }
    },
    onSubscribed: function (sub) {
        console.log("Subscribed "+sub.subKey);
    },
    onUnsubscribed: function (subKey) {
        console.log("Unsubscribed "+subKey);
    },
    resolveFirebaseQuery: function (sub) {
        return new Firebase(sub.path);
    },
    subscribedRegistry: {}
});

function myAutoSubscriber(Component) {
    return autoSubscriber(subscribeSubs, Component);
}

//Example usage
var fbRoot = "https://dinosaur-facts.firebaseio.com";
export var Dinosaur = myAutoSubscriber(observer(class extends React.Component {
    static getSubs(props, state) {
        //In practice, you would use helper functions instead of hardcoding the sub spec format here
        return [{
            subKey: 'detail_' + props.dinosaurKey,
            asValue: true,

            //custom fields used by
            params: {name: 'dinosaurDetails', key: props.dinosaurKey},
            path: fbRoot+"/dinosaurs/" + props.dinosaurKey
        },
            {
                subKey: 'score_' + props.dinosaurKey,
                asValue: true,

                //custom fields
                params: {name: 'dinosaurScores', key: props.dinosaurKey},
                path: fbRoot+"/scores/" + props.dinosaurKey
            }
        ];
    }

    render() {
        const {dinosaurKey} = this.props;
        return (
            <div>
                <div>dinosaur: {dinosaurKey}</div>
                <div>detail: {JSON.stringify(store.dinosaurDetails.get(dinosaurKey) ||"no detail data")} </div>
                <div>score: {JSON.stringify(store.dinosaurScores.get(dinosaurKey)||"no score data")}</div>
            </div>
        )
    }
}));

export var DinosaurList = myAutoSubscriber(observer(class extends React.Component {
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
    render() {
        return (
            <div>
                {Object.keys(store.dinosaurs || {}).map(dinosaurKey=>{
                    return <Dinosaur key={dinosaurKey} dinosaurKey={dinosaurKey} />
                })}
            </div>
        );
    }
}));