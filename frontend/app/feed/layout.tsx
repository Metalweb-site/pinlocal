import AppShell from '@/components/shared/AppShell'
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
