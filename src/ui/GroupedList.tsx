import { IonList } from '@ionic/react';
import type { ReactNode } from 'react';
import styles from './GroupedList.module.css';

interface GroupedListProps {
  title?: string;
  children: ReactNode;
}

/** The iOS grouped list: a small label sits above the card, not inside it. */
export function GroupedList({ title, children }: GroupedListProps) {
  return (
    <section className={styles.group}>
      {title && <h2 className={styles.title}>{title}</h2>}
      <IonList inset className={styles.list}>
        {children}
      </IonList>
    </section>
  );
}
