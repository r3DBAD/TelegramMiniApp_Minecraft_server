import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

export function EmptyState({ icon, title, children }: EmptyStateProps) {
  return (
    <main className="shell centered">
      <section className="empty-state">
        {icon}
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
