import { createSlice } from "@reduxjs/toolkit";


// Estado inicial
const initialState = {
    token: localStorage.getItem("token") || null,
    refreshToken: localStorage.getItem("refreshToken") || null,
    isLoggedIn: !!localStorage.getItem("token"),
};

// Creamos el slice
const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        login: (state, action) => {
            const {  token, refreshToken } = action.payload;
            state.token = token;
            state.refreshToken = refreshToken;
            state.isLoggedIn = true;

            window.localStorage.setItem("token", token);
            window.localStorage.setItem("refreshToken", refreshToken);
        },
        logout: (state) => {
            state.token = null;
            state.refreshToken = null;
            state.isLoggedIn = false;

            window.localStorage.removeItem("token");
            window.localStorage.removeItem("refreshToken");

        },
        refreshTokenSuccess: (state, action) => {
            state.token = action.payload;
            localStorage.setItem("token", action.payload);
        },
    },
});


export const { login, logout,refreshTokenSuccess  } = authSlice.actions;
export default authSlice.reducer;
