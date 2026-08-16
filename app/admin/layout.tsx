import type { Metadata } from 'next'
import { AdminGate } from '@/app/components/AdminGate'

export const metadata: Metadata = {
  title: 'Admin',
  description: 'Panel de administración',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGate>{children}</AdminGate>
}
