import test from 'tape';

import { asDotGraph } from '../src/index.js';

test('generates subscription dot graphs', (assert) => {
  {
    const subscribedRegistry = {}
    assert.equal(
      asDotGraph(subscribedRegistry),
      `digraph "SubscriptionGraph" {  ;\n ;\n }`,
      "empty graph"
    );
  }

  {
    const subscribedRegistry = {'sub1': {refCount: 1}};
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { sub1 [label="sub1"] ;\n ;\n }`,
      "single-node graph"
    );
  }

  {
    const subscribedRegistry = {'sub1': {refCount: 1}};
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey, color: 'blue'}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { sub1 [label="sub1" style=filled fillcolor="blue"] ;\n ;\n }`,
      "graph with custom makeNodeProps & string colors"
    );
  }

  {
    const subscribedRegistry = {'sub1': {refCount: 1}};
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey, color: {background: 'blue'}}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { sub1 [label="sub1" style=filled fillcolor="blue"] ;\n ;\n }`,
      "graph with custom makeNodeProps & OBJECT colors"
    );
  }

  {
    const subscribedRegistry = {'sub1': {refCount: 1}};
    assert.equal(
      asDotGraph(subscribedRegistry),
      `digraph "SubscriptionGraph" { sub1 [label=" \n sub1 \n # subsribers: 1" style=filled fillcolor="#D2E5FF" color="grey"] ;\n ;\n }`,
      "graph default makeNodeProps"
    );
  }
  
  {
    const subscribedRegistry = {
      'sub1': {parentSubKeys: {'_root': 1}, refCount: 1, childUnsubs: {'sub2': ()=>{}, 'sub3': ()=>{}}},
      'sub2': {parentSubKeys: {'sub1': 1, '_root': 2}, refCount: 2},
      'sub3': {parentSubKeys: {'sub1': 1}, refCount: 1}
    }
    assert.equal(
      asDotGraph(subscribedRegistry),
      `digraph "SubscriptionGraph" { sub1 [label=" \n sub1 \n # subsribers: 1\n # children subs: 2" style=filled fillcolor="#D2E5FF" color="grey"] ;\nsub2 [label=" \n sub2 \n # subsribers: 2" style=filled fillcolor="#D2E5FF" color="grey"] ;\nsub3 [label=" \n sub3 \n # subsribers: 1" style=filled fillcolor="#D2E5FF" color="grey"] ;\nsub1 -> sub2 ;\nsub1 -> sub3 ;\n }`,
      "graph with nested subs"
    );
  }

  {
    //Cycles - shouldn't happen, but asDotGraph can handle it
    const subscribedRegistry = {
      'sub1': {parentSubKeys: {'sub2': 1}, refCount: 1},
      'sub2': {parentSubKeys: {'sub1': 1}, refCount: 1}
    }
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { sub1 [label="sub1"] ;\nsub2 [label="sub2"] ;\nsub2 -> sub1 ;\nsub1 -> sub2 ;\n }`,
      "graph with cycles"
    );
  }

  {
    //handles missing fields
    const subscribedRegistry = {
      'sub1': null,
      'sub2': {parentSubKeys: {'sub1': 1}},
      'sub3': {parentSubKeys: null}
    }
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { sub1 [label="sub1"] ;\nsub2 [label="sub2"] ;\nsub3 [label="sub3"] ;\nsub1 -> sub2 ;\n }`,
      "handles missing fields"
    );
  }

  {
    //handles fieldSubs
    const subscribedRegistry = {
      'sub1': {fieldUnsubs: {'field1': ()=>{}, 'field2': ()=>{}}}
    }
    assert.equal(
      asDotGraph(subscribedRegistry),
      `digraph "SubscriptionGraph" { sub1 [label=" \n sub1 \n # subsribers: 0\n # field subs: 2" style=filled fillcolor="#D2E5FF" color="grey"] ;\n ;\n }`,
      "displays field subs count"
    );
  }

  {
    const subscribedRegistry = {
      'messages': {refCount: 1, childUnsubs: {'user1': ()=>{}, 'user2': ()=>{}}},
      'user1': {parentSubKeys: {'messages': 1}},
      'user2': {parentSubKeys: {'messages': 1}}
    }
    function makeNodeProps(subKey, subInfo) {
      return {label: subKey}
    }
    assert.equal(
      asDotGraph(subscribedRegistry, makeNodeProps),
      `digraph "SubscriptionGraph" { messages [label="messages"] ;\nuser1 [label="user1"] ;\nuser2 [label="user2"] ;\nmessages -> user1 ;\nmessages -> user2 ;\n }`,
      "graph with messages and users"
    );
    console.log(asDotGraph(subscribedRegistry, makeNodeProps))
  }

  assert.end();
});
