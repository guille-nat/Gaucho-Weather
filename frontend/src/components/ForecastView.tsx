import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { Forecast, ForecastDay, ForecastHour, Level, Sky } from '../api/types';
import {
  byUrgency,
  DECISION_TITLE,
  fieldVerdict,
  HONEST_LINE,
  inWindow,
  keepUnits,
  LEVEL_LABEL,
  rangeText,
  windowHours,
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
import { conditionLabel, currentSky, dayPhase } from '../lib/sky';
import { Icon, type IconName } from './Icon';
import { SkyMotion, SkyPause } from './SkyMotion';

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
  /** What comes after the forecast and before the credits, loaded or not (a lote's links, data). */
  after?: ReactNode;
}

/** The shortest wait that earns the rain bars growing: below it, nobody saw a wait. */
const REVEAL_AFTER_MS = 120;

export function ForecastView({
  forecast,
  fallback,
  header,
  decisions,
  frostModels,
  notice,
  updating,
  after,
}: ForecastViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const waitingSince = useRef<number | null>(null);
  // A forecast that arrives after a wait the farmer could see grows its rain bars (motion-pass).
  // The blocks themselves enter by sections on every insertion (app.css, Motion).
  // A wait too short to notice (a cached forecast while the phone finds itself) shows at once, so
  // returning to Clima does not replay the entrance. Set before paint, outside React's attributes.
  useLayoutEffect(() => {
    if (!forecast) {
      waitingSince.current ??= performance.now();
      return;
    }
    if (waitingSince.current === null) return;
    const waited = performance.now() - waitingSince.current;
    waitingSince.current = null;
    if (waited >= REVEAL_AFTER_MS && root.current) root.current.dataset.reveal = '';
  }, [forecast]);
  // The header keeps its place in the tree whatever loads below it, so focus and taps survive.
  return (
    <div
      ref={root}
      className={decisions === 'block' ? 'forecast forecast--board' : 'forecast'}
      aria-busy={updating || undefined}
    >
      <div className="forecast-head">
        {header}
        {notice}
      </div>
      {forecast ? (
        <ForecastBody forecast={forecast} decisions={decisions} frostModels={frostModels} />
      ) : (
        fallback
      )}
      {after}
      {forecast ? <Credits forecast={forecast} /> : null}
    </div>
  );
}

function ForecastBody({
  forecast,
  decisions,
  frostModels,
}: Pick<ForecastViewProps, 'decisions' | 'frostModels'> & { forecast: Forecast }) {
  if (decisions === 'block') {
    // A lote is a decision board (lote-tablero S2-S6): today's decisions first, then the hours
    // an agronomist reads to back them, then the week. On wide screens the week sits beside the
    // decisions and the hours take the full width, so every column of the table is in view.
    return (
      <>
        <SkyMotion forecast={forecast} />
        <div className="board-main">
          <DecisionsBlock forecast={forecast} frostModels={frostModels} />
          <NowStrip forecast={forecast} />
        </div>
        <SprayHours forecast={forecast} />
        <Week forecast={forecast} />
      </>
    );
  }
  return (
    <>
      <SkyMotion forecast={forecast} />
      <div className="forecast-main">
        <Hero forecast={forecast} />
        <FieldPill forecast={forecast} />
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
      <SkyPause forecast={forecast} />
      <p className="hero-temp">
        <span className="sr-only">Temperatura ahora: </span>
        <span>{formatDegrees(forecast.now.temperature_c)}</span>
      </p>
      <p className="hero-cond">
        <Icon name={skyIcon(currentSky(forecast), night)} size={28} strokeWidth={1.8} />
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

const DECISION_ICON: Record<DecisionKey, IconName> = {
  frost_tonight: 'snowflake',
  spray_today: 'drop',
  field_work: 'parcel',
};

/** The coldest model's 2 m minimum, or null without models. */
function coldest(models: [string, number][] | undefined): number | null {
  return models?.length ? Math.min(...models.map(([, value]) => value)) : null;
}

/** The figures behind a verdict, one plain line each (lote-tablero S3). */
function evidence(
  key: DecisionKey,
  forecast: Forecast,
  frostModels: [string, number][] | undefined,
): string[] {
  const { frost_tonight: frost } = forecast.decisions;
  if (key === 'frost_tonight') {
    // The 2 m figure is the median of the models (engine/frost.py), so the coldest model, which
    // "Ver modelos" lists, sits beside it instead of looking like a contradiction.
    const cold = coldest(frostModels);
    const line = [
      frost.ground_estimate_c === null ? null : `suelo ${formatTemp(frost.ground_estimate_c)}`,
      frost.min_2m_c === null ? null : `2\u00a0m: mediana ${formatTemp(frost.min_2m_c)}`,
      cold === null ? null : `mín. modelo ${formatTemp(cold)}`,
    ].filter(Boolean);
    return line.length ? [line.join(' · ')] : [];
  }
  if (key === 'spray_today') {
    const hours = windowHours(forecast);
    const wind = rangeText(hours.map((h) => h.wind_kmh));
    const gust = rangeText(hours.map((h) => h.gust_kmh));
    const parts = [wind && `viento ${wind}`, gust && `ráfagas ${gust}`].filter(Boolean);
    return parts.length ? [`${parts.join(' · ')}\u00a0km/h`] : [];
  }
  return forecast.rain_past_7d_mm === null
    ? []
    : [`cayeron ${formatMm(forecast.rain_past_7d_mm)} en 7 días`];
}

function DecisionsBlock({
  forecast,
  frostModels,
}: {
  forecast: Forecast;
  frostModels?: [string, number][];
}) {
  const agreeing = forecast.decisions.frost_tonight.models_agreeing;
  return (
    <section className="decisions" aria-labelledby="sec-decisions">
      <h2 id="sec-decisions" className="panel-title">
        Hoy en este lote
      </h2>
      <ul className="decision-list">
        {byUrgency(forecast.decisions).map((key) => {
          const decision = forecast.decisions[key];
          const models = key === 'frost_tonight' && frostModels?.length ? frostModels : null;
          const lines = evidence(key, forecast, frostModels);
          if (key === 'frost_tonight' && agreeing && !models) lines.push(`Dan helada: ${agreeing}`);
          return (
            <li key={key} className={`decision decision--${decision.level}`}>
              <div className="decision-head">
                <span className="decision-icon" aria-hidden="true">
                  <Icon name={DECISION_ICON[key]} size={22} strokeWidth={2.2} />
                </span>
                <h3 className="decision-title">{DECISION_TITLE[key]}</h3>
                <LevelChip level={decision.level} />
              </div>
              <p className="decision-reason">{keepUnits(decision.reason)}</p>
              {lines.map((line) => (
                <p key={line} className="decision-evidence">
                  {line}
                </p>
              ))}
              {models ? (
                <details className="models-more">
                  <summary>
                    <Icon name="chevronRight" size={20} strokeWidth={2.6} />
                    Ver modelos
                  </summary>
                  <ul className="models" aria-label="Mínima por modelo">
                    {models.map(([model, value]) => (
                      <li key={model}>
                        <span className="models-name">{MODEL_LABELS[model] ?? model}</span>
                        <span className="models-value">{formatTemp(value)}</span>
                      </li>
                    ))}
                  </ul>
                  {agreeing ? <p className="models-agree">Dan helada: {agreeing}</p> : null}
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="honest">
        <Icon name="info" size={18} />
        <span>{HONEST_LINE}</span>
      </p>
    </section>
  );
}

/** "Ahora" on a lote (S4): one line for this hour, one for the sun. */
function NowStrip({ forecast }: { forecast: Forecast }) {
  const { now, today } = forecast;
  const night = dayPhase(forecast) === 'night';
  const from = windFrom(now.wind_dir_deg);
  const rise = today.sunrise ? Date.parse(today.sunrise) : null;
  const set = today.sunset ? Date.parse(today.sunset) : null;
  return (
    <section className="panel now-strip" aria-label="Ahora">
      <SkyPause forecast={forecast} />
      <p className="now-line">
        <span className="now-temp">
          <span className="sr-only">Temperatura ahora: </span>
          {formatDegrees(now.temperature_c)}
        </span>
        <span className="now-cond">
          <Icon name={skyIcon(currentSky(forecast), night)} size={24} strokeWidth={1.8} />
          {conditionLabel(forecast)}
        </span>
        <span className="now-range">
          Máx {formatDegrees(today.max_c)} · Mín {formatDegrees(today.min_c)}
        </span>
        {now.wind_kmh === null ? null : (
          <span className="now-wind">
            <Icon name="wind" size={20} />
            <span className="sr-only">Viento: </span>
            {from ? `${from} ` : null}
            {formatKmh(now.wind_kmh)}
          </span>
        )}
      </p>
      <p className="now-sun">
        <span>
          <Icon name="sunrise" size={20} /> Sale {formatTimeOrDash(today.sunrise)}
        </span>
        <span>
          <Icon name="sunset" size={20} /> Se pone {formatTimeOrDash(today.sunset)}
        </span>
        {rise !== null && set !== null ? (
          <span className="now-light">{daylightText(Date.parse(now.time), rise, set)}</span>
        ) : null}
      </p>
    </section>
  );
}

/** A lote's first rows: today's working hours and the night; the rest on request. */
const FIRST_HOURS = 24;

/** One local day of hours, under its own row header. */
function byDay(hours: ForecastHour[]): { date: string; hours: ForecastHour[] }[] {
  const days: { date: string; hours: ForecastHour[] }[] = [];
  for (const hour of hours) {
    const date = hour.time.slice(0, 10);
    const last = days.at(-1);
    if (last?.date === date) last.hours.push(hour);
    else days.push({ date, hours: [hour] });
  }
  return days;
}

/** What makes an hour bad for spraying, inversion included even when no cause names it. */
function sprayCauses(hour: ForecastHour): string {
  const spray = hour.spray;
  if (!spray) return '';
  const causes = [...spray.causes];
  if (spray.inversion && !causes.some((c) => c.includes('inversión'))) {
    causes.push('inversión térmica');
  }
  return causes.join(', ');
}

/**
 * The hours for the agronomist (lote-tablero S4): one row per hour, the spraying state first,
 * then the weather behind it. The spray window's rows say "Ventana" and carry a gold band.
 */
function SprayHours({ forecast }: { forecast: Forecast }) {
  const titleId = useId();
  const tableId = useId();
  const [all, setAll] = useState(false);
  const every = forecast.hourly;
  const hours = all ? every : every.slice(0, FIRST_HOURS);
  const withSpray = every.some((h) => h.spray);
  const withProbability = every.some((h) => h.rain_probability_pct !== null);
  const today = forecast.daily[0]?.date ?? forecast.now.time.slice(0, 10);
  const window = forecast.decisions.spray_today.best_window;
  const columns = 6 + (withSpray ? 3 : 0) + (withProbability ? 1 : 0);
  return (
    <section className="panel lote-hours" aria-labelledby={titleId}>
      <h2 id={titleId} className="panel-title">
        Próximas horas
      </h2>
      {window && withSpray ? (
        <p className="lote-hours-legend">
          <span className="level level--ok">
            <Icon name="check" size={16} strokeWidth={2.6} />
            Ventana
          </span>
          la mejor ventana para pulverizar hoy
        </p>
      ) : null}
      <div
        className="lote-hours-scroll"
        tabIndex={0}
        role="group"
        aria-label="Desplazá para ver todas las columnas"
      >
        <table id={tableId} className="lote-hours-table" aria-labelledby={titleId}>
          <thead>
            <tr>
              <th scope="col">Hora</th>
              {withSpray ? <th scope="col">Pulverizar</th> : null}
              <th scope="col">Viento (km/h)</th>
              <th scope="col">Ráfagas</th>
              {withSpray ? <th scope="col">Delta T</th> : null}
              <th scope="col">°C</th>
              <th scope="col">Humedad</th>
              <th scope="col">Lluvia (mm)</th>
              {withProbability ? <th scope="col">Prob.</th> : null}
              {withSpray ? (
                <th scope="col" className="lote-hours-causes">
                  Causas
                </th>
              ) : null}
            </tr>
          </thead>
          {byDay(hours).map((day) => (
            <tbody key={day.date}>
              <tr className="lote-hours-day">
                <th scope="rowgroup" colSpan={columns}>
                  <span>{formatDayLong(day.date, today)}</span>
                </th>
              </tr>
              {day.hours.map((h) => {
                const open = inWindow(forecast, h.time);
                const from = windFrom(h.wind_direction_deg);
                const wind =
                  h.wind_kmh === null ? DASH : `${from ? `${from} ` : ''}${Math.round(h.wind_kmh)}`;
                return (
                  <tr key={h.time} className={open ? 'is-window' : undefined}>
                    <th scope="row">{h.time === every[0]?.time ? 'Ahora' : formatHour(h.time)}</th>
                    {withSpray ? (
                      <td>
                        {!h.spray ? (
                          DASH
                        ) : open ? (
                          <span className="level level--ok">
                            <Icon name="check" size={16} strokeWidth={2.6} />
                            Ventana
                          </span>
                        ) : (
                          <LevelChip level={h.spray.level} />
                        )}
                      </td>
                    ) : null}
                    <td>{wind}</td>
                    <td>{h.gust_kmh === null ? DASH : Math.round(h.gust_kmh)}</td>
                    {withSpray ? <td>{formatOneDecimal(h.spray?.delta_t_c)}</td> : null}
                    <td className="lote-hours-temp">{formatDegrees(h.temperature_c)}</td>
                    <td>{formatPct(h.humidity_pct)}</td>
                    <td className={h.rain_mm ? 'is-wet' : undefined}>
                      {formatOneDecimal(h.rain_mm)}
                    </td>
                    {withProbability ? <td>{formatPct(h.rain_probability_pct)}</td> : null}
                    {withSpray ? <td className="lote-hours-causes">{sprayCauses(h)}</td> : null}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      {every.length > FIRST_HOURS ? (
        <button
          type="button"
          className="btn btn--light lote-hours-more"
          aria-expanded={all}
          aria-controls={tableId}
          onClick={() => setAll((v) => !v)}
        >
          {all ? `Ver solo ${FIRST_HOURS} horas` : `Ver las ${every.length} horas`}
        </button>
      ) : null}
    </section>
  );
}

function Hours({ forecast }: { forecast: Forecast }) {
  const titleId = useId();
  const hours = forecast.hourly;
  // A new place has no ensemble: no probability at all, so the row goes instead of filling dashes.
  const withProbability = hours.some((h) => h.rain_probability_pct !== null);
  const today = forecast.daily[0]?.date ?? '';
  // The first hour of each new day, marked in every row so the day change runs down the whole
  // strip, not only through the header.
  const newDay = hours.map((hour, i) => i > 0 && formatHour(hour.time) === '0\u00a0h');
  const cell = (i: number, extra?: string) =>
    [newDay[i] ? 'is-new-day' : '', extra ?? ''].filter(Boolean).join(' ') || undefined;
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
                return (
                  <th key={hour.time} scope="col" className={cell(i)}>
                    {newDay[i] ? (
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
          {/* One band per variable, each with its own tint, so temperature, rain and wind read
              apart at a glance (the table stays one table for screen readers). */}
          <tbody className="hours-band hours-band--temp">
            <tr className="hours-temp">
              <RowHead icon="thermometer" short="°C" name="Temperatura" />
              {hours.map((h, i) => (
                <td key={h.time} className={cell(i)}>
                  {formatDegrees(h.temperature_c)}
                </td>
              ))}
            </tr>
          </tbody>
          <tbody className="hours-band hours-band--rain">
            <tr>
              <RowHead icon="rain" short="mm" name="Lluvia (mm)" />
              {hours.map((h, i) => (
                <td key={h.time} className={cell(i, h.rain_mm ? 'is-wet' : undefined)}>
                  {formatOneDecimal(h.rain_mm)}
                </td>
              ))}
            </tr>
            {withProbability ? (
              <tr>
                <RowHead icon="drop" short="%" name="Probabilidad de lluvia" />
                {hours.map((h, i) => (
                  <td key={h.time} className={cell(i)}>
                    {/* A small bar under the figure: the chance of rain readable at a glance. */}
                    <span
                      className="hours-prob"
                      style={{ '--p': `${h.rain_probability_pct ?? 0}%` } as CSSProperties}
                    >
                      {formatPct(h.rain_probability_pct)}
                    </span>
                  </td>
                ))}
              </tr>
            ) : null}
          </tbody>
          <tbody className="hours-band hours-band--wind">
            <tr>
              <RowHead icon="wind" short="km/h" name="Viento (km/h)" />
              {hours.map((h, i) => (
                <td key={h.time} className={cell(i)}>
                  {formatOneDecimal(h.wind_kmh === null ? null : Math.round(h.wind_kmh))}
                </td>
              ))}
            </tr>
            <tr>
              <RowHead icon="wind" short="ráf." name="Ráfagas (km/h)" />
              {hours.map((h, i) => (
                <td key={h.time} className={cell(i)}>
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
        {days.map((day, index) => {
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
                    style={{ width: `${Number(width.toFixed(2))}%`, '--i': index } as CSSProperties}
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
