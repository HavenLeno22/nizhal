// Asks before a shared link replaces the home already saved on this phone.
import { useT } from '../i18n';

export function SharedPrompt(props: { onOpen: () => void; onKeep: () => void }) {
  const t = useT();
  return (
    <div className="sharedprompt" role="alertdialog" aria-labelledby="shared-title" aria-describedby="shared-body">
      <p className="sharedprompt__title" id="shared-title">
        {t.shared.title}
      </p>
      <p id="shared-body">{t.shared.body}</p>
      <div className="sharedprompt__actions">
        <button type="button" className="button" onClick={props.onKeep} autoFocus>
          {t.shared.keep}
        </button>
        <button type="button" className="button button--quiet" onClick={props.onOpen}>
          {t.shared.open}
        </button>
      </div>
    </div>
  );
}
