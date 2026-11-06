import { createDatabase, readSettings, type DuoDatabase } from '../db/database';
import {
  bootstrap,
  createTransaction,
  ensureJointAccount,
  softDelete,
  updateSettings,
  upsert,
  type TransactionDraft,
} from '../db/ops';
import type { Member } from '../schemas/entities';
import {
  applySync,
  buildSyncPayload,
  decodePayload,
  encodePayload,
  previewSync,
} from './coupleSync';

let phoneA: DuoDatabase;
let phoneB: DuoDatabase;

const live = async (d: DuoDatabase) => (await d.transactions.toArray()).filter((t) => !t.deletedAt);

async function bill(d: DuoDatabase, description: string, over: Partial<TransactionDraft> = {}) {
  const joint = await ensureJointAccount(d);
  const category = (await d.categories.toArray()).find((c) => c.name === 'Moradia')!;
  return createTransaction(
    {
      kind: 'expense',
      amountCents: 100_000,
      description,
      date: '2026-11-05',
      accountId: joint.id,
      cardId: null,
      categoryId: category.id,
      tagIds: [],
      status: 'pending',
      notes: '',
      payerMemberId: null,
      splitRule: 'proportional',
      goalId: null,
      goalItemId: null,
      ...over,
    },
    d,
    '2026-11-06',
  );
}

async function send(from: DuoDatabase) {
  return decodePayload(await encodePayload(await buildSyncPayload(from)));
}

beforeEach(async () => {
  phoneA = createDatabase(`a-${crypto.randomUUID()}`);
  phoneB = createDatabase(`b-${crypto.randomUUID()}`);
  await bootstrap(phoneA);
  await new Promise((r) => setTimeout(r, 5));
  await bootstrap(phoneB);
  const household = (await phoneA.households.toCollection().first())!;
  const b = (await phoneA.members.get(household.memberIds[1]))!;
  await upsert<Member>('members', { ...b, name: 'Bia' }, phoneA);
});

afterEach(async () => {
  await phoneA.delete();
  await phoneB.delete();
});

describe('compartilhar entre os dois celulares', () => {
  it('ida e volta pelo texto compactado', async () => {
    await bill(phoneA, 'Aluguel');
    const text = await encodePayload(await buildSyncPayload(phoneA));
    expect(text.startsWith('MEUBEM1:')).toBe(true);
    const decoded = await decodePayload(`Olha aí: ${text} !`);
    expect(decoded.tables.transactions).toHaveLength(1);
  });

  it('recusa texto errado ou cortado', async () => {
    await expect(decodePayload('oi')).rejects.toThrow('Copie a mensagem inteira');
    await expect(decodePayload('MEUBEM1:abc')).rejects.toThrow('cortada');
  });

  it('celular novo entra na casa e vê as contas', async () => {
    await bill(phoneA, 'Aluguel');
    const payload = await send(phoneA);
    const preview = await previewSync(payload, phoneB);
    expect(preview.sameHousehold).toBe(false);
    expect(preview.theirNames[1]).toBe('Bia');
    expect(preview.localHasData).toBe(false);

    await applySync(payload, 1, phoneB);
    expect((await live(phoneB)).map((t) => t.description)).toEqual(['Aluguel']);
    const a = await phoneA.households.toCollection().first();
    const b = await phoneB.households.toCollection().first();
    expect(b!.id).toBe(a!.id);
    expect((await readSettings(phoneB)).deviceMemberIndex).toBe(1);
    expect((await phoneB.members.toArray()).map((m) => m.name)).toContain('Bia');
    expect((await phoneB.categories.toArray()).filter((c) => c.name === 'Moradia')).toHaveLength(1);
  });

  it('quem já tinha lançado mantém as contas, sem duplicar conjunta nem categorias', async () => {
    await bill(phoneA, 'Aluguel');
    await bill(phoneB, 'Internet');
    await applySync(await send(phoneA), 1, phoneB);

    expect((await live(phoneB)).map((t) => t.description).sort()).toEqual(['Aluguel', 'Internet']);
    const joints = (await phoneB.accounts.toArray()).filter((x) => x.type === 'joint');
    expect(joints).toHaveLength(1);
    const internet = (await live(phoneB)).find((t) => t.description === 'Internet')!;
    expect(internet.accountId).toBe(joints[0]!.id);
    const moradia = (await phoneB.categories.toArray()).filter((c) => c.name === 'Moradia');
    expect(moradia).toHaveLength(1);
    expect(internet.categoryId).toBe(moradia[0]!.id);
    expect(internet.householdId).toBe((await phoneB.households.toCollection().first())!.id);
  });

  it('depois de juntos, a volta também funciona e os dois convergem', async () => {
    await bill(phoneA, 'Aluguel');
    await bill(phoneB, 'Internet');
    await applySync(await send(phoneA), 1, phoneB);
    await applySync(await send(phoneB), 0, phoneA);
    const names = async (d: DuoDatabase) => (await live(d)).map((t) => t.description).sort();
    expect(await names(phoneA)).toEqual(['Aluguel', 'Internet']);
    expect(await names(phoneB)).toEqual(['Aluguel', 'Internet']);
    const preview = await previewSync(await send(phoneA), phoneB);
    expect(preview.sameHousehold).toBe(true);
    expect(preview.newer).toBe(0);
  });

  it('vence a edição mais recente, e exclusões viajam', async () => {
    const [id] = await bill(phoneA, 'Aluguel');
    const [other] = await bill(phoneA, 'Luz');
    await applySync(await send(phoneA), 1, phoneB);

    await phoneA.transactions.update(id!, {
      amountCents: 111,
      updatedAt: '2030-01-01T00:00:00.000Z',
    });
    await phoneB.transactions.update(id!, {
      amountCents: 222,
      updatedAt: '2029-01-01T00:00:00.000Z',
    });
    await softDelete('transactions', other!, phoneB);

    await applySync(await send(phoneB), 0, phoneA);
    expect((await phoneA.transactions.get(id!))!.amountCents).toBe(111);
    expect((await live(phoneA)).map((t) => t.description)).toEqual(['Aluguel']);
    await applySync(await send(phoneA), 1, phoneB);
    expect((await phoneB.transactions.get(id!))!.amountCents).toBe(111);
  });

  it('gasto individual não sai do celular', async () => {
    await bill(phoneA, 'Aluguel');
    await bill(phoneA, 'Bala', { splitRule: 'memberA' });
    const payload = await buildSyncPayload(phoneA);
    expect(payload.tables.transactions!.map((t) => t.description)).toEqual(['Aluguel']);
  });

  it('quem era pessoa 1 no próprio celular vira a pessoa certa e as regras acompanham', async () => {
    await bill(phoneA, 'Aluguel');
    await bill(phoneB, 'Bala', { splitRule: 'memberA' });
    await updateSettings({ deviceMemberIndex: 0 }, phoneB);
    await applySync(await send(phoneA), 1, phoneB);
    const bala = (await live(phoneB)).find((t) => t.description === 'Bala')!;
    expect(bala.splitRule).toBe('memberB');
  });

  it('recorrência gerada em cada lado não duplica', async () => {
    await bill(phoneA, 'Aluguel', {
      repeat: { mode: 'recurring', frequency: 'monthly', endDate: null },
    });
    await applySync(await send(phoneA), 1, phoneB);
    const count = (await live(phoneA)).length;
    await applySync(await send(phoneB), 0, phoneA);
    expect(await live(phoneA)).toHaveLength(count);
  });
});
