'use client'

// One question of the New Hire Details form: label, help, the control, and an
// optional trailing note. Extracted from RequestForm (S2 350–387 renderField /
// renderControl) so the public request form at /apply renders the exact same
// controls — base wage, bonuses, radios, dollar formatting — from one place.
// The markup is unchanged: `.fld[data-fid]`, `label.q`, `.qn`, `.req`, `.help`.

import React from 'react'

import { DOLLAR_FIELD_IDS } from '@/lib/offers/schema'
import type { FieldDef, OfferData } from '@/lib/offers/types'

import BaseWageField from './BaseWageField'
import BonusField from './BonusField'
import RadioField from './RadioField'

export interface FieldBlockProps {
  field: FieldDef
  data: OfferData
  /** Highlight as a required field left empty (after a save/send attempt). */
  missing?: boolean
  onChange: (id: string, value: string) => void
  onDollarBlur: (id: string) => void
  onClearFields: (ids: string[]) => void
  /** Rendered after the control — RequestForm's "claimed row" note. */
  extra?: React.ReactNode
}

export default function FieldBlock({
  field: f,
  data,
  missing,
  onChange,
  onDollarBlur,
  onClearFields,
  extra,
}: FieldBlockProps): React.JSX.Element {
  const cls = 'fld' + (missing ? ' missing' : '')
  const value = data[f.id] || ''

  if (f.type === 'bonus' || f.type === 'base') {
    return (
      <div className={cls} data-fid={f.id}>
        <label className="q">
          <span className="qn">{f.q}.</span>
          {f.label}
        </label>
        <span className="help">{f.help || ''}</span>
        {f.type === 'bonus' ? (
          <BonusField
            field={f}
            data={data}
            onChange={onChange}
            onDollarBlur={onDollarBlur}
            onClearFields={onClearFields}
          />
        ) : (
          <BaseWageField field={f} data={data} onChange={onChange} onDollarBlur={onDollarBlur} />
        )}
        {extra}
      </div>
    )
  }

  let control: React.ReactNode
  if (f.type === 'textarea') {
    control = <textarea value={value} onChange={(e) => onChange(f.id, e.target.value)} />
  } else if (f.type === 'radio' || f.type === 'radio_other') {
    control = <RadioField field={f} value={value} onChange={(v) => onChange(f.id, v)} />
  } else {
    const inputType: 'text' | 'email' | 'tel' | 'date' =
      f.type === 'email' || f.type === 'tel' || f.type === 'date' ? f.type : 'text'
    control = (
      <input
        type={inputType}
        value={value}
        onChange={(e) => onChange(f.id, e.target.value)}
        onBlur={DOLLAR_FIELD_IDS.includes(f.id) ? () => onDollarBlur(f.id) : undefined}
      />
    )
  }

  return (
    <div className={cls} data-fid={f.id}>
      <label className="q">
        <span className="qn">{f.q}.</span>
        {f.label}
        {f.req && <span className="req">*</span>}
      </label>
      {f.help && <span className="help">{f.help}</span>}
      {control}
      {extra}
    </div>
  )
}
