import { d3 } from '../libs/nofbiz/nofbiz.analytics.js'

const MAX_LEVELS_UP = 2
const MAX_LEVELS_DOWN = 10

/**
 * Build tree data from the current node and all available nodes.
 *
 * Upward: walks up to MAX_LEVELS_UP (2) ancestors above the current node. The
 * topmost included ancestor becomes the returned tree root. At each ancestor
 * level, that ancestor's other children (not on the path toward currentNode)
 * are attached as leaf nodes (no descendants expanded).
 *
 * Downward: recurses descendants of the current node up to MAX_LEVELS_DOWN
 * (10) levels deep. Descendants beyond that depth are omitted.
 *
 * Cycle / self-parent guard: a visited UUID set prevents infinite loops caused
 * by cycles or self-referencing LinkedPrograms values.
 *
 * @param {object} currentNode - The node to center the tree on. Must have UUID, Title, LinkedPrograms, _type.
 * @param {object[]} allNodes - All nodes (projects + programs), each tagged with _type.
 * @returns {object} Root node of the tree in D3 hierarchy-compatible format.
 */
export function buildTreeData(currentNode, allNodes) {
  const toNode = (item, isCurrent = false, nodeChildren = []) => ({
    id: item.UUID,
    title: item.Title,
    type: item._type || 'project',
    isCurrent,
    children: nodeChildren
  })

  // Recursively build the downward subtree for a node, bounded by depth.
  // visited is a Set of UUIDs already on the ancestor chain to guard against cycles.
  function buildDown(node, depth, visited) {
    if (depth <= 0) return toNode(node)
    const nextVisited = new Set(visited)
    nextVisited.add(node.UUID)
    const kids = allNodes.filter(
      n => n.LinkedPrograms === node.UUID && !nextVisited.has(n.UUID)
    )
    return toNode(node, false, kids.map(c => buildDown(c, depth - 1, nextVisited)))
  }

  // Build the current node's downward subtree (marks isCurrent = true at root).
  const ancestorVisited = new Set([currentNode.UUID])
  const kidsOfCurrent = allNodes.filter(
    n => n.LinkedPrograms === currentNode.UUID && !ancestorVisited.has(n.UUID)
  )
  let subtree = toNode(
    currentNode,
    true,
    kidsOfCurrent.map(c => buildDown(c, MAX_LEVELS_DOWN - 1, ancestorVisited))
  )

  // Walk upward up to MAX_LEVELS_UP, wrapping the accumulated subtree at each step.
  let node = currentNode
  const upVisited = new Set([currentNode.UUID])
  for (let level = 0; level < MAX_LEVELS_UP; level++) {
    if (!node.LinkedPrograms || node.LinkedPrograms === node.UUID) break
    const parent = allNodes.find(n => n.UUID === node.LinkedPrograms) || null
    if (!parent || upVisited.has(parent.UUID)) break
    upVisited.add(parent.UUID)

    // Other children of this parent become leaf nodes (not expanded).
    const siblings = allNodes.filter(
      n => n.LinkedPrograms === parent.UUID && n.UUID !== node.UUID
    )
    subtree = toNode(parent, false, [
      ...siblings.map(s => toNode(s)),
      subtree
    ])
    node = parent
  }

  return subtree
}

/**
 * Render a D3 top-to-bottom tree into a raw DOM element.
 * Nodes are clickable rounded rectangles color-coded by type.
 *
 * @param {HTMLElement} mountEl - Raw DOM element to render SVG into.
 * @param {object} treeData - Root node from buildTreeData.
 * @param {function} onNodeClick - Called with the node data object when a node is clicked.
 * @returns {function} Cleanup function that removes the SVG.
 */
export function renderTreeViz(mountEl, treeData, onNodeClick) {
  // Clear any previous content
  while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild)

  const nodeWidth = 168
  const nodeHeight = 48
  const levelGap = 80

  const hierarchy = d3.hierarchy(treeData)
  const treeLayout = d3.tree().nodeSize([nodeWidth + 24, nodeHeight + levelGap])
  treeLayout(hierarchy)

  // Compute horizontal bounds
  let minX = Infinity
  let maxX = -Infinity
  hierarchy.each(n => {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
  })

  const svgWidth = Math.max(mountEl.clientWidth || 600, maxX - minX + nodeWidth + 80)
  const svgHeight = (hierarchy.height + 1) * (nodeHeight + levelGap) + 60
  const offsetX = -minX + nodeWidth / 2 + 40

  const svg = d3.select(mountEl)
    .append('svg')
    .attr('width', svgWidth)
    .attr('height', svgHeight)
    .style('display', 'block')
    .style('overflow', 'visible')

  const g = svg.append('g')
    .attr('transform', `translate(${offsetX}, 30)`)

  // Draw links
  const linkGen = d3.link(d3.curveBumpY)
    .x(d => d.x)
    .y(d => d.y)

  g.selectAll('.app-tree-link')
    .data(hierarchy.links())
    .join('path')
    .attr('class', 'app-tree-link')
    .attr('fill', 'none')
    .attr('stroke', '#e0e0e0')
    .attr('stroke-width', 2)
    .attr('d', linkGen)

  // Draw nodes
  const nodeG = g.selectAll('.app-tree-node')
    .data(hierarchy.descendants())
    .join('g')
    .attr('class', 'app-tree-node')
    .attr('transform', d => `translate(${d.x - nodeWidth / 2}, ${d.y - nodeHeight / 2})`)
    .style('cursor', 'pointer')
    .on('click', (event, d) => onNodeClick(d.data))

  // Node background rect
  nodeG.append('rect')
    .attr('width', nodeWidth)
    .attr('height', nodeHeight)
    .attr('rx', 8)
    .attr('ry', 8)
    .attr('fill', d => d.data.isCurrent ? '#e6f5ef' : '#ffffff')
    .attr('stroke', d => {
      if (d.data.isCurrent) return '#00965d'
      if (d.data.type === 'program') return '#00965d'
      return '#1d4ed8'
    })
    .attr('stroke-width', d => d.data.isCurrent ? 2 : 1)

  // Type label (overline style)
  nodeG.append('text')
    .attr('x', 10)
    .attr('y', 16)
    .attr('fill', d => d.data.type === 'program' ? '#00965d' : '#1d4ed8')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('letter-spacing', '0.04em')
    .text(d => d.data.type === 'program' ? 'PROGRAM' : 'PROJECT')

  // Title text (truncate if too long)
  nodeG.append('text')
    .attr('x', 10)
    .attr('y', 34)
    .attr('fill', '#242424')
    .attr('font-size', '12px')
    .attr('font-weight', d => d.data.isCurrent ? '600' : '400')
    .text(d => d.data.title.length > 20 ? d.data.title.slice(0, 20) + '...' : d.data.title)

  return function cleanup() {
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild)
  }
}
