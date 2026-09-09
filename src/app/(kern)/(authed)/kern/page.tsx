import React from 'react'

import KernManager from '@/components/kern/KernManager'
import { KernProvider } from '@/components/kern/KernProvider'

export default function KernPage() {
  return (
    <KernProvider>
      <KernManager />
    </KernProvider>
  )
}
