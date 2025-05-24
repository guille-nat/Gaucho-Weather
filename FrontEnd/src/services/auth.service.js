import axios from "axios";
import { API_BASE_URL } from "../constants/constants";
import store from "../redux/store";
import { login } from "../redux/slices/authSlice";

export const userLogin = async (username, password) => {
    const response = await axios.post(`${API_BASE_URL}/token`, {
            username,
            password,
        });

        const { access, refresh } = response.data;

        // Guardar tokens en Redux
        store.dispatch(login({ token: access, refreshToken: refresh }));

        return response.data;
};
