import { useId, useState, type ReactNode } from 'react';
import type { Forecast, ForecastDay, Level, Sky } from '../api/types';
import {
  DECISION_TITLE,
  fieldVerdict,
  HONEST_LINE,
  keepUnits,
  LEVEL_LABEL,
  type DecisionKey,
} from '../lib/decisions';
import {
  DASH,
  formatDayLong,
  formatDayShort,
  formatDegrees,
  formatHour,
  formatKmh,
  formatMm,
  formatOneDecimal,
  formatPct,
  formatTemp,
  formatTime,
  formatTimeOrDash,
  MODEL_LABELS,
  windFrom,
} from '../lib/format';
import { conditionLabel, dayPhase, todaySky } from '../lib/sky';
import { Icon, type IconName } from './Icon';

/**
 * The forecast screen of a place (S1, S8, S9): Inicio and each lote share it. Big reading first,
 * then the field verdict, the hours, the week, and the details that justify them.
 */
interface ForecastViewProps {
  /** `null` while it loads or failed: `fallback` shows instead, under the same header. */
  forecast: Forecast | null;
  fallback?: ReactNode;
  /** Top row: the place name and its action (search, or back to the lotes). */
  header: ReactNode;
  /** Inicio shows one verdict in the gold pill; a lote shows every decision. */
  decisions: 'pill' | 'block';
  /** A lote's 2 m minimum per model, behind "Ver modelos" in the frost decision. */
  frostModels?: [string, number][];
  /** Something to say above the forecast: offline, location denied, still loading. */
  notice?: ReactNode;
  /** True while the next place loads behind the current one. */
  updating?: boolean;
}

export function ForecastView({
  forecast,
  fallback,
  header,
  decisions,
  frostModels,
  notice,
  updating,
}: ForecastViewProps) {
  // The header keeps its place in the tree whatever loads below it, so focus and taps survive.
  return (
    <div className="forecast" aria-busy={updating || undefined}>
      <div className="forecast-head">
        {header}
        {notice}
      </div>
      {forecast ? (
        <ForecastBody forecast={forecast} decisions={decisions} frostModels={frostModels} />
      ) : (
        fallback
      )}
    </div>
  );
}

function ForecastBody({
  forecast,
  decisions,
  frostModels,
}: Pick<ForecastViewProps, 'decisions' | 'frostModels'> & { forecast: Forecast }) {
  return (
    <>
      <div className="forecast-main">
        <Hero forecast={forecast} />
        {decisions === 'pill' ? (
          <FieldPill forecast={forecast} />
        ) : (
          <DecisionsBlock forecast={forecast} frostModels={frostModels} />
        )}
      </div>
      <div className="forecast-data">
        <Hours forecast={forecast} />
        <Week forecast={forecast} />
      </div>
      <div className="forecast-details">
        <Wind forecast={forecast} />
        <Rain forecast={forecast} />
        <Sun forecast={forecast} />
      </div>
      <Credits forecast={forecast} />
    </>
  );
}

const SKY_ICON: Record<Sky, IconName> = {
  sol: 'sun',
  parcial: 'cloudSun',
  nublado: 'cloud',
  lluvia: 'rain',
  tormenta: 'storm',
};

function skyIcon(sky: Sky, night = false): IconName {
  return night && sky === 'sol' ? 'moon' : SKY_ICON[sky];
}

function Hero({ forecast }: { forecast: Forecast }) {
  const night = dayPhase(forecast) === 'night';
  return (
    <section className="hero" aria-label="Ahora">
      <p className="hero-temp">
        <span className="sr-only">Temperatura ahora: </span>
        <span>{formatDegrees(forecast.now.temperature_c)}</span>
      </p>
      <p className="hero-cond">
        <Icon name={skyIcon(todaySky(forecast), night)} size={28} strokeWidth={1.8} />
        <span>{conditionLabel(forecast)}</span>
      </p>
      <p className="hero-range">
        Máx {formatDegrees(forecast.today.max_c)} · Mín {formatDegrees(forecast.today.min_c)}
      </p>
    </section>
  );
}

const LEVEL_ICON: Record<Level, IconName> = {
  ok: 'check',
  caution: 'alert',
  critical: 'alertCircle',
};

export function LevelChip({ level }: { level: Level }) {
  return (
    <span className={`level level--${level}`}>
      <Icon name={LEVEL_ICON[level]} size={16} strokeWidth={2.6} />
      {LEVEL_LABEL[level]}
    </span>
  );
}

const ORDER: DecisionKey[] = ['frost_tonight', 'field_work', 'spray_today'];

function FieldPill({ forecast }: { forecast: Forecast }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const verdict = fieldVerdict(forecast);
  const others = ORDER.filter((key) => key !== verdict.key);
  return (
    <section className="verdict" aria-label="Para el campo">
      <button
        type="button"
        className="verdict-pill"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="verdict-head">
          <Icon name={LEVEL_ICON[verdict.level]} size={20} strokeWidth={2.6} />
          Para el campo
          <span className="verdict-level">· {LEVEL_LABEL[verdict.level]}</span>
        </span>
        <span className="verdict-text">{keepUnits(verdict.reason)}</span>
        <Icon className="verdict-chevron" name="chevronRight" size={22} strokeWidth={2.6} />
      </button>
      {open ? (
        <div className="verdict-more" id={id}>
          <ul className="verdict-others">
            {others.map((key) => {
              const decision = forecast.decisions[key];
              return (
                <li key={key}>
                  <span className="verdict-other-head">
                    <span className="verdict-other-title">{DECISION_TITLE[key]}</span>
                    <LevelChip level={decision.level} />
                  </span>
                  <span>{keepUnits(decision.reason)}</span>
                </li>
              );
            })}
          </ul>
          <p className="honest">
            <Icon name="info" size={18} />
            <span>{HONEST_LINE}</span>
          </p>
        </div>
      ) : null}
    </section>
  );
}

function DecisionsBlock({
  forecast,
  frostModels,
}: {
  forecast: Forecast;
  frostModels?: [string, number][];
}) {
  const { frost_tonight: frost, spray_today: spray, field_work: field } = forecast.decisions;
  const today = forecast.daily[0]?.date ?? forecast.now.time.slice(0, 10);
  return (
    <section className="decisions" aria-labelledby="sec-decisions">
      <h2 id="sec-decisions" className="panel-title">
        Decisiones para este lote
      </h2>
      <ul className="decision-list">
        <li className="decision">
          <span className="decision-head">
            <Icon name="snowflake" size={22} />
            <span className="decision-title">{DECISION_TITLE.frost_tonight}</span>
            <LevelChip level={frost.level} />
          </span>
          <p className="decision-reason">{keepUnits(frost.reason)}</p>
          <dl className="decision-facts">
            <div>
              <dt>En el suelo</dt>
              <dd>
                {frost.ground_estimate_c === null ? DASH : formatTemp(frost.ground_estimate_c)}
              </dd>
            </div>
            <div>
              <dt>A 2 m</dt>
              <dd>{frost.min_2m_c === null ? DASH : formatTemp(frost.min_2m_c)}</dd>
            </div>
            <div>
              <dt>Modelos que dan helada</dt>
              <dd>{frost.models_agreeing ?? DASH}</dd>
            </div>
          </dl>
          {frostModels?.length ? (
            <details className="models-more">
              <summary>
                <Icon name="chevronRight" size={20} strokeWidth={2.6} />
                Ver modelos
              </summary>
              <ul className="models" aria-label="Mínima por modelo">
                {frostModels.map(([model, value]) => (
                  <li key={model}>
                    <span className="models-name">{MODEL_LABELS[model] ?? model}</span>
                    <span className="models-value">{formatTemp(value)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
        <li className="decision">
          <span className="decision-head">
            <Icon name="drop" size={22} />
            <span className="decision-title">{DECISION_TITLE.spray_today}</span>
            <LevelChip level={spray.level} />
          </span>
          <p className="decision-reason">{keepUnits(spray.reason)}</p>
          {spray.best_window ? (
            <dl className="decision-facts">
              <div>
                <dt>Mejor ventana</dt>
                <dd>
                  {formatTime(spray.best_window.start)} a {formatTime(spray.best_window.end)}
                </dd>
              </div>
            </dl>
          ) : null}
        </li>
        <li className="decision">
          <span className="decision-head">
            <Icon name="parcel" size={22} />
            <span className="decision-title">{DECISION_TITLE.field_work}</span>
            <LevelChip level={field.level} />
          </span>
          <p className="decision-reason">{keepUnits(field.reason)}</p>
          {field.next_rain ? (
            <dl className="decision-facts">
              <div>
                <dt>Próxima lluvia fuerte</dt>
                <dd>
                  {formatDayLong(field.next_rain.date, today)} · {formatMm(field.next_rain.mm)}
                  {field.next_rain.probability_pct === null
                    ? null
                    : ` · ${formatPct(field.next_rain.probability_pct)}`}
                </dd>
              </div>
            </dl>
          ) : null}
        </li>
      </ul>
      <p className="honest">
        <Icon name="info" size={18} />
        <span>{HONEST_LINE}</span>
      </p>
    </section>
  );
}

function Hours({ forecast }: { forecast: Forecast }) {
  const titleId = useId();
  const hours = forecast.hourly;
  // A new place has no ensemble: no probability at all, so the row goes instead of filling dashes.
  const withProbability = hours.some((h) => h.rain_probability_pct !== null);
  const today = forecast.daily[0]?.date ?? '';
  return (
    <section className="panel hours" aria-labelledby={titleId}>
      <h2 id={titleId} className="panel-title">
        Próximas horas
      </h2>
      <div
        className="hours-scroll"
        tabIndex={0}
        role="group"
        aria-label="Desplazá para ver las 48 horas"
      >
        <table className="hours-table" aria-labelledby={titleId}>
          <thead>
            <tr>
              <td />
              {hours.map((hour, i) => {
                const label = i === 0 ? 'Ahora' : formatHour(hour.time);
                const midnight = i > 0 && label === '0\u00a0h';
                return (
                  <th key={hour.time} scope="col" className={midnight ? 'is-new-day' : undefined}>
                    {midnight ? (
                      <span className="hours-day">
                        {formatDayShort(hour.time.slice(0, 10), today)}{' '}
                      </span>
                    ) : null}
                    {label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <tr className="hours-temp">
              <RowHead icon="thermometer" short="°C" name="Temperatura" />
              {hours.map((h) => (
                <td key={h.time}>{formatDegrees(h.temperature_c)}</td>
              ))}
            </tr>
            <tr>
              <RowHead icon="rain" short="mm" name="Lluvia (mm)" />
              {hours.map((h) => (
                <td key={h.time} className={h.rain_mm ? 'is-wet' : undefined}>
                  {formatOneDecimal(h.rain_mm)}
                </td>
              ))}
            </tr>
            {withProbability ? (
              <tr>
                <RowHead icon="drop" short="%" name="Probabilidad de lluvia" />
                {hours.map((h) => (
                  <td key={h.time}>{formatPct(h.rain_probability_pct)}</td>
                ))}
              </tr>
            ) : null}
            <tr>
              <RowHead icon="wind" short="km/h" name="Viento (km/h)" />
              {hours.map((h) => (
                <td key={h.time}>
                  {formatOneDecimal(h.wind_kmh === null ? null : Math.round(h.wind_kmh))}
                </td>
              ))}
            </tr>
            <tr>
              <RowHead icon="wind" short="ráf." name="Ráfagas (km/h)" />
              {hours.map((h) => (
                <td key={h.time}>
                  {formatOneDecimal(h.gust_kmh === null ? null : Math.round(h.gust_kmh))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** A narrow row label (icon and unit) that still reads in full to a screen reader. */
function RowHead({ icon, short, name }: { icon: IconName; short: string; name: string }) {
  return (
    <th scope="row">
      <span className="hours-rowhead" aria-hidden="true">
        <Icon name={icon} size={18} />
        {short}
      </span>
      <span className="sr-only">{name}</span>
    </th>
  );
}

/** Every bar of the week is drawn against the same millimetres: the wettest day, 5 mm at least. */
function rainScale(days: ForecastDay[]): number {
  return Math.max(5, ...days.map((d) => d.rain_mm ?? 0));
}

function Week({ forecast }: { forecast: Forecast }) {
  const titleId = useId();
  const days = forecast.daily;
  const scale = rainScale(days);
  const today = days[0]?.date ?? '';
  return (
    <section className="panel week" aria-labelledby={titleId}>
      <h2 id={titleId} className="panel-title">
        Próximos 7 días
      </h2>
      <ul className="week-list" aria-labelledby={titleId}>
        {days.map((day) => {
          const mm = day.rain_mm ?? 0;
          const width = Math.min(100, (mm / scale) * 100);
          return (
            <li key={day.date} className="day">
              <span className="day-name">
                <span aria-hidden="true">{formatDayShort(day.date, today)}</span>
                <span className="sr-only">{formatDayLong(day.date, today)}</span>
              </span>
              <span className="day-sky">
                <Icon name={skyIcon(day.sky)} size={26} strokeWidth={1.8} />
                <span className="sr-only">{SKY_TEXT[day.sky]}</span>
              </span>
              <span className="day-temps">
                <span className="day-max">
                  <span className="sr-only">máxima </span>
                  {formatDegrees(day.max_c)}
                </span>
                <span className="day-min">
                  <span className="sr-only">mínima </span>
                  {formatDegrees(day.min_c)}
                </span>
              </span>
              <span className="day-rain">
                <span className="rain-track" aria-hidden="true">
                  <span
                    className="rain-fill"
                    data-rain-bar=""
                    style={{ width: `${Number(width.toFixed(2))}%` }}
                  />
                </span>
                <span className={mm > 0 ? 'day-mm' : 'day-mm is-dry'}>{formatMm(day.rain_mm)}</span>
                {day.rain_probability_pct === null ? null : (
                  <span className="day-prob">
                    <span className="sr-only">probabilidad </span>
                    {formatPct(day.rain_probability_pct)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SKY_TEXT: Record<Sky, string> = {
  sol: 'soleado',
  parcial: 'parcialmente nublado',
  nublado: 'nublado',
  lluvia: 'lluvia',
  tormenta: 'tormenta',
};

function Wind({ forecast }: { forecast: Forecast }) {
  const { wind_kmh, wind_dir_deg, gust_kmh, humidity_pct } = forecast.now;
  const from = windFrom(wind_dir_deg);
  return (
    <section className="panel wind" aria-labelledby="sec-wind">
      <h2 id="sec-wind" className="panel-title">
        Viento y humedad
      </h2>
      <div className="wind-body">
        <svg className="compass" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <circle
            cx="32"
            cy="32"
            r="27"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="2"
          />
          <text
            x="32"
            y="12.5"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="currentColor"
          >
            N
          </text>
          {wind_dir_deg === null ? null : (
            // The arrow points where the wind goes: it comes from `wind_dir_deg`.
            <path
              d="M32 16 39 40 32 35 25 40Z"
              fill="var(--gold)"
              transform={`rotate(${(wind_dir_deg + 180) % 360} 32 32)`}
            />
          )}
        </svg>
        <p className="wind-now">
          <span className="wind-speed">{formatKmh(wind_kmh)}</span>
          <span className="wind-from">{from ? `del ${from}` : 'dirección sin dato'}</span>
        </p>
      </div>
      <dl className="facts-inline">
        <div>
          <dt>Ráfagas</dt>
          <dd>{formatKmh(gust_kmh)}</dd>
        </div>
        <div>
          <dt>Humedad</dt>
          <dd>{formatPct(humidity_pct)}</dd>
        </div>
      </dl>
    </section>
  );
}

function Rain({ forecast }: { forecast: Forecast }) {
  const ahead = forecast.daily.reduce((sum, day) => sum + (day.rain_mm ?? 0), 0);
  return (
    <section className="panel rain" aria-labelledby="sec-rain">
      <h2 id="sec-rain" className="panel-title">
        Lluvia
      </h2>
      <p className="big-figure">
        <Icon name="drop" size={26} strokeWidth={1.8} />
        <span>{formatMm(forecast.rain_past_7d_mm)}</span>
      </p>
      <p className="rain-label">cayeron en los últimos 7 días</p>
      <p className="rain-ahead">
        <strong>{formatMm(ahead)}</strong> esperados en los próximos 7
      </p>
    </section>
  );
}

function daylightText(now: number, rise: number, set: number): string {
  if (now < rise) return `Sale en ${duration(rise - now)}`;
  if (now >= set) return 'Ya se puso el sol';
  return `Quedan ${duration(set - now)} de luz`;
}

function duration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function Sun({ forecast }: { forecast: Forecast }) {
  const { sunrise, sunset } = forecast.today;
  const now = Date.parse(forecast.now.time);
  const rise = sunrise ? Date.parse(sunrise) : null;
  const set = sunset ? Date.parse(sunset) : null;
  const known = rise !== null && set !== null;
  const fraction = known ? Math.min(1, Math.max(0, (now - rise) / (set - rise))) : null;
  const up = known && now > rise && now < set;
  const angle = Math.PI * (1 - (fraction ?? 0));
  const sun = { x: 60 + 50 * Math.cos(angle), y: 56 - 50 * Math.sin(angle) };
  return (
    <section className="panel sun" aria-labelledby="sec-sun">
      <h2 id="sec-sun" className="panel-title">
        Sol
      </h2>
      <svg className="sun-arc" viewBox="0 0 120 62" aria-hidden="true" focusable="false">
        <path
          d="M10 56a50 50 0 0 1 100 0"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.5"
          strokeWidth="2"
          strokeDasharray="3 5"
          strokeLinecap="round"
        />
        <path d="M2 57h116" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
        {up ? <circle cx={sun.x} cy={sun.y} r="7" fill="var(--gold)" /> : null}
      </svg>
      <dl className="facts-inline">
        <div>
          <dt>
            <Icon name="sunrise" size={18} /> Sale
          </dt>
          <dd>{formatTimeOrDash(sunrise)}</dd>
        </div>
        <div>
          <dt>
            <Icon name="sunset" size={18} /> Se pone
          </dt>
          <dd>{formatTimeOrDash(sunset)}</dd>
        </div>
      </dl>
      {known ? <p className="sun-left">{daylightText(now, rise, set)}</p> : null}
    </section>
  );
}

/** Open-Meteo and Georef AR are CC BY 4.0: their credit is a licence term, not decoration. */
export const CREDITS =
  'Pronóstico: Open-Meteo.com (CC BY 4.0) · Lugares: Georef AR, datos.gob.ar (CC BY 4.0)';

function Credits({ forecast }: { forecast: Forecast }) {
  const models = forecast.models.map((m) => MODEL_LABELS[m] ?? m).join(', ');
  return (
    <footer className="forecast-credits">
      <p>
        Pronóstico de las {formatTime(forecast.fetched_at)}
        {models ? ` · Modelos ${models}` : null}
      </p>
      <p>{CREDITS}</p>
    </footer>
  );
}

/** The shape of the forecast while it loads (a cold cell takes over a second). */
export function ForecastSkeleton({ label }: { label: string }) {
  return (
    <div className="forecast-skeleton" aria-busy="true">
      <p className="sr-only" role="status">
        {label}
      </p>
      <span className="ghost ghost--temp" />
      <span className="ghost ghost--line" />
      <span className="ghost ghost--pill" />
      <span className="ghost ghost--panel" />
      <span className="ghost ghost--panel" />
    </div>
  );
}
