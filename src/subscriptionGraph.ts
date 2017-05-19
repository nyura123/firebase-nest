
//default way to make a graph node from subInfo
//for properties you can output, see http://visjs.org/docs/network/nodes.html
export function defaultMakeVisNodeProps(subKey, subInfo) {
  subInfo = subInfo || {};
  const sub = subInfo.sub || {};
  const firebasePath = sub.path || (subInfo.ref || {}).ref || '';
  let label = `${firebasePath} \n ${subKey} \n # subsribers: ${subInfo.refCount||0}`;
  if (subInfo.childUnsubs) {
    label += `\n # children subs: ${Object.keys(subInfo.childUnsubs).length}`;
  }
  if (subInfo.fieldUnsubs) {
    label += `\n # field subs: ${Object.keys(subInfo.fieldUnsubs).length}`;
  }
  return {shape: 'box', borderWidth: 1, shadow: {enabled:true}, color: {background: '#D2E5FF', border:'grey'}, label};
}

export function asNodesAndEdges(subscribedRegistry, makeVisNodeProps?) {
  makeVisNodeProps = makeVisNodeProps || defaultMakeVisNodeProps;

  const subKeys = {}
  const nodes = [];
  const edges = [];
  Object.keys(subscribedRegistry || {}).forEach((subKey) => {
    const subInfo = subscribedRegistry[subKey];
    const node = Object.assign({}, makeVisNodeProps(subKey, subInfo), {id: subKey});
    subKeys[subKey] = node;
    nodes.push(node);
  });
  Object.keys(subscribedRegistry || {}).forEach((subKey) => {
    const subInfo = subscribedRegistry[subKey] || {};
    const node = subKeys[subKey];
    Object.keys(subInfo.parentSubKeys || {}).forEach((parentSubKey) => {
      if (subKeys[parentSubKey]) {
        edges.push({length: 5, from: parentSubKey, to: subKey})
        if (!node.group) {
          node.group = parentSubKey;
        }
      } else {
        //This should only happen for parentSubKey==_root which won't have its own subscribedRegistry[_rootKey] entry
        // const node = {id: parentSubKey, label: `${parentSubKey}`};
        // nodes.push(node);
        // subKeys[parentSubKey] = node;
        // edges.push({from: parentSubKey, to: subKey})
      }
    });
  });

  return {
    nodes,
    edges
  }
}

export interface AsDotGraphOpts {
  name?: string;
}

function visNodeToDotNode(node) {
  const fillColor =
      (node.color && typeof node.color === 'string') ? ` style=filled fillcolor="${node.color}"`
      : (node.color && node.color.background) ? ` style=filled fillcolor="${node.color.background}"`
      : '';
  const borderColor = (node.color && node.color.border) ? ` color="${node.color.border}"` : '';

  return `${node.id} [label="${node.label}"${fillColor}${borderColor}]`;
}

function visEdgeToDotEdge(edge) {
  return `${edge.from} -> ${edge.to}`;
}

export function asDotGraph(subscribedRegistry, makeNodeProps?, opts: AsDotGraphOpts = {}) {
  const visGraph = asNodesAndEdges(subscribedRegistry, makeNodeProps);
  //const nodesById = visGraph.nodes.reduce((byId, node) => (Object.assign({}, byId, {[node.id]: node})), {});
  const {
      name = 'SubscriptionGraph'
  } = opts;
  return `digraph "${name}" { ` +
    visGraph.nodes.map((node) => visNodeToDotNode(node)).join(' ;\n') + ' ;\n' +
    visGraph.edges.map((edge) => visEdgeToDotEdge(edge)).join(' ;\n') + ' ;\n' +
  ' }';
}
