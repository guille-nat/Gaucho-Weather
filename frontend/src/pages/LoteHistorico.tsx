import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import type { HistoryDay, HistoryHour, Level, LoteHistory } from '../api/types';
import { FormAlert, SelectField, TextField } from '../components/Field';
import { Icon, type IconName } from '../components/Icon';
import {
  DASH,
  TIME_ZONE,
  formatHour,
  formatKmh,
  formatMm,
  formatPct,
  formatTemp,
  windFrom,
} from '../lib/format';
import { useLote, useLoteHistory } from '../query/hooks';

/** The first day the API keeps (backend/apps/archiver/history.py FIRST_DAY). */
const FIRST_DAY = '2021-01-01';
const PRESETS = [7, 30] as const;
const STILL_LOADING =
  'Todavía estamos cargando el historial de este lote. Probá de nuevo en unos minutos.';

interface Range {
  from: string;
  to: string;
}

/** Today in Argentina as YYYY-MM-DD, like the server's `timezone.localdate()`. */
const isoToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date());

const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const lastDays = (today: string, days: number): Range => ({
  from: addDays(today, 1 - days),
  to: today,
});

const weekdayShort = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const weekdayLong = new Intl.DateTimeFormat('es-AR', { weekday: 'long', timeZone: 'UTC' });
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** `Dom 15/11` (or `Domingo 15/11` when `long`): a calendar date, no time zone shift. */
function dayLabel(iso: string, long = false) {
  const at = new Date(`${iso}T12:00:00Z`);
  const weekday = (long ? weekdayLong : weekdayShort).format(at).replace('.', '');
  return `${capitalise(weekday)} ${at.getUTCDate()}/${at.getUTCMonth() + 1}`;
}

const temp = (celsius: number | null) => (celsius === null ? DASH : formatTemp(celsius));

const SPRAY: Record<Level | 'none', { label: string; icon: IconName }> = {
  ok: { label: 'Apto', icon: 'check' },
  caution: { label: 'Con cuidado', icon: 'alert' },
  critical: { label: 'No apto', icon: 'alertCircle' },
  none: { label: 'Sin dato', icon: 'info' },
};

/** The spray wind range of an hour: icon and word, never colour alone. */
function SprayChip({ level }: { level: Level | null }) {
  const key = level ?? 'none';
  return (
    <span className={`level level--${key}`}>
      <Icon name={SPRAY[key].icon} size={16} strokeWidth={2.6} />
      {SPRAY[key].label}
    </span>
  );
}

function DailyTable({ days }: { days: HistoryDay[] }) {
  const titleId = useId();
  return (
    <section className="panel hist-days" aria-labelledby={titleId}>
      <h2 id={titleId} className="panel-title">
        Resumen diario
      </h2>
      <div className="hist-scroll" tabIndex={0} role="group" aria-labelledby={titleId}>
        <table className="hist-table" aria-labelledby={titleId}>
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Máx</th>
              <th scope="col">Mín</th>
              <th scope="col">Lluvia</th>
              <th scope="col">Viento máx</th>
              <th scope="col">Ráfaga máx</th>
              <th scope="col">Humedad mín</th>
              <th scope="col">Delta T máx</th>
              <th scope="col">Horas con inversión</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <th scope="row">{dayLabel(day.date)}</th>
                <td>{temp(day.temp_max_c)}</td>
                <td>{temp(day.temp_min_c)}</td>
                <td>{formatMm(day.rain_mm)}</td>
                <td>{formatKmh(day.wind_max_kmh)}</td>
                <td>{formatKmh(day.gust_max_kmh)}</td>
                <td>{formatPct(day.humidity_min_pct)}</td>
                <td>{temp(day.delta_t_max_c)}</td>
                <td>{day.inversion_hours === null ? DASH : `${day.inversion_hours} h`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WindDirection({ degrees }: { degrees: number | null }) {
  const from = windFrom(degrees);
  return (
    <span className="hist-dir">
      {degrees === null ? null : (
        // The arrow points where the wind goes: it comes from `degrees`.
        <Icon
          name="arrowUp"
          size={18}
          strokeWidth={2.6}
          style={{ rotate: `${(degrees + 180) % 360}deg` }}
        />
      )}
      <span>{from ?? DASH}</span>
    </span>
  );
}

/** Warmer at 80 m than at 2 m: icon and word, never colour alone. */
function InversionMark({ inversion }: { inversion: boolean | null }) {
  if (inversion === null) return DASH;
  return inversion ? (
    <span className="level level--caution">
      <Icon name="alert" size={16} strokeWidth={2.6} />
      Hay inversión
    </span>
  ) : (
    <span className="level level--ok">
      <Icon name="check" size={16} strokeWidth={2.6} />
      Sin inversión
    </span>
  );
}

function HourItem({ hour }: { hour: HistoryHour }) {
  const causes = hour.spray_wind_causes.join(', ');
  const facts: [string, ReactNode][] = [
    ['Viento', formatKmh(hour.wind_kmh)],
    ['Ráfaga', formatKmh(hour.gust_kmh)],
    ['Dirección', <WindDirection degrees={hour.wind_dir_deg} />],
    ['Humedad', formatPct(hour.humidity_pct)],
    ['Delta T', temp(hour.delta_t_c)],
    ['Inversión térmica', <InversionMark inversion={hour.inversion} />],
    ['Temperatura', temp(hour.temperature_c)],
    ['Lluvia', formatMm(hour.rain_mm)],
  ];
  return (
    <li className="hist-hour">
      <div className="hist-hour-head">
        <span className="hist-hour-time">{formatHour(hour.time)}</span>
        <SprayChip level={hour.spray_wind} />
      </div>
      {causes ? <p className="hist-hour-causes">{capitalise(causes)}</p> : null}
      <dl className="hist-hour-facts">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

/** The latest day with stored hours: usually today or yesterday, what an applicator records. */
const defaultDay = (days: HistoryDay[]) =>
  [...days].reverse().find((d) => d.hours > 0)?.date ?? days.at(-1)?.date ?? '';

function WindHours({ history }: { history: LoteHistory }) {
  const titleId = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const day =
    chosen && history.days.some((d) => d.date === chosen) ? chosen : defaultDay(history.days);
  const hours = history.hours.filter((h) => h.time.slice(0, 10) === day);
  return (
    <section className="panel hist-wind" aria-labelledby={titleId}>
      <h2 id={titleId} className="panel-title">
        Viento hora por hora
      </h2>
      <p className="fine hist-lead">
        Para el registro de cada aplicación: viento a 10 m y si estaba en el rango para pulverizar.
      </p>
      <p className="fine hist-lead">
        Delta T: temperatura menos bulbo húmedo; entre 2 y 8 °C la gota no se evapora de más.
        Inversión térmica: más calor a 80 m que a 2 m; el aire queda quieto y la deriva llega lejos.
      </p>
      <SelectField label="Día" value={day} onChange={(e) => setChosen(e.target.value)}>
        {history.days.map((d) => (
          <option key={d.date} value={d.date}>
            {dayLabel(d.date, true)}
          </option>
        ))}
      </SelectField>
      {hours.length ? (
        <ol
          className="hist-hour-list"
          aria-label={`Viento hora por hora del ${dayLabel(day, true)}`}
        >
          {hours.map((hour) => (
            <HourItem key={hour.time} hour={hour} />
          ))}
        </ol>
      ) : (
        <p className="fine">Todavía no hay horas guardadas de este día.</p>
      )}
    </section>
  );
}

function RangePicker({
  today,
  range,
  onChange,
}: {
  today: string;
  range: Range;
  onChange: (range: Range) => void;
}) {
  const [draft, setDraft] = useState(range);
  const choose = (next: Range) => {
    setDraft(next);
    onChange(next);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onChange(draft);
  };
  return (
    <section className="panel hist-range" aria-label="Período">
      <div className="segmented" role="group" aria-label="Períodos rápidos">
        {PRESETS.map((days) => {
          const preset = lastDays(today, days);
          const active = preset.from === range.from && preset.to === range.to;
          return (
            <button
              key={days}
              type="button"
              className="segmented-option"
              aria-pressed={active}
              onClick={() => choose(preset)}
            >
              Últimos {days} días
            </button>
          );
        })}
      </div>
      {/* The server owns the rules (31 days at most, from 2021): its message is shown as is. */}
      <form className="hist-dates" noValidate onSubmit={submit}>
        <TextField
          label="Desde"
          type="date"
          min={FIRST_DAY}
          max={today}
          value={draft.from}
          onChange={(e) => setDraft({ ...draft, from: e.target.value })}
        />
        <TextField
          label="Hasta"
          type="date"
          min={FIRST_DAY}
          max={today}
          value={draft.to}
          onChange={(e) => setDraft({ ...draft, to: e.target.value })}
        />
        <button type="submit" className="btn btn--light hist-dates-submit">
          Ver período
        </button>
      </form>
    </section>
  );
}

/** S9, S10: daily summaries and the hourly wind of a lote, for its owner and their applicators. */
export function LoteHistorico() {
  const id = Number(useParams().id);
  const lote = useLote(id);
  const [today] = useState(isoToday);
  const [range, setRange] = useState(() => lastDays(today, 7));
  const history = useLoteHistory(id, range.from, range.to);

  const error = history.error instanceof ApiError ? history.error : null;
  const notFound = lote.isError || error?.status === 404;
  const back = (
    <Link className="back-link" to={`/lotes/${id}`}>
      <Icon name="chevronLeft" strokeWidth={2.6} />
      {lote.data?.name ?? 'Lote'}
    </Link>
  );

  if (notFound) {
    return (
      <div className="page">
        <Link className="back-link" to="/lotes">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <p className="notice">
          {lote.error && lote.error.message !== 'No encontrado.'
            ? lote.error.message
            : 'No encontramos ese lote.'}
        </p>
      </div>
    );
  }

  const data = history.data;
  return (
    <div className="page page-history">
      <header className="page-head">
        {back}
        <h1 className="page-title">Histórico de clima y viento</h1>
        {lote.data?.establishment ? (
          <p className="page-head-meta">{lote.data.establishment}</p>
        ) : null}
      </header>

      <RangePicker today={today} range={range} onChange={setRange} />

      <div className="hist-body">
        {error?.status === 400 ? (
          <FormAlert message={error.message} />
        ) : history.isError ? (
          <div className="notice notice--error" role="alert">
            <Icon name="alertCircle" />
            <p>{history.error.message}</p>
            <button type="button" className="btn btn--light" onClick={() => void history.refetch()}>
              <Icon name="refresh" />
              Reintentar
            </button>
          </div>
        ) : null}

        {data && !history.isError ? (
          <>
            {data.complete ? null : (
              <div className="notice" role="status">
                <Icon name="clock" />
                <p>{STILL_LOADING}</p>
              </div>
            )}
            <DailyTable days={data.days} />
            <WindHours history={data} />
            <p className="fine hist-attribution">
              <Icon name="info" size={18} />
              <span>{data.attribution}</span>
            </p>
          </>
        ) : history.isPending ? (
          <p className="notice" aria-live="polite">
            Cargando el historial…
          </p>
        ) : null}
      </div>
    </div>
  );
}
