import { Suspense, lazy } from "react";
import { BrowserRouter, Route } from "react-router-dom";
import RutesWithNotFound from "./utilities/routes-with-not-found";
import Loader from "./components/Loader";
import { Provider } from "react-redux";
import store from "./redux/store";
import { PublicRoutes, PrivateRoutes } from "./routes/routes";
import AuthGuard from "./guards/auth.guard";
import "./styles/App.css";
import Home from "./components/Home";

const Layout = lazy(() => import("./components/Layout"));
const Login = lazy(() => import("./components/Login"));
const Register = lazy(() => import("./components/Register"));
const Reports = lazy(() => import("./components/Reports"));
const UserProfile = lazy(() => import("./components/UserProfile"));
const Historic = lazy(() => import("./components/Historic"));
const Graphics = lazy(() => import("./components/Graphics"));
const ForgotPassword = lazy(() => import("./components/ForgotPassword"));
const ResetPassword = lazy(() => import("./components/ResetPassword"));
const VerifyEmail = lazy(() => import("./components/VerifyEmail"));

function App() {
  return (
    <>
      <div className="app">
        <Suspense fallback={<Loader />}>
          <Provider store={store}>
            <BrowserRouter>
              <RutesWithNotFound>
                <Route path={PublicRoutes.HOME} element={<Layout component={<Home />} />} />
                <Route path={PublicRoutes.LOGIN} element={<Layout component={<Login />} />} />
                <Route path={PublicRoutes.REGISTER} element={<Layout component={<Register />} />} />
                <Route path={PublicRoutes.FORGOT_PASSWORD} element={<Layout component={<ForgotPassword />} />} />
                <Route path={PublicRoutes.RESET_PASSWORD} element={<Layout component={<ResetPassword />} />} />
                <Route path={PublicRoutes.VERIFY_EMAIL} element={<Layout component={<VerifyEmail />} />} />

                <Route element={<AuthGuard />}>
                  <Route path={PrivateRoutes.PROFILE} element={<Layout component={<UserProfile />}/>}/>
                  <Route path={PrivateRoutes.HISTORIC} element={<Layout component={<Historic />} />} />
                  <Route path={PrivateRoutes.GRAPHICS} element={<Layout component={<Graphics />} />} />
                </Route>

                <Route path={PublicRoutes.REPORTS} element={<Layout component={<Reports />} />} />

              </RutesWithNotFound>
            </BrowserRouter>
          </Provider>
        </Suspense>
      </div>
    </>
  );
}

export default App;
