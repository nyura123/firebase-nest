import test from 'tape';

import {autoSubscriber, createAutoSubscriber} from '../src/index.js';

test('autoSubscriber component test', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    var didMountCalled = false;
    var didUpdateCalled = false;
    var willUnmountCalled = false;
    const Subscriber = autoSubscriber(class {
        static getSubs(props, state) {
            getSubsCalled++;
            return {subKey: "subKey1", asValue: true};
        }
        static subscribeSubs(subs, props, state) {
            subscribeCalled++;
            return ()=>{
                unsubscribeCalled++;
            };
        }
        componentDidMount() {
            didMountCalled = true;
        }
        componentDidUpdate() {
            didUpdateCalled = true;
        }
        componentWillUnmount() {
            willUnmountCalled = true;
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentWillUnmount();
    assert.equal(didMountCalled, true, "componentDidMount called");
    assert.equal(didUpdateCalled, true, "componentDidUpdate called");
    assert.equal(willUnmountCalled, true, "componentWillUnmount called");
    assert.equal(getSubsCalled, 5, "getSubs called on componentDidMount and each componentDidUpdate");
    assert.equal(subscribeCalled, 1, "subscribe called only on getSubs changes");
    assert.equal(unsubscribeCalled, 1, "unsubscribe called on componentWillUnmount");

    assert.end();
});


test('createAutoSubscriber component test', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    var didMountCalled = false;
    var didUpdateCalled = false;
    var willUnmountCalled = false;

    function getSubs(props, state) {
        getSubsCalled++;
        return {subKey: "subKey1", asValue: true};
    }
    function subscribeSubs(subs, props, state) {
        subscribeCalled++;
        return ()=>{
            unsubscribeCalled++;
        };
    }

    const Subscriber = createAutoSubscriber({getSubs, subscribeSubs})(class {
        getSubs() {
            //shouldn't be called
        }
        subscribeSubs() {
            //shouldn't be called
        }
        componentDidMount() {
            didMountCalled = true;
        }
        componentDidUpdate() {
            didUpdateCalled = true;
        }
        componentWillUnmount() {
            willUnmountCalled = true;
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentWillUnmount();
    assert.equal(didMountCalled, true, "componentDidMount called");
    assert.equal(didUpdateCalled, true, "componentDidUpdate called");
    assert.equal(willUnmountCalled, true, "componentWillUnmount called");
    assert.equal(getSubsCalled, 5, "getSubs called on componentDidMount and each componentDidUpdate");
    assert.equal(subscribeCalled, 1, "subscribe called only on getSubs changes");
    assert.equal(unsubscribeCalled, 1, "unsubscribe called on componentWillUnmount");

    assert.end();
});

test('autoSubscriber component updates subscriptions on getSubs changes', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    var didMountCalled = false;
    var didUpdateCalled = false;
    var willUnmountCalled = false;
    const Subscriber = autoSubscriber(class {
        static getSubs(props, state) {
            getSubsCalled++;
            return {subKey: "subKey"+(getSubsCalled), asValue: true};
        }
        static subscribeSubs(subs, props, state) {
            subscribeCalled++;
            return ()=>{
                unsubscribeCalled++;
            };
        }
        componentDidMount() {
            didMountCalled = true;
        }
        componentDidUpdate() {
            didUpdateCalled = true;
        }
        componentWillUnmount() {
            willUnmountCalled = true;
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    subscriber.componentDidUpdate();
    subscriber.componentDidUpdate();
    subscriber.componentWillUnmount();
    assert.equal(didMountCalled, true, "componentDidMount called");
    assert.equal(didUpdateCalled, true, "componentDidUpdate called");
    assert.equal(willUnmountCalled, true, "componentWillUnmount called");
    assert.equal(getSubsCalled, 3, "getSubs called on componentDidMount and each componentDidUpdate");
    assert.equal(subscribeCalled, 3, "subscribe called only on getSubs changes");
    assert.equal(unsubscribeCalled, 3, "unsubscribe called on componentWillUnmount");

    assert.end();
});

test('autoSubscriber handles subscribeSubs that returns a promise and keeps track of fetching state', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    let setStateCalledWithFetchingTrue = false;
    const Subscriber = autoSubscriber(class {
        static getSubs(props, state) {
            getSubsCalled++;
            return {subKey: "subKey"+(getSubsCalled), asValue: true};
        }
        static subscribeSubs(subs, props, state) {
            subscribeCalled++;
            return {
                unsubscribe: ()=>{
                    unsubscribeCalled++;
                },
                promise: new Promise((resolve, reject) => { resolve(); })
            };
        }
        componentDidMount() {
        }
        componentDidUpdate() {
        }
        componentWillUnmount() {
        }
        setState(state, done) {
            if (state._autoSubscriberFetching) {
                setStateCalledWithFetchingTrue = true;
            } else if (state._autoSubscriberFetching === false) {
                assert.end();
            }
            done && done();
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    assert.equal(getSubsCalled, 1, "getSubs called on componentDidMount");
    assert.equal(setStateCalledWithFetchingTrue, true, "setState called with autoSubscriberFetching=true");
});

test('autoSubscriber keeps track of fetching error', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    const Subscriber = autoSubscriber(class {
        static getSubs(props, state) {
            getSubsCalled++;
            return {subKey: "subKey"+(getSubsCalled), asValue: true};
        }
        static subscribeSubs(subs, props, state) {
            subscribeCalled++;
            return {
                unsubscribe: ()=>{
                    unsubscribeCalled++;
                },
                promise: new Promise((resolve, reject) => { reject('fetch error'); })
            };
        }
        componentDidMount() {
        }
        componentDidUpdate() {
        }
        componentWillUnmount() {
        }
        setState(state, done) {
            if (state._autoSubscriberError === 'fetch error') {
                assert.end();
            }
            done && done();
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    assert.equal(getSubsCalled, 1, "getSubs called on componentDidMount");
});

test('autoSubscriber doesn\'t trash super\'s state', (assert) => {
    var getSubsCalled = 0;
    var subscribeCalled = 0;
    var unsubscribeCalled = 0;
    const Subscriber = autoSubscriber(class {
        static getSubs(props, state) {
            getSubsCalled++;
            return {subKey: "subKey"+(getSubsCalled), asValue: true};
        }
        static subscribeSubs(subs, props, state) {
            subscribeCalled++;
            return {
                unsubscribe: ()=>{
                    unsubscribeCalled++;
                },
                promise: new Promise((resolve, reject) => { resolve(); })
            };
        }
        constructor(props) {
            this.state = {
                userState: 1
            }
        }
        componentDidMount() {
        }
        componentDidUpdate() {
        }
        componentWillUnmount() {
        }
        setState(state, done) {
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    assert.equal(getSubsCalled, 1, "getSubs called on componentDidMount");
    assert.equal(subscriber.state.userState, 1, "user state is kept");
    assert.end();
});

test('autoSubscriber component works with missing methods', (assert) => {
    var didMountCalled = false;
    var didUpdateCalled = false;
    var willUnmountCalled = false;
    const Subscriber = autoSubscriber(class {
        componentDidMount() {
            didMountCalled = true;
        }
        componentDidUpdate() {
            didUpdateCalled = true;
        }
        componentWillUnmount() {
            willUnmountCalled = true;
        }
    });

    const subscriber = new Subscriber();
    subscriber.componentDidMount();
    subscriber.componentDidUpdate();
    subscriber.componentWillUnmount();

    assert.end();
});