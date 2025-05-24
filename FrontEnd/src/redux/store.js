import { configureStore } from "@reduxjs/toolkit";
import authReducer  from "./slices/authSlice";
import userPreferencesReducer from "./slices/userPreferencesSlice"

const store = configureStore({
    reducer: {
        auth: authReducer ,
        userPreferences: userPreferencesReducer,
    },
});

export default store;
