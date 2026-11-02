import { motion, useReducedMotion } from 'framer-motion'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShell } from '@/app/AppLayout'
import { Icon } from './ui/Icon'
import { cn } from '@/lib/utils'
import { isBidTrackerEnabled } from '@/modules/bid-tracker/enabled'
import { useCanReadAny } from '@/lib/permissions'
import { useNodeFilter } from '@/lib/rbacTree/access'
import { NAV_MODULES } from '@/lib/routeModules'
import { ROUTE_NODES } from '@/app/routeNodes'

interface RailItemProps {
  label: string
  icon: string
  active: boolean
  index: number
  onClick: () => void
  /** Only some entries set `aria-current` (Account Mapping / Commercial / Opportunity / Directory never did). */
  ariaCurrent?: boolean
}

/** Hover: the icon lifts, grows and gives a quick wiggle; the label nudges up. */
const ICON_VARIANTS = {
  rest: { y: 0, scale: 1, rotate: 0 },
  hover: { y: -3, scale: 1.18, rotate: [0, -12, 10, -6, 0], transition: { duration: 0.5, ease: 'easeOut' as const } },
}
const LABEL_VARIANTS = { rest: { y: 0 }, hover: { y: -1, transition: { duration: 0.2 } } }

/** One rail button. Motion: staggered slide-in when the rail first appears;
 *  hover wiggles the icon over a soft background wash; press squishes; the
 *  active state is a pill that slides between items (shared `layoutId`) while
 *  the newly active icon bounces. All of it is skipped under
 *  `prefers-reduced-motion`. */
function RailItem({ label, icon, active, index, onClick, ariaCurrent }: RailItemProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28, delay: reduce ? 0 : 0.05 + index * 0.045 }}
    >
      <motion.button
        type="button"
        onClick={onClick}
        title={label}
        data-active={active}
        aria-current={ariaCurrent && active ? 'page' : undefined}
        initial="rest"
        whileHover={reduce ? undefined : 'hover'}
        whileTap={reduce ? undefined : { scale: 0.92 }}
        className={cn(
          'group relative flex min-h-[48px] w-12 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 outline-none lg:w-14',
          'focus-visible:ring-2 focus-visible:ring-goms-sky',
          active ? 'text-goms-navy' : 'text-ink-600/70 hover:text-ink-900',
        )}
      >
        {/* Hover wash (inactive items only; the active pill covers it). */}
        {!active && (
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-white opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100"
          />
        )}
        {active && (
          <motion.span
            aria-hidden
            layoutId="rail-active-pill"
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }}
            className="absolute inset-0 rounded-xl bg-white shadow-sm ring-1 ring-line"
          >
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-goms-navy" />
          </motion.span>
        )}
        <motion.span variants={ICON_VARIANTS} className="relative">
          {/* Keyed on `active` so the icon bounces each time it becomes the current module. */}
          <motion.span
            key={String(active)}
            className="block"
            initial={reduce || !active ? false : { scale: 0.6, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 14 }}
          >
            <Icon name={icon} size={20} strokeWidth={active ? 2 : 1.6} />
          </motion.span>
        </motion.span>
        <motion.span variants={LABEL_VARIANTS} className="relative text-center text-[9px] font-medium leading-tight tracking-tight">
          {label}
        </motion.span>
      </motion.button>
    </motion.div>
  )
}

/** The app's persistent navigation element — a slim left rail with one button
 *  per top-level module (Account Mapping, Commercial Calculator — spec §5).
 *  Desktop only (`hidden lg:flex`): on a phone a permanent vertical rail is a
 *  desktop pattern that also ate ~15% of a 390px viewport, so below `lg` the
 *  same entries live inside `MobileNavDrawer` (the hamburger menu) instead.
 *  Account Mapping's active state comes from `navExpanded` (true whenever the
 *  route isn't Home or Commercial Calculator); Commercial Calculator's comes
 *  from the route directly, since `navExpanded` is specifically false there. */
export function AccountMappingRail() {
  const navigate = useNavigate()
  const location = useLocation()
  const { navExpanded } = useShell()
  const path = location.pathname
  // Each entry needs the server policy (A) AND the permission tree. Roles & Access lives in Settings → System settings.
  const tree = useNodeFilter()
  const canAccountMapping = useCanReadAny(NAV_MODULES.accountMapping) && tree('accountMapping')
  const canCommercial = useCanReadAny(NAV_MODULES.commercial) && tree('commercial')
  const canOpportunity = useCanReadAny(NAV_MODULES.opportunity) && tree('opportunity')
  const canTeams = useCanReadAny(NAV_MODULES.teams) && tree('teams')
  const canDirectory = useCanReadAny(NAV_MODULES.directory) && tree(ROUTE_NODES.directory)
  const directoryPath = canDirectory ? '/teams/directory' : '/teams'
  const canDocumentMaker = tree('documentMaker')
  const canEmail = tree('email')
  const canWhatsApp = tree(ROUTE_NODES.whatsapp)
  const canMarketing = tree(ROUTE_NODES.marketing)
  const canFinance = tree(ROUTE_NODES.finance)
  const canCalendar = tree(ROUTE_NODES.calendar)
  const canInsights = useCanReadAny(NAV_MODULES.insights) && tree('accountMapping.insights')

  const items: Omit<RailItemProps, 'index'>[] = [
    canAccountMapping && { label: 'Account Mapping', icon: 'Network', active: navExpanded, onClick: () => navigate('/map') },
    canCommercial && { label: 'Commercial Calculator', icon: 'Calculator', active: path.startsWith('/commercial-calculator'), onClick: () => navigate('/commercial-calculator') },
    isBidTrackerEnabled() && canOpportunity && { label: 'Opportunity', icon: 'Target', active: path.startsWith('/live-bids'), onClick: () => navigate('/live-bids') },
    // Personal files: open to every signed-in user (the API scopes each file to its owner).
    canDocumentMaker && { label: 'Document maker', icon: 'FileText', active: path.startsWith('/document-maker'), ariaCurrent: true, onClick: () => navigate('/document-maker') },
    canInsights && { label: 'Insights', icon: 'BarChart3', active: /^\/(insights|analytics)/.test(path), ariaCurrent: true, onClick: () => navigate('/insights') },
    canEmail && { label: 'E-mail', icon: 'Mail', active: path.startsWith('/email'), ariaCurrent: true, onClick: () => navigate('/email') },
    canWhatsApp && { label: 'WhatsApp', icon: 'MessageCircle', active: path.startsWith('/whatsapp'), ariaCurrent: true, onClick: () => navigate('/whatsapp') },
    canMarketing && { label: 'Marketing', icon: 'Megaphone', active: path.startsWith('/marketing'), ariaCurrent: true, onClick: () => navigate('/marketing') },
    canFinance && { label: 'Finance', icon: 'Landmark', active: path.startsWith('/finance'), ariaCurrent: true, onClick: () => navigate('/finance') },
    canCalendar && { label: 'Calendar', icon: 'CalendarDays', active: path.startsWith('/calendar'), ariaCurrent: true, onClick: () => navigate('/calendar') },
    (canTeams || canDirectory) && { label: 'Directory', icon: 'IdCard', active: path.startsWith('/teams'), onClick: () => navigate(directoryPath) },
  ].filter((item): item is Omit<RailItemProps, 'index'> => Boolean(item))

  return (
    <nav className="hidden w-14 shrink-0 flex-col items-center gap-1.5 border-r border-line bg-panel py-4 lg:flex lg:w-16">
      {items.map((item, index) => <RailItem key={item.label} index={index} {...item} />)}
    </nav>
  )
}
