# Progresso

Patrick pediu para seguir sem parar por fase até o app estar funcional. O status abaixo separa o que foi testado aqui do que só o aparelho real confirma.

## Fases 0 a 5: prontas

- [x] **0 · Fundação:** PWA instalável, tema claro e escuro, tab bar, `/debug`, CI, orçamento de bundle
- [x] **1 · Núcleo:** contas, categorias, lançamentos, formulário com teclado próprio, lista virtualizada, Início
- [x] **2 · Cartões e repetições:** faturas derivadas, parcelas, pagar fatura, recorrências, contas a pagar, comprovante
- [x] **3 · Planejamento:** orçamentos, sonhos dos 3 tipos com checklist e celebração, relatórios, frase-resumo
- [x] **4 · Casal:** rendas, rateio, acerto, conta conjunta, fechar e reabrir mês, justiça, privacidade de gastos individuais
- [x] **5 · Dados e IA:** backup e restauração, pacote para IA, change-set com revisão e desfazer, saúde dos dados, OFX e CSV

## Fase 6: parcial

- [x] Onboarding, trava com PIN e Face ID, lembrete de backup, blocos reordenáveis, splash screens, badge
- [ ] **Assets finais:** o ícone é placeholder e os estados vazios usam ícones. Decidir a origem (`docs/ARTCRAFT.md`)
- [ ] **Checklist manual no iPhone:** instalar, offline, safe areas, teclado sobre sheets, swipe-back, share sheet, câmera, Face ID
- [ ] Desempenho em iPhone de 3 anos

## Fora, por ora

- [ ] Fase 7: sync entre os dois celulares
- [ ] Opcionais do spec: importador da planilha antiga e criptografia do IndexedDB

## Decisões a confirmar com o Patrick

- D-020: compras de cartão no acerto
- D-021: gasto de sonho fora do orçamento da casa
