import { describe, expect, test } from 'bun:test'

import {
  applyEmployeeImport,
  branchesCSV,
  employeesCSV,
  parseCSV,
  rosterCSV,
  toCSV,
} from '@/lib/kern/csv'
import { PNL_DEFAULTS, newBranch, normalize, seedState } from '@/lib/kern/normalize'
import type { OrgState, TyRoster } from '@/lib/kern/types'

const PROD = { '100': { '2026-01': [1000, 1] as [number, number] } }
const deps = () => ({ production: PROD })

describe('normalize', () => {
  test('an empty document gets every default', () => {
    const d = normalize({}, deps())
    expect(d.divisions).toEqual([])
    expect(d.areas).toEqual([])
    expect(d.titles.length).toBeGreaterThan(0)
    expect(d.pnl).toEqual(PNL_DEFAULTS)
    expect(d.production).toEqual(PROD)
    expect(d.prodExcluded).toEqual({})
  })

  test('it invents a super-division and reparents orphan divisions', () => {
    const d = normalize(
      { divisions: [{ id: 'd1', name: 'Red', manager: '', parentId: null }] },
      deps(),
    )
    expect(d.superDivisions).toHaveLength(1)
    expect(d.superDivisions[0].name).toBe('Matrix')
    expect(d.divisions[0].parentId).toBe(d.superDivisions[0].id)
  })

  test('a pre-roster branch has its roster synthesised from the flat lists', () => {
    const d = normalize(
      {
        branches: [
          {
            id: 'b1',
            orgid: '100',
            name: 'Alpha',
            manager: 'Boss',
            status: 'Active',
            regionPending: '',
            processors: ['P1'],
            loas: ['L1'],
          } as unknown as OrgState['branches'][number],
        ],
      },
      deps(),
    )
    const roster = d.branches[0].roster
    expect(roster.map((e) => [e.name, e.title])).toEqual([
      ['Boss', 'Branch Manager'],
      ['P1', 'Processor'],
      ['L1', 'Loan Officer Assistant'],
    ])
  })

  test('an existing roster is left alone', () => {
    const d = normalize(
      {
        branches: [
          {
            id: 'b1',
            orgid: '100',
            name: 'A',
            manager: 'Boss',
            status: '',
            regionPending: '',
            processors: ['P1'],
            loas: [],
            servicedBy: [],
            roster: [],
            areaId: null,
            regionId: null,
            divisionId: null,
            archived: false,
          },
        ],
      },
      deps(),
    )
    expect(d.branches[0].roster).toEqual([])
  })

  test('junk branches — no name AND no numeric orgid — are dropped', () => {
    const mk = (p: Record<string, unknown>) =>
      ({
        processors: [],
        loas: [],
        servicedBy: [],
        roster: [],
        ...p,
      }) as unknown as OrgState['branches'][number]
    const d = normalize(
      {
        branches: [
          mk({ id: '1', name: '  ', orgid: 'xx' }), // junk
          mk({ id: '2', name: '', orgid: '100' }), // numeric orgid — kept
          mk({ id: '3', name: 'Named', orgid: '' }), // named — kept
        ],
      },
      deps(),
    )
    expect(d.branches.map((b) => b.id)).toEqual(['2', '3'])
  })

  test('division tagging runs once and sets the flag', () => {
    const base = () => ({
      divisions: [
        { id: 'red', name: 'Matrix Red', manager: '', parentId: 'sd' },
        { id: 'blue', name: 'Matrix Blue', manager: '', parentId: 'sd' },
      ],
      superDivisions: [{ id: 'sd', name: 'Matrix', manager: '' }],
      branches: [
        {
          id: 'b1',
          orgid: '1',
          name: 'Smukalla',
          manager: '',
          status: '',
          regionPending: '',
          processors: [],
          loas: [],
          servicedBy: [],
          roster: [],
          areaId: null,
          regionId: null,
          divisionId: null,
          archived: false,
        },
        {
          id: 'b2',
          orgid: '2',
          name: 'Other',
          manager: '',
          status: '',
          regionPending: '',
          processors: [],
          loas: [],
          servicedBy: [],
          roster: [],
          areaId: null,
          regionId: null,
          divisionId: null,
          archived: false,
        },
      ],
    })
    const d = normalize(base(), deps())
    expect(d.branches[0].divisionId).toBe('red')
    expect(d.branches[1].divisionId).toBe('blue')
    expect(d._divTagsApplied).toBe(true)

    // Re-running must not re-tag a branch the user has since moved.
    d.branches[0].divisionId = 'blue'
    const again = normalize(d, deps())
    expect(again.branches[0].divisionId).toBe('blue')
  })

  test('the TYROSTER import adds branches and people, deduped, once', () => {
    const roster: TyRoster = {
      branches: [{ orgid: '900', name: 'New Branch' }],
      people: [
        { orgid: '900', name: 'Jane Doe', email: 'jane@x.com', mgr: 'Ty' },
        { orgid: '900', name: 'JANE DOE', email: '' }, // dup by name
        { orgid: '900', name: 'Other', email: 'JANE@X.COM' }, // dup by email
        { orgid: '404', name: 'Nowhere' }, // no such branch
      ],
    }
    const d = normalize({}, { production: PROD, tyRoster: roster })
    expect(d.branches.map((b) => b.orgid)).toEqual(['900'])
    expect(d.branches[0].roster.map((e) => e.name)).toEqual(['Jane Doe'])
    expect(d._tyRosterImported).toBe(true)

    // Idempotent: a second pass adds nothing.
    const again = normalize(d, { production: PROD, tyRoster: roster })
    expect(again.branches[0].roster).toHaveLength(1)
    expect(again.branches).toHaveLength(1)
  })

  test('pnl defaults fill gaps without overwriting stored values', () => {
    const d = normalize({ pnl: { procFee: 800 } as OrgState['pnl'] }, deps())
    expect(d.pnl.procFee).toBe(800)
    expect(d.pnl.loaBps).toBe(PNL_DEFAULTS.loaBps)
  })

  test('the bundled seed normalizes into a usable document', () => {
    const d = normalize(seedState(), deps())
    expect(d.branches.length).toBeGreaterThan(0)
    expect(d.superDivisions.length).toBeGreaterThan(0)
    d.branches.forEach((b) => {
      expect(Array.isArray(b.roster)).toBe(true)
      expect(typeof b.archived).toBe('boolean')
    })
  })

  test('newBranch is complete', () => {
    const b = newBranch()
    expect(b.archived).toBe(false)
    expect(b.roster).toEqual([])
    expect(b.status).toBe('Active')
  })
})

describe('CSV', () => {
  test('parseCSV handles quotes, doubled quotes and CRLF', () => {
    expect(parseCSV('a,b\r\nc,"d,e"\n"f""g",h')).toEqual([
      ['a', 'b'],
      ['c', 'd,e'],
      ['f"g', 'h'],
    ])
  })

  test('toCSV quotes only what needs it', () =>
    expect(toCSV([['plain', 'has,comma', 'has"quote', 'has\nnewline']])).toBe(
      'plain,"has,comma","has""quote","has\nnewline"',
    ))

  test('parse → serialize round trip', () => {
    const rows = [
      ['Branch', 'Name'],
      ['Al, Inc', 'Jane "J" Doe'],
    ]
    expect(parseCSV(toCSV(rows))).toEqual(rows)
  })

  const s = (): OrgState =>
    normalize(
      {
        branches: [
          {
            id: 'b1',
            orgid: '100',
            name: 'Alpha',
            manager: 'Boss',
            status: 'Active',
            regionPending: '',
            processors: [],
            loas: [],
            servicedBy: ['Svc'],
            roster: [
              {
                id: 'e1',
                name: 'Jane',
                title: 'Processor',
                email: 'j@x.com',
                phone: '',
                notes: '',
              },
            ],
            areaId: null,
            regionId: null,
            divisionId: null,
            archived: false,
          },
          {
            id: 'b2',
            orgid: '200',
            name: 'Hidden',
            manager: '',
            status: '',
            regionPending: '',
            processors: [],
            loas: [],
            servicedBy: [],
            roster: [],
            areaId: null,
            regionId: null,
            divisionId: null,
            archived: true,
          },
        ],
      },
      deps(),
    )

  test('exports skip archived branches', () => {
    expect(branchesCSV(s()).length).toBe(2) // header + Alpha
    expect(employeesCSV(s()).length).toBe(2) // header + Jane
    expect(rosterCSV(s()).length).toBe(2)
  })

  test('employee import matches on branch name or orgid, case-insensitively', () => {
    const st = s()
    const res = applyEmployeeImport(
      st,
      parseCSV(
        'Branch,Name,Title,Email,Phone\nALPHA,Ann,Chief Vibes Officer,a@x.com,555\n100,Bob,Processor,b@x.com,\n',
      ),
    )
    expect(res.added).toBe(2)
    expect(res.unmatched).toEqual([])
    expect(res.branches[0].roster.map((e) => e.name)).toEqual(['Jane', 'Ann', 'Bob'])
    // A title the list doesn't know is reported so the caller can add it;
    // 'Processor' is already a seed title, so it is not reported again.
    expect(res.titles).toEqual(['Chief Vibes Officer'])
  })

  test('unmatched branches are reported, not silently dropped', () => {
    const res = applyEmployeeImport(
      s(),
      parseCSV('Branch,Name\nNope,Ann\nAlso Nope,Bob\nAlpha,Cy\n'),
    )
    expect(res.added).toBe(1)
    expect(res.unmatched).toEqual(['Nope', 'Also Nope'])
  })

  test('a headerless file falls back to positional columns', () => {
    const res = applyEmployeeImport(s(), parseCSV('Alpha,Ann,Closer,a@x.com,555\n'))
    expect(res.added).toBe(1)
    expect(res.branches[0].roster.at(-1)).toMatchObject({
      name: 'Ann',
      title: 'Closer',
      email: 'a@x.com',
      phone: '555',
    })
  })

  test('rows without a branch or a name are skipped', () => {
    const res = applyEmployeeImport(s(), parseCSV('Branch,Name\nAlpha,\n,Bob\n'))
    expect(res.added).toBe(0)
    expect(res.unmatched).toEqual([])
  })

  test('applyEmployeeImport is pure — the input state is untouched', () => {
    const st = s()
    const before = JSON.stringify(st)
    applyEmployeeImport(st, parseCSV('Branch,Name\nAlpha,Ann\n'))
    expect(JSON.stringify(st)).toBe(before)
  })
})
