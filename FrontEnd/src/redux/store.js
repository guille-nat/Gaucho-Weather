import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import userPreferencesReducer from "./slices/userPreferencesSlice";
import searchLocationReducer from "./slices/searchLocationSlice";

const store = configureStore({
    reducer: {
        auth: authReducer,
        userPreferences: userPreferencesReducer,
        searchLocation: searchLocationReducer,
    },
});

export default store;
