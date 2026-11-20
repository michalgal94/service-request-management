import { useRef, useState } from 'react';
import type { TicketStatus } from '../../shared/tickets.js';
import { api, ApiError, errorMessage } from './api.js';
import { CreateTicketForm } from './components/CreateTicketForm.js';
import { Icon } from './components/Icon.js';
import { SearchBar } from './components/SearchBar.js';
import { TicketList } from './components/TicketList.js';
import { useTickets } from './hooks/useTickets.js';

export function App() {
  const tickets = useTickets();
  const [searchKey, setSearchKey] = useState(0);
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState('');
  const [updating, setUpdating] = useState<Record<number, TicketStatus>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const pendingIds = useRef(new Set<number>());

  async function updateStatus(id: number, status: TicketStatus, version: number) {
    if (pendingIds.current.has(id)) return;
    pendingIds.current.add(id);
    setUpdating((previous) => ({ ...previous, [id]: status }));
    setRowErrors((previous) => { const next = { ...previous }; delete next[id]; return next; });
    setSuccess('');
    setConflict('');
    try {
      await api.updateStatus(id, status, version);
      tickets.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_CONFLICT') {
        setConflict(`פנייה ${id} עודכנה בינתיים על ידי משתמש אחר. הרשימה רועננה; בדקו את המצב העדכני ונסו שוב.`);
        tickets.refresh();
      } else {
        setRowErrors((previous) => ({ ...previous, [id]: errorMessage(error) }));
      }
    } finally {
      pendingIds.current.delete(id);
      setUpdating((previous) => { const next = { ...previous }; delete next[id]; return next; });
    }
  }

  function created(id: number) {
    tickets.reset();
    setSearchKey((key) => key + 1);
    setSuccess(`פנייה ${id} נוצרה בהצלחה.`);
    setConflict('');
  }

  return (
    <>
      <a className="skip-link" href="#main">דלג לתוכן</a>
      <header className="topbar"><div className="topbar-inner"><span className="brand-icon"><Icon name="service" /></span>
        <span className="brand-name">מוקד שירות</span><span className="brand-divider" /><span className="brand-section">ניהול פניות</span></div></header>
      <main id="main" className="workspace">
        <div className="page-heading"><div className="eyebrow">ניהול ומעקב</div><h1>פניות שירות</h1><p>כל הפניות במקום אחד, מהפתיחה ועד לסיום הטיפול.</p></div>
        <SearchBar key={searchKey} onSearch={(filters) => { setSuccess(''); setConflict(''); tickets.search(filters); }} />
        <div className="success-region">
          {success && <div className="success-banner" role="status"><Icon name="check" /><span>{success}</span></div>}
          {conflict && <div className="error-banner" role="alert"><Icon name="error" /><p>{conflict}</p></div>}
        </div>
        <div className="content-grid">
          <CreateTicketForm onCreated={created} />
          <TicketList data={tickets.data} loading={tickets.loading} error={tickets.error} page={tickets.page}
            filtered={!!(tickets.filters.q || tickets.filters.status)} updating={updating} rowErrors={rowErrors}
            onRetry={tickets.refresh} onPage={tickets.goToPage} onStatusChange={updateStatus} />
        </div>
        <footer className="page-footer"><Icon name="service" /><span>שירות טוב מתחיל בהקשבה.</span></footer>
      </main>
    </>
  );
}
