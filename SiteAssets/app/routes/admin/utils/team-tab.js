import {
  View, Container, Text, SiteApi
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_ALLOCATIONS, LIST_PROJECTS } from '../../../utils/constants.js'

export async function createTeamTab({ siteApi, pmGroupMembers }) {
  if (!pmGroupMembers || pmGroupMembers.length === 0) {
    return new View([
      new Text('No team members found', { type: 'p', class: 'app-empty-state' }),
    ])
  }

  const [allAllocations, allProjects] = await Promise.all([
    siteApi.list(LIST_ALLOCATIONS).getItems(),
    siteApi.list(LIST_PROJECTS).getItems(
      { Status: { value: ['Pipeline', 'On Hold', 'In Progress', 'Delayed'], operator: 'Or' } },
      { viewFields: ['UUID', 'Title', 'Role'] }
    ),
  ])

  const projectByUUID = Object.fromEntries(allProjects.map(p => [p.UUID, p]))

  const teamData = pmGroupMembers.map(member => {
    const memberEmail = member.Email.toLowerCase()
    const memberAllocations = allAllocations.filter(
      a => a.UserEmail && a.UserEmail.toLowerCase() === memberEmail
        && projectByUUID[a.ProjectUUID]
    )
    const totalAllocation = memberAllocations.reduce(
      (sum, a) => sum + (parseFloat(a.AllocationPercent) || 0), 0
    )
    return {
      name: member.Title,
      email: member.Email,
      totalAllocation,
      allocations: memberAllocations,
    }
  })

  function buildMemberRow(member) {
    const totalClass = member.totalAllocation > 1
      ? 'app-team-total app-team-total--over'
      : 'app-team-total'

    const mainRow = new Container([
      new Text(member.name, { type: 'span', class: 'app-team-name' }),
      new Text(member.email, { type: 'span', class: 'app-team-email' }),
      new Text(member.totalAllocation.toFixed(2) + ' FTE', { type: 'span', class: totalClass }),
    ], { class: 'app-team-row' })

    const activeAllocations = member.allocations.filter(a => projectByUUID[a.ProjectUUID])
    const breakdownRows = activeAllocations.length > 0
      ? activeAllocations.map(a => {
          const project = projectByUUID[a.ProjectUUID]
          const role = project.Role || ''
          const label = [role, a.ProjectUUID, project.Title].filter(Boolean).join(' ')
          return new Container([
            new Text(label, { type: 'span', class: 'app-team-project-id' }),
            new Text(a.AllocationPercent + ' FTE', { type: 'span', class: 'app-team-project-percent' }),
          ], { class: 'app-team-breakdown-row' })
        })
      : [new Text('No allocations', { type: 'span', class: 'app-team-no-alloc' })]

    return new Container([mainRow, ...breakdownRows], { class: 'app-team-member' })
  }

  const header = new Container([
    new Text('Team Member', { type: 'span', class: 'app-team-header-cell' }),
    new Text('Email', { type: 'span', class: 'app-team-header-cell' }),
    new Text('FTE', { type: 'span', class: 'app-team-header-cell' }),
  ], { class: 'app-team-header' })

  const memberRows = teamData.map(member => buildMemberRow(member))

  return new View([
    new Container([header, ...memberRows], { class: 'app-team-table' }),
  ])
}
