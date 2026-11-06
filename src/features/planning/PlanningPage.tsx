import { TargetIcon } from '@phosphor-icons/react';
import { EmptyState } from '../../ui/EmptyState';
import { LargeTitlePage } from '../../ui/LargeTitlePage';

export function PlanningPage() {
  return (
    <LargeTitlePage title="Planejamento">
      <EmptyState
        icon={<TargetIcon />}
        title="Orçamentos e sonhos moram aqui"
        description="Este espaço ganha vida na Fase 3."
      />
    </LargeTitlePage>
  );
}
