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

## Virada: as contas do casal

- [x] Salários que entram sozinhos no dia do pagamento, com aumento agendado
- [x] Início: renda somada, quanto precisam pagar, quanto sobra, divisão pela renda ou metade, quando transferir para a conjunta
- [x] Contas fixas, contas futuras e parcelas num formulário só; aba Futuro com 12 meses
- [x] Simulador e projeção de 6 meses
- [x] Compartilhar por mensagem entre os dois celulares
- [x] Girafa e macaquinho, animações, tocar no gráfico abre o resumo
- [x] Navegação testada com toques reais (`e2e/navigation.spec.ts`)
- [x] Atualização detectada em segundos, com botão em Ajustes
- [x] Planilha do casal: criar, convidar, sincronizar sozinho, juntar (`src/io/sheetSync.ts`)
- [ ] Chave do Google Picker, para quem foi convidado abrir a planilha
- [ ] Testar no iPhone: login, renovação depois de 1 hora, Picker, atualização com o app instalado

## Fora, por ora

- [ ] Fase 7: sync entre os dois celulares
- [ ] Opcionais do spec: importador da planilha antiga e criptografia do IndexedDB

## Decisões a confirmar com o Patrick

- D-020: compras de cartão no acerto
- D-021: gasto de sonho fora do orçamento da casa
