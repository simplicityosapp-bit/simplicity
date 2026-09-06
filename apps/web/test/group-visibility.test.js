/* ════════════════════════════════════════════════════════════════
   THE GROUP, SEEN FROM THE CLIENT SIDE.
   ════════════════════════════════════════════════════════════════
   The clients screen knew about groups and showed none of it. A card named
   the client's PROJECT, so a facilitator running three cohorts inside one
   project met three identical rows of "סדנאות קבוצתיות" and had to open
   each client to find out which cohort they were looking at; and there was
   no way to bring one cohort onto the screen by itself.

   Round 4 also closes the smaller gaps around a group: adding a client who
   does not exist yet without leaving the group, a project client list that
   says who is no longer working with you, a membership row that opens
   something when tapped, and a cascade dialog whose destructive half looks
   destructive.
   ════════════════════════════════════════════════════════════════ */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')
const LOCALES = ['he', 'en', 'es', 'fr']
const load = (lang, ns) => JSON.parse(
  readFileSync(new URL(`../../../packages/core/src/i18n/locales/${lang}/${ns}.json`, import.meta.url), 'utf8'),
)

describe('the client card names the group', () => {
  const src = read('src/screens/clients/ClientCard.jsx')

  it('takes it from the tracks, not from a second lookup', () => {
    expect(src).toMatch(/const groupTracks = tracks\.filter\(\(tr\) => tr\.kind === 'group'\)/)
  })

  it('names one group and counts several', () => {
    /* A card that lists every group stops being a card. */
    expect(src).toMatch(/namedGroups\.length === 1[\s\S]{0,140}card\.groupCount/)
  })

  it('still names the cohort of someone whose groups have all ended', () => {
    /* Unlike the meetings figure beside it, this tag says who the person is
       rather than what they owe. Dropping it would print a former member as
       unaffiliated while the list, grouped by group, files them under the
       cohort they were in. */
    expect(src).toMatch(/groupTracks\.some\(\(tr\) => !tr\.ended\)\s*\?\s*groupTracks\.filter\(\(tr\) => !tr\.ended\)\s*:\s*groupTracks/)
  })

  it('renders it beside the project, not instead of it', () => {
    expect(src).toMatch(/cc-proj cc-group/)
    expect(src).toMatch(/\{project && <Txt className="cc-proj">/)
  })
})

describe('grouping the list by group', () => {
  const src = read('src/screens/clients/index.jsx')

  it('is one of three groupings, and an unknown stored value falls back', () => {
    expect(src).toMatch(/const GROUP_BY_OPTIONS = \[/)
    expect(src).toMatch(/GROUP_BY_OPTIONS\.some\(\(o\) => o\.k === prefs\?\.clientsGroupBy\)/)
  })

  it('builds project buckets and group buckets through one path', () => {
    /* Two shapes rendered by one list; the render used to branch on
       `groupBy === 'project'` and could only ever draw that one. */
    expect(src).toMatch(/\) : grouped \? \(/)
    expect(src).not.toMatch(/\) : groupBy === 'project' \? \(/)
  })

  it('puts a client in every group they are in', () => {
    /* The point of the view is to see a cohort whole. Leaving someone out
       of one bucket to keep the list a partition would defeat it. */
    expect(src).toMatch(/ids\.forEach\(\(gid\) => put\(gid, c\)\)/)
  })

  it('counts the legacy single-group tag as membership too', () => {
    /* Same union the project screen's roster takes: the row is the source
       of truth, but a client carrying only the tag is still in that group. */
    expect(src).toMatch(/if \(c\.group_id\) ids\.add\(c\.group_id\)/)
  })

  it('drops the tabs and the hero for any grouping, not just project', () => {
    expect(src).toMatch(/const sourceClients = \(groupBy !== 'status' \|\| balanceOnly\)/)
    expect(src).toMatch(/\{groupBy !== 'status' && \(/)
  })
})

describe('a new client, straight into the group', () => {
  it('the member picker offers it', () => {
    const src = read('src/modals/AddGroupMemberModal.jsx')
    expect(src).toMatch(/onCreateClient/)
    expect(src).toMatch(/addGroupMember\.newClient/)
    /* "Everyone is already a member" is a fine state to be in, not an
       error — it only read as one because there was nothing else to do. */
    expect(src).toMatch(/className="m-hint">\{t\('addGroupMember\.allMembers'\)\}/)
  })

  it('the project screen creates the client AND the membership', () => {
    const src = read('src/screens/project-detail/index.jsx')
    expect(src).toMatch(/const addClientToGroup[\s\S]{0,400}addMember\(newMembership\(/)
    expect(src).toMatch(/onSave=\{addClientToGroup\}/)
  })

  it('the add-client form says where the client is going', () => {
    const src = read('src/modals/AddClientModal.jsx')
    expect(src).toMatch(/addClient\.intoGroup/)
    for (const lang of LOCALES) {
      expect(load(lang, 'modalsClient').addClient.intoGroup, `${lang}.intoGroup`).toMatch(/\{\{group\}\}/)
      expect(load(lang, 'modalsClient').addGroupMember.newClient, `${lang}.newClient`).toBeTruthy()
    }
  })
})

describe('the project client list', () => {
  const src = read('src/screens/project-detail/index.jsx')

  it('says who is a former client, and sinks them', () => {
    /* Without it, after a couple of cohorts a project reads as a roster of
       thirty current clients when six of them are current. */
    expect(src).toMatch(/const orderedProjectClients = useMemo/)
    expect(src).toMatch(/detail\.clients\.past/)
    expect(src).toMatch(/past \? ' is-past' : ''/)
  })

  it('keeps group-mates together under the names', () => {
    expect(src).toMatch(/\(a\.group_id \|\| ''\)\.localeCompare\(b\.group_id \|\| ''\)/)
  })

  it('has the label in every locale', () => {
    for (const lang of LOCALES) {
      expect(load(lang, 'projects').detail.clients.past, `${lang}.past`).toBeTruthy()
    }
  })
})

describe('the smaller gaps', () => {
  it('a membership row opens the group\'s project', () => {
    /* It named a group and did nothing when tapped, in a panel where every
       other list row opens something. */
    const src = read('src/drawers/client/ClientDrawerSections.jsx')
    expect(src).toMatch(/g\?\.project_id \?/)
    expect(src).toMatch(/navigate\(buildRoute\(ROUTES\.PROJECT, \{ id: g\.project_id \}\)\)/)
    for (const lang of LOCALES) {
      expect(load(lang, 'clients').sections.openGroupAria, `${lang}.openGroupAria`).toMatch(/\{\{name\}\}/)
    }
  })

  it('the cascade dialog\'s destructive choice looks destructive', () => {
    /* Both pills wore the same terracotta fill, so "למחוק לקוחות" was
       indistinguishable at a glance from "להשאיר" — on the dialog whose
       only purpose is telling those two apart. */
    const src = read('src/modals/DeleteGroupModal.jsx')
    expect(src).toMatch(/\$\{!choices\[o\.key\] \? ' on danger' : ''\}/)
    expect(read('src/screens/project-detail/ProjectDetailScreen.css'))
      .toMatch(/\.dg-row-choice \.m-pill\.on\.danger/)
  })

  it('the group forms open the app\'s picker, not the OS wheel', () => {
    /* Every other add form had moved; these two were the pair left, so a
       GROUP's fixed day opened a different widget from a client's. */
    for (const rel of ['src/modals/AddGroupModal.jsx', 'src/modals/EditGroupModal.jsx']) {
      const src = read(rel)
      expect(src, rel).toMatch(/import SelectMenu from/)
      expect(src, rel).not.toMatch(/<select className="m-select" value=\{form\.recurring_day\}/)
    }
  })

  /* The member picker keeps its native <select>: it groups clients into
     "in this project" and "outside it" with <optgroup>, which SelectMenu
     has no equivalent for. Converting it would mean dropping the split —
     a worse trade than the widget being inconsistent, and worth stating
     so the next sweep does not "finish the job" by accident. */
  it('except the member picker, which needs option groups', () => {
    const src = read('src/modals/AddGroupMemberModal.jsx')
    expect(src).toMatch(/<optgroup label=\{t\('addGroupMember\.inProject'\)\}/)
    expect(src).not.toMatch(/import SelectMenu from/)
  })
})

describe('every locale carries the new vocabulary', () => {
  it('names the group grouping and the group count', () => {
    for (const lang of LOCALES) {
      const c = load(lang, 'clients')
      expect(c.groupBy.group, `${lang}.groupBy.group`).toBeTruthy()
      expect(c.groupBy.noGroup, `${lang}.groupBy.noGroup`).toBeTruthy()
      expect(c.card.groupCount_one, `${lang}.groupCount_one`).toBeTruthy()
      expect(c.card.groupCount_other, `${lang}.groupCount_other`).toBeTruthy()
    }
  })
})
