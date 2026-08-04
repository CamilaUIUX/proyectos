import type { Metadata } from 'next'
import AuthProvider from '@/app/components/AuthProvider'

export const metadata: Metadata = {
  title: 'Daily',
  description: 'Daily standup report generator',
}

export default function DailyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`
        /* Microanimaciones de 150-250 ms: desplazamientos mínimos, sin rebotes ni escala
           llamativa. El movimiento solo confirma el cambio, nunca decora. */
        @keyframes daily-in {
          from { opacity: 0; transform: translateY(-3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes daily-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-3px); }
        }
        @keyframes daily-overlay-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes daily-modal-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .daily-in      { animation: daily-in  0.16s ease both; }
        .daily-out     { animation: daily-out 0.16s ease both; }
        .daily-overlay { animation: daily-overlay-in 0.15s ease both; }
        .daily-modal   { animation: daily-modal-in 0.2s cubic-bezier(0.2, 0, 0, 1) both; }
      `}</style>
      <AuthProvider>{children}</AuthProvider>
    </>
  )
}
