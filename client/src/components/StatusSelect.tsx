import { statusLabels, ticketStatuses, type TicketStatus } from '../../../shared/tickets.js';
import { Icon } from './Icon.js';

interface Props {
  id?: string;
  label: string;
  value: TicketStatus | '';
  onChange: (value: TicketStatus | '') => void;
  allowAll?: boolean;
  disabled?: boolean;
  errorId?: string;
}

export function StatusSelect({ id, label, value, onChange, allowAll, disabled, errorId }: Props) {
  return (
    <div className={`select-wrap ${allowAll ? '' : `status-select status-${value}`}`}>
      <select id={id} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as TicketStatus | '')}
        disabled={disabled} aria-busy={disabled || undefined} aria-describedby={errorId}>
        {allowAll && <option value="">כל הסטטוסים</option>}
        {ticketStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
      </select>
      <Icon name="chevron" />
    </div>
  );
}
