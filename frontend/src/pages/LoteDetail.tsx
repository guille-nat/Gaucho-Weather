import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router';
import type { Lote } from '../api/types';
import { FormAlert } from '../components/Field';
import { ForecastSkeleton, ForecastView } from '../components/ForecastView';
import { Icon } from '../components/Icon';
import { LoteFacts } from '../components/LoteFacts';
import { OfflineStrip } from '../components/OfflineStrip';
import { PlantingsEditor } from '../components/PlantingsEditor';
import { StatusChip } from '../components/StatusChip';
import { useOnline } from '../hooks/useOnline';
import {
  cropLabels,
  draftsFrom,
  plantingsError,
  plantingsOf,
  validateDrafts,
  type PlantingDraft,
  type PlantingsErrors,
} from '../lib/crops';
import { formError } from '../lib/formErrors';
import { loteMeta } from '../lib/lote';
import { applySky, skyTheme } from '../lib/sky';
import {
  FORECAST_WAIT,
  isForecastPending,
  useDeleteLote,
  useLote,
  useLoteForecast,
  useRetryLoteForecast,
  useUpdateLote,
} from '../query/hooks';
import { Saved } from './Perfil';

/** The forecast part of the lote: the Inicio layout plus its decisions (S5). */
function LoteForecast({ lote, header }: { lote: Lote; header: ReactNode }) {
  const forecast = useLoteForecast(lote.id);
  const retry = useRetryLoteForecast(lote.id);
  const online = useOnline();
  const snapshot = forecast.data;

  useEffect(() => {
    if (snapshot) applySky(skyTheme(snapshot.forecast));
  }, [snapshot]);

  const stale = snapshot !== undefined && (!online || forecast.isError || snapshot.fromCache);
  const models = Object.entries(lote.summary?.tonight_min_models ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === 'number',
  );
  // A new or moved lote gets its forecast within seconds (S12): wait for it instead of a dead end.
  const noForecast = isForecastPending(forecast.error);
  const gaveUp = noForecast && forecast.errorUpdateCount >= FORECAST_WAIT.tries;
  const fallback = forecast.isPending ? (
    <ForecastSkeleton label="Cargando el pronóstico del lote…" />
  ) : noForecast && !gaveUp ? (
    <div className="panel pending" role="status" aria-label="Buscando el pronóstico">
      <span className="forecast-search" aria-hidden="true" />
      <p className="pending-title">
        Estamos buscando el pronóstico de este lote. Tarda unos segundos.
      </p>
      <p className="fine">Aparece acá solo, apenas llega.</p>
    </div>
  ) : noForecast ? (
    <div className="panel pending">
      <StatusChip tone="pending">Sin datos aún</StatusChip>
      <p className="pending-title">Todavía no llegó el pronóstico de este lote.</p>
      <p className="fine">A veces tarda un poco más. Probá de nuevo en un rato.</p>
      <button type="button" className="btn btn--light" onClick={() => void retry()}>
        <Icon name="refresh" />
        Volver a intentar
      </button>
    </div>
  ) : !lote.summary ? (
    <div className="panel pending">
      <StatusChip tone="pending">Sin datos aún</StatusChip>
      <p className="pending-title">Estamos juntando el primer pronóstico de este lote</p>
      <p className="fine">Descargamos el pronóstico cada 6 horas. Volvé a mirar más tarde.</p>
    </div>
  ) : (
    <div className="notice notice--error" role="alert">
      <Icon name="alertCircle" />
      <p>{forecast.error?.message}</p>
      <button type="button" className="btn btn--light" onClick={() => void forecast.refetch()}>
        <Icon name="refresh" />
        Reintentar
      </button>
    </div>
  );
  return (
    <ForecastView
      forecast={snapshot?.forecast ?? null}
      fallback={fallback}
      header={header}
      decisions="block"
      frostModels={models}
      notice={stale ? <OfflineStrip servedAt={snapshot.servedAt} /> : null}
    />
  );
}

/**
 * Changing the crops without the whole edit form (cultivos-por-lote S2): the editor in a native
 * modal dialog that saves only `plantings`. The browser keeps focus inside, closes it on Esc and
 * the back gesture (dropping the unsaved rows) and gives focus back to "Cambiar cultivos".
 */
/** What the page calls to open the crops dialog from elsewhere (the header's crops button). */
interface CropsDialog {
  open: () => void;
}

/** One dialog per page; "Cambiar cultivos" here and the header's crops button both open it. */
function ChangeCrops({ lote, ref }: { lote: Lote; ref?: Ref<CropsDialog> }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const update = useUpdateLote(lote.id);
  const [drafts, setDrafts] = useState<PlantingDraft[]>([]);
  const [errors, setErrors] = useState<PlantingsErrors>({});

  function open() {
    update.reset();
    // Rendered before showModal(), so the browser focuses the first crop, or "Agregar cultivo".
    flushSync(() => {
      setDrafts(draftsFrom(plantingsOf(lote)));
      setErrors({});
    });
    dialogRef.current?.showModal();
  }
  useImperativeHandle(ref, () => ({ open }));

  function save(event: FormEvent) {
    event.preventDefault();
    const result = validateDrafts(drafts);
    setErrors(result.errors);
    if (!result.input) {
      requestAnimationFrame(() =>
        dialogRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    update.mutate({ plantings: result.input }, { onSuccess: () => dialogRef.current?.close() });
  }

  return (
    <>
      <button type="button" className="btn btn--light btn--block" onClick={open}>
        <Icon name="pencil" />
        Cambiar cultivos
      </button>
      <Saved message={update.isSuccess ? 'Cultivos guardados.' : null} />
      <dialog ref={dialogRef} className="crops-dialog" aria-labelledby={titleId}>
        {/* The look lives on this box: a display rule on <dialog> itself would show it closed. */}
        <form className="crops-dialog-box form" onSubmit={save} noValidate>
          <h2 id={titleId} className="crops-dialog-title">
            Cultivos de {lote.name}
          </h2>
          <FormAlert message={formError(update.error)} />
          <PlantingsEditor
            drafts={drafts}
            onChange={setDrafts}
            errors={errors}
            error={plantingsError(update.error)}
            loteHa={lote.area_ha}
            hideLegend
          />
          <div className="confirm-actions">
            <button type="submit" className="btn btn--primary" disabled={update.isPending}>
              {update.isPending ? 'Guardando…' : 'Guardar cultivos'}
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function DeleteLote({ lote }: { lote: Lote }) {
  const [asking, setAsking] = useState(false);
  const remove = useDeleteLote(lote.id);
  const navigate = useNavigate();

  if (!asking) {
    return (
      <button type="button" className="btn btn--danger btn--block" onClick={() => setAsking(true)}>
        <Icon name="trash" />
        Borrar lote
      </button>
    );
  }
  return (
    <div className="confirm" role="group" aria-labelledby="confirm-delete">
      <p id="confirm-delete" className="confirm-text">
        ¿Borrar {lote.name}? Se pierden sus datos y no se puede deshacer.
      </p>
      <FormAlert message={remove.error?.message} />
      <div className="confirm-actions">
        <button
          type="button"
          className="btn btn--danger-solid"
          disabled={remove.isPending}
          onClick={() =>
            remove.mutate(undefined, { onSuccess: () => navigate('/lotes', { replace: true }) })
          }
        >
          {remove.isPending ? 'Borrando…' : 'Sí, borrar'}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setAsking(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function LoteDetail() {
  const id = Number(useParams().id);
  const lote = useLote(id);
  const crops = useRef<CropsDialog>(null);

  if (!lote.data) {
    return (
      <div className="page">
        <Link className="back-link" to="/lotes">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <p className="notice">
          {lote.isError
            ? lote.error.message === 'No encontrado.'
              ? 'No encontramos ese lote.'
              : lote.error.message
            : 'Cargando lote…'}
        </p>
      </div>
    );
  }

  const data = lote.data;
  const meta = loteMeta(data, { crops: false });
  const cropNames = cropLabels(plantingsOf(data)).join(' · ');
  const header = (
    <header className="place-bar place-bar--lote">
      <div className="place-names">
        <Link className="back-link" to="/lotes">
          <Icon name="chevronLeft" strokeWidth={2.6} />
          Mis lotes
        </Link>
        <h1 className="place-name">{data.name}</h1>
        <p className="place-region">{[data.establishment, meta].filter(Boolean).join(' · ')}</p>
        {/* S2: the crops change from the top of the page, not only from the facts below. */}
        <button type="button" className="crops-quick" onClick={() => crops.current?.open()}>
          <Icon name="sprout" size={20} />
          {cropNames ? (
            <span>
              <span className="sr-only">Cambiar cultivos:</span> {cropNames}
            </span>
          ) : (
            <span>Agregar cultivos</span>
          )}
          <Icon name="pencil" size={16} strokeWidth={2.4} />
        </button>
      </div>
      <Link
        className="icon-btn icon-btn--solid"
        to={`/lotes/${data.id}/editar`}
        aria-label="Editar lote"
      >
        <Icon name="pencil" size={22} strokeWidth={2.4} />
      </Link>
    </header>
  );
  return (
    <div className="page page-detail">
      <LoteForecast lote={data} header={header} />

      <section className="section lote-history" aria-label="Histórico">
        <Link className="history-link" to={`/lotes/${data.id}/historico`}>
          <Icon name="history" size={26} />
          <span className="history-link-text">
            <span className="history-link-title">Histórico de clima y viento</span>
            <span className="fine">Viento hora por hora para tus registros de aplicación</span>
          </span>
          <Icon name="chevronRight" strokeWidth={2.6} />
        </Link>
      </section>

      <section className="section lote-facts" aria-labelledby="sec-facts">
        <h2 id="sec-facts" className="panel-title">
          Datos del lote
        </h2>
        <LoteFacts lote={data} cropsAction={<ChangeCrops lote={data} ref={crops} />} />
        <div className="detail-actions">
          <Link className="btn btn--light btn--block" to={`/lotes/${data.id}/editar`}>
            <Icon name="pencil" />
            Editar lote
          </Link>
          <DeleteLote lote={data} />
        </div>
      </section>
    </div>
  );
}
