import {createSlice} from "@reduxjs/toolkit";

// Estado inicial
const initialState = {
    favoriteLocation: JSON.parse(window.localStorage.getItem('favoriteLocation')) || [],
    preferredUnits: window.localStorage.getItem('preferredUnits') || "metric",
    alertsEnabled: window.localStorage.getItem('alertsEnabled') || false,
};

// Slice de Redux
const userPreferencesSlice = createSlice({
    name: "userPreferences",
    initialState,
    reducers: {
        setPreferences: (state, action) =>{
            const {favoriteLocation,preferredUnits ,alertsEnabled }= action.payload
            state.favoriteLocation =  favoriteLocation;
            state.preferredUnits =preferredUnits;
            state.alertsEnabled = alertsEnabled
            window.localStorage.setItem('favoriteLocation', JSON.stringify(favoriteLocation));
            window.localStorage.setItem('preferredUnits',preferredUnits)
            window.localStorage.setItem('alertsEnabled',alertsEnabled)
        },
        clearPreferences: (state) => {
            state.favoriteLocation = [];
            state.preferredUnits = 'metric';
            state.alertsEnabled = 'false';
            window.localStorage.removeItem('alertsEnabled');
            window.localStorage.removeItem('favoriteLocation');
            window.localStorage.removeItem('preferredUnits');
        },
    },
});
export const { setPreferences, clearPreferences } = userPreferencesSlice.actions;
export default userPreferencesSlice.reducer;