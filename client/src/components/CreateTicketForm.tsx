import { useRef, useState, type FormEvent } from 'react';
import { createTicketSchema, type FieldErrors } from '../../../shared/tickets.js';
import { api, ApiError, errorMessage } from '../api.js';
import { Icon } from './Icon.js';
import type { ZodError } from 'zod';

function fieldErrors(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const name = issue.path[0];
    if ((name === 'title' || name === 'description') && !fields[name]) fields[name] = issue.message;
  }
  return fields;
}

export function CreateTicketForm({ onCreated }: { onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitting = useRef(false);
  const creationKeys = useRef(new Map<string, string>());
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  function changeField(name: 'title' | 'description', value: string) {
    const values = { title, description, [name]: value };
    if (name === 'title') setTitle(value);
    else setDescription(value);
    if (submitted) {
      const result = createTicketSchema.safeParse(values);
      setErrors(result.success ? {} : fieldErrors(result.error));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setSubmitted(true);
    setError(null);
    const result = createTicketSchema.safeParse({ title, description });
    if (!result.success) {
      const fields = fieldErrors(result.error);
      setErrors(fields);
      if (fields.title) titleRef.current?.focus();
      else descriptionRef.current?.focus();
      return;
    }
    setErrors({});
    const payload = JSON.stringify(result.data);
    let idempotencyKey = creationKeys.current.get(payload);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      creationKeys.current.set(payload, idempotencyKey);
    }
    submitting.current = true;
    setPending(true);
    try {
      const { ticket } = await api.create(result.data, idempotencyKey);
      setTitle('');
      setDescription('');
      setSubmitted(false);
      creationKeys.current.clear();
      onCreated(ticket.id);
    } catch (cause) {
      setError(errorMessage(cause));
      if (cause instanceof ApiError && cause.fields) setErrors(cause.fields);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <aside className="panel create-panel" aria-labelledby="create-heading">
      <div className="panel-heading">
        <div><h2 id="create-heading">פנייה חדשה</h2><p>איך אפשר לעזור?</p></div>
      </div>
      <form onSubmit={submit} noValidate className="create-form">
        <div className="field">
          <label htmlFor="ticket-title">כותרת <span className="required" aria-hidden="true">*</span></label>
          <input ref={titleRef} id="ticket-title" placeholder="בקצרה, במה הפנייה עוסקת?" value={title} required
            disabled={pending} aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : 'title-hint'}
            onChange={(e) => changeField('title', e.target.value)} />
          {errors.title ? <p className="field-error" id="title-error" role="alert">{errors.title}</p>
            : <p className="field-hint" id="title-hint"><bdi>3–100</bdi> תווים</p>}
        </div>
        <div className="field">
          <div className="label-line"><label htmlFor="ticket-description">תיאור</label><span>אופציונלי</span></div>
          <textarea ref={descriptionRef} id="ticket-description" placeholder="פרטים נוספים שיעזרו לנו לטפל בפנייה..." rows={6}
            value={description} disabled={pending} aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'description-error' : 'description-hint'}
            onChange={(e) => changeField('description', e.target.value)} />
          {errors.description ? <p className="field-error" id="description-error" role="alert">{errors.description}</p>
            : <p className="field-hint counter" id="description-hint"><span>עד 2,000 תווים</span><bdi>{description.length.toLocaleString('he-IL')} / 2,000</bdi></p>}
        </div>
        <p className="new-status-note"><span className="status-dot" />פנייה חדשה תיפתח בסטטוס ״פתוחה״</p>
        {error && <div className="error-banner" role="alert"><Icon name="error" /><p>{error}</p></div>}
        <button type="submit" className="button button-primary create-button" disabled={pending}>
          {pending ? <span className="spinner" /> : <Icon name="plus" />}{pending ? 'יוצר פנייה…' : 'צור פנייה'}
        </button>
      </form>
    </aside>
  );
}
