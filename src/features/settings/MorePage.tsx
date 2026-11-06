import {
  BankIcon,
  CalculatorIcon,
  CaretRightIcon,
  ChartBarIcon,
  CoinsIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileArrowDownIcon,
  GearIcon,
  HandshakeIcon,
  LightbulbIcon,
  ListChecksIcon,
  RobotIcon,
  ShareNetworkIcon,
  StethoscopeIcon,
  TagIcon,
  UploadSimpleIcon,
  type Icon,
} from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { BRAND } from '../../brand';
import { useData } from '../../db/DataContext';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Mascot } from '../../ui/Mascot';

interface Item {
  to: string;
  title: string;
  sub?: string;
  Icon: Icon;
  color: string;
}

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: 'O que importa',
    items: [
      {
        to: '/tabs/more/salaries',
        title: 'Salários',
        sub: 'Renda de cada um e aumentos',
        Icon: CoinsIcon,
        color: '#1baf7a',
      },
      {
        to: '/tabs/more/simulator',
        title: 'Simulador',
        sub: 'E se tiver um aumento? E se comprar?',
        Icon: CalculatorIcon,
        color: '#6250d6',
      },
      {
        to: '/tabs/more/share',
        title: 'Compartilhar',
        sub: 'Mantenham os dois celulares em dia',
        Icon: ShareNetworkIcon,
        color: '#e87ba4',
      },
      {
        to: '/tabs/more/couple',
        title: 'Acerto do mês',
        sub: 'Quem pagou a mais e fechar o mês',
        Icon: HandshakeIcon,
        color: '#eb6834',
      },
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      {
        to: '/tabs/more/accounts',
        title: 'Contas',
        sub: 'Conjunta e pessoais',
        Icon: BankIcon,
        color: '#2a78d6',
      },
      { to: '/tabs/more/cards', title: 'Cartões', Icon: CreditCardIcon, color: '#6e2f6b' },
      { to: '/tabs/more/reports', title: 'Relatórios', Icon: ChartBarIcon, color: '#eda100' },
    ],
  },
  {
    label: 'Organização',
    items: [
      { to: '/tabs/more/categories', title: 'Categorias', Icon: TagIcon, color: '#1baf7a' },
      {
        to: '/tabs/more/rules',
        title: 'Regras automáticas',
        Icon: LightbulbIcon,
        color: '#eda100',
      },
      {
        to: '/tabs/more/incomes',
        title: 'Outras rendas',
        sub: '13º, bônus e freelas',
        Icon: ListChecksIcon,
        color: '#2a78d6',
      },
    ],
  },
  {
    label: 'Seus dados',
    items: [
      { to: '/tabs/more/backup', title: 'Backup', Icon: DatabaseIcon, color: '#6250d6' },
      { to: '/tabs/more/ai', title: 'Pedir para uma IA', Icon: RobotIcon, color: '#e87ba4' },
      {
        to: '/tabs/more/import',
        title: 'Importar extrato',
        Icon: UploadSimpleIcon,
        color: '#2a78d6',
      },
      {
        to: '/tabs/more/history',
        title: 'Histórico de importações',
        Icon: FileArrowDownIcon,
        color: '#eb6834',
      },
      {
        to: '/tabs/more/health',
        title: 'Saúde dos dados',
        Icon: StethoscopeIcon,
        color: '#e34948',
      },
    ],
  },
  {
    label: 'App',
    items: [
      { to: '/tabs/more/settings', title: 'Ajustes', Icon: GearIcon, color: '#8e8a86' },
      {
        to: '/install',
        title: 'Como instalar no celular',
        Icon: FileArrowDownIcon,
        color: '#1baf7a',
      },
      { to: '/debug', title: 'Diagnóstico do aparelho', Icon: StethoscopeIcon, color: '#8e8a86' },
    ],
  },
];

export default function MorePage() {
  const { settings } = useData();
  return (
    <LargeTitlePage title="Mais">
      <div className="page-pad">
        {GROUPS.map((group, g) => (
          <div key={group.label} className="rise" style={{ ['--i' as string]: g }}>
            <p className="group-label">{group.label}</p>
            <div className="card-list">
              {group.items.map(({ to, title, sub, Icon: ItemIcon, color }) => (
                <Link key={to} className="nav-row" to={to}>
                  <span className="tile" style={{ background: color }} aria-hidden="true">
                    <ItemIcon size={20} weight="fill" />
                  </span>
                  <span className="row-main">
                    <span className="nav-title">{title}</span>
                    {sub && <span className="nav-sub">{sub}</span>}
                  </span>
                  <CaretRightIcon size={14} className="muted" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </div>
        ))}
        {settings.mascots && (
          <div
            className="mascot-onboarding"
            style={{ marginTop: 'var(--space-6)', marginBottom: 0 }}
          >
            <Mascot animal="giraffe" size={70} idle />
            <Mascot animal="monkey" size={62} idle delay={0.6} />
          </div>
        )}
        <p className="small muted center" style={{ margin: 'var(--space-2) 0 var(--space-7)' }}>
          {BRAND.name} · versão {__BUILD_ID__}
        </p>
      </div>
    </LargeTitlePage>
  );
}
