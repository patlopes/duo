import {
  AirplaneTiltIcon,
  BankIcon,
  BookOpenIcon,
  CalendarBlankIcon,
  CarIcon,
  ChartLineUpIcon,
  DiamondIcon,
  DotsThreeIcon,
  ForkKnifeIcon,
  GiftIcon,
  HeartIcon,
  HouseIcon,
  KeyIcon,
  LaptopIcon,
  MoneyIcon,
  MopedIcon,
  PawPrintIcon,
  PiggyBankIcon,
  PopcornIcon,
  QuestionIcon,
  ReceiptIcon,
  RepeatIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  StarIcon,
  UserIcon,
  WalletIcon,
  type Icon,
} from '@phosphor-icons/react';

const ICONS: Record<string, Icon> = {
  house: HouseIcon,
  cart: ShoppingCartIcon,
  fork: ForkKnifeIcon,
  moped: MopedIcon,
  car: CarIcon,
  heart: HeartIcon,
  book: BookOpenIcon,
  popcorn: PopcornIcon,
  plane: AirplaneTiltIcon,
  repeat: RepeatIcon,
  bag: ShoppingBagIcon,
  paw: PawPrintIcon,
  gift: GiftIcon,
  user: UserIcon,
  receipt: ReceiptIcon,
  rings: DiamondIcon,
  key: KeyIcon,
  money: MoneyIcon,
  laptop: LaptopIcon,
  star: StarIcon,
  calendar: CalendarBlankIcon,
  chart: ChartLineUpIcon,
  dots: DotsThreeIcon,
  question: QuestionIcon,
  bank: BankIcon,
  wallet: WalletIcon,
  piggy: PiggyBankIcon,
};

export const ACCOUNT_ICONS = ['bank', 'wallet', 'piggy', 'chart', 'house'];
export const CATEGORY_ICONS = Object.keys(ICONS).filter((k) => k !== 'question' && k !== 'dots');

export function IconByName({ name, size = 20 }: { name: string; size?: number }) {
  const Component = ICONS[name] ?? QuestionIcon;
  return <Component size={size} weight="fill" aria-hidden="true" />;
}

/** The colored circle used for categories and accounts. White on the fill reads on every color. */
export function IconBubble({
  name,
  color,
  size = 38,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  return (
    <span
      className="icon-bubble"
      style={{ background: color, width: size, height: size }}
      aria-hidden="true"
    >
      <IconByName name={name} size={Math.round(size * 0.52)} />
    </span>
  );
}
