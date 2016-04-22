import test from 'tape';

import {autoSubscriber} from '../src/index.js';

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