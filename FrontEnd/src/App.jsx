import React, { Suspense, lazy, useState } from "react";
import { BrowserRouter, Route } from "react-router-dom";
import Graphics from "./components/Graphics";
import Historic from "./components/Historic";
import RutesWithNotFound from "./utilities/routes-with-not-found";
import Reports from "./components/Reports";
import Loader from "./components/Loader";
import Register from "./components/Register";
import { Provider } from "react-redux";
import store from "./redux/store";
import { PublicRoutes, PrivateRoutes } from "./routes/routes";
import AuthGuard from "./guards/auth.guard";
import "./styles/App.css";
import UserProfile from "./components/UserProfile";

const Layout = lazy(() => import("./components/Layout"));
const Home = lazy(() => import("./components/Home"));
const Login = lazy(() => import("./components/Login"));

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
