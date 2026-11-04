import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { PublicOnly, RequireAuth } from './components/Guards';
import { Alertas } from './pages/Alertas';
import { LoteDetail } from './pages/LoteDetail';
import { EditarLote, NuevoLote } from './pages/LoteForm';
import { Login } from './pages/Login';
import { MisLotes } from './pages/MisLotes';
import { Perfil } from './pages/Perfil';
import { Register } from './pages/Register';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/ingresar" element={<Login />} />
        <Route path="/crear-cuenta" element={<Register />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<MisLotes />} />
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
