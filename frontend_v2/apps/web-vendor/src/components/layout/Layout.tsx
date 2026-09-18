import { useState } from 'react';
import type { ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

/**
 * Grid app shell: one viewport-tall grid with an auto header row and a `1fr`
 * body row. The `1fr` gives `main` a definite height, so page bodies can use
 * `h-full` without anyone computing `100vh - chrome`.
 */
export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="grid h-dvh grid-rows-[auto_1fr] overflow-hidden bg-gray-50">
      <Header onMenuClick={() => setSidebarOpen((open) => !open)} />
      <div className="relative flex min-h-0">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}
        <main className="min-h-0 w-full flex-1 overflow-y-auto p-4 lg:w-auto lg:p-6">{children}</main>
      </div>
    </div>
  );
}
