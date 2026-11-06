import { z } from 'zod';
import type { Data } from '../db/DataContext';
import { newId } from '../db/ops';
import { ENTITY_SCHEMAS } from '../schemas/entities';
import { ChangesetSchema } from './changeset';

export type AiTask = 'statement' | 'categorize' | 'budget' | 'goals' | 'free';

export const AI_TASKS: { id: AiTask; title: string; description: string; instruction: string }[] = [
  {
    id: 'statement',
    title: 'Lançar uma fatura ou extrato',
    description: 'Anexe o PDF ou print junto, na própria IA.',
    instruction:
      'Vou anexar uma fatura ou extrato. Crie uma operação "create" de transaction para cada linha. Use lookups para achar conta, cartão e categoria. Não crie o que já está em data.transactions.',
  },
  {
    id: 'categorize',
    title: 'Categorizar o que está sem categoria',
    description: 'A IA propõe e você revisa antes de aplicar.',
    instruction:
      'Encontre em data.transactions os lançamentos com categoryId null e proponha uma operação "update" para cada um, com a categoria mais provável de lookups.categories.',
  },
  {
    id: 'budget',
    title: 'Revisar meu orçamento do próximo mês',
    description: 'Com base nos gastos dos últimos meses.',
    instruction:
      'Analise data.transactions e data.budgets. Proponha operações de budget para o próximo mês, com month preenchido, e explique em summary o raciocínio. Seja realista com o histórico.',
  },
  {
    id: 'goals',
    title: 'Montar plano de aportes para os sonhos',
    description: 'Quanto cada um guarda por mês em cada sonho.',
    instruction:
      'Analise lookups.goals, data.goalMovements e data.incomes. Escreva em summary um plano de aportes mensais por membro, proporcional à renda. Só proponha operações se eu tiver pedido alguma alteração.',
  },
  {
    id: 'free',
    title: 'Pergunta livre',
    description: 'Escreva o que quer pedir.',
    instruction: '',
  },
];

/** Versioned with the app: the change-set engine and this text must always agree. */
const BASE_INSTRUCTIONS = `Você vai ajudar um casal com as finanças deles.

Responda SOMENTE com um único JSON no formato "duo-changeset", sem comentários e sem texto fora do JSON.

Regras:
- Dinheiro em centavos inteiros e positivos (R$ 12,34 é 1234). O campo "kind" define se é despesa ou receita.
- Datas em YYYY-MM-DD e mês em YYYY-MM.
- Use APENAS ids que existem em "lookups" ou "data". Nunca invente um id.
- Para criar registros, use ids temporários "tmp:1", "tmp:2"... no campo "tempId". Eles podem ser referenciados por outras operações do mesmo arquivo.
- Nunca apague: proponha "delete" só se o usuário pedir explicitamente.
- Lançamento: informe exatamente um entre "accountId" e "cardId".
- Cartão: deixe "invoiceMonth" como null para o app calcular a fatura.
- Parcelado: use o mesmo "installmentGroupId" temporário em N transações, com installmentNumber e installmentTotal.
- Compra de cartão e pagamento de fatura são coisas diferentes: pagamento de fatura é transfer com kind "invoice_payment", nunca uma despesa.
- Explique cada operação no campo "reason", em português.
- Se faltar informação, devolva "operations": [] e as dúvidas em "questions", em vez de chutar.

Formato:
{"format":"duo-changeset","schemaVersion":1,"basedOnExportId":"<exportId deste arquivo>","summary":"...","questions":[],"operations":[
 {"op":"create","entity":"transaction","tempId":"tmp:1","data":{"kind":"expense","amountCents":41235,"description":"Mercado","date":"2026-11-03","cardId":"...","invoiceMonth":null,"categoryId":"...","splitRule":"proportional","status":"paid"},"reason":"Linha 4 da fatura"},
 {"op":"update","entity":"transaction","id":"...","patch":{"categoryId":"..."},"reason":"iFood é Delivery"},
 {"op":"delete","entity":"transaction","id":"...","reason":"Duplicado, pedido pelo usuário"}
]}

Entidades aceitas em "entity": transaction, transfer, account, card, category, tag, budget, goal, goalItem, goalMovement, income, rule.`;

export function jsonSchemas() {
  return {
    changeset: z.toJSONSchema(ChangesetSchema, { unrepresentable: 'any' }),
    entities: {
      transaction: z.toJSONSchema(ENTITY_SCHEMAS.transactions, { unrepresentable: 'any' }),
      transfer: z.toJSONSchema(ENTITY_SCHEMAS.transfers, { unrepresentable: 'any' }),
      budget: z.toJSONSchema(ENTITY_SCHEMAS.budgets, { unrepresentable: 'any' }),
      goalMovement: z.toJSONSchema(ENTITY_SCHEMAS.goalMovements, { unrepresentable: 'any' }),
    },
  };
}

export interface AiPackageOptions {
  task: AiTask;
  months: string[];
  question?: string;
}

/** One self-explanatory file, because sharing a single file is what works well on a phone. */
export function buildAiPackage(data: Data, { task, months, question }: AiPackageOptions) {
  const taskInfo = AI_TASKS.find((t) => t.id === task)!;
  const request = task === 'free' ? (question ?? '').trim() : taskInfo.instruction;
  const instructions = `${request ? `PEDIDO DO USUÁRIO:\n${request}\n\n` : ''}${BASE_INSTRUCTIONS}`;
  const inScope = (month: string) => months.includes(month);
  const transactions = data.transactions.filter((t) => inScope(t.competenceMonth));
  const dates = transactions.map((t) => t.date).sort();

  return {
    format: 'duo-ai-export',
    schemaVersion: 1,
    exportId: newId(),
    exportedAt: new Date().toISOString(),
    scope: {
      months,
      entities: [
        'transactions',
        'transfers',
        'budgets',
        'goalMovements',
        'incomes',
        'categories',
        'accounts',
        'cards',
        'goals',
        'tags',
      ],
    },
    instructions,
    jsonSchema: jsonSchemas(),
    lookups: {
      members: data.members.map((m, i) => ({ id: m.id, name: m.name, code: i === 0 ? 'A' : 'B' })),
      categories: data.categories
        .filter((c) => !c.system && !c.archived)
        .map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          parentId: c.parentId,
          nature: c.nature,
          defaultSplitRule: c.defaultSplitRule,
        })),
      accounts: data.accounts
        .filter((a) => !a.archived)
        .map((a) => ({ id: a.id, name: a.name, type: a.type, ownerMemberId: a.ownerMemberId })),
      cards: data.cards
        .filter((c) => !c.archived)
        .map((c) => ({
          id: c.id,
          name: c.name,
          closingDay: c.closingDay,
          dueDay: c.dueDay,
          ownerMemberId: c.ownerMemberId,
        })),
      goals: data.goals.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        targetCents: g.targetCents,
        targetDate: g.targetDate,
        status: g.status,
      })),
      goalItems: data.goalItems.map((i) => ({
        id: i.id,
        goalId: i.goalId,
        name: i.name,
        budgetCents: i.budgetCents,
      })),
      tags: data.tags.map((t) => ({ id: t.id, name: t.name })),
    },
    data: {
      transactions,
      transfers: data.transfers.filter((t) => inScope(t.competenceMonth)),
      budgets: data.budgets.filter((b) => b.month === null || inScope(b.month)),
      goalMovements: data.goalMovements.filter((m) => inScope(m.competenceMonth)),
      incomes: data.incomes.filter((i) => inScope(i.competenceMonth)),
    },
    stats: {
      transactions: transactions.length,
      dateRange: dates.length ? [dates[0], dates[dates.length - 1]] : [],
    },
  };
}
