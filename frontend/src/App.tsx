import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { PublicOnly, RequireAuth } from './components/Guards';
import { Alertas } from './pages/Alertas';
import { Buscar } from './pages/Buscar';
import { Inicio } from './pages/Inicio';
import { LoteDetail } from './pages/LoteDetail';
import { EditarLote, NuevoLote } from './pages/LoteForm';
import { Login } from './pages/Login';
import { MisLotes } from './pages/MisLotes';
import { Perfil } from './pages/Perfil';
import { Planes } from './pages/Planes';
import { Recuperar } from './pages/Recuperar';
import { Register } from './pages/Register';
import { Restablecer } from './pages/Restablecer';

/** S8: the weather and the plans are public; lotes, alerts and the profile need an account. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/ingresar" element={<Login />} />
        <Route path="/crear-cuenta" element={<Register />} />
        <Route path="/recuperar" element={<Recuperar />} />
      </Route>
      <Route path="/restablecer/:uid/:token" element={<Restablecer />} />
      <Route path="/buscar" element={<Buscar />} />
      <Route element={<AppShell />}>
        <Route index element={<Inicio />} />
        <Route path="/planes" element={<Planes />} />
        <Route element={<RequireAuth />}>
          <Route path="/lotes" element={<MisLotes />} />
          <Route path="/lotes/nuevo" element={<NuevoLote />} />
          <Route path="/lotes/:id" element={<LoteDetail />} />
          <Route path="/lotes/:id/editar" element={<EditarLote />} />
          <Route path="/alertas" element={<Alertas />} />
          <Route path="/perfil" element={<Perfil />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
