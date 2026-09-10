'use client'

// K 649-677 — the title list that populates every roster's Title dropdown.

import React, { useState } from 'react'

import { useKern } from '../KernProvider'

export default function TitlesView() {
  const { state, update, toast, confirmDialog } = useKern()
  const [draft, setDraft] = useState('')

  const add = (): void => {
    const val = draft.trim()
    if (!val) return
    // K 653 — case-insensitive duplicate check.
    if (state.titles.some((x) => x.toLowerCase() === val.toLowerCase())) {
      toast('Title already exists', true)
      return
    }
    update((d) => {
      d.titles = [...d.titles, val]
    })
    setDraft('')
    toast('Title added')
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          placeholder="New title…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button className="primary" onClick={add}>
          + Add title
        </button>
        <div className="grow" />
      </div>

      <div className="hint">
        These titles populate the Title dropdown in every branch roster. Add or edit the ones your
        team uses.
      </div>

      <div className="card">
        {!state.titles.length ? (
          <div className="empty">No titles yet. Add one above.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th style={{ width: 120 }}>In use</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {state.titles.map((name, i) => {
                // K 668 — live branches only.
                const used = state.branches
                  .filter((b) => !b.archived)
                  .reduce((n, b) => n + (b.roster || []).filter((e) => e.title === name).length, 0)
                return (
                  <tr key={`${name}-${i}`}>
                    <td>
                      <input
                        value={name}
                        onChange={(e) => {
                          const v = e.target.value
                          update((d) => {
                            d.titles = d.titles.map((t, j) => (j === i ? v : t))
                          })
                        }}
                      />
                    </td>
                    <td className="num">{used}</td>
                    <td className="actions">
                      <button
                        className="sm danger"
                        onClick={() =>
                          confirmDialog(
                            'Delete title?',
                            `“${name}” will be removed from the list (existing roster entries keep their text).`,
                            () =>
                              update((d) => {
                                d.titles = d.titles.filter((_, j) => j !== i)
                              }),
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
