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
    status: item.Status || '',
    childCount: 0,
    isCurrent,
    children: nodeChildren
  })

  function countDirectChildren(nodeUUID) {
    return allNodes.filter(n => n.LinkedPrograms === nodeUUID).length
  }

  function buildDown(node, depth, visited) {
    if (depth <= 0) {
      const n = toNode(node)
      n.childCount = countDirectChildren(node.UUID)
      return n
    }
    const nextVisited = new Set(visited)
    nextVisited.add(node.UUID)
    const kids = allNodes.filter(
      n => n.LinkedPrograms === node.UUID && !nextVisited.has(n.UUID)
    )
    const built = toNode(node, false, kids.map(c => buildDown(c, depth - 1, nextVisited)))
    built.childCount = kids.length
    return built
  }

  const ancestorVisited = new Set([currentNode.UUID])
  const kidsOfCurrent = allNodes.filter(
    n => n.LinkedPrograms === currentNode.UUID && !ancestorVisited.has(n.UUID)
  )
  let subtree = toNode(
    currentNode,
    true,
    kidsOfCurrent.map(c => buildDown(c, MAX_LEVELS_DOWN - 1, ancestorVisited))
  )
  subtree.childCount = kidsOfCurrent.length

  let node = currentNode
  const upVisited = new Set([currentNode.UUID])
  for (let level = 0; level < MAX_LEVELS_UP; level++) {
    if (!node.LinkedPrograms || node.LinkedPrograms === node.UUID) break
    const parent = allNodes.find(n => n.UUID === node.LinkedPrograms) || null
    if (!parent || upVisited.has(parent.UUID)) break
    upVisited.add(parent.UUID)

    const siblings = allNodes.filter(
      n => n.LinkedPrograms === parent.UUID && n.UUID !== node.UUID
    )
    subtree = toNode(parent, false, [
      ...siblings.map(s => toNode(s)),
      subtree
    ])
    subtree.childCount = siblings.length + 1
    node = parent
  }

  return subtree
}

// -------------------------------------------------------------------
// D3 tree renderer — orthogonal connectors, 240px nodes, no truncation
// -------------------------------------------------------------------

/**
 * Render a D3 top-to-bottom tree into a raw DOM element.
 * Uses orthogonal 1px #d1d1d1 connectors (28px vertical stub → horizontal spine → per-child stub).
 * Nodes are 240px wide, radius-4 rectangles with three lines of content.
 *
 * NOTE: D3's own selection/DOM API (select, append, attr, etc.) is used here —
 * this is the existing pattern for this module and the only place raw DOM manipulation
 * is permitted per project rules (not SPARC component injection).
 *
 * @param {HTMLElement} mountEl - Raw DOM element to render SVG into.
 * @param {object} treeData - Root node from buildTreeData.
 * @param {function} onNodeClick - Called with the node data object when a node is clicked.
 * @returns {function} Cleanup function that removes the SVG.
 */
export function renderTreeViz(mountEl, treeData, onNodeClick) {
  // Clear any previous content
  while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild)

  // Node dimensions per spec: 240px wide, variable height (needs room for 3 lines)
  const nodeWidth = 240
  const nodeHeight = 72   // 10px padding top + 14/14 overline + 14/20 name + 12/16 third line + 10px padding bottom
  const verticalStub = 28 // 28px vertical stub from node to horizontal spine
  const levelGap = nodeHeight + verticalStub * 2 + 16

  const hierarchy = d3.hierarchy(treeData)
  const treeLayout = d3.tree().nodeSize([nodeWidth + 24, levelGap])
  treeLayout(hierarchy)

  // Compute horizontal bounds
  let minX = Infinity
  let maxX = -Infinity
  hierarchy.each(n => {
    if (n.x < minX) minX = n.x
    if (n.x > maxX) maxX = n.x
  })

  const padding = 48
  const svgWidth = Math.max(mountEl.clientWidth || 700, maxX - minX + nodeWidth + padding * 2)
  const svgHeight = (hierarchy.height + 1) * levelGap + 60
  const offsetX = -minX + nodeWidth / 2 + padding

  const svg = d3.select(mountEl)
    .append('svg')
    .attr('width', svgWidth)
    .attr('height', svgHeight)
    .style('display', 'block')
    .style('overflow', 'visible')
    .style('font-family', "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif")

  const g = svg.append('g')
    .attr('transform', `translate(${offsetX}, 30)`)

  // -------------------------------------------------------------------
  // Orthogonal connectors
  // Draw: parent bottom-centre → down 28px vertical stub → horizontal spine → up 28px to child top-centre
  // 1px solid #d1d1d1
  // For the current node, the connector stub going up is #00965E
  // -------------------------------------------------------------------

  hierarchy.links().forEach(link => {
    const parentX = link.source.x
    const parentY = link.source.y
    const childX = link.target.x
    const childY = link.target.y

    const parentBottom = parentY + nodeHeight / 2
    const childTop = childY - nodeHeight / 2
    const spineY = parentBottom + verticalStub
    const isCurrentChild = link.target.data.isCurrent
    const connectorColor = isCurrentChild ? '#00965E' : '#d1d1d1'

    // Vertical stub down from parent
    g.append('line')
      .attr('x1', parentX).attr('y1', parentBottom)
      .attr('x2', parentX).attr('y2', spineY)
      .attr('stroke', '#d1d1d1')
      .attr('stroke-width', 1)

    // Horizontal spine at spineY
    const spineLeft = Math.min(parentX, childX)
    const spineRight = Math.max(parentX, childX)
    if (spineLeft < spineRight) {
      g.append('line')
        .attr('x1', spineLeft).attr('y1', spineY)
        .attr('x2', spineRight).attr('y2', spineY)
        .attr('stroke', '#d1d1d1')
        .attr('stroke-width', 1)
    }

    // Vertical stub up to child
    g.append('line')
      .attr('x1', childX).attr('y1', spineY)
      .attr('x2', childX).attr('y2', childTop)
      .attr('stroke', connectorColor)
      .attr('stroke-width', 1)
  })

  // -------------------------------------------------------------------
  // Nodes
  // -------------------------------------------------------------------

  const nodeG = g.selectAll('.app-tree-node')
    .data(hierarchy.descendants())
    .join('g')
    .attr('class', 'app-tree-node')
    .attr('transform', d => `translate(${d.x - nodeWidth / 2}, ${d.y - nodeHeight / 2})`)
    .style('cursor', d => d.data.isCurrent ? 'default' : 'pointer')
    .on('click', (event, d) => {
      if (!d.data.isCurrent) onNodeClick(d.data)
    })

  // Background rect
  nodeG.append('rect')
    .attr('width', nodeWidth)
    .attr('height', nodeHeight)
    .attr('rx', 4)
    .attr('ry', 4)
    .attr('fill', d => {
      if (d.data.isCurrent) return '#E6F4EE'
      if (!d.parent) return '#E6F4EE'  // root/ancestor gets wash ground
      return '#ffffff'
    })
    .attr('stroke', d => {
      if (d.data.isCurrent) return '#00965E'
      if (!d.parent) return '#00965E'  // root ancestor
      if (d.data.type === 'program') return '#8BC8AA'
      return '#d1d1d1'
    })
    .attr('stroke-width', d => {
      if (d.data.isCurrent) return 2
      if (!d.parent) return 1.5
      return 1.5
    })

  // Focus ring on current node
  nodeG.filter(d => d.data.isCurrent)
    .append('rect')
    .attr('width', nodeWidth + 6)
    .attr('height', nodeHeight + 6)
    .attr('x', -3)
    .attr('y', -3)
    .attr('rx', 6)
    .attr('ry', 6)
    .attr('fill', 'none')
    .attr('stroke', '#E6F4EE')
    .attr('stroke-width', 3)

  const PADDING_X = 10
  const LINE1_Y = 14   // overline
  const LINE2_Y = 33   // name (14/20)
  const LINE3_Y = 56   // third line (12/16)

  // Line 1: type overline (PROGRAM / PROJECT, or "PROJECT · YOU ARE HERE" for current)
  nodeG.append('text')
    .attr('x', PADDING_X)
    .attr('y', LINE1_Y)
    .attr('fill', d => d.data.type === 'program' ? '#00965E' : '#616161')
    .attr('font-size', '10px')
    .attr('font-weight', '600')
    .attr('letter-spacing', '0.08em')
    .attr('text-transform', 'uppercase')
    .text(d => {
      const kind = d.data.type === 'program' ? 'PROGRAM' : 'PROJECT'
      return d.data.isCurrent ? `${kind} · YOU ARE HERE` : kind
    })

  // Line 2: full untruncated name
  nodeG.append('text')
    .attr('x', PADDING_X)
    .attr('y', LINE2_Y)
    .attr('fill', '#242424')
    .attr('font-size', '14px')
    .attr('font-weight', d => d.data.isCurrent ? '600' : '400')
    .attr('line-height', '20px')
    .each(function(d) {
      const el = d3.select(this)
      const title = d.data.title || ''
      const maxWidth = nodeWidth - PADDING_X * 2

      // Wrap text using tspan elements if needed
      const words = title.split(/\s+/)
      let line = ''
      let lineNumber = 0
      const lineHeight = 18

      el.text(null)

      let tspan = el.append('tspan').attr('x', PADDING_X).attr('dy', 0)

      for (const word of words) {
        const testLine = line ? line + ' ' + word : word
        tspan.text(testLine)
        const textLength = tspan.node() ? tspan.node().getComputedTextLength() : 0

        if (textLength > maxWidth && line) {
          tspan.text(line)
          tspan = el.append('tspan').attr('x', PADDING_X).attr('dy', lineHeight)
          line = word
          lineNumber++
          if (lineNumber >= 2) break  // max 2 lines for name
        } else {
          line = testLine
        }
      }
      tspan.text(line)
    })

  // Line 3: child count for programs, status pill text for projects
  nodeG.append('text')
    .attr('x', PADDING_X)
    .attr('y', LINE3_Y)
    .attr('font-size', '12px')
    .attr('font-weight', '400')
    .each(function(d) {
      const el = d3.select(this)
      if (d.data.type === 'program') {
        const count = d.data.childCount || (d.children ? d.children.length : 0)
        const label = count === 1 ? '1 child' : `${count} children`
        el.attr('fill', '#616161').text(label)
      } else {
        const status = d.data.status || ''
        // Use status-appropriate colors matching pastel vocabulary
        const statusColors = {
          'In Progress': '#1e40af',
          'Completed':   '#166534',
          'Delayed':     '#92400e',
          'Pipeline':    '#5b21b6',
          'On Hold':     '#9a3412',
          'Stopped':     '#991b1b',
        }
        const color = statusColors[status] || '#616161'
        el.attr('fill', color).text(status)
      }
    })

  return function cleanup() {
    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild)
  }
}
