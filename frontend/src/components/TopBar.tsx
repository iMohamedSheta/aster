import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays, CalendarPlus, ChevronDown, FolderOpen, Info, Plus, ReceiptText, Search, Stethoscope, UserPlus,
} from 'lucide-react'
import { shortDay } from '../lib/format'
import { translate } from '../lib/i18n'
import type { Patient } from '../lib/types'
import { Button, Dropdown, MenuItem } from './ui'
import { PatientDialog } from './PatientDialog'
import { AppointmentDialog } from './AppointmentDialog'
import { VisitDialog } from './VisitDialog'
import { InvoiceDialog } from './BillingDialogs'
import { PatientFileDialog } from './PatientFileDialog'
import { PageGuideSheet } from './PageGuide'
import { UpdateIndicator } from './UpdateDialog'

type QuickPanel = 'patient' | 'appointment' | 'visit' | 'invoice' | 'document' | null

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const navigate = useNavigate()
  const [panel, setPanel] = useState<QuickPanel>(null)
  const [createdPatient, setCreatedPatient] = useState<Patient | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <>
      <div className="no-print flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-surface px-6 xl:px-8">
        <button
          onClick={onSearch}
          className="group flex h-9 w-[330px] items-center gap-2.5 rounded-lg border border-line-strong bg-canvas px-3 text-start transition hover:border-accent-400 hover:bg-elevated"
        >
          <Search size={14} className="text-accent-600 transition group-hover:text-accent-500" />
          <span className="flex-1 truncate text-[11.5px] text-faint">Search patients, visits, invoices…</span>
          <kbd className="rounded-[4px] border border-line-strong bg-elevated px-1.5 py-0.5 font-mono text-[9px] font-medium text-faint">Ctrl K</kbd>
        </button>

        <div className="flex-1" />

        <span className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted lg:flex">
          <CalendarDays size={13} className="text-accent-600" />
          <span className="font-mono normal-case tracking-normal">{shortDay(new Date())}</span>
        </span>

        <UpdateIndicator />

        <button
          type="button"
          onClick={() => setGuideOpen(true)}
          title={translate('About this page')}
          aria-label={translate('About this page')}
          className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11px] font-medium text-muted transition hover:border-accent-400 hover:bg-elevated hover:text-ink"
        >
          <Info size={14} className="text-accent-600" />
          <span className="hidden xl:inline">Guide</span>
        </button>

        <div className="mx-1.5 hidden h-5 w-px bg-line lg:block" />

        <Dropdown
          align="right"
          trigger={(
            <Button variant="copper" size="md">
              <Plus size={14} /> New <ChevronDown size={11} className="opacity-70" />
            </Button>
          )}
        >
          <div className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-faint">Quick add</div>
          <MenuItem icon={<UserPlus size={14} />} onClick={() => setPanel('patient')}>Register a patient</MenuItem>
          <MenuItem icon={<CalendarPlus size={14} />} onClick={() => setPanel('appointment')}>Book an appointment</MenuItem>
          <MenuItem icon={<Stethoscope size={14} />} onClick={() => setPanel('visit')}>Start a visit</MenuItem>
          <MenuItem icon={<ReceiptText size={14} />} onClick={() => setPanel('invoice')}>Create an invoice</MenuItem>
          <MenuItem icon={<FolderOpen size={14} />} onClick={() => setPanel('document')}>Add a document</MenuItem>
        </Dropdown>
      </div>

      <PatientDialog
        open={panel === 'patient'}
        onClose={() => setPanel(null)}
        onSaved={(p) => {
          setCreatedPatient(p)
          navigate(`/patients/${p.id}`)
        }}
      />
      <AppointmentDialog
        open={panel === 'appointment'}
        onClose={() => setPanel(null)}
        defaultPatient={createdPatient}
      />
      <VisitDialog open={panel === 'visit'} onClose={() => setPanel(null)} />
      <InvoiceDialog open={panel === 'invoice'} onClose={() => setPanel(null)} />
      <PatientFileDialog open={panel === 'document'} onClose={() => setPanel(null)} />
      <PageGuideSheet open={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  )
}
