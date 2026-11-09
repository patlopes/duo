import { useData } from '../../db/DataContext';
import { Mascot } from '../../ui/Mascot';
import { GoogleButton } from './GoogleButton';
import { useSheetState } from './sheetSession';

/** Where an invitation link lands: one button between the person and the couple's data. */
export function InviteGate() {
  const { settings } = useData();
  const invite = useSheetState((s) => s.invite);
  const clearInvite = useSheetState((s) => s.clearInvite);
  if (!invite || invite === settings.googleSheetId) return null;
  return (
    <div className="onboarding invite-gate" role="dialog" aria-modal="true" aria-label="Convite">
      <div className="onboarding-body">
        <div className="rise">
          <div className="mascot-onboarding">
            <Mascot animal="giraffe" idle />
            <Mascot animal="monkey" idle delay={0.7} />
          </div>
          <h1>Você foi convidado</h1>
          <p>Entre com o Gmail que recebeu o convite e vocês passam a ver as mesmas contas.</p>
        </div>
      </div>
      <GoogleButton codeHint />
      <button
        type="button"
        className="link-button"
        style={{ marginTop: 'var(--space-3)' }}
        onClick={clearInvite}
      >
        Agora não
      </button>
    </div>
  );
}
