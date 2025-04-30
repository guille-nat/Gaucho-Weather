import { useSelector } from "react-redux";
import { Outlet, Navigate } from "react-router-dom";

import { PublicRoutes } from "../routes/routes";

const AuthGuard = () => {
    const isLoggedIn = useSelector((store) => store.auth.isLoggedIn); // Tomamos el estado de Redux

    return isLoggedIn ? <Outlet /> : <Navigate replace to={PublicRoutes.LOGIN} />;
};

export default AuthGuard;
