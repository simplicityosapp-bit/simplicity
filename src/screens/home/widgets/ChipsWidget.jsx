import { useMemo, useState } from 'react'
import { ClipboardList, Wallet, Users } from 'lucide-react'
import { homeChips, getTileFilters } from '../../../lib/homeData'
import { useClients } from '../../../hooks/useClients'
import { useGroups } from '../../../hooks/useGroups'
import { useProjects } from '../../../hooks/useProjects'
import { useTasks } from '../../../hooks/useTasks'
import { useTransactions } from '../../../hooks/useTransactions'
import { useCategories } from '../../../hooks/useCategories'
import { useUserPreferences } from '../../../hooks/useUserPreferences'
import InfoPopover from '../../../components/InfoPopover'
import TileDrillModal from '../../../modals/TileDrillModal'
import i18n from '../../../i18n'
import { useT } from '../../../i18n/useT'

/* Bottom data chips — RTL order: משימות · נטו · לקוחות. Tap opens
   a drill-down modal where the user picks filters (status, time
   range, priorities, etc.). The number above the label updates live
   from the filters. "פתיחה במלא ←" inside the modal still routes
   to the corresponding screen for full management. */
export default function ChipsWidget() {
  const { t } = useT('home')
  const { clients } = useClients()
  const { groups } = useGroups()
  const { projects } = useProjects()
  const { tasks } = useTasks()
  const { transactions } = useTransactions()
  const { categories } = useCategories()
  const { prefs, update: updatePrefs } = useUserPreferences()
  const [openTile, setOpenTile] = useState(null)

  const filters = useMemo(() => getTileFilters(prefs), [prefs])
  const summary = useMemo(
    () => homeChips(new Date(), { clients, tasks, transactions }, filters),
    [clients, tasks, transactions, filters],
  )
  const numLocale = i18n.language === 'he' ? 'he-IL' : (i18n.language || 'he-IL')
  const netStr = `${summary.net < 0 ? '−' : ''}${Math.round(Math.abs(summary.net)).toLocaleString(numLocale)} ₪`
  /* Long amounts overflowed the narrow mobile chip and ran over the wallet
     icon (beta feedback 03/06/2026) — step the font down as the string grows
     so the number always fits inside the card. */
  const netSizeCls = netStr.length >= 11 ? ' h-stat-num-xlong' : netStr.length >= 8 ? ' h-stat-num-long' : ''
  /* Label mirrors the selected net type so it stays truthful when the drill
     filter is income/expense-only — same mapping as NetPanel (beta 11/06/2026). */
  const netLbl = filters.net?.type === 'income' ? t('widgets.chips.income') : filters.net?.type === 'expense' ? t('widgets.chips.expense') : t('widgets.chips.net')

  /* The tile is a `<div role="button">` instead of a real <button> because
     it contains the InfoPopover trigger (which is itself a <button>) —
     nested <button>s break hydration and aren't valid HTML. Keyboard
     activation is preserved via the Enter/Space handler. */
  const onTileKey = (fn) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
  }
  return (
    <>
      <div className="h-chips">
        <div role="button" tabIndex={0} className="h-stat" onClick={() => setOpenTile('tasks')} onKeyDown={onTileKey(() => setOpenTile('tasks'))}>
          <ClipboardList size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
          <span className="h-stat-num mono">{summary.openTasks}</span>
          <span className="h-stat-lbl">
            {t('widgets.chips.tasks')}
            <InfoPopover label={t('widgets.chips.tasksInfoLabel')} text={t('widgets.chips.tasksInfoText_pre') + t('widgets.chips.tasksInfoText_post')} placement="top" />
          </span>
        </div>
        <div role="button" tabIndex={0} className="h-stat" onClick={() => setOpenTile('net')} onKeyDown={onTileKey(() => setOpenTile('net'))}>
          <Wallet size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
          <span className={`h-stat-num mono${netSizeCls}`}>{netStr}</span>
          <span className="h-stat-lbl">
            {netLbl}
            <InfoPopover label={t('widgets.chips.netInfoLabel')} text={t('widgets.chips.netInfoText_pre') + t('widgets.chips.netInfoText_post')} placement="top" />
          </span>
        </div>
        <div role="button" tabIndex={0} className="h-stat" onClick={() => setOpenTile('clients')} onKeyDown={onTileKey(() => setOpenTile('clients'))}>
          <Users size={18} strokeWidth={1.5} className="h-stat-icon" aria-hidden="true" />
          <span className="h-stat-num mono">{summary.activeClients}</span>
          <span className="h-stat-lbl">
            {t('widgets.chips.clients')}
            <InfoPopover label={t('widgets.chips.clientsInfoLabel')} text={t('widgets.chips.clientsInfoText_pre') + t('widgets.chips.clientsInfoText_post')} placement="top" />
          </span>
        </div>
      </div>

      <TileDrillModal
        key={openTile}
        open={!!openTile}
        tile={openTile}
        onClose={() => setOpenTile(null)}
        prefs={prefs}
        updatePrefs={updatePrefs}
        clients={clients}
        groups={groups}
        projects={projects}
        categories={categories}
        tasks={tasks}
        transactions={transactions}
        netSummary={summary}
      />
    </>
  )
}
