import type { TicketListResponse, TicketStatus } from '../../../shared/tickets.js';
import { Icon } from './Icon.js';
import { StatusSelect } from './StatusSelect.js';

const dateFormat = new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jerusalem' });
const fullDateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });

interface Props {
  data: TicketListResponse | null;
  loading: boolean;
  error: string | null;
  page: number;
  filtered: boolean;
  updating: Record<number, TicketStatus>;
  rowErrors: Record<number, string>;
  onRetry: () => void;
  onPage: (page: number) => void;
  onStatusChange: (id: number, status: TicketStatus, version: number) => void;
}

export function TicketList({ data, loading, error, page, filtered, updating, rowErrors, onRetry, onPage, onStatusChange }: Props) {
  const total = data?.pagination.total ?? 0;
  const totalPages = data?.pagination.totalPages ?? 1;
  return (
    <section className="panel list-panel" aria-labelledby="list-heading">
      <div className="panel-heading list-heading">
        <div><div className="title-line"><h2 id="list-heading">{filtered ? 'תוצאות החיפוש' : 'כל הפניות'}</h2>
          {!loading && !error && <span className="count-badge">{total.toLocaleString('he-IL')}</span>}</div>
          <p>צפייה, מעקב ועדכון סטטוס הפניות</p></div>
      </div>

      <div className="list-content" aria-busy={loading}>
        {loading ? <div className="list-state" role="status"><span className="spinner spinner-large" /><p>טוען פניות…</p></div>
          : error ? <div className="list-state error-state" role="alert"><span className="state-icon"><Icon name="error" /></span>
            <h3>לא הצלחנו לטעון את הפניות</h3><p>{error}</p><button className="button button-secondary" onClick={onRetry}>נסה שוב</button></div>
          : !data?.tickets.length ? <div className="list-state" role="status"><span className="state-icon"><Icon name="inbox" /></span>
            <h3>לא נמצאו פניות</h3><p>{filtered ? 'אפשר לנסות חיפוש אחר או לבחור סטטוס שונה.' : 'אפשר ליצור את הפנייה הראשונה בטופס.'}</p></div>
          : <><p className="table-scroll-hint">לצפייה בתאריך ובסטטוס, גללו את הטבלה לצדדים.</p>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="טבלת פניות, ניתנת לגלילה אופקית"><table>
            <caption className="sr-only">פניות שירות, עמוד {page} מתוך {totalPages}</caption>
            <thead><tr><th scope="col">מספר פניה</th><th scope="col">כותרת</th><th scope="col">תאריך יצירה</th><th scope="col">סטטוס</th></tr></thead>
            <tbody>{data.tickets.map((ticket) => {
              const pending = updating[ticket.id] !== undefined;
              const rowError = rowErrors[ticket.id];
              return <tr key={ticket.id}>
                <td className="ticket-id"><bdi>{ticket.id}</bdi></td>
                <td className="ticket-copy"><span className="ticket-title">{ticket.title}</span>
                  <p className="ticket-description" title={ticket.description || undefined}>{ticket.description || '—'}</p></td>
                <td className="ticket-date"><time dateTime={ticket.created_at} title={fullDateFormat.format(new Date(ticket.created_at))}>{dateFormat.format(new Date(ticket.created_at))}</time></td>
                <td className="ticket-status">
                  <StatusSelect label={`סטטוס פנייה ${ticket.id}`} value={updating[ticket.id] ?? ticket.status}
                    disabled={pending} onChange={(status) => { if (status) onStatusChange(ticket.id, status, ticket.version); }}
                    errorId={rowError ? `status-error-${ticket.id}` : undefined} />
                  {pending && <span className="row-saving" role="status">שומר…</span>}
                  {rowError && <p id={`status-error-${ticket.id}`} className="field-error" role="alert">{rowError}</p>}
                </td>
              </tr>;
            })}</tbody>
          </table></div></>}
      </div>

      <nav className="pagination" aria-label="דפדוף בפניות">
        <button className="button button-secondary" disabled={loading || !!error || page <= 1} onClick={() => onPage(page - 1)}>הקודם</button>
        <span aria-live="polite" aria-atomic="true">{!loading && !error ? <>עמוד <strong>{page}</strong> מתוך <strong>{totalPages}</strong></> : `עמוד ${page}`}</span>
        <button className="button button-secondary" disabled={loading || !!error || page >= totalPages} onClick={() => onPage(page + 1)}>הבא</button>
      </nav>
    </section>
  );
}
