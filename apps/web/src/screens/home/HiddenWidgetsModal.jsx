import { Plus } from 'lucide-react'
import Modal from '../../modals/Modal'
import { useT } from '../../i18n/useT'
import { Box, Txt, Btn } from '../../components/ui'

/* Where hidden widgets go, and the only way back.
   Hiding one with the ✕ has to be reversible from the same screen — otherwise
   the ✕ is a one-way door and the widget is gone as far as the user can tell.
   Reached from the edit bar, which is the only place it is relevant. */
export default function HiddenWidgetsModal({ open, onClose, hidden = [], onRestore }) {
  const { t } = useT('home')
  return (
    <Modal open={open} onClose={onClose} title={t('edit.hiddenTitle')}>
      {hidden.length === 0 ? (
        <Txt as="p" className="h-card-empty">{t('edit.hiddenEmpty')}</Txt>
      ) : (
        <Box className="home-hidden-list">
          {hidden.map((w) => (
            <Btn
              key={w.id}
              type="button"
              className="home-hidden-row"
              onClick={() => onRestore(w.id)}
            >
              <Txt className="home-hidden-name">{t(`edit.names.${w.id}`)}</Txt>
              <Txt className="home-hidden-add" aria-hidden="true">
                <Plus size={15} strokeWidth={2} />
              </Txt>
            </Btn>
          ))}
        </Box>
      )}
    </Modal>
  )
}
