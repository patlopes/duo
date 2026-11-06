import { IonItem, IonLabel } from '@ionic/react';
import { BRAND } from '../../brand';
import { GroupedList } from '../../ui/GroupedList';
import { LargeTitlePage } from '../../ui/LargeTitlePage';

function NavItem({ to, children }: { to: string; children: string }) {
  return (
    <IonItem routerLink={to} detail>
      <IonLabel>{children}</IonLabel>
    </IonItem>
  );
}

export default function MorePage() {
  return (
    <LargeTitlePage title="Mais">
      <GroupedList title="Dinheiro">
        <NavItem to="/tabs/more/accounts">Contas</NavItem>
        <NavItem to="/tabs/more/cards">Cartões</NavItem>
        <NavItem to="/tabs/more/reports">Relatórios</NavItem>
      </GroupedList>
      <GroupedList title="Casal">
        <NavItem to="/tabs/more/couple">Acerto do mês</NavItem>
        <NavItem to="/tabs/more/incomes">Rendas</NavItem>
      </GroupedList>
      <GroupedList title="Organização">
        <NavItem to="/tabs/more/categories">Categorias</NavItem>
        <NavItem to="/tabs/more/rules">Regras automáticas</NavItem>
      </GroupedList>
      <GroupedList title="Seus dados">
        <NavItem to="/tabs/more/ai">Pedir para uma IA</NavItem>
        <NavItem to="/tabs/more/import">Importar extrato</NavItem>
        <NavItem to="/tabs/more/backup">Backup</NavItem>
        <NavItem to="/tabs/more/history">Histórico de importações</NavItem>
        <NavItem to="/tabs/more/health">Saúde dos dados</NavItem>
      </GroupedList>
      <GroupedList title="App">
        <NavItem to="/tabs/more/settings">Ajustes</NavItem>
        <NavItem to="/install">Como instalar no celular</NavItem>
        <NavItem to="/debug">Diagnóstico do aparelho</NavItem>
      </GroupedList>
      <p className="small muted center" style={{ margin: 'var(--space-4) 0 var(--space-7)' }}>
        {BRAND.name} · versão {__BUILD_ID__}
      </p>
    </LargeTitlePage>
  );
}
